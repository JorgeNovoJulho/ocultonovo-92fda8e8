-- =====================================================================
-- ONDA D — Social Universe Pulse
-- Auto-emite eventos no Feed Vivo a partir de:
--   • Noite Oculta ativa
--   • Aura Storm ativa (se a função existir)
--   • Temporada social ativa
--   • Conexões raras recentes (destiny epic+/mythic) das últimas 6h
--   • Conexões ocultas reveladas hoje
-- Idempotente: só insere quando não há evento do mesmo kind/source nas
-- últimas 30 min ainda válido (expires_at > now()).
-- Idempotente em relação a tabelas — todas as cláusulas usam IF NOT EXISTS.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.social_universe_emit_pulse()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_noite record;
  v_season record;
  v_storm record;
  v_destiny record;
  v_hidden record;
  v_exists boolean;
BEGIN
  -- 1) NOITE OCULTA ATIVA -------------------------------------------
  SELECT id, kind, title, subtitle, hue, emoji, ends_at
  INTO v_noite
  FROM public.oculto_noites
  WHERE ends_at > now() AND starts_at <= now()
  ORDER BY starts_at DESC LIMIT 1;

  IF v_noite.id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_feed_vivo
      WHERE kind = 'noite'
        AND payload->>'source_id' = v_noite.id::text
        AND expires_at > now()
    ) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_feed_vivo(kind, payload, hue, emoji, pinned, expires_at)
      VALUES (
        'noite',
        jsonb_build_object(
          'source_id', v_noite.id,
          'title', v_noite.title,
          'subtitle', v_noite.subtitle,
          'noite_kind', v_noite.kind
        ),
        v_noite.hue, COALESCE(v_noite.emoji, '🌙'), true,
        LEAST(v_noite.ends_at, now() + interval '6 hours')
      );
      v_inserted := v_inserted + 1;
    END IF;
  END IF;

  -- 2) TEMPORADA ATIVA — emite 1x ao iniciar (janela 24h) ----------
  SELECT id, code, title, narrative, theme_hue, emoji, ends_at
  INTO v_season
  FROM public.oculto_seasons
  WHERE active = true AND starts_at <= now() AND ends_at > now()
  ORDER BY starts_at DESC LIMIT 1;

  IF v_season.id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_feed_vivo
      WHERE kind = 'season'
        AND payload->>'source_id' = v_season.id::text
        AND created_at > (now() - interval '24 hours')
    ) INTO v_exists;
    IF NOT v_exists THEN
      INSERT INTO public.oculto_feed_vivo(kind, payload, hue, emoji, expires_at)
      VALUES (
        'season',
        jsonb_build_object(
          'source_id', v_season.id,
          'title', v_season.title,
          'message', COALESCE(v_season.narrative, 'Nova temporada social ativa'),
          'code', v_season.code
        ),
        v_season.theme_hue, COALESCE(v_season.emoji, '🌌'),
        now() + interval '12 hours'
      );
      v_inserted := v_inserted + 1;
    END IF;
  END IF;

  -- 3) AURA STORM ATIVA (se função existir) -------------------------
  BEGIN
    SELECT id, kind, message, ends_at, intensity
    INTO v_storm
    FROM public.oculto_aura_storms
    WHERE ends_at > now() AND starts_at <= now()
    ORDER BY starts_at DESC LIMIT 1;

    IF v_storm.id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.oculto_feed_vivo
        WHERE kind = 'tempestade'
          AND payload->>'source_id' = v_storm.id::text
          AND expires_at > now()
      ) INTO v_exists;
      IF NOT v_exists THEN
        INSERT INTO public.oculto_feed_vivo(kind, payload, hue, emoji, expires_at)
        VALUES (
          'tempestade',
          jsonb_build_object(
            'source_id', v_storm.id,
            'title', COALESCE(v_storm.message, 'Tempestade de Aura'),
            'storm_kind', v_storm.kind,
            'intensity', v_storm.intensity
          ),
          320, '⚡',
          LEAST(v_storm.ends_at, now() + interval '3 hours')
        );
        v_inserted := v_inserted + 1;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- aura_storms ainda não existe neste DB — ignora
    NULL;
  END;

  -- 4) DESTINO SOCIAL — conexões raras (epic/mythic) últimas 6h -----
  BEGIN
    FOR v_destiny IN
      SELECT id, user_a, user_b, rarity, affinity, created_at
      FROM public.oculto_destiny_links
      WHERE created_at > (now() - interval '6 hours')
        AND rarity IN ('epic','mythic')
      ORDER BY created_at DESC
      LIMIT 3
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.oculto_feed_vivo
        WHERE kind = 'destiny'
          AND payload->>'source_id' = v_destiny.id::text
      ) INTO v_exists;
      IF NOT v_exists THEN
        INSERT INTO public.oculto_feed_vivo(kind, payload, hue, emoji, expires_at)
        VALUES (
          'destiny',
          jsonb_build_object(
            'source_id', v_destiny.id,
            'title', CASE WHEN v_destiny.rarity = 'mythic'
                          THEN 'Conexão mítica registrada no universo'
                          ELSE 'Conexão épica acaba de surgir' END,
            'rarity', v_destiny.rarity,
            'affinity', v_destiny.affinity
          ),
          CASE WHEN v_destiny.rarity = 'mythic' THEN 45 ELSE 290 END,
          CASE WHEN v_destiny.rarity = 'mythic' THEN '✨' ELSE '💞' END,
          now() + interval '4 hours'
        );
        v_inserted := v_inserted + 1;
      END IF;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 5) CONEXÕES OCULTAS REVELADAS HOJE ------------------------------
  BEGIN
    FOR v_hidden IN
      SELECT id, revealed_at
      FROM public.oculto_hidden_connections
      WHERE revealed_at IS NOT NULL
        AND revealed_at > (now() - interval '6 hours')
      ORDER BY revealed_at DESC
      LIMIT 3
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.oculto_feed_vivo
        WHERE kind = 'hidden'
          AND payload->>'source_id' = v_hidden.id::text
      ) INTO v_exists;
      IF NOT v_exists THEN
        INSERT INTO public.oculto_feed_vivo(kind, payload, hue, emoji, expires_at)
        VALUES (
          'hidden',
          jsonb_build_object(
            'source_id', v_hidden.id,
            'title', 'Uma conexão oculta acaba de ser revelada'
          ),
          265, '🔮',
          now() + interval '3 hours'
        );
        v_inserted := v_inserted + 1;
      END IF;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 6) LIMPEZA — remove eventos expirados há mais de 24h -----------
  DELETE FROM public.oculto_feed_vivo
  WHERE expires_at < (now() - interval '24 hours');

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'ts', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.social_universe_emit_pulse() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
