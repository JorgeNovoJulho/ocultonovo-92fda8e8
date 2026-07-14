/**
 * useOnboarding — exibe o tour pós-login e respeita a janela de reexibição.
 *
 * Regras atuais:
 *  - ao fechar ou concluir com lembrete ativo, o modal some por 30 dias
 *  - após 30 dias da última exibição, volta a aparecer
 *  - legado com onboarding_dismissed_forever é tratado como snooze de 30 dias
 *
 * Persistência: profiles.onboarding_* (RLS: user_id = auth.uid()).
 * Fail-open: se a query falhar, exibe o onboarding (não bloqueia o usuário).
 * Race-safe: aguarda authLoading antes de consultar.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import {
  REMIND_MS,
  getLocalHideUntil,
  isLocallyHidden,
  setLocalHideForThirtyDays,
  clearLocalHide,
} from '@/lib/onboardingDismissal';

const PROFILE_ONBOARDING_COLUMNS =
  'id, user_id, onboarding_dismissed_forever, onboarding_completed, onboarding_hide_until, onboarding_current_step, onboarding_intent, onboarding_last_seen_at, login_count';

function buildProfileBootstrap(user: User) {
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const fallbackName = String(metadata.name || metadata.full_name || user.email?.split('@')[0] || 'Usuário');
  const fallbackUsername = String(metadata.username || fallbackName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || `user_${user.id.slice(0, 8)}`;

  return {
    id: user.id,
    user_id: user.id,
    name: fallbackName,
    username: fallbackUsername,
  };
}

export function useOnboarding() {
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [initialStep, setInitialStep] = useState(0);
  const [intent, setIntent] = useState<'creator' | 'user' | null>(null);
  const [checking, setChecking] = useState(true);
  const evaluatedRef = useRef<string | null>(null); // evita reabrir após dismiss na mesma sessão

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setChecking(false);
      setOpen(false);
      return;
    }
    // Já avaliamos para este usuário nesta sessão? Não reabrir
    if (evaluatedRef.current === user.id) return;

    // Bloqueio local persistente (sobrevive a reload/reabrir navegador).
    // Se ainda estiver dentro da janela de 30 dias → não consulta DB nem abre.
    if (isLocallyHidden(user.id)) {
      evaluatedRef.current = user.id;
      setOpen(false);
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        let { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_ONBOARDING_COLUMNS)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!data) {
          const fallback = await supabase
            .from('profiles')
            .select(PROFILE_ONBOARDING_COLUMNS)
            .eq('id', user.id)
            .maybeSingle();

          data = fallback.data;
          error = fallback.error;

          if (fallback.data && !fallback.data.user_id) {
            await supabase.from('profiles').update({ user_id: user.id } as never).eq('id', user.id);
            data = { ...fallback.data, user_id: user.id };
          }
        }

        if (!data && !error) {
          const bootstrap = await supabase
            .from('profiles')
            .upsert(buildProfileBootstrap(user) as never, { onConflict: 'id' })
            .select(PROFILE_ONBOARDING_COLUMNS)
            .maybeSingle();

          data = bootstrap.data;
          error = bootstrap.error;
        }

        if (cancelled) return;
        evaluatedRef.current = user.id;

        // Fail-open: erro na query → mostra
        if (error || !data) {
          setOpen(true);
          setInitialStep(0);
          return;
        }

        const row = data as any;
        setIntent((row.onboarding_intent as 'creator' | 'user') || null);
        const now = Date.now();
        const hideUntilMs = row.onboarding_hide_until
          ? new Date(row.onboarding_hide_until).getTime()
          : 0;
        const lastSeenMs = row.onboarding_last_seen_at
          ? new Date(row.onboarding_last_seen_at).getTime()
          : 0;
        const legacyHideUntilMs = row.onboarding_dismissed_forever && lastSeenMs
          ? lastSeenMs + REMIND_MS
          : 0;
        const effectiveHideUntilMs = Math.max(hideUntilMs || 0, legacyHideUntilMs || 0);

        if (effectiveHideUntilMs && effectiveHideUntilMs > now) {
          setOpen(false);
          return;
        }

        // Não exibir o tour logo após o cadastro: só aparece a partir do 2º login.
        const loginCount = Number(row.login_count ?? 0);
        if (loginCount < 2) {
          setOpen(false);
          return;
        }

        setInitialStep(row.onboarding_completed ? 0 : Number(row.onboarding_current_step) || 0);
        setOpen(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const update = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!user) return;
      try {
        const payload = { ...patch, user_id: user.id };

        const byUserId = await supabase
          .from('profiles')
          .update(payload as never)
          .eq('user_id', user.id)
          .select('id')
          .maybeSingle();

        if (byUserId.data) return;

        const byId = await supabase
          .from('profiles')
          .update(payload as never)
          .eq('id', user.id)
          .select('id')
          .maybeSingle();

        if (byId.data) return;

        await supabase
          .from('profiles')
          .upsert({ ...buildProfileBootstrap(user), ...payload } as never, { onConflict: 'id' });
      } catch {
        /* silent */
      }
    },
    [user?.id]
  );

  const buildHideUntil = useCallback(() => new Date(Date.now() + REMIND_MS), []);

  // Fechar/adiar → re-aparece em 30 dias (persistido em localStorage + DB)
  const skip = useCallback(
    async (currentStep: number) => {
      setOpen(false);
      setLocalHideForThirtyDays(user?.id);
      const hideUntil = buildHideUntil();
      await update({
        onboarding_dismissed_forever: false,
        onboarding_last_seen_at: new Date().toISOString(),
        onboarding_hide_until: hideUntil.toISOString(),
        onboarding_current_step: currentStep,
      });
    },
    [buildHideUntil, update, user?.id]
  );

  const closeNow = useCallback(
    async (currentStep: number) => {
      setOpen(false);
      clearLocalHide(user?.id);
      await update({
        onboarding_dismissed_forever: false,
        onboarding_last_seen_at: new Date().toISOString(),
        onboarding_hide_until: null,
        onboarding_current_step: currentStep,
      });
    },
    [update, user?.id]
  );

  // Concluiu todas as etapas
  const complete = useCallback(async () => {
    setOpen(false);
    setLocalHideForThirtyDays(user?.id);
    const hideUntil = buildHideUntil();
    await update({
      onboarding_dismissed_forever: false,
      onboarding_completed: true,
      onboarding_last_seen_at: new Date().toISOString(),
      onboarding_hide_until: hideUntil.toISOString(),
      onboarding_current_step: 0,
    });
  }, [buildHideUntil, update, user?.id]);

  const completeNow = useCallback(async () => {
    setOpen(false);
    clearLocalHide(user?.id);
    await update({
      onboarding_dismissed_forever: false,
      onboarding_completed: true,
      onboarding_last_seen_at: new Date().toISOString(),
      onboarding_hide_until: null,
      onboarding_current_step: 0,
    });
  }, [update, user?.id]);

  const dismissForThirtyDays = useCallback(async () => {
    await skip(0);
  }, [skip]);

  /** Estado atual do bloqueio local (para refletir no checkbox ao recarregar). */
  const isHiddenLocally = useCallback(
    () => isLocallyHidden(user?.id),
    [user?.id]
  );
  const getHideUntilTs = useCallback(
    () => getLocalHideUntil(user?.id),
    [user?.id]
  );

  // Salva progresso por etapa (debounced no caller)
  const saveStep = useCallback(
    async (step: number) => {
      await update({ onboarding_current_step: step });
    },
    [update]
  );

  // Salva intenção ("creator" | "user") escolhida no Step 0
  const setOnboardingIntent = useCallback(
    async (value: 'creator' | 'user') => {
      setIntent(value);
      await update({ onboarding_intent: value });
    },
    [update]
  );

  // QA helpers (dev only)
  const forceOpen = useCallback((step = 0) => {
    setInitialStep(step);
    setOpen(true);
  }, []);

  const resetFlags = useCallback(async () => {
    clearLocalHide(user?.id);
    await update({
      onboarding_dismissed_forever: false,
      onboarding_completed: false,
      onboarding_hide_until: null,
      onboarding_current_step: 0,
    });
    evaluatedRef.current = null;
    setInitialStep(0);
    setOpen(true);
  }, [update, user?.id]);

  return {
    open,
    initialStep,
    intent,
    checking,
    skip,
    closeNow,
    complete,
    completeNow,
    dismissForThirtyDays,
    isHiddenLocally,
    getHideUntilTs,
    saveStep,
    setOnboardingIntent,
    forceOpen,
    resetFlags,
  };
}
