-- ============================================================================
-- BETA CONTROL — Onda 10: Checklist obrigatório de PRODUÇÃO (categorizado)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- O que faz:
--  1) Estende platform_launch_checklist com category + notes (idempotente).
--  2) Insere/atualiza os itens críticos divididos por categoria
--     (ASAAS, WhatsApp, Segurança, Realtime, Performance, Moderação,
--      Experiências Reais, Lançamento).
--  3) Cria trigger BEFORE UPDATE em platform_runtime_settings que IMPEDE
--     transição para platform_mode='production' enquanto houver item
--     required=true e done=false (bypass somente via SECURITY DEFINER).
--  4) Cria tabela production_launch_log para registrar aprovações,
--     reversões e tentativas de transição.
--  5) Mantém RPC launch_checklist_ready() e adiciona
--     launch_checklist_pending_required() para listar pendências.
-- ============================================================================

-- 1) Colunas novas (idempotente) -------------------------------------------
ALTER TABLE public.platform_launch_checklist
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'lançamento';

ALTER TABLE public.platform_launch_checklist
  ADD COLUMN IF NOT EXISTS notes text;

-- Index para listar por categoria
CREATE INDEX IF NOT EXISTS idx_launch_checklist_category
  ON public.platform_launch_checklist (category, sort_order);

-- 2) Seed dos itens críticos por categoria ---------------------------------
-- ON CONFLICT preserva o estado "done" e "notes" já preenchidos pelo admin,
-- mas atualiza rótulos, descrição, ordem, categoria e flag required.
INSERT INTO public.platform_launch_checklist (key, label, description, required, sort_order, category) VALUES
  -- ASAAS
  ('asaas_webhook',         'ASAAS — Webhook validado',        'Webhook recebendo eventos de cobrança/assinatura/chargeback.', true, 100, 'ASAAS'),
  ('asaas_split',           'ASAAS — Split validado',          'Split 6% imposto → 20% plataforma → 5% afiliado conferido em produção.', true, 110, 'ASAAS'),
  ('asaas_checkout',        'ASAAS — Checkout validado',       'Checkout PIX e Cartão testado ponta a ponta.', true, 120, 'ASAAS'),
  ('asaas_subscription',    'ASAAS — Assinatura validada',     'Cobrança recorrente Premium/VIP testada (criação, renovação, cancelamento).', true, 130, 'ASAAS'),
  ('asaas_payout',          'ASAAS — Saque validado',          'Solicitação de saque de criador testada em produção.', true, 140, 'ASAAS'),
  ('asaas_chargeback',      'ASAAS — Chargeback testado',      'Fluxo de chargeback/estorno simulado e tratado.', true, 150, 'ASAAS'),

  -- WhatsApp
  ('whatsapp_integration',  'WhatsApp — Integração ativa',     'Provedor conectado e token válido.', true, 200, 'WhatsApp'),
  ('whatsapp_send',         'WhatsApp — Envio funcionando',    'Mensagens automáticas (boas-vindas, match, verificação) entregando.', true, 210, 'WhatsApp'),
  ('whatsapp_limits',       'WhatsApp — Limites OK',           'Rate-limit/quota do provedor revisados para o volume esperado.', false, 220, 'WhatsApp'),

  -- Segurança
  ('security_rls',          'Segurança — RLS validada',        'Linter Supabase sem WARN críticos; políticas revisadas.', true, 300, 'Segurança'),
  ('security_admin_routes', 'Segurança — Rotas admin protegidas','useIsMasterAdmin/has_role aplicado em todas as rotas admin.', true, 310, 'Segurança'),
  ('security_lgpd',         'Segurança — LGPD validada',       'Consentimento +18, política e contatos de privacidade publicados.', true, 320, 'Segurança'),

  -- Realtime
  ('realtime_rooms',        'Realtime — Salas',                'Aura Rooms recebendo eventos em tempo real.', true, 400, 'Realtime'),
  ('realtime_feed',         'Realtime — Feed',                 'Feed com invalidação realtime ativa.', true, 410, 'Realtime'),
  ('realtime_aura_match',   'Realtime — Aura Match',           'Matches em tempo real OK.', true, 420, 'Realtime'),
  ('realtime_pulses',       'Realtime — Pulsos',               'Pulses/Presence Signals propagando.', true, 430, 'Realtime'),

  -- Performance
  ('perf_mobile',           'Performance — Mobile',            'Realme C55 (4GB) navega sem travas; FPS >= 50.', true, 500, 'Performance'),
  ('perf_stress',           'Performance — Stress test',       'Stress test simulando 1000 usuários simultâneos.', true, 510, 'Performance'),
  ('perf_memory',           'Performance — Memória',           'Sem leaks; uso < 200MB em sessão típica.', true, 520, 'Performance'),
  ('perf_realtime_cleanup', 'Performance — Realtime cleanup',  'removeChannel/unsubscribe em todos os hooks de Realtime.', true, 530, 'Performance'),

  -- Moderação
  ('mod_reports',           'Moderação — Denúncias',           'Fluxo de denúncia e fila admin operacional.', true, 600, 'Moderação'),
  ('mod_blocks',            'Moderação — Bloqueios',           'Bloquear/silenciar usuários funciona em feed, chat e radar.', true, 610, 'Moderação'),
  ('mod_antifraud',         'Moderação — Antifraude',          'Shadowban, freeze e auditoria registrados em audit_logs.', true, 620, 'Moderação'),

  -- Experiências Reais
  ('exp_kyc',               'Experiências — KYC obrigatório',  'KYC ativo para participar de experiências reais.', true, 700, 'Experiências Reais'),
  ('exp_safety',            'Experiências — Segurança',        'Safety check-in e WhatsApp alert funcionando.', true, 710, 'Experiências Reais'),
  ('exp_consent',           'Experiências — Consentimento',    'Consentimento +18 e termos específicos exibidos antes do RSVP.', true, 720, 'Experiências Reais'),

  -- Lançamento (mantém os itens originais como categoria "Lançamento")
  ('asaas_production',      'ASAAS em PRODUÇÃO (chave live)',  'Chave ASAAS_API_KEY apontando para produção, sandbox_mode=false.', true, 800, 'Lançamento'),
  ('stripe_live',           'Stripe LIVE',                     'Chaves Stripe em modo live, webhook configurado.', true, 810, 'Lançamento'),
  ('emails_verified',       'E-mails (Resend) verificados',    'Domínio do remetente verificado no Resend.', true, 820, 'Lançamento'),
  ('legal_terms',           'Termos e LGPD publicados',        'Termos, políticas e fluxos +18 disponíveis.', true, 830, 'Lançamento'),
  ('backup_snapshot',       'Snapshot pré-lançamento',         'Backup completo do banco gerado antes da virada.', true, 840, 'Lançamento'),
  ('monitoring',            'Observabilidade',                 'Discord/Sentry recebendo alertas críticos.', false, 850, 'Lançamento')
ON CONFLICT (key) DO UPDATE
  SET label       = EXCLUDED.label,
      description = EXCLUDED.description,
      required    = EXCLUDED.required,
      sort_order  = EXCLUDED.sort_order,
      category    = EXCLUDED.category;

-- 3) Log de produção (aprovação/reversão/tentativas) -----------------------
CREATE TABLE IF NOT EXISTS public.production_launch_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,                       -- 'attempt_blocked' | 'transition_to_production' | 'revert_to_beta' | 'item_completed' | 'item_uncompleted'
  actor       uuid,                                -- auth.uid() do ator
  target_key  text,                                -- checklist_key quando item_*
  prev_value  jsonb,
  new_value   jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_launch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prod_log_select_admin" ON public.production_launch_log;
CREATE POLICY "prod_log_select_admin" ON public.production_launch_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  );

-- 4) Trigger BACKEND: bloqueia transição → production com checklist incompleto
CREATE OR REPLACE FUNCTION public._guard_platform_production_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending int;
  v_pending_keys text;
BEGIN
  -- Só atua quando ESTÁ entrando em produção (mudança de modo)
  IF NEW.platform_mode = 'production' AND coalesce(OLD.platform_mode, '') <> 'production' THEN
    SELECT count(*), string_agg(key, ', ' ORDER BY sort_order)
      INTO v_pending, v_pending_keys
      FROM public.platform_launch_checklist
      WHERE required = true AND done = false;

    IF v_pending > 0 THEN
      INSERT INTO public.production_launch_log
        (event_type, actor, prev_value, new_value, reason)
      VALUES
        ('attempt_blocked',
         auth.uid(),
         jsonb_build_object('platform_mode', OLD.platform_mode),
         jsonb_build_object('platform_mode', NEW.platform_mode),
         format('Checklist incompleto: %s pendência(s) — %s', v_pending, coalesce(v_pending_keys,'')));

      RAISE EXCEPTION
        'CHECKLIST_INCOMPLETO: % itens obrigatórios pendentes (%). Conclua o checklist de produção antes.',
        v_pending, coalesce(v_pending_keys, '');
    END IF;

    -- Aprovação registrada
    INSERT INTO public.production_launch_log
      (event_type, actor, prev_value, new_value, reason)
    VALUES
      ('transition_to_production',
       auth.uid(),
       jsonb_build_object('platform_mode', OLD.platform_mode),
       jsonb_build_object('platform_mode', NEW.platform_mode),
       'Checklist aprovado — entrada em produção');
  END IF;

  -- Reversão registrada
  IF coalesce(OLD.platform_mode,'') = 'production' AND NEW.platform_mode <> 'production' THEN
    INSERT INTO public.production_launch_log
      (event_type, actor, prev_value, new_value, reason)
    VALUES
      ('revert_to_beta',
       auth.uid(),
       jsonb_build_object('platform_mode', OLD.platform_mode),
       jsonb_build_object('platform_mode', NEW.platform_mode),
       format('Reversão de produção para %s', NEW.platform_mode));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_platform_production ON public.platform_runtime_settings;
CREATE TRIGGER trg_guard_platform_production
  BEFORE UPDATE ON public.platform_runtime_settings
  FOR EACH ROW
  WHEN (OLD.platform_mode IS DISTINCT FROM NEW.platform_mode)
  EXECUTE FUNCTION public._guard_platform_production_transition();

-- 5) Logs de conclusão/desconclusão de itens -------------------------------
CREATE OR REPLACE FUNCTION public._log_launch_checklist_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.done IS DISTINCT FROM NEW.done THEN
    INSERT INTO public.production_launch_log
      (event_type, actor, target_key, prev_value, new_value, reason)
    VALUES (
      CASE WHEN NEW.done THEN 'item_completed' ELSE 'item_uncompleted' END,
      auth.uid(),
      NEW.key,
      jsonb_build_object('done', OLD.done, 'notes', OLD.notes),
      jsonb_build_object('done', NEW.done, 'notes', NEW.notes),
      NEW.label
    );

    -- Quem completou + quando (idempotente)
    IF NEW.done = true THEN
      NEW.done_at := now();
      NEW.done_by := auth.uid();
    ELSE
      NEW.done_at := NULL;
      NEW.done_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_launch_checklist ON public.platform_launch_checklist;
CREATE TRIGGER trg_log_launch_checklist
  BEFORE UPDATE ON public.platform_launch_checklist
  FOR EACH ROW EXECUTE FUNCTION public._log_launch_checklist_change();

-- 6) RPCs auxiliares -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.launch_checklist_pending_required()
RETURNS TABLE (key text, label text, category text, sort_order int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT key, label, category, sort_order
    FROM public.platform_launch_checklist
    WHERE required = true AND done = false
    ORDER BY sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.launch_checklist_pending_required() TO anon, authenticated;

-- 7) Realtime --------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.production_launch_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
