const fs = require("fs");
const path = require("path");

const root = process.cwd();
const out = path.join(root, "public");

function rm(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
}

rm(out);
mkdir(out);

const excluded = new Set([
  ".git", ".vercel", "node_modules", "public", "scripts"
]);

function copyDir(src, dest) {
  mkdir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(root, out);

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_ANON_KEY || "";

const config = `window.SCHREIBTRAINER_CONFIG = ${JSON.stringify({
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: key
}, null, 2)};\n`;

mkdir(path.join(out, "js"));
fs.writeFileSync(path.join(out, "js", "config.js"), config, "utf8");

console.log("Build concluído.");
console.log("Output:", out);
console.log("Supabase URL configurada:", Boolean(url));
console.log("Supabase key configurada:", Boolean(key));
