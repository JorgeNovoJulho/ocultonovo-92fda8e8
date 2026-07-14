-- Force PostgREST schema cache reload
SELECT pg_notify('pgrst', 'reload schema');
-- Touch the column to make sure it's registered
COMMENT ON COLUMN public.public_activities.is_seed IS 'Flag para identificar atividades de seeds/bots';