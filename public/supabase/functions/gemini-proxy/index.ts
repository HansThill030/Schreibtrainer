// Supabase Edge Function: gemini-proxy
// Usa a Interactions API do Google Gemini (novo endpoint obrigatório para novas contas)
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

async function callModel(model: string, apiKey: string, prompt: string, maxTokens: number) {
  // Interactions API endpoint (novo, obrigatorio para novas contas)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  const raw = await res.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { status: res.status, ok: res.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json({ error: "GEMINI_API_KEY secret não configurada." }, 500);
  }

  let requestBody: any;
  try { requestBody = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const prompt = typeof requestBody?.prompt === "string" ? requestBody.prompt.trim() : "";
  if (!prompt) return json({ error: "Missing prompt" }, 400);

  const maxTokens = Math.min(Math.max(Number(requestBody?.max_tokens) || 1000, 256), 8000);
  const attempts: any[] = [];

  for (const model of MODELS) {
    const { status, ok, data } = await callModel(model, geminiKey, prompt, maxTokens);

    if (ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
      return json({ text, model });
    }

    const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 300);
    attempts.push({ model, status, error: errMsg });

    // Para imediatamente em erro de autenticação — inútil tentar outros modelos
    if (status === 400 || status === 403) break;
    // Para em outros erros não-recuperáveis (exceto 429 e 5xx)
    if (status !== 429 && status < 500) break;
  }

  return json({ error: "Gemini request failed", attempts }, 502);
});
