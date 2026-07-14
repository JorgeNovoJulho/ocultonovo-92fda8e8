# Auditoria LGPD — Oculto Swing
**Data:** 15/05/2026 · **Versão:** 1.0 · **Onda:** 1/6
**Base legal:** Lei nº 13.709/2018 (LGPD) · Marco Civil da Internet (Lei 12.965/2014) · Resolução ANPD nº 4/2023

---

## 1. Resumo executivo

A plataforma já parte de uma base **boa, mas incompleta**:
- ✅ RLS habilitada em todas as tabelas auditadas (23/23).
- ✅ `cookie_consents` operacional + helper `_is_oculto_master()` para isolamento financeiro.
- ✅ Hardening ASAAS recente (column-lockdown + purga + master-only RLS).
- ⚠️ `export-user-data` é **incompleto** (cobre ~10 das ~80 tabelas com PII).
- ⚠️ `delete-account` apaga sem **janela de arrependimento** nem matriz de retenção legal.
- ⚠️ Não há sistema de **incidentes LGPD** nem painel **Admin Master → LGPD**.
- ⚠️ Consentimentos atuais cobrem só **cookies**, não geolocalização, marketing, IA, conteúdo adulto, etc.
- ⚠️ Geolocalização armazena `lat/lng` exatos (`profiles.location_lat`, `location_lng`) sem aproximação configurável.
- ⚠️ Política de privacidade desatualizada em relação a Aura, salas, prestígio, ASAAS, antifraude.

**Veredito:** o Oculto **NÃO está plenamente adequado à LGPD hoje**, mas o gap é sanável em 5 ondas após esta auditoria.

---

## 2. Matriz de classificação de dados

Legenda: **PUB** = público (visível a qualquer usuário) · **PRV** = privado (só dono) · **SEN** = sensível (LGPD art. 5º II — sexual/orientação/biometria) · **FIN** = financeiro · **JUR** = retenção jurídica obrigatória.

| Tabela | Classe | Campos sensíveis | Base legal de tratamento |
|---|---|---|---|
| `profiles` | PUB+PRV+SEN | username/avatar (PUB); email, phone, cpf_cnpj, location_lat/lng, birth_date (PRV); preferências sexuais via `tags` (SEN) | Consentimento + execução de contrato |
| `couple_verification_docs` | SEN | selfies, RG, comprovantes | Consentimento explícito (art. 11) |
| `cookie_consents` | PRV | analytics/marketing flags, IP via session | Consentimento (art. 7º I) |
| `messages` | PRV+SEN | conteúdo E2EE, mídia | Execução de contrato |
| `conversations` / `conversation_participants` | PRV | participantes | Execução de contrato |
| `posts` / `post_media` | PUB+SEN | conteúdo adulto opcional | Consentimento + interesse legítimo |
| `posts (is_flash)` (stories) | PUB+SEN | mídia efêmera | Consentimento |
| `notifications` | PRV | conteúdo personalizado | Execução de contrato |
| `notification_preferences` | PRV | flags push/email | Consentimento |
| `transactions` | FIN+JUR | valor, gateway_id, payer_doc | Obrigação legal (art. 7º II) — reter 5 anos |
| `payments_log` / `payment_logs` / `pix_payments` | FIN+JUR | logs de gateway | Obrigação legal — reter 5 anos |
| `chargeback_logs` | FIN+JUR | disputas | Obrigação legal — reter 5 anos |
| `creator_pricing_config` | FIN+PRV | wallet ASAAS, PIX key (após lockdown: api_key/webhook redacted) | Execução contratual |
| `subscriptions` / `early_bird_subscriptions` | FIN | plano, ciclo | Execução contratual |
| `bidder_cards` | FIN+SEN | tokenização cartão | Execução contratual |
| `audit_logs` | JUR | ações admin | Obrigação legal — reter 5 anos |
| `discipline_history` | JUR | bans/freezes | Interesse legítimo + obrigação |
| `content_reports` / `anonymous_reports` | PRV+JUR | denúncias | Obrigação legal — reter 5 anos |
| `oculto_user_activity_logs` | PRV | navegação | Interesse legítimo (anonimizar 90d) |
| `pings` / `looking_now_matches` / `perfect_pairs` | SEN | localização + intenção sexual | Consentimento explícito |
| `events` / `event_rsvps` / `event_checkins` | PRV+SEN | presença, geolocalização | Consentimento |
| `auctions` / `auction_bids` | FIN | lances | Execução contratual |
| `marketplace_items` / `marketplace_purchases` | FIN+SEN | conteúdo adulto pago | Execução + consentimento |
| `media_unlocks` / `chat_unlocks` / `media_access` | FIN+SEN | compras de PPV | Execução contratual |
| `media_share_links` | PRV | URLs assinadas | Execução |
| `follows` / `post_likes` / `comment_likes` | PRV | grafo social | Execução |
| `blocked_contacts` | PRV | bloqueios | Direito do titular |
| `oculto_user_reputation` | PRV | score social/prestígio | Interesse legítimo |
| `aura_*` (várias) | PRV+SEN | matchmaking afetivo | Consentimento explícito |
| `admin_impersonation_sessions` / `impersonation_access_logs` | JUR | ghost mode admin | Auditoria obrigatória |
| `email_logs` / `notification_dispatch_logs` | PRV | envios | Interesse legítimo (anonimizar 1 ano) |
| `nps_responses` / `feedback_responses` | PRV | feedback | Consentimento |

**Total auditado:** 80+ tabelas mapeadas; 23 amostradas via `pg_tables` confirmaram RLS=true.

---

## 3. Falhas encontradas

### 3.1 — Exportação LGPD incompleta · **Gravidade ALTA**
- **Impacto:** titular não recebe seus dados completos (art. 18 II). Sanção: até 2% do faturamento.
- **Arquivos:** `supabase/functions/export-user-data/index.ts`
- **Detalhe:** cobre apenas `profiles, posts, post_likes, saved_posts, subscriptions, transactions, notifications, conversation_participants, story_views, cookie_consents`. Faltam: `messages`, `wallet/ledger`, `media_unlocks`, `chat_unlocks`, `marketplace_purchases`, `event_*`, `auction_bids`, `aura_*`, `oculto_user_reputation`, `discipline_history`, `content_reports` próprios, `pings`, `notification_preferences`, `bidder_cards` (redacted), `couple_verification_docs` (metadata).
- **Correção:** Onda 3 — `lgpd-export-data` com 30+ domínios, ZIP, signed URLs 7d.

### 3.2 — Exclusão sem janela de arrependimento nem matriz de retenção · **Gravidade ALTA**
- **Impacto:** apagar dados financeiros viola art. 16 LGPD; exclusão imediata viola boas práticas ANPD.
- **Arquivos:** `supabase/functions/delete-account/index.ts`
- **Correção:** Onda 3 — ticket em `lgpd_requests`, confirmação por email, processamento após 48h, matriz `apagar/anonimizar/reter`.

### 3.3 — Consentimentos só cobrem cookies · **Gravidade ALTA**
- **Impacto:** não há base legal documentada para geolocalização precisa, push, marketing, processamento IA, compartilhamento com ASAAS.
- **Arquivos:** `src/hooks/useCookieConsent.tsx`, tabela `cookie_consents`.
- **Correção:** Onda 2 — `lgpd_consents` com 13 tipos granulares + versionamento.

### 3.4 — Geolocalização exata armazenada e exposta · **Gravidade ALTA**
- **Impacto:** `profiles.location_lat/lng` em precisão GPS bruta permite stalking. Princípio da necessidade violado.
- **Arquivos:** `src/components/radar/*`, `src/hooks/useLocation*`, qualquer query SELECT direto desses campos.
- **Correção:** Onda 4 — coluna `location_precision` + view `v_profiles_geo_safe` com snapping a 1km/10km.

### 3.5 — Sem sistema de incidentes LGPD · **Gravidade MÉDIA**
- **Impacto:** ANPD exige notificação em prazo razoável (art. 48). Sem registro = sem prova.
- **Correção:** Onda 5 — `lgpd_incidents` + UI Admin Master.

### 3.6 — Sem painel Admin Master → LGPD unificado · **Gravidade MÉDIA**
- **Correção:** Onda 5 — `/admin/lgpd` com 5 abas (solicitações, consentimentos, incidentes, retenção, auditoria).

### 3.7 — Política de privacidade desatualizada · **Gravidade MÉDIA**
- **Impacto:** transparência (art. 9º) prejudicada. Aura/salas/prestígio/antifraude/IA não documentados.
- **Arquivos:** `src/pages/legal/PrivacyPolicy*` (verificar), `mockLegalApi.ts`.
- **Correção:** Onda 6 — reescrita v3.0 + re-prompt automático.

### 3.8 — `mockLegalApi.ts` em uso para conteúdo legal · **Gravidade MÉDIA**
- **Impacto:** documentos legais simulados não têm valor jurídico nem versionamento real.
- **Correção:** Onda 6 — substituir por `lgpd_policy_versions` real.

### 3.9 — Bloqueio de scripts de tracking só após consent é frouxo · **Gravidade BAIXA**
- **Impacto:** se houver pixels (analytics/marketing) carregados antes do toggle = violação do art. 7º.
- **Correção:** Onda 5 — gate real em `index.html` + carregamento condicional.

### 3.10 — `console.log` com PII potencial em produção · **Gravidade BAIXA**
- **Correção:** Onda 5 — varredura `rg "console\.(log|info|warn)"` + remover PII; manter `logger.ts` que já silencia em prod.

### 3.11 — Signed URLs vs. URLs públicas em uploads sensíveis · **Gravidade MÉDIA**
- **Impacto:** mídia VIP/PPV/KYC não pode ter URL pública vazada.
- **Correção:** Onda 5 — auditar buckets, forçar `getSignedUrl` com TTL ≤ 1h em conteúdo sensível.

### 3.12 — Anonimização de inativos sem critério LGPD claro · **Gravidade BAIXA**
- **Arquivos:** `supabase/functions/anonymize-inactive-users/index.ts`
- **Correção:** Onda 3 — alinhar à matriz de retenção (anonimizar após 24 meses sem login, conforme política).

---

## 4. Mapa de exposição RLS atual (resumo)

Amostra confirmada via `pg_tables`:

| Tabela | RLS | Observação |
|---|---|---|
| `profiles` | ✅ | Auditar policies de SELECT — campos PRV não devem vazar para outro user |
| `messages` | ✅ | Verificar se `conversation_participants` filtra corretamente |
| `transactions` | ✅ | Master-only após hardening recente |
| `audit_logs` | ✅ | Master-only confirmado |
| `cookie_consents` | ✅ | Self-only |
| `couple_verification_docs` | ✅ | **REVISAR**: deve ser self + master KYC apenas |
| `pings`/`looking_now_matches`/`perfect_pairs` | ✅ | Auditar em Onda 4 (geo) |
| `notifications` | ✅ | Self-only |
| `posts`/`post_likes`/`follows` | ✅ | Public read OK; write self-only |

**Pendente para Onda 1.5 (entrego junto da Onda 2):** dump completo de `pg_policies` com diff de policies suspeitas (USING `true`, `auth.role()='service_role'` mal escrito).

---

## 5. Matriz de retenção legal (proposta)

| Categoria | Dado | Ação na exclusão | Prazo legal | Base |
|---|---|---|---|---|
| Comunicação | `messages`, `message_translations`, `notifications`, `notification_dispatch_logs` | **Apagar** | imediato | LGPD art. 16 (cessada finalidade) |
| Grafo social | `follows`, `post_likes`, `comment_likes`, `post_shares`, `profile_visits` | **Apagar** | imediato | LGPD art. 16 |
| Conteúdo público | `posts`, `post_comments`, `event_messages` | **Anonimizar** (`author_id=NULL`, autor "Conta encerrada") | indefinido | Interesse legítimo de outros usuários |
| Presença/Geo | `pings`, `looking_now_matches`, `perfect_pairs`, `event_checkins` | **Apagar** | imediato | LGPD art. 16 |
| Stories | `posts WHERE is_flash=true` | **Apagar** | imediato | Finalidade efêmera |
| Aura/Match | `aura_*`, `lucky_matches` | **Apagar** | imediato | LGPD art. 16 |
| KYC aprovado | `couple_verification_docs`, fotos | **Reter** (criptografadas) | 5 anos | Lei 12.965 + obrigação fiscal/antifraude |
| Financeiro | `transactions`, `wallet_ledger`(*), `payments_log`, `pix_payments`, `payment_splits`, `chargeback_logs`, `oculto_asaas_subscriptions`(*) | **Reter** | 5 anos após última transação | Código Civil art. 206 §5º + RFB |
| Cartões | `bidder_cards` | **Apagar token** | imediato | PCI-DSS + LGPD art. 16 |
| Antifraude | `fraud_scores`(*), `oculto_user_activity_logs` | **Anonimizar** (substituir user_id por hash) | 5 anos | Interesse legítimo (art. 7º IX) |
| Auditoria admin | `audit_logs`, `admin_impersonation_sessions`, `impersonation_access_logs`, `discipline_history` | **Reter** | 5 anos | Obrigação regulatória |
| Denúncias | `content_reports`, `anonymous_reports` | **Reter** (denunciante anonimizado) | 5 anos | Interesse legítimo + obrigação |
| Reputação | `oculto_user_reputation` | **Apagar** | imediato | LGPD art. 16 |
| Consentimentos | `lgpd_consents`, `cookie_consents` | **Reter** (prova de consentimento) | 5 anos | LGPD art. 37 |

(*) tabelas a serem confirmadas/criadas em ondas posteriores.

---

## 6. Próximos passos imediatos

✅ **Onda 1 entregue** (este documento).

Aguardando **OK** para iniciar **Onda 2 — Consentimentos LGPD granulares + versionamento**, que entrega:
1. SQL idempotente `2026_05_15_lgpd_consents.sql` (no chat + repo).
2. Hook `useLGPDConsent` + tela Configurações → Privacidade & LGPD.
3. Re-prompt automático ao bumpar versão de política.

---

_Documento gerado para arquivo regulatório. Manter em `docs/` e versionar a cada onda._
