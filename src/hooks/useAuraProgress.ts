import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { AURA_XP_LEDGER_LOCAL_EVENT } from './useAuraXpInteraction';
import { sanitizeEntryDayProgress } from './auraEntryDayGuard';

export interface AuraProgress {
  xp: number;
  level: number;
  streak_days: number;
  xp_in_level: number;
  xp_to_next: number;
}

const FALLBACK: AuraProgress = { xp: 0, level: 1, streak_days: 0, xp_in_level: 0, xp_to_next: 50 };

/**
 * Aura Evolutiva — XP, nível e streak diário do usuário no Aura Match.
 * - Faz 1 chamada `aura_register_visit` por sessão (debounced via ref).
 * - Expõe `awardXp(amount, reason)` para outras interações.
 */
export function useAuraProgress(autoRegisterVisit = true) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<AuraProgress>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const visitedRef = useRef(false);
  const profileCreatedAtRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const profilePromise = (supabase as any)
      .from('profiles')
      .select('created_at,aura_xp,aura_level,aura_streak_days')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);
    const [{ data, error }, { data: rows }] = await Promise.all([
      (supabase as any).rpc('aura_get_progress'),
      profilePromise,
    ]);
    const p = Array.isArray(rows) ? rows[0] : null;
    profileCreatedAtRef.current = p?.created_at ?? profileCreatedAtRef.current;
    if (data && data[0]) {
      const r = data[0];
      setProgress(sanitizeEntryDayProgress({
        xp: r.xp ?? 0,
        level: r.level ?? 1,
        streak_days: r.streak_days ?? 0,
        xp_in_level: r.xp_in_level ?? 0,
        xp_to_next: r.xp_to_next ?? 50,
      }, profileCreatedAtRef.current));
    } else if (error) {
      if (p) {
        const xp = Number(p.aura_xp ?? 0);
        const level = Number(p.aura_level ?? 1);
        const floor = 50 * Math.max(level - 1, 0) * Math.max(level - 1, 0);
        const next = 50 * level * level;
        setProgress(sanitizeEntryDayProgress({
          xp,
          level,
          streak_days: Number(p.aura_streak_days ?? 0),
          xp_in_level: Math.max(0, xp - floor),
          xp_to_next: Math.max(1, next - floor),
        }, profileCreatedAtRef.current));
      }
    }
  }, [user?.id]);

  const registerVisit = useCallback(async () => {
    if (!user?.id || visitedRef.current) return;
    visitedRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('aura_register_visit');
      if (!error && data && data[0]) {
        const r = data[0];
        setProgress((p) => sanitizeEntryDayProgress({
          ...p,
          xp: r.xp ?? p.xp,
          level: r.level ?? p.level,
          streak_days: r.streak_days ?? p.streak_days,
        }, profileCreatedAtRef.current));
        if (r.awarded_xp > 0) {
          toast.success(`+${r.awarded_xp} XP de aura`, {
            description: r.streak_days > 1 ? `🔥 ${r.streak_days} dias seguidos` : 'Bem-vindo de volta',
            duration: 2500,
          });
        }
        if (r.level_up) {
          toast.success(`Nível ${r.level} desbloqueado!`, {
            description: 'Sua aura ficou mais intensa.',
            duration: 4000,
          });
        }
        await refresh();
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, refresh]);

  const awardXp = useCallback(
    async (amount: number, reason?: string) => {
      if (!user?.id || !amount) return;
      const { data } = await (supabase as any).rpc('aura_award_xp', {
        p_amount: amount,
        p_reason: reason ?? null,
      });
      if (data && data[0]) {
        if (data[0].level_up) {
          toast.success(`Nível ${data[0].level} desbloqueado!`, { duration: 4000 });
        }
        await refresh();
      }
    },
    [user?.id, refresh]
  );

  useEffect(() => {
    if (!user?.id) return;
    refresh();
    if (autoRegisterVisit) {
      // pequeno delay para não competir com o boot da página
      const t = setTimeout(() => registerVisit(), 800);
      return () => clearTimeout(t);
    }
  }, [user?.id, autoRegisterVisit, refresh, registerVisit]);

  // Realtime: refresh + toast ao receber qualquer evento do ledger de XP de interação.
  // RLS já filtra para entregar somente linhas em que o usuário é actor ou receiver.
  useEffect(() => {
    if (!user?.id) return;

    const unsub = subscribeTable('oculto_aura_xp_interaction_ledger', async (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const row = payload?.new ?? {};
      try {
        const { data: profRows } = await (supabase as any)
          .from('v_public_profiles')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1);
        const myProfileId = Array.isArray(profRows) ? profRows[0]?.id : null;
        if (myProfileId && row.receiver_id === myProfileId && row.actor_id !== myProfileId) {
          const reward = Number(row.receiver_reward ?? 0);
          if (reward > 0) {
            toast.success(`+${reward} XP de Aura`, {
              description: 'Alguém interagiu com você 💛',
              duration: 2600,
            });
          } else if (reward < 0) {
            toast(`${reward} XP de Aura`, {
              description: 'Um descurtir reduziu seu XP',
              duration: 2600,
            });
          }
        }
      } catch { /* noop */ }
      refresh();
    }, { events: ['INSERT'] });

    // Realtime no próprio perfil: aplica aura_xp/aura_level instantaneamente
    // (sem precisar recarregar) quando o backend credita conquistas/XP.
    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const row = payload?.new ?? {};
      if (row?.user_id !== user.id) return;
      profileCreatedAtRef.current = row?.created_at ?? profileCreatedAtRef.current;
      const newXp = Number(row?.aura_xp ?? NaN);
      if (!Number.isFinite(newXp)) return;
      setProgress((p) => {
        if (p.xp === newXp) return p;
        const level = Number(row?.aura_level ?? p.level);
        const floor = 50 * Math.max(level - 1, 0) * Math.max(level - 1, 0);
        const next = 50 * level * level;
        return sanitizeEntryDayProgress({
          ...p,
          xp: newXp,
          level,
          streak_days: Number(row?.aura_streak_days ?? p.streak_days),
          xp_in_level: Math.max(0, newXp - floor),
          xp_to_next: Math.max(1, next - floor),
        }, profileCreatedAtRef.current);
      });
    }, { events: ['UPDATE'] });

    // Realtime de claims do próprio usuário — toast + refresh imediato.
    const unsubClaims = subscribeTable('oculto_aura_achievement_claims', (payload: any) => {
      const row = payload?.new ?? {};
      if (row?.user_id !== user.id) return;
      const xp = Number(row?.xp_awarded ?? 0);
      if (xp > 0) {
        toast.success(`+${xp.toLocaleString('pt-BR')} XP de conquista`, {
          description: 'Aplicado ao seu saldo de Aura.',
          duration: 3200,
        });
      }
      refresh();
    }, { events: ['INSERT'] });

    const localHandler = () => { refresh(); };
    window.addEventListener(AURA_XP_LEDGER_LOCAL_EVENT, localHandler);

    // Fallback: a cada 30s revalida o saldo caso o realtime caia.
    const poll = window.setInterval(() => { refresh(); }, 30_000);

    return () => {
      unsub();
      unsubProfiles();
      unsubClaims();
      window.removeEventListener(AURA_XP_LEDGER_LOCAL_EVENT, localHandler);
      window.clearInterval(poll);
    };

  }, [user?.id, refresh]);

  return { progress, loading, awardXp, refresh };
}
