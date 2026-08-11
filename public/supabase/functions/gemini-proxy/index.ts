// Supabase Edge Function: gemini-proxy
// Required secret: GEMINI_API_KEY
// Deploy com: supabase functions deploy gemini-proxy --no-verify-jwt

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-preview-05-20",
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { status: res.status, ok: res.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Diagnose: check key
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json({ error: "GEMINI_API_KEY secret não configurada. Adicione em Supabase > Project Settings > Edge Functions > Secrets." }, 500);
  }

  let requestBody: any;
  try { requestBody = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const prompt = typeof requestBody?.prompt === "string" ? requestBody.prompt.trim() : "";
  if (!prompt) return json({ error: "Missing prompt" }, 400);

  const maxOutputTokens = Math.min(Math.max(Number(requestBody?.max_tokens) || 1000, 256), 8000);

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens, temperature: 0.7 },
  };

  const attempts: any[] = [];

  for (const model of MODELS) {
    const { status, ok, data } = await callModel(model, geminiKey, body);

    if (ok) {
      const text = extractText(data);
      return json({ text, model });
    }

    // Inclui erro detalhado pra debug
    attempts.push({
      model,
      status,
      error: data?.error?.message || data?.error || JSON.stringify(data).slice(0, 300),
    });

    // Para logo se for erro de autenticação (key inválida) — não tenta próximo modelo
    if (status === 400 || status === 403) break;
    // Para em outros erros não-recuperáveis (exceto 429 rate limit e 5xx)
    if (status !== 429 && status < 500) break;
  }

  return json({ error: "Gemini request failed", attempts }, 502);
});
