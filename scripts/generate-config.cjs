const fs = require("fs");
const path = require("path");

const url = process.env.VITE_SUPABASE_URL || "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!url || !anonKey) {
  console.warn("[Schreibtrainer] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não está configurada.");
}

const output = `// Generated during the Vercel build. Do not put Gemini secrets here.
window.__SUPABASE_URL__ = ${JSON.stringify(url)};
window.__SUPABASE_ANON_KEY__ = ${JSON.stringify(anonKey)};
`;

fs.writeFileSync(path.join(__dirname, "..", "js", "config.js"), output, "utf8");
console.log("[Schreibtrainer] js/config.js generated.");
