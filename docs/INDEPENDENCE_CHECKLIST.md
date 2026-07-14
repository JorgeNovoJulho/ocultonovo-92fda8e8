# ✅ CHECKLIST DE INDEPENDÊNCIA — APP OCULTO

## 1. Assets e Mídia
- ✅ **Nenhuma imagem/ícone** hospedado em servidores Lovable
- ✅ Avatares e banners → `Supabase Storage: avatars/`
- ✅ Mídias de posts → `Supabase Storage: post-media/`
- ✅ Ícones → Lucide React (bundled no projeto)
- ✅ Fontes → Google Fonts (CDN pública)

## 2. APIs e Proxies
- ✅ **Nenhuma API** passa por proxies do Lovable
- ✅ Stripe → Direto via `stripe-gateway` / `stripe-webhook` Edge Functions
- ✅ Asaas/PIX → Direto via `pix-gateway` / `asaas-webhook` Edge Functions
- ✅ OpenAI → Direto via `openai-chat` Edge Function
- ✅ Cloudflare Stream → Direto via `transcode-video` Edge Function
- ✅ WhatsApp → Direto via `whatsapp-gateway` Edge Function

## 3. Autenticação e Banco
- ✅ Auth → 100% Supabase Auth (email/senha)
- ✅ Database → PostgreSQL via Supabase (schema público)
- ✅ RLS → Políticas aplicadas em todas as tabelas sensíveis
- ✅ Realtime → Supabase Realtime (mensagens, posts, notificações)

## 4. Edge Functions (58 funções)
- ✅ Todas em `supabase/functions/` (Deno runtime padrão)
- ✅ Deploy via `supabase functions deploy` (CLI oficial)
- ✅ Nenhuma dependência de runtime Lovable

## 5. Build Local
- ✅ `npm install && npm run build` funciona offline
- ✅ Zero dependências privadas do Lovable no `package.json`
- ✅ Todas as dependências são pacotes npm públicos

## 6. Domínio
- ✅ Centralizado em `src/lib/appConfig.ts` → `APP_URL`
- ✅ Edge Functions usam `Deno.env.get('APP_URL')` com fallback `ocultoswing.com.br`
- ✅ Para trocar domínio: alterar apenas `.env` (frontend) e Supabase Secrets (backend)

## 7. Migrações
- ✅ Todas em `supabase/migrations/` (SQL padrão)
- ✅ Aplicáveis via `supabase db push` ou `supabase migration up`

## Como replicar em instância Supabase limpa
1. Criar projeto no Supabase Dashboard
2. Executar: `supabase link --project-ref SEU_REF`
3. Executar: `supabase db push` (aplica todas as migrações)
4. Configurar secrets: `supabase secrets set STRIPE_SECRET_KEY=... APP_URL=...`
5. Deploy functions: `supabase functions deploy`
6. Configurar `.env` local com as URLs do novo projeto
7. Build: `npm run build`
8. Deploy frontend em qualquer CDN (Vercel, Netlify, Cloudflare Pages)
