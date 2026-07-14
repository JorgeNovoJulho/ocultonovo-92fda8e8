-- ============================================================================
-- Salas especiais: ativar somente 1 por vez, apenas quando os critérios reais
-- forem atendidos (horário, dia da semana, data sazonal, clima e temperatura).
-- Backend externo. Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.special_cycle_evaluate_and_open()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_sp           timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_hour             int := EXTRACT(HOUR FROM v_now_sp)::int;
  v_weekday          int := EXTRACT(DOW FROM v_now_sp)::int;
  v_month            int := EXTRACT(MONTH FROM v_now_sp)::int;
  v_day              int := EXTRACT(DAY FROM v_now_sp)::int;
  v_part             text := CASE
    WHEN v_hour BETWEEN 0 AND 5 THEN 'madrugada'
    WHEN v_hour BETWEEN 6 AND 11 THEN 'manha'
    WHEN v_hour BETWEEN 12 AND 17 THEN 'tarde'
    ELSE 'noite'
  END;
  v_weather          text := 'unknown';
  v_temp             numeric := NULL;
  v_existing_open_id uuid := NULL;
  v_existing_key     text := NULL;
  v_def              record;
  v_session_id       uuid;
  v_opened           int := 0;
BEGIN
  -- Fecha sessões abertas/closing cujos critérios deixaram de ser válidos.
  FOR v_def IN
    SELECT
      s.id AS session_id,
      s.cycle_key,
      s.room_slug,
      d.label,
      d.emoji,
      d.max_duration_minutes,
      d.active,
      d.day_parts,
      d.hour_start,
      d.hour_end,
      d.days_of_week,
      d.date_month,
      d.date_day,
      d.weather_kinds,
      d.min_temp,
      d.max_temp,
      d.sort_order
    FROM public.oculto_special_cycle_sessions s
    JOIN public.oculto_special_cycle_definitions d
      ON d.key = s.cycle_key
    WHERE s.status IN ('open', 'closing')
  LOOP
    IF NOT (
      v_def.active = true
      AND (cardinality(COALESCE(v_def.day_parts, '{}'::text[])) = 0 OR v_part = ANY(v_def.day_parts))
      AND (
        v_def.hour_start IS NULL AND v_def.hour_end IS NULL
        OR v_def.hour_start IS NOT NULL AND v_def.hour_end IS NULL AND v_hour >= v_def.hour_start
        OR v_def.hour_start IS NULL AND v_def.hour_end IS NOT NULL AND v_hour < v_def.hour_end
        OR v_def.hour_start = v_def.hour_end
        OR v_def.hour_start < v_def.hour_end AND v_hour >= v_def.hour_start AND v_hour < v_def.hour_end
        OR v_def.hour_start > v_def.hour_end AND (v_hour >= v_def.hour_start OR v_hour < v_def.hour_end)
      )
      AND (cardinality(COALESCE(v_def.days_of_week, '{}'::int[])) = 0 OR v_weekday = ANY(v_def.days_of_week))
      AND (v_def.date_month IS NULL OR v_def.date_month = v_month)
      AND (v_def.date_day IS NULL OR v_def.date_day = v_day)
      AND (cardinality(COALESCE(v_def.weather_kinds, '{}'::text[])) = 0 OR v_weather = ANY(v_def.weather_kinds))
      AND (v_def.min_temp IS NULL OR (v_temp IS NOT NULL AND v_temp >= v_def.min_temp))
      AND (v_def.max_temp IS NULL OR (v_temp IS NOT NULL AND v_temp <= v_def.max_temp))
    ) THEN
      PERFORM public.special_room_close(v_def.session_id);
    END IF;
  END LOOP;

  -- Se já existir alguma sessão aberta válida, mantém só ela.
  SELECT s.id, s.cycle_key
    INTO v_existing_open_id, v_existing_key
  FROM public.oculto_special_cycle_sessions s
  JOIN public.oculto_special_cycle_definitions d
    ON d.key = s.cycle_key
  WHERE s.status = 'open'
    AND d.active = true
  ORDER BY COALESCE(d.sort_order, 999) ASC, s.opened_at DESC
  LIMIT 1;

  -- Garante exclusividade: nunca mais de 1 sala especial aberta ao mesmo tempo.
  IF v_existing_open_id IS NOT NULL THEN
    UPDATE public.oculto_special_cycle_sessions
       SET status = 'closed', closed_at = now()
     WHERE status = 'open'
       AND id <> v_existing_open_id;

    RETURN 0;
  END IF;

  -- Abre somente o primeiro ciclo elegível pela prioridade (sort_order).
  SELECT *
    INTO v_def
  FROM public.oculto_special_cycle_definitions d
  WHERE d.active = true
    AND (cardinality(COALESCE(d.day_parts, '{}'::text[])) = 0 OR v_part = ANY(d.day_parts))
    AND (
      d.hour_start IS NULL AND d.hour_end IS NULL
      OR d.hour_start IS NOT NULL AND d.hour_end IS NULL AND v_hour >= d.hour_start
      OR d.hour_start IS NULL AND d.hour_end IS NOT NULL AND v_hour < d.hour_end
      OR d.hour_start = d.hour_end
      OR d.hour_start < d.hour_end AND v_hour >= d.hour_start AND v_hour < d.hour_end
      OR d.hour_start > d.hour_end AND (v_hour >= d.hour_start OR v_hour < d.hour_end)
    )
    AND (cardinality(COALESCE(d.days_of_week, '{}'::int[])) = 0 OR v_weekday = ANY(d.days_of_week))
    AND (d.date_month IS NULL OR d.date_month = v_month)
    AND (d.date_day IS NULL OR d.date_day = v_day)
    AND (cardinality(COALESCE(d.weather_kinds, '{}'::text[])) = 0 OR v_weather = ANY(d.weather_kinds))
    AND (d.min_temp IS NULL OR (v_temp IS NOT NULL AND v_temp >= d.min_temp))
    AND (d.max_temp IS NULL OR (v_temp IS NOT NULL AND v_temp <= d.max_temp))
  ORDER BY COALESCE(d.sort_order, 999) ASC, d.key ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO public.oculto_special_cycle_sessions(cycle_key, room_slug, closes_at, status)
  VALUES (
    v_def.key,
    v_def.room_slug,
    now() + make_interval(mins => COALESCE(v_def.max_duration_minutes, 180)),
    'open'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM public._special_post_system_message(
    v_def.room_slug,
    COALESCE(v_def.emoji, '✨') || ' Ciclo especial "' || v_def.label || '" começou! Fecha em ' || COALESCE(v_def.max_duration_minutes, 180) || ' min.',
    'cycle_open'
  );

  v_opened := 1;
  RETURN v_opened;
END;
$$;

NOTIFY pgrst, 'reload schema';
