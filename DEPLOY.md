# Schreibtrainer — configuração corrigida

## Vercel

Crie estas Environment Variables:

```env
VITE_SUPABASE_URL=https://omgsadypqptedpuokgkh.supabase.co
VITE_SUPABASE_ANON_KEY=SEU_SUPABASE_PUBLISHABLE_KEY
```

Ative para Production, Preview e Development.

## Supabase Edge Function

Na função `gemini-proxy`, configure o secret obrigatório:

```text
GEMINI_API_KEY=SEU_GEMINI_API_KEY
```

Opcionalmente, para manter a proteção por `apikey`:

```text
SUPABASE_ANON_KEY=O_MESMO_VALOR_DE_VITE_SUPABASE_ANON_KEY
```

Se `SUPABASE_ANON_KEY` não for configurada, a função não exige o header `apikey`.

### Deploy

```bash
supabase login
supabase link --project-ref omgsadypqptedpuokgkh
supabase secrets set GEMINI_API_KEY=SEU_GEMINI_API_KEY
supabase secrets set SUPABASE_ANON_KEY=SEU_SUPABASE_PUBLISHABLE_KEY
supabase functions deploy gemini-proxy
```

Depois faça um novo deploy do site no Vercel.

## Importante

Não coloque `GEMINI_API_KEY` no Vercel nem no frontend.
