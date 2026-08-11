// Supabase Edge Function: gemini-proxy
// Empfängt { prompt, max_tokens } vom Frontend, ruft die Google Gemini API
// (kostenloser Tier, kein Kreditkarte nötig) mit dem server-seitig gespeicherten
// API-Key auf und gibt die Antwort im GLEICHEN Format zurück, das der Frontend-Code
// vorher von der Anthropic API erwartet hat — {content:[{type:"text", text:"..."}]}.
// So musste im app.js NICHTS an der Response-Verarbeitung geändert werden.
//
// WICHTIG: verify_jwt = false nötig (siehe README) — sonst blockiert der
// CORS-Preflight (OPTIONS) mit 401, weil der Browser dabei keine Custom-Header
// mitschickt. Als Ersatz prüfen wir den "apikey"-Header hier manuell.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Öffentlicher "publishable" Supabase-Key deines Projekts — nur ein leichter
// Schutz gegen zufällige/robotische Aufrufe, keine echte Security.
const EXPECTED_APIKEY = "sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft";

// Bevorzugtes Modell + Fallback, falls das Hauptmodell mal überlastet/limitiert ist.
const MODEL_PRIMARY = "gemini-2.5-flash";
const MODEL_FALLBACK = "gemini-2.0-flash";

async function chamarGemini(model: string, apiKey: string, prompt: string, maxTokens: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9 },
    }),
  });
  const data = await res.json();
  return { res, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const suppliedKey = req.headers.get("apikey");
  if (suppliedKey !== EXPECTED_APIKEY) {
    return new Response(JSON.stringify({ error: "Ungültiger oder fehlender apikey-Header." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { prompt, max_tokens } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Feld 'prompt' (string) ist erforderlich." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY ist auf dem Server nicht konfiguriert." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxTokens = typeof max_tokens === "number" ? max_tokens : 1000;

    let { res, data } = await chamarGemini(MODEL_PRIMARY, apiKey, prompt, maxTokens);

    // Bei Rate-Limit (429) oder Serverfehler auf das Fallback-Modell wechseln.
    if (!res.ok && (res.status === 429 || res.status >= 500)) {
      ({ res, data } = await chamarGemini(MODEL_FALLBACK, apiKey, prompt, maxTokens));
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Gemini-Fehler", raw: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";

    // Antwort in das gleiche Format bringen, das der Frontend-Code erwartet
    // (kompatibel mit dem früheren Anthropic-Response-Format).
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
