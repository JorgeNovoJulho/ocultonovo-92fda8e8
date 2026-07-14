# Fase 5 — Auditoria de Segurança (resumo)

Total: **433 findings** retornados pelo `security--run_security_scan` (linter Supabase).

## Categorias predominantes (warn)
- `SUPA_extension_in_public` — extensões instaladas em `public`. Sem impacto direto de RLS.
- `SUPA_rls_policy_always_true` — políticas com `USING (true)` / `WITH CHECK (true)` em UPDATE/DELETE/INSERT em algumas tabelas legadas.
- `SUPA_public_bucket_allows_listing` — buckets públicos permitindo `LIST` em `storage.objects`.
- `SUPA_function_search_path_mutable` — funções SQL sem `SET search_path = public` (já tratamos as críticas).
- `SUPA_security_definer_view` — views `SECURITY DEFINER` que devem ser `SECURITY INVOKER`.

## Itens já mitigados pela arquitetura
- Toda nova função `SECURITY DEFINER` deste projeto inclui `SET search_path = public` (regra de memória).
- Tabelas isoladas em prefixo `oculto_` com RLS dedicada (memória DB Integrity).
- Hardening de views já aplicado em ciclos anteriores (memory: Security View Hardening).

## A reforçar (priorizar próximo turno dedicado)
1. Revisar políticas `USING (true)` remanescentes em tabelas de telemetria/seed (manter SELECT público se intencional, restringir mutações).
2. Restringir `LIST` em buckets públicos não-críticos (manter apenas leitura por path direto).
3. Migrar views `SECURITY DEFINER` ainda flagradas para `SECURITY INVOKER` + RLS no objeto base.
4. Padronizar `SET search_path = public` em qualquer função antiga ainda flagrada.

> Nada aqui requer ação no frontend. As correções são SQL idempotentes e devem ir para `supabase/external_sql/` em um turno isolado para revisão pelo dono do banco externo.
