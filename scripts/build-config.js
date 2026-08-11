const fs = require("fs");
const path = require("path");

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!url || !key) {
  console.warn("Warning: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are missing.");
}

function jsString(value) {
  return JSON.stringify(value);
}

const output = `// Generated during Vercel build. Do not put Gemini secrets here.
window.__SUPABASE_URL__ = ${jsString(url)};
window.__SUPABASE_ANON_KEY__ = ${jsString(key)};
`;

fs.writeFileSync(path.join(__dirname, "..", "js", "config.js"), output, "utf8");
console.log("Generated js/config.js from Vercel environment variables.");
