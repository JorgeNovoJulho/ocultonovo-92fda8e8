-- =====================================================================
-- APLICAR NO SUPABASE EXTERNO (rvybbrkzmboqbhcemqar)
-- SQL Editor → cole o conteúdo abaixo → Run.
--
-- Corrige o erro:
--   "Could not find the function public.vote_on_poll(p_option_id, p_poll_id)
--    in the schema cache"
--
-- Garante:
--   • Cada usuário pode votar UMA única vez por enquete
--   • Em apenas UMA opção
--   • Voto é IRREMOVÍVEL (sem DELETE / sem UPDATE)
-- =====================================================================

-- 1) Constraint de unicidade: 1 voto por (poll_id, voter_id)
--    Mesmo que a flag allow_multiple_votes esteja true por engano,
--    o banco recusa um segundo voto do mesmo usuário.
CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_unique_voter_per_poll
  ON public.poll_votes (poll_id, voter_id);

-- 2) RLS: bloquear UPDATE e DELETE em poll_votes (voto é imutável)
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voto não pode ser editado" ON public.poll_votes;
CREATE POLICY "Voto não pode ser editado"
  ON public.poll_votes FOR UPDATE
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Voto não pode ser removido" ON public.poll_votes;
CREATE POLICY "Voto não pode ser removido"
  ON public.poll_votes FOR DELETE
  USING (false);

-- 3) Função vote_on_poll — sempre força voto único e irrevogável
CREATE OR REPLACE FUNCTION public.vote_on_poll(
  p_poll_id  UUID,
  p_option_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll          RECORD;
  v_voter         RECORD;
  v_voter_credits RECORD;
  v_vote_id       UUID;
  v_net_amount    NUMERIC;
  v_option_exists BOOLEAN;
BEGIN
  -- Verifica se a opção pertence à enquete
  SELECT EXISTS(
    SELECT 1 FROM poll_options
    WHERE id = p_option_id AND poll_id = p_poll_id
  ) INTO v_option_exists;

  IF NOT v_option_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opção inválida');
  END IF;

  -- Carrega a enquete
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enquete não encontrada');
  END IF;

  -- Bloqueia se encerrada
  IF v_poll.closes_at IS NOT NULL AND v_poll.closes_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enquete encerrada');
  END IF;

  -- Carrega o votante
  SELECT * INTO v_voter FROM profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil não encontrado');
  END IF;

  -- Voto único por enquete (IGNORA allow_multiple_votes — regra de negócio)
  IF EXISTS (
    SELECT 1 FROM poll_votes
    WHERE poll_id = p_poll_id AND voter_id = v_voter.id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_VOTED',
      'error', 'Você já votou nesta enquete'
    );
  END IF;

  -- Enquetes pagas
  IF v_poll.entry_cost > 0 THEN
    SELECT * INTO v_voter_credits FROM user_credits WHERE user_id = v_voter.id;

    IF NOT FOUND OR COALESCE(v_voter_credits.credits_balance, 0) < v_poll.entry_cost THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Créditos insuficientes',
        'required', v_poll.entry_cost,
        'available', COALESCE(v_voter_credits.credits_balance, 0),
        'code', 'INSUFFICIENT_CREDITS'
      );
    END IF;

    IF v_voter_credits.credits_frozen THEN
      RETURN jsonb_build_object('success', false, 'error', 'Seus créditos estão congelados');
    END IF;

    UPDATE user_credits
       SET credits_balance = credits_balance - v_poll.entry_cost,
           updated_at = now()
     WHERE user_id = v_voter.id;

    v_net_amount := v_poll.entry_cost * 0.9;

    UPDATE profiles
       SET balance = COALESCE(balance, 0) + v_net_amount
     WHERE id = v_poll.creator_id;

    INSERT INTO transactions (user_id, amount, type, status, description)
    VALUES
      (v_voter.id,        -v_poll.entry_cost, 'tip', 'completed', 'Voto em enquete paga'),
      (v_poll.creator_id,  v_net_amount,      'tip', 'completed', 'Voto recebido em enquete');
  END IF;

  -- Registra o voto (constraint UNIQUE blinda condição de corrida)
  INSERT INTO poll_votes (poll_id, option_id, voter_id, amount_paid)
  VALUES (p_poll_id, p_option_id, v_voter.id, v_poll.entry_cost)
  RETURNING id INTO v_vote_id;

  -- Atualiza contadores
  UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = p_option_id;
  UPDATE polls
     SET total_votes   = total_votes + 1,
         total_revenue = total_revenue + v_poll.entry_cost,
         updated_at    = now()
   WHERE id = p_poll_id;

  RETURN jsonb_build_object(
    'success', true,
    'vote_id', v_vote_id,
    'amount_paid', v_poll.entry_cost,
    'message', 'Voto registrado com sucesso!'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_VOTED',
      'error', 'Você já votou nesta enquete'
    );
END;
$$;

-- 4) Permissão de execução
GRANT EXECUTE ON FUNCTION public.vote_on_poll(UUID, UUID) TO authenticated, anon;

-- 5) Recarrega o cache do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';
