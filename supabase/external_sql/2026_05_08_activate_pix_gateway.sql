-- Ativa o gateway PIX no Supabase externo (rvybbrkzmboqbhcemqar)
-- Idempotente: pode ser executado múltiplas vezes sem efeitos colaterais.

-- 1) Garante que existe ao menos uma linha de config
INSERT INTO public.pix_gateway_config (gateway_provider, is_active, sandbox_mode, min_deposit)
SELECT 'asaas', true, true, 5
WHERE NOT EXISTS (SELECT 1 FROM public.pix_gateway_config);

-- 2) Ativa todas as linhas de config existentes
UPDATE public.pix_gateway_config
SET is_active = true,
    updated_at = now()
WHERE is_active IS DISTINCT FROM true;

-- 3) Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
