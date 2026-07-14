-- ============================================================================
-- OCULTO PLAY — FIX SEGURO PARA audit_logs.status
-- Banco EXTERNO. 100% idempotente.
-- Resolve: ERROR 42703: column "status" does not exist
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'audit_logs'
        AND column_name = 'status'
    ) THEN
      ALTER TABLE public.audit_logs
        ADD COLUMN status text;
    END IF;

    UPDATE public.audit_logs
       SET status = 'success'
     WHERE status IS NULL;

    ALTER TABLE public.audit_logs
      ALTER COLUMN status SET DEFAULT 'success';

    ALTER TABLE public.audit_logs
      ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'audit_logs'
         AND column_name = 'status'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'audit_logs_status_chk'
         AND conrelid = 'public.audit_logs'::regclass
     ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_status_chk
      CHECK (status IN ('success','error','warning','info','pending','processed'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'audit_logs'
         AND column_name = 'status'
     ) THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_status_created
      ON public.audit_logs(status, created_at DESC);
  END IF;
END $$;

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';