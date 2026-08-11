// Supabase Edge Function: gemini-proxy
// Required secret: GEMINI_API_KEY
// Optional secret: SUPABASE_ANON_KEY
//
// Deploy:
//   supabase functions deploy gemini-proxy
//
// Secrets:
//   supabase secrets set GEMINI_API_KEY=...
//   supabase secrets set SUPABASE_ANON_KEY=...

const MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractText(payload: any): string {
  return payload?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text || "")
    .join("") || "";
}

async function callModel(model: string, apiKey: string, body: any) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  return { res, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json({ error: "GEMINI_API_KEY não está configurada nos Secrets do Supabase." }, 500);
  }

  const expectedAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (expectedAnonKey && req.headers.get("apikey") !== expectedAnonKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  let requestBody: any;
  try {
    requestBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const prompt = typeof requestBody?.prompt === "string" ? requestBody.prompt.trim() : "";
  if (!prompt) return json({ error: "Missing prompt" }, 400);

  const maxOutputTokens = Math.min(
    Math.max(Number(requestBody?.max_tokens) || 1000, 256),
    12000,
  );

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens,
      temperature: 0.7,
    },
  };

  const errors: any[] = [];

  for (const model of MODELS) {
    const { res, data } = await callModel(model, geminiKey, body);

    if (res.ok) {
      return json({
        text: extractText(data),
        model,
      });
    }

    errors.push({
      model,
      status: res.status,
      error: data?.error || data,
    });

    if (![400, 403, 404, 429].includes(res.status) && res.status < 500) break;
  }

  return json({
    error: "Gemini request failed",
    details: errors,
  }, 502);
});
