# SQL arquivado (não rodar de novo)

Estes arquivos estavam soltos na raiz do projeto (e um em `supabase/`) e foram
movidos para cá em 13/10/2026 para não serem executados por engano.

**Atenção antes de reaproveitar qualquer um deles:**

- `migration_admin_master_*.sql` executam
  `DELETE FROM public.user_roles WHERE role = 'admin_master'` — removem TODOS os
  administradores master antes de recriar um único.
- `fix_landing_settings_rls.sql` apaga todas as roles do usuário master antes
  de recriá-las.
- `migration_admin_master_fix.sql` remove funções com `DROP ... CASCADE`, o que
  apaga junto as políticas de RLS que dependem delas.
- `migration_admin_master_final_v2.sql` recria `restore_account` retornando
  `void`; a tela do Cemitério espera `jsonb`. A versão oficial agora está em
  `../2026_10_13_correcoes_feed_play_cemiterio.sql`.
- `fix_play_share_settings.sql` foi incorporado (com correções de permissão)
  ao mesmo arquivo de 13/10/2026.
- `update_template.sql` só altera o texto da mensagem de boas-vindas.
