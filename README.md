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

## Nota sobre a API da Anthropic
As chamadas de IA agora passam pela Edge Function `claude-proxy` (pasta
`supabase/functions/claude-proxy/`), que guarda sua API key da Anthropic no
servidor — nunca fica exposta no site.

### Deploy da Edge Function (via Dashboard, sem precisar de CLI)

1. Pega uma API key em https://console.anthropic.com/settings/keys (se ainda não tiver)
2. No Supabase: menu lateral → **Edge Functions** → **Create a new function**
3. Nome da function: `claude-proxy`
4. Cola o conteúdo de `supabase/functions/claude-proxy/index.ts` no editor
5. Deploy
6. Depois de criada, vai em **Manage secrets** (ou Project Settings → Edge Functions → Secrets)
   e adiciona:
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: sua key da Anthropic (começa com `sk-ant-...`)
7. Testa direto no navegador ou com curl:
   ```bash
   curl -X POST 'https://omgsadypqptedpuokgkh.supabase.co/functions/v1/claude-proxy' \
     -H 'Content-Type: application/json' \
     -H 'apikey: sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft' \
     -d '{"prompt": "Sag nur Hallo auf Deutsch.", "max_tokens": 50}'
   ```
   Se voltar um JSON com `"content":[{"type":"text","text":"Hallo!"}]`, está funcionando.

### Alternativa via CLI (se preferir)
```bash
npm install -g supabase
supabase login
supabase link --project-ref omgsadypqptedpuokgkh
supabase functions deploy claude-proxy
supabase secrets set ANTHROPIC_API_KEY=sk-ant-sua-key-aqui
```

⚠️ **Custo**: cada chamada de IA (gerar tema ou corrigir texto) consome créditos
da sua conta Anthropic diretamente — diferente do artifact do Claude.ai, que
não custa nada extra. Vale acompanhar o uso em console.anthropic.com/settings/usage.
