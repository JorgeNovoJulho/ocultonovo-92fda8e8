-- HOTFIX: alinhar checagem de master nas RPCs de manutenção com o frontend
-- (has_role admin_master OU username='ocultomaster' OU email canônico OU profiles.is_admin)
CREATE OR REPLACE FUNCTION public._is_master_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin_master')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = _uid
         AND (lower(coalesce(p.username,'')) = 'ocultomaster'
              OR coalesce(p.is_admin, false) = true)
    )
    OR EXISTS (
      SELECT 1 FROM auth.users u
       WHERE u.id = _uid
         AND lower(u.email) = 'ocultomaster@ocultoswing.com.br'
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public._is_master_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_maintenance(p_enabled boolean, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.platform_runtime_settings;
BEGIN
  IF NOT public._is_master_admin(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin_master can toggle maintenance';
  END IF;
  UPDATE public.platform_runtime_settings
     SET maintenance_enabled  = p_enabled,
         maintenance_message  = COALESCE(NULLIF(p_message,''), maintenance_message),
         maintenance_started_at  = CASE WHEN p_enabled AND maintenance_started_at IS NULL THEN now()
                                        WHEN p_enabled THEN maintenance_started_at
                                        ELSE maintenance_started_at END,
         maintenance_finished_at = CASE WHEN p_enabled THEN NULL ELSE now() END,
         force_logout_version    = CASE WHEN p_enabled THEN coalesce(force_logout_version,0) + 1
                                        ELSE coalesce(force_logout_version,0) END,
         updated_at = now()
   WHERE id = (SELECT id FROM public.platform_runtime_settings ORDER BY created_at ASC LIMIT 1)
   RETURNING * INTO v_row;
  INSERT INTO public.oculto_maintenance_audit (action, actor_user_id, meta)
  VALUES (CASE WHEN p_enabled THEN 'enable' ELSE 'disable' END, v_uid,
          jsonb_build_object('message', v_row.maintenance_message,
                             'force_logout_version', v_row.force_logout_version));
  RETURN public.get_maintenance_state();
END $$;
GRANT EXECUTE ON FUNCTION public.set_maintenance(boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.force_logout_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._is_master_admin(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin_master can force logout';
  END IF;
  UPDATE public.platform_runtime_settings
     SET force_logout_version = coalesce(force_logout_version,0) + 1, updated_at = now()
   WHERE id = (SELECT id FROM public.platform_runtime_settings ORDER BY created_at ASC LIMIT 1);
  INSERT INTO public.oculto_maintenance_audit (action, actor_user_id, meta)
  VALUES ('force_logout', v_uid, '{}'::jsonb);
  RETURN public.get_maintenance_state();
END $$;
GRANT EXECUTE ON FUNCTION public.force_logout_all() TO authenticated;

NOTIFY pgrst, 'reload schema';
