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

### ⚠️ Passo obrigatório: desativar "Verify JWT" na function

Por padrão, o Supabase exige um JWT válido **antes mesmo** da sua function
rodar — isso inclui a requisição de preflight `OPTIONS` que o navegador manda
automaticamente antes de qualquer fetch cross-origin. Como o preflight não
carrega os headers customizados (`apikey`/`Authorization`), ele toma 401 e o
navegador bloqueia tudo com erro de CORS, mesmo a function estando com o
código de CORS certo.

**Correção — via Dashboard:**
1. Supabase → Edge Functions → `claude-proxy` → aba de configurações da function
2. Desmarca **"Enforce JWT Verification"** (ou "Verify JWT")
3. Salva / faz redeploy se pedir

**Correção — via CLI:**
```bash
supabase functions deploy claude-proxy --no-verify-jwt
```

Como isso remove a proteção padrão da plataforma, o código da function agora
faz uma checagem própria (mais simples) do header `apikey` — só aceita
chamadas que mandem a publishable key correta. Não é segurança forte (a key
já é pública no JS do site), mas barra bots/scans aleatórios batendo direto
na URL da function.

### Deploy da Edge Function (via Dashboard, sem precisar de CLI)

1. Pega uma API key em https://console.anthropic.com/settings/keys (se ainda não tiver)
2. No Supabase: menu lateral → **Edge Functions** → **Create a new function**
3. Nome da function: `claude-proxy`
4. Cola o conteúdo de `supabase/functions/claude-proxy/index.ts` no editor
5. **Desmarca "Enforce JWT Verification"** (ver acima) antes de fazer deploy
6. Deploy
7. Depois de criada, vai em **Manage secrets** (ou Project Settings → Edge Functions → Secrets)
   e adiciona:
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: sua key da Anthropic (começa com `sk-ant-...`)
8. Testa direto no navegador ou com curl:
   ```bash
   curl -X POST 'https://omgsadypqptedpuokgkh.supabase.co/functions/v1/claude-proxy' \
     -H 'Content-Type: application/json' \
     -H 'apikey: sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft' \
     -d '{"prompt": "Sag nur Hallo auf Deutsch.", "max_tokens": 50}'
   ```
   Se voltar um JSON com `"content":[{"type":"text","text":"Hallo!"}]`, está funcionando.

### Alternativa via CLI (deploy completo, já com verify_jwt desativado)
```bash
npm install -g supabase
supabase login
supabase link --project-ref omgsadypqptedpuokgkh
supabase functions deploy claude-proxy --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-sua-key-aqui
```

⚠️ **Custo**: cada chamada de IA (gerar tema ou corrigir texto) consome créditos
da sua conta Anthropic diretamente — diferente do artifact do Claude.ai, que
não custa nada extra. Vale acompanhar o uso em console.anthropic.com/settings/usage.
