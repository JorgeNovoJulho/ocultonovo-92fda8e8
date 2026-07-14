-- =====================================================================
-- ONDA F — Auto-scheduler de Noites Ocultas (horário BRT)
-- =====================================================================
-- Regras (timezone America/Sao_Paulo):
--   • Madrugada Secreta — 00:00–04:00 todos os dias (intensidade 2)
--   • Eclipse Social    — Domingo 20:00–22:00 (intensidade 3)
--   • Noite VIP         — Sexta 22:00–02:00 do sábado (vip_only=true)
--   • Tempestade Aura   — quando online > 50 (decisão delegada à existing
--                          aura_storms, não criamos noite duplicada)
--
-- Idempotente: só cria noite se não houver noite ATIVA do mesmo kind.
-- Roda dentro de social_universe_emit_pulse() a cada 5 min via cron.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.noite_oculta_auto_schedule()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_local timestamp := (v_now AT TIME ZONE 'America/Sao_Paulo');
  v_hour int := EXTRACT(HOUR FROM v_local);
  v_dow  int := EXTRACT(DOW  FROM v_local); -- 0=domingo, 5=sexta, 6=sábado
  v_created int := 0;
  v_exists boolean;
BEGIN
  -- 1) MADRUGADA SECRETA: ativa entre 00h–04h todos os dias
  IF v_hour BETWEEN 0 AND 3 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_noites
      WHERE kind = 'madrugada_secreta' AND ends_at > v_now
    ) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_noites(kind, title, subtitle, ends_at, intensity, emoji, hue)
      VALUES (
        'madrugada_secreta',
        'Madrugada Secreta',
        'O universo desperta no escuro · auras dobradas até 4h',
        ((v_local::date + interval '4 hours') AT TIME ZONE 'America/Sao_Paulo'),
        2, '🌙', 250
      );
      v_created := v_created + 1;
    END IF;
  END IF;

  -- 2) ECLIPSE SOCIAL: Domingo (DOW=0) entre 20h e 21h
  IF v_dow = 0 AND v_hour BETWEEN 20 AND 21 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_noites
      WHERE kind = 'eclipse_social' AND ends_at > v_now
    ) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_noites(kind, title, subtitle, ends_at, intensity, emoji, hue)
      VALUES (
        'eclipse_social',
        'Eclipse Social',
        'Dois mundos se cruzam por 2h · descoberta ampliada',
        v_now + interval '2 hours',
        3, '🌑', 290
      );
      v_created := v_created + 1;
    END IF;
  END IF;

  -- 3) NOITE VIP: Sexta (DOW=5) das 22h até sábado 02h
  IF v_dow = 5 AND v_hour >= 22 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_noites
      WHERE kind = 'noite_vip' AND ends_at > v_now
    ) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_noites(kind, title, subtitle, ends_at, vip_only, intensity, emoji, hue)
      VALUES (
        'noite_vip',
        'Noite VIP',
        'Sexta dourada · salas exclusivas e conexões raras',
        v_now + interval '4 hours',
        true, 3, '👑', 45
      );
      v_created := v_created + 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('created', v_created, 'hour_brt', v_hour, 'dow', v_dow);
END;
$$;

GRANT EXECUTE ON FUNCTION public.noite_oculta_auto_schedule() TO authenticated, service_role;

-- =====================================================================
-- Atualiza social_universe_emit_pulse para chamar o auto-scheduler antes
-- de emitir eventos no Feed Vivo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.social_universe_emit_pulse()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_noite record; v_season record; v_storm record;
  v_destiny record; v_hidden record; v_exists boolean;
  v_auto jsonb;
BEGIN
  -- 0) AUTO-SCHEDULE de Noites Ocultas (Onda F)
  BEGIN
    SELECT public.noite_oculta_auto_schedule() INTO v_auto;
  EXCEPTION WHEN undefined_function THEN v_auto := '{}'::jsonb; END;

  -- 1) Noite Oculta ativa
  SELECT id, kind, title, subtitle, hue, emoji, ends_at INTO v_noite
  FROM public.oculto_noites
  WHERE ends_at > now() AND starts_at <= now()
  ORDER BY starts_at DESC LIMIT 1;
  IF v_noite.id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.oculto_feed_vivo
      WHERE kind='noite' AND payload->>'source_id'=v_noite.id::text AND expires_at>now()) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_feed_vivo(kind,payload,hue,emoji,pinned,expires_at)
      VALUES('noite', jsonb_build_object('source_id',v_noite.id,'title',v_noite.title,'subtitle',v_noite.subtitle,'noite_kind',v_noite.kind),
        v_noite.hue, COALESCE(v_noite.emoji,'🌙'), true, LEAST(v_noite.ends_at, now()+interval '6 hours'));
      v_inserted := v_inserted+1;
    END IF;
  END IF;

  -- 2) Temporada ativa
  SELECT id,code,title,narrative,theme_hue,emoji,ends_at INTO v_season
  FROM public.oculto_seasons WHERE active=true AND starts_at<=now() AND ends_at>now()
  ORDER BY starts_at DESC LIMIT 1;
  IF v_season.id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.oculto_feed_vivo
      WHERE kind='season' AND payload->>'source_id'=v_season.id::text AND created_at>(now()-interval '24 hours')) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_feed_vivo(kind,payload,hue,emoji,expires_at)
      VALUES('season', jsonb_build_object('source_id',v_season.id,'title',v_season.title,'message',COALESCE(v_season.narrative,'Nova temporada social ativa'),'code',v_season.code),
        v_season.theme_hue, COALESCE(v_season.emoji,'🌌'), now()+interval '12 hours');
      v_inserted := v_inserted+1;
    END IF;
  END IF;

  -- 3) Aura Storm
  BEGIN
    SELECT id,kind,message,ends_at,intensity INTO v_storm
    FROM public.oculto_aura_storms WHERE ends_at>now() AND starts_at<=now()
    ORDER BY starts_at DESC LIMIT 1;
    IF v_storm.id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM public.oculto_feed_vivo
        WHERE kind='tempestade' AND payload->>'source_id'=v_storm.id::text AND expires_at>now()) INTO v_exists;
      IF NOT v_exists THEN
        INSERT INTO public.oculto_feed_vivo(kind,payload,hue,emoji,expires_at)
        VALUES('tempestade', jsonb_build_object('source_id',v_storm.id,'title',COALESCE(v_storm.message,'Tempestade de Aura'),'storm_kind',v_storm.kind,'intensity',v_storm.intensity),
          320, '⚡', LEAST(v_storm.ends_at, now()+interval '3 hours'));
        v_inserted := v_inserted+1;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 4) Destino raro últimas 6h
  BEGIN
    FOR v_destiny IN
      SELECT id,user_a,user_b,rarity,affinity,created_at FROM public.oculto_destiny_links
      WHERE created_at>(now()-interval '6 hours') AND rarity IN ('epic','mythic')
      ORDER BY created_at DESC LIMIT 3
    LOOP
      SELECT EXISTS(SELECT 1 FROM public.oculto_feed_vivo
        WHERE kind='destiny' AND payload->>'source_id'=v_destiny.id::text) INTO v_exists;
      IF NOT v_exists THEN
        INSERT INTO public.oculto_feed_vivo(kind,payload,hue,emoji,expires_at)
        VALUES('destiny', jsonb_build_object('source_id',v_destiny.id,
          'title', CASE WHEN v_destiny.rarity='mythic' THEN 'Conexão mítica registrada no universo' ELSE 'Conexão épica acaba de surgir' END,
          'rarity',v_destiny.rarity,'affinity',v_destiny.affinity),
          CASE WHEN v_destiny.rarity='mythic' THEN 45 ELSE 290 END,
          CASE WHEN v_destiny.rarity='mythic' THEN '✨' ELSE '💞' END,
          now()+interval '4 hours');
        v_inserted := v_inserted+1;
      END IF;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 5) Hidden connections reveladas
  BEGIN
    FOR v_hidden IN
      SELECT id,revealed_at FROM public.oculto_hidden_connections
      WHERE revealed_at IS NOT NULL AND revealed_at>(now()-interval '6 hours')
      ORDER BY revealed_at DESC LIMIT 3
    LOOP
      SELECT EXISTS(SELECT 1 FROM public.oculto_feed_vivo
        WHERE kind='hidden' AND payload->>'source_id'=v_hidden.id::text) INTO v_exists;
      IF NOT v_exists THEN
        INSERT INTO public.oculto_feed_vivo(kind,payload,hue,emoji,expires_at)
        VALUES('hidden', jsonb_build_object('source_id',v_hidden.id,'title','Uma conexão oculta acaba de ser revelada'),
          265, '🔮', now()+interval '3 hours');
        v_inserted := v_inserted+1;
      END IF;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Limpeza
  DELETE FROM public.oculto_feed_vivo WHERE expires_at < (now()-interval '24 hours');

  RETURN jsonb_build_object('inserted', v_inserted, 'auto_schedule', v_auto, 'ts', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.social_universe_emit_pulse() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
