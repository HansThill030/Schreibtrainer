// Supabase Edge Function: gemini-proxy
// Required secret: GEMINI_API_KEY
// Optional secret: SUPABASE_ANON_KEY (only if you want to enforce the incoming apikey header)
//
// Deploy with:
//   supabase functions deploy gemini-proxy
//
// Set secrets with:
//   supabase secrets set GEMINI_API_KEY=...
//   supabase secrets set SUPABASE_ANON_KEY=...   (optional)

const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractText(payload: any): string {
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || "")
      .join("") ||
    ""
  );
}

async function callGemini(model: string, apiKey: string, body: any) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  return { res, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json(
      { error: "GEMINI_API_KEY não configurada nos Secrets da Edge Function." },
      500,
    );
  }

  // Optional authentication guard. If SUPABASE_ANON_KEY is configured,
  // require the client to send the same publishable key in `apikey`.
  const expectedAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (expectedAnonKey) {
    const suppliedKey = req.headers.get("apikey");
    if (suppliedKey !== expectedAnonKey) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  let requestBody: any;
  try {
    requestBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // The frontend can send a Gemini generateContent body directly.
  // We also accept { prompt, systemInstruction, generationConfig } for convenience.
  const body =
    requestBody?.contents
      ? requestBody
      : {
          systemInstruction: requestBody?.systemInstruction
            ? { parts: [{ text: String(requestBody.systemInstruction) }] }
            : undefined,
          contents: [
            {
              role: "user",
              parts: [{ text: String(requestBody?.prompt ?? "") }],
            },
          ],
          generationConfig: requestBody?.generationConfig,
        };

  if (
    !body.contents?.[0]?.parts?.length ||
    !body.contents[0].parts.some((p: any) => typeof p?.text === "string")
  ) {
    return json({ error: "Missing prompt/contents" }, 400);
  }

  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastError: any = null;

  for (const model of models) {
    const { res, data } = await callGemini(model, geminiKey, body);

    if (res.ok) {
      const text = extractText(data);
      return json({
        text,
        model,
        response: data,
      });
    }

    lastError = {
      status: res.status,
      model,
      error: data?.error || data,
    };

    // Try the next model for model-not-found, permission, rate-limit,
    // or transient server errors. Other client errors are returned immediately.
    const shouldFallback =
      res.status === 400 ||
      res.status === 403 ||
      res.status === 404 ||
      res.status === 429 ||
      res.status >= 500;

    if (!shouldFallback) break;
  }

  return json(
    {
      error: "Gemini request failed",
      details: lastError,
      modelsTried: models,
    },
    502,
  );
});
