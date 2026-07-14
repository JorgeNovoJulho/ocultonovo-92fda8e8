---
name: Google OAuth Signup Flow
description: Cadastro/login via Google no Supabase EXTERNO + /completar-cadastro obrigatório
type: feature
---
- Botão `GoogleSignInButton` (em `src/components/auth/GoogleSignInButton.tsx`) chama `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: window.location.origin + '/auth/callback', prompt: 'select_account' })` no Supabase externo.
- Rota `/auth/callback` (`AuthCallbackPage`) processa hash/code, chama RPC `my_profile_completion()` e roteia: completo → `/feed`, incompleto → `/completar-cadastro`, erro → `/login?error=oauth`.
- Rota `/completar-cadastro` (`CompletarCadastroPage`) exige: `username` (3-20, [a-z0-9_]), `name`, `birth_date` (>=18), `gender`, aceites Termos + Privacidade + +18; faz upsert em `profiles` com `onboarding_completed=true`.
- Hook `useProfileCompletion` consulta RPC `my_profile_completion()`.
- `ProtectedRoute` aplica gate: se autenticado mas `isComplete===false` e rota não whitelisted → redirect `/completar-cadastro`. Whitelist: `/completar-cadastro`, `/legal/*`, `/auth/callback`, `/logout`, `/admin*`.
- Novas colunas em `profiles`: `auth_provider`, `adult_confirmed_at`, `privacy_accepted_at`, `terms_accepted_at`, `onboarding_completed` (default false).
- Trigger `handle_new_user` atualizado para capturar `raw_app_meta_data->>'provider'` e `raw_user_meta_data` (name/full_name/avatar_url/picture).
- Provider Google deve estar habilitado MANUALMENTE no painel do Supabase externo (rvybbrkzmboqbhcemqar) com Redirect URLs para todos os domínios (produção, preview Lovable, localhost).
- SQL idempotente em `supabase/external_sql/2026_06_06_google_oauth_profile_completion.sql`.
