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
As chamadas para `api.anthropic.com/v1/messages` funcionam sem API key
somente dentro do ambiente de Artifacts do Claude.ai. Fora dele (num site
publicado de verdade), você vai precisar:
- Ou hospedar um pequeno backend/proxy que injeta sua própria API key da Anthropic
- Ou trocar as chamadas por outra forma de acesso ao modelo (ex: via seu próprio
  backend em Supabase Edge Functions, Vercel Functions, etc.)

Isso é a próxima peça que falta pra funcionar 100% fora do Claude.ai — me avisa
quando quiser resolver essa parte.
