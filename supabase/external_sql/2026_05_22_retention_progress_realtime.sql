-- Habilita realtime na tabela de progresso de retenção para que
-- RetentionMissionsStrip atualize as missões concluídas sem precisar
-- recarregar a página.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_retention_progress;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.oculto_retention_progress REPLICA IDENTITY FULL;
