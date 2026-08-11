// Supabase Edge Function: claude-proxy
// Empfängt { prompt, max_tokens } vom Frontend, ruft die Anthropic API mit dem
// server-seitig gespeicherten API-Key auf und gibt die Antwort zurück.
// Der Anthropic-API-Key wird NIE ans Frontend geschickt.
//
// WICHTIG: Diese Function läuft mit verify_jwt = false (siehe README), weil der
// Browser bei CORS-Preflight-Requests (OPTIONS) keine Custom-Header wie
// "apikey"/"Authorization" mitschickt — mit aktivierter JWT-Prüfung würde die
// Plattform den Preflight-Request selbst mit 401 ablehnen, bevor unser Code
// überhaupt läuft. Als Ersatz prüfen wir den "apikey"-Header hier manuell,
// nur für echte POST-Requests (nicht für OPTIONS).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Der öffentliche "publishable" Supabase-Key deines Projekts — dient hier nur
// als leichter Schutz gegen zufällige/robotische Aufrufe, nicht als echte Security
// (der Key ist im Frontend-Code ohnehin sichtbar).
const EXPECTED_APIKEY = "sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft";

serve(async (req) => {
  // CORS-Preflight — MUSS mit 200 antworten, sonst blockiert der Browser alles.
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

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ist auf dem Server nicht konfiguriert." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: typeof max_tokens === "number" ? max_tokens : 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await anthropicResponse.json();

    return new Response(JSON.stringify(data), {
      status: anthropicResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
