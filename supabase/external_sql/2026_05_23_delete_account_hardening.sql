-- =====================================================================
-- delete_user_account — hardening: cobre tabelas oculto_* que travavam
-- a exclusão (FK para auth.users sem CASCADE) e impediam usuários
-- reais de excluir suas contas.
--
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  -- 1) Arquiva no Cemitério (não bloqueia se falhar)
  BEGIN
    PERFORM public.archive_user_to_graveyard(target_user_id, 'self_deletion', 'self');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'graveyard_archive_failed: %', SQLERRM;
  END;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = target_user_id LIMIT 1;

  -- 2) Cleanup defensivo (cada bloco isolado para nunca abortar o restante)
  --    Lista expandida para cobrir TODAS as tabelas que referenciam
  --    auth.users / profiles sem ON DELETE CASCADE e que travavam a
  --    remoção final do auth user.
  BEGIN DELETE FROM public.notifications              WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.messages                   WHERE sender_id = target_user_id OR receiver_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.conversation_participants  WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.post_likes                 WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.post_comments              WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.comments                   WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.posts                      WHERE author_id = v_profile_id OR user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.follows                    WHERE follower_id = target_user_id OR following_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.subscriptions              WHERE user_id = target_user_id OR creator_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Aura ecosystem
  BEGIN DELETE FROM public.oculto_aura_duels          WHERE challenger_id = target_user_id OR opponent_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_aura_daily_quests   WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_aura_weekly_chests  WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.aura_pulses                WHERE sender_id = target_user_id OR target_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.aura_pings                 WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_aura_xp_gifts       WHERE sender_id = target_user_id OR receiver_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_aura_streaks        WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_retention_progress  WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Presence / sessions / radar
  BEGIN DELETE FROM public.online_presence            WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.looking_now                WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_active_sessions     WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.oculto_presence_signals    WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Stories / saved / blocks
  BEGIN DELETE FROM public.stories                    WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.saved_posts                WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.user_blocks                WHERE blocker_id = target_user_id OR blocked_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Discovery / matches
  BEGIN DELETE FROM public.discovery_actions          WHERE user_id = target_user_id OR target_user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.looking_now_matches        WHERE user_a = target_user_id OR user_b = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Push / devices / consents (mantém logs fiscais)
  BEGIN DELETE FROM public.push_subscriptions         WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.user_devices               WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.user_roles                 WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Profile por último (após dependências locais)
  BEGIN DELETE FROM public.profiles                   WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
