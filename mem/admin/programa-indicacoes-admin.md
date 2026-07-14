---
name: Programa de Indicações — Admin
description: Painel /admin/programa-indicacoes com Config (diff+confirm), Saques realtime, Antifraude filtrável e Auditoria (referral_audit_log + triggers)
type: feature
---
Rota: `/admin/programa-indicacoes` (`AdminProgramaIndicacoesPage.tsx`).

Tabs:
- **Config** — edita `referral_program_config` (singleton id=true) via RPC `referral_admin_update_config`. Botão de salvar abre `AlertDialog` com diff antes→depois; só habilita se houver mudanças.
- **Saques** — view `v_referral_admin_withdrawals` filtrada por status. Aprovação pede confirmação; rejeição exige motivo. Resolve via RPC `referral_admin_resolve_withdrawal(p_withdrawal_id, p_action, p_reason)`. Realtime em `referral_withdrawals`.
- **Antifraude** — `referral_antifraud_events` com filtros (tipo, severidade, busca) + modal de detalhes (payload `details` jsonb). Realtime.
- **Auditoria** — view `v_referral_audit_log` (SECURITY INVOKER, junta `profiles` por `actor_id=user_id`). Filtro por entidade (config/withdrawal) + busca. Modal mostra `before_data` / `after_data` lado a lado.

Auditoria DB (`2026_05_16_referral_audit_log.sql`):
- Tabela `referral_audit_log(actor_id, entity_type, entity_id, action, before_data, after_data, note)`. RLS: read só master, service_role all.
- Trigger `trg_audit_referral_config` AFTER UPDATE em `referral_program_config` WHEN row mudou.
- Trigger `trg_audit_referral_withdrawal` AFTER UPDATE em `referral_withdrawals` quando `status` muda (action mapeada: approve/paid/reject/cancel/processing; usa `COALESCE(NEW.reviewed_by, auth.uid())`).

Master gate: helper `_referral_is_master` usa `profiles.is_admin` OR `username='ocultomaster'` (coluna `is_master_admin` não existe). Sempre `p.user_id = auth.uid()`.

Plano `referral_withdrawals`: colunas reais são `requested_at`, `reviewed_at`, `reviewed_by`, `paid_at`, `rejection_reason` (NÃO existe `created_at`/`processed_at`/`admin_note`). View `v_referral_admin_withdrawals` aliasa `w.requested_at AS created_at` para o front.
