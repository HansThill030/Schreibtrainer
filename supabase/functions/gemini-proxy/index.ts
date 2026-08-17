// Supabase Edge Function: gemini-proxy
// Required secret: GEMINI_API_KEY
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pelo runtime.
// Deploy: supabase functions deploy gemini-proxy --no-verify-jwt
//
// Aceita opcionalmente uma ou mais imagens (para transcrição/correção de textos
// manuscritos fotografados). Body: { prompt: string, max_tokens?: number, images?: [{ mimeType, data }] }
//
// Rate limit: se o cliente enviar o token de sessão real do usuário (Authorization
// header), a função identifica o usuário e aplica um limite diário de chamadas —
// protege contra abuso da chave pública do Supabase (que é necessariamente pública).

const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

const DAILY_LIMIT = 40;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPECTED_APIKEY = "sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checarERegistrarUso(userToken) {
  // Retorna { ok: true } se pode prosseguir, ou { ok: false } se estourou o limite.
  // Falha silenciosamente (permite a chamada) se não conseguir identificar o usuário
  // ou se a tabela/infra de rate-limit não estiver disponível — nunca bloqueia por erro interno.
  if (!userToken || userToken === EXPECTED_APIKEY) return { ok: true };

  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) return { ok: true };

  try {
    const userRes = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${userToken}`, apikey: EXPECTED_APIKEY },
    });
    if (!userRes.ok) return { ok: true };
    const userData = await userRes.json();
    const userId = userData?.id;
    if (!userId) return { ok: true };

    const hoje = new Date().toISOString().slice(0, 10);
    const getRes = await fetch(
      `${baseUrl}/rest/v1/uso_diario?user_id=eq.${userId}&dia=eq.${hoje}&select=contador`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = getRes.ok ? await getRes.json() : [];
    const atual = Array.isArray(rows) && rows[0] ? rows[0].contador : 0;

    if (atual >= DAILY_LIMIT) return { ok: false };

    await fetch(`${baseUrl}/rest/v1/uso_diario`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: userId, dia: hoje, contador: atual + 1 }),
    });
    return { ok: true };
  } catch {
    return { ok: true }; // infra instável não deve travar o app
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return json({ error: "GEMINI_API_KEY secret não configurada." }, 500);

  const suppliedKey = req.headers.get("apikey");
  if (suppliedKey !== EXPECTED_APIKEY) {
    return json({ error: "Ungültiger oder fehlender apikey-Header." }, 401);
  }

  const authHeader = req.headers.get("authorization") || "";
  const userToken = authHeader.replace(/^Bearer\s+/i, "");
  const usoStatus = await checarERegistrarUso(userToken);
  if (!usoStatus.ok) {
    return json({ error: "Tageslimit erreicht. Bitte versuche es morgen erneut.", limitReached: true }, 429);
  }

  let requestBody;
  try { requestBody = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const prompt = typeof requestBody?.prompt === "string" ? requestBody.prompt.trim() : "";
  if (!prompt) return json({ error: "Missing prompt" }, 400);

  const maxTokens = Math.min(Math.max(Number(requestBody?.max_tokens) || 2000, 512), 16000);

  // Monta as "parts" — texto, e opcionalmente uma ou mais imagens (base64) para OCR/transcrição
  const parts = [];
  const images = Array.isArray(requestBody?.images) ? requestBody.images : (requestBody?.image ? [requestBody.image] : []);
  images.forEach(img => {
    if (img && img.data && img.mimeType) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
    }
  });
  parts.push({ text: prompt });

  const attempts = [];

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    });

    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("") || "";
      const finishReason = data?.candidates?.[0]?.finishReason || "unknown";
      return json({ text, model, finishReason });
    }

    const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 400);
    attempts.push({ model, status: res.status, error: errMsg });
    if (res.status === 400 || res.status === 403) break;
    if (res.status !== 429 && res.status < 500) break;
  }

  return json({ error: "Gemini request failed", attempts }, 502);
});
