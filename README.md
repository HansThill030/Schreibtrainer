# Schreibtrainer — Deploy-Anleitung

## Struktur
```
index.html       → Página 1 (explicação do projeto)
trainer.html      → Páginas 2-5 (roteadas via #/config, #/aufgabe, #/schreiben, #/korrektur)
css/styles.css    → estilos compartilhados
js/app.js         → lógica (Supabase + Claude API + roteador)
```

## Por que isso resolve o erro do Supabase
Rodando como site real (fora do sandbox de artifact do Claude.ai), o navegador
não tem mais a política de rede restrita do artifact — o `fetch()` para
`*.supabase.co` funciona normalmente, igual funcionaria em qualquer site.

## Deploy mais rápido (grátis, sem conta): Netlify Drop
1. Acesse https://app.netlify.com/drop
2. Arraste a pasta inteira (com index.html, trainer.html, css/, js/) pra lá
3. Pronto — recebe uma URL tipo `https://algumnome.netlify.app`

## Alternativa: GitHub Pages
1. Cria um repositório novo no GitHub
2. Sobe os arquivos (index.html, trainer.html, css/, js/) pra raiz do repo
3. Settings → Pages → Source: branch `main`, pasta `/root`
4. Fica disponível em `https://teu-usuario.github.io/nome-do-repo/`

## Alternativa: Vercel
1. `npm i -g vercel` (ou usa o site vercel.com)
2. Dentro da pasta do projeto: `vercel deploy`
3. Segue o fluxo — não precisa de build, é só arquivos estáticos

## IA gratuita: Google Gemini (via Edge Function)

As chamadas de IA passam pela Edge Function `gemini-proxy` (pasta
`supabase/functions/gemini-proxy/`), que guarda sua API key do **Google
Gemini** no servidor — nunca fica exposta no site. Usa o modelo
`gemini-2.5-flash` (com fallback automático pro `gemini-2.0-flash` se o
principal estiver sobrecarregado), que roda no tier gratuito do Google — **sem
cartão de crédito**.

### 1. Pega uma API key do Gemini (grátis)
1. Acessa https://aistudio.google.com/apikey
2. Faz login com uma conta Google
3. "Create API Key" → copia a key gerada

### 2. ⚠️ Passo obrigatório: desativar "Verify JWT" na function
Por padrão, o Supabase exige JWT válido antes até de rodar sua function —
isso inclui o preflight `OPTIONS` do navegador, que não carrega headers
customizados. Sem desativar isso, o CORS trava tudo com 401 antes mesmo do
seu código rodar.

**Via Dashboard:** Edge Functions → `gemini-proxy` → desmarca **"Enforce JWT
Verification"** → salva/redeploy.

**Via CLI (mais garantido):**
```bash
supabase functions deploy gemini-proxy --no-verify-jwt
```

### 3. Deploy da Edge Function (via Dashboard, sem CLI)
1. Supabase → **Edge Functions** → **Create a new function**
2. Nome: `gemini-proxy`
3. Cola o conteúdo de `supabase/functions/gemini-proxy/index.ts`
4. Desmarca "Enforce JWT Verification" (passo 2)
5. Deploy
6. **Manage secrets** → adiciona:
   - Nome: `GEMINI_API_KEY`
   - Valor: a key que você pegou no passo 1
7. Testa com curl:
   ```bash
   curl -X POST 'https://omgsadypqptedpuokgkh.supabase.co/functions/v1/gemini-proxy' \
     -H 'Content-Type: application/json' \
     -H 'apikey: sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft' \
     -d '{"prompt": "Sag nur Hallo auf Deutsch.", "max_tokens": 50}'
   ```
   Deve voltar algo como `{"content":[{"type":"text","text":"Hallo!"}]}`.

### Alternativa via CLI (deploy completo)
```bash
npm install -g supabase
supabase login
supabase link --project-ref omgsadypqptedpuokgkh
supabase functions deploy gemini-proxy --no-verify-jwt
supabase secrets set GEMINI_API_KEY=sua-key-aqui
```

### Limites do tier gratuito (referência, pode mudar)
Gemini 2.5 Flash: ~10-15 requisições/minuto, até ~1.000-1.500/dia — muito
acima do que esse app deve usar em uso pessoal normal. Se algum dia bater
limite (erro 429), a function já tenta automaticamente o modelo de fallback.
