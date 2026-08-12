// Supabase Edge Function: gemini-proxy
// Required secret: GEMINI_API_KEY
// Deploy: supabase functions deploy gemini-proxy --no-verify-jwt

const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return json({ error: "GEMINI_API_KEY secret não configurada." }, 500);

  let requestBody: any;
  try { requestBody = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const prompt = typeof requestBody?.prompt === "string" ? requestBody.prompt.trim() : "";
  if (!prompt) return json({ error: "Missing prompt" }, 400);

  const maxTokens = Math.min(Math.max(Number(requestBody?.max_tokens) || 2000, 512), 16000);
  const attempts: any[] = [];

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    });

    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
      const finishReason = data?.candidates?.[0]?.finishReason || "unknown";
      return json({ text, model, finishReason, tokenCount: data?.usageMetadata });
    }

    const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 400);
    attempts.push({ model, status: res.status, error: errMsg });
    if (res.status === 400 || res.status === 403) break;
    if (res.status !== 429 && res.status < 500) break;
  }

  return json({ error: "Gemini request failed", attempts }, 502);
});
