# Schreibtrainer — versão corrigida

## 1. Vercel

Em **Project Settings → Environment Variables**, crie:

- `VITE_SUPABASE_URL` = `https://omgsadypqptedpuokgkh.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = sua chave publishable/anon do Supabase

Marque **Production**, **Preview** e **Development**.

O build do Vercel gera automaticamente `js/config.js`. A chave publishable/anon pode aparecer no frontend; a chave Gemini não.

## 2. Supabase

Em **Edge Functions → Secrets**, configure:

- `GEMINI_API_KEY` = sua chave da Gemini API
- `SUPABASE_ANON_KEY` = a mesma chave publishable/anon usada no Vercel (opcional, mas recomendada)

Depois publique:

```bash
supabase link --project-ref omgsadypqptedpuokgkh
supabase functions deploy gemini-proxy
```

Se ainda não criou os secrets:

```bash
supabase secrets set GEMINI_API_KEY=SEU_GEMINI_API_KEY
supabase secrets set SUPABASE_ANON_KEY=SUA_CHAVE_PUBLISHABLE
```

## 3. Por que a página tinha ficado vazia

O `app.js` era carregado como um script JavaScript comum, mas a versão anterior usava `import.meta.env`. `import.meta` só pode ser usado em módulos ES; o navegador interrompia o parsing do arquivo inteiro. Por isso os elementos da configuração não eram renderizados.

A versão atual usa `js/config.js`, gerado no build do Vercel, e não usa `import.meta` no navegador.

## 4. Gemini

A Edge Function usa `gemini-2.5-flash-lite` como primeira opção e `gemini-2.5-flash` como fallback. O Flash-Lite estável é listado atualmente pela documentação oficial do Gemini API.

## Vercel: configuração do frontend

O `app.js` é um JavaScript normal carregado por `<script src="js/app.js">`, portanto ele **não usa `import.meta.env`**.
No build do Vercel, `scripts/generate-config.cjs` lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
e gera `js/config.js`.

Se aparecer `Cannot use 'import.meta' outside a module`, essa mensagem vem de uma implantação antiga.
Faça um novo deploy deste ZIP e confirme que o build executou `npm run build`.
