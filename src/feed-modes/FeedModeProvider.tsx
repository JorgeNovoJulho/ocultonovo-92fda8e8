import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useMyPlanStatus } from '@/hooks/useMyPlanStatus';
import {
  FEED_MODES,
  DEFAULT_FEED_MODE,
  MODES_FORCING_CARD,
  type FeedModeId,
  type FeedWidgetKey,
} from './modes.config';

export type FeedModeMinPlan = 'free' | 'premium' | 'vip';

export interface FeedModeConfigRow {
  mode_id: FeedModeId;
  label: string;
  description: string | null;
  enabled: boolean;
  min_plan: FeedModeMinPlan;
  sort_order: number;
  /** Override admin: mapa widget_key → boolean. Quando definido sobrescreve FEED_MODES. */
  widgets?: Partial<Record<FeedWidgetKey, boolean>> | null;
}

interface FeedModeContextValue {
  mode: FeedModeId;
  setMode: (m: FeedModeId, source?: 'selector' | 'onboarding' | 'admin' | 'system') => Promise<{ ok: boolean; reason?: 'plan_insufficient' | 'mode_not_available' | 'error' }>;
  shows: (key: FeedWidgetKey) => boolean;
  forcesCardLayout: boolean;
  availableModes: FeedModeConfigRow[];
  /** Plano atual do usuário (free se não logado / desconhecido) */
  userPlan: FeedModeMinPlan;
  /** Pode o usuário atual usar este modo (atende min_plan)? */
  canUseMode: (m: FeedModeId) => boolean;
  loading: boolean;
  /** Overrides do modo Personalizado: mapa widget_key → boolean. */
  customWidgets: Partial<Record<FeedWidgetKey, boolean>>;
  /** Atualiza/persiste um toggle do modo Personalizado em tempo real. */
  setCustomWidget: (key: FeedWidgetKey, enabled: boolean) => Promise<void>;
  /** Substitui todos os overrides do modo Personalizado de uma vez. */
  setCustomWidgetsBulk: (widgets: Partial<Record<FeedWidgetKey, boolean>>) => Promise<void>;
  /** Chave do widget atualmente sendo salvo (para indicador visual). */
  savingWidget: FeedWidgetKey | null;
  /** "saving" durante RPC, "saved" por 1.2s após sucesso, "error" em falha. */
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}

const FeedModeContext = createContext<FeedModeContextValue | null>(null);

const LS_KEY = 'oculto:feed_mode';

const PLAN_RANK: Record<FeedModeMinPlan, number> = { free: 1, premium: 2, vip: 3 };

function normalizePlan(p: string | undefined | null): FeedModeMinPlan {
  if (p === 'vip' || p === 'premium' || p === 'free') return p;
  return 'free';
}

export function FeedModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const planStatus = useMyPlanStatus();
  const userPlan: FeedModeMinPlan = normalizePlan(planStatus?.plan);

  const [mode, setModeState] = useState<FeedModeId>(() => {
    if (typeof window === 'undefined') return DEFAULT_FEED_MODE;
    // Migration v1: força modo 'limpo' uma única vez para TODOS os usuários
    // (mobile + desktop). Após isso, a escolha do usuário é preservada.
    const MIGRATION_KEY = 'oculto:feed_mode_default_limpo_v1';
    if (!window.localStorage.getItem(MIGRATION_KEY)) {
      try {
        window.localStorage.setItem(LS_KEY, 'limpo');
        window.localStorage.setItem(MIGRATION_KEY, '1');
      } catch {}
      return 'limpo';
    }
    const cached = window.localStorage.getItem(LS_KEY) as FeedModeId | null;
    return cached && cached in FEED_MODES ? cached : DEFAULT_FEED_MODE;
  });
  const [availableModes, setAvailableModes] = useState<FeedModeConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customWidgets, setCustomWidgets] = useState<Partial<Record<FeedWidgetKey, boolean>>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.localStorage.getItem('oculto:feed_widgets_custom') || '{}'); }
    catch { return {}; }
  });
  const [savingWidget, setSavingWidget] = useState<FeedWidgetKey | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Config admin — só busca/assina quando há usuário logado.
  // Para anônimos (landing/login/signup) não faz sentido carregar a config de
  // modos do feed, e isso evitava uma query + canal realtime no boot inicial.
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchConfig = async () => {
      const { data } = await supabase
        .from('oculto_feed_modes_config')
        .select('mode_id,label,description,enabled,min_plan,sort_order,widgets')
        .eq('enabled', true)
        .order('sort_order', { ascending: true });
      if (!cancelled && data) setAvailableModes(data as FeedModeConfigRow[]);
      if (!cancelled) setLoading(false);
    };
    fetchConfig();

    const unsub = subscribeTable('oculto_feed_modes_config', fetchConfig);

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.id]);

  // feed_mode do usuário + Realtime cross-device + sync entre abas
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // Migration v1: se acabamos de forçar 'limpo' para este browser,
      // persiste 'limpo' no perfil do usuário e ignora o valor antigo do servidor.
      const PROFILE_MIGRATION_KEY = `oculto:feed_mode_profile_limpo_v1:${user.id}`;
      const alreadyMigrated = window.localStorage.getItem(PROFILE_MIGRATION_KEY);
      if (!alreadyMigrated) {
        try {
          await supabase.rpc('set_feed_mode', { p_mode: 'limpo' });
          window.localStorage.setItem(PROFILE_MIGRATION_KEY, '1');
          window.localStorage.setItem(LS_KEY, 'limpo');
        } catch {}
        if (cancelled) return;
        setModeState('limpo');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('feed_mode, feed_widgets_custom')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const m = (data as any)?.feed_mode as FeedModeId | undefined;
      if (m && m in FEED_MODES) {
        setModeState(m);
        try { window.localStorage.setItem(LS_KEY, m); } catch {}
      }
      const wc = (data as any)?.feed_widgets_custom;
      const serverHasEntries = wc && typeof wc === 'object' && Object.keys(wc).length > 0;
      if (serverHasEntries) {
        setCustomWidgets(wc);
        try { window.localStorage.setItem('oculto:feed_widgets_custom', JSON.stringify(wc)); } catch {}
      } else {
        // Servidor vazio: se temos overrides locais, REENVIA para persistir
        // (recupera-se de falhas anteriores da RPC).
        try {
          const localRaw = window.localStorage.getItem('oculto:feed_widgets_custom');
          const local = localRaw ? JSON.parse(localRaw) : null;
          if (local && typeof local === 'object' && Object.keys(local).length > 0) {
            void supabase.rpc('set_feed_widgets_custom', { p_widgets: local });
          }
        } catch {}
      }
    })();

    // ── Realtime: sincroniza mudanças do feed_mode entre dispositivos
    // do mesmo usuário (ex.: trocou no mobile → desktop reflete na hora).
    const applyRealtimePayload = (payload: any) => {
      const next = payload?.new?.feed_mode as FeedModeId | undefined;
      if (next && next in FEED_MODES) {
        setModeState((prev) => (prev === next ? prev : next));
        try { window.localStorage.setItem(LS_KEY, next); } catch {}
      }
      const wc = payload?.new?.feed_widgets_custom;
      if (wc && typeof wc === 'object' && Object.keys(wc).length > 0) {
        setCustomWidgets(wc);
        try { window.localStorage.setItem('oculto:feed_widgets_custom', JSON.stringify(wc)); } catch {}
      }
    };
    // Filtro server-side antigo (`user_id=eq` ou `id=eq`) → agora aplicado client-side
    // sobre o bus compartilhado de `profiles`.
    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const row = payload?.new ?? {};
      if (row.user_id !== user.id && row.id !== user.id) return;
      applyRealtimePayload(payload);
    }, { events: ['UPDATE'] });

    // ── Storage: sincroniza entre abas do mesmo navegador (sem round-trip).
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === LS_KEY && ev.newValue) {
        const next = ev.newValue as FeedModeId;
        if (next in FEED_MODES) setModeState((prev) => (prev === next ? prev : next));
      }
      if (ev.key === 'oculto:feed_widgets_custom' && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          if (parsed && typeof parsed === 'object') setCustomWidgets(parsed);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      unsubProfiles();
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.id]);


  const canUseMode = useCallback((m: FeedModeId) => {
    const cfg = availableModes.find((x) => x.mode_id === m);
    if (!cfg) return true; // sem config ainda → permitir (fail-open client-side; servidor bloqueia)
    return PLAN_RANK[userPlan] >= PLAN_RANK[cfg.min_plan];
  }, [availableModes, userPlan]);

  const setMode = useCallback(async (m: FeedModeId, source: 'selector' | 'onboarding' | 'admin' | 'system' = 'selector') => {
    if (!(m in FEED_MODES)) return { ok: false, reason: 'mode_not_available' as const };
    if (!canUseMode(m)) return { ok: false, reason: 'plan_insufficient' as const };

    const prev = mode;
    if (prev === m) return { ok: true };
    // flushSync força commit síncrono → UI muda na MESMA tarefa do clique,
    // antes de qualquer await/round-trip. Zero delay perceptível.
    flushSync(() => setModeState(m));
    try { window.localStorage.setItem(LS_KEY, m); } catch {}
    // Notifica outras abas no mesmo navegador (StorageEvent não dispara na aba origem).
    try { window.dispatchEvent(new CustomEvent('oculto:feed-mode-changed', { detail: m })); } catch {}


    if (user?.id) {
      const { error } = await supabase.rpc('set_feed_mode', { p_mode: m });
      if (error) {
        // Para o modo "personalizado": NÃO faz rollback nem propaga erro.
        // O usuário sempre consegue abrir o painel/modal mesmo se o backend
        // ainda não tem o seed/CHECK atualizado — a escolha fica persistida
        // localmente e o servidor sincroniza assim que o SQL for aplicado.
        if (m === 'personalizado') {
          return { ok: true };
        }
        // rollback otimista para os demais modos
        setModeState(prev);
        try { window.localStorage.setItem(LS_KEY, prev); } catch {}
        const msg = error.message || '';
        if (msg.includes('plan_insufficient')) return { ok: false, reason: 'plan_insufficient' as const };
        if (msg.includes('mode_not_available')) return { ok: false, reason: 'mode_not_available' as const };
        return { ok: false, reason: 'error' as const };
      }
      // telemetria fire-and-forget
      try {
        void supabase.rpc('log_feed_mode_event', {
          p_mode_from: prev,
          p_mode_to: m,
          p_source: source,
        });
      } catch {}
    }
    return { ok: true };
  }, [user?.id, mode, canUseMode]);

  const shows = useCallback((key: FeedWidgetKey) => {
    // No modo Personalizado, o usuário decide widget-a-widget.
    // DEFAULT (sem override) = mesmas funções do modo "Limpo" (simples).
    if (mode === 'personalizado') {
      const override = customWidgets[key];
      if (override !== undefined) return !!override;
      return FEED_MODES.limpo.has(key);
    }
    // Override do admin (oculto_feed_modes_config.widgets) tem prioridade.
    const cfg = availableModes.find((m) => m.mode_id === mode);
    const adminWidgets = cfg?.widgets;
    if (adminWidgets && typeof adminWidgets === 'object' && key in adminWidgets) {
      return !!(adminWidgets as any)[key];
    }
    return FEED_MODES[mode].has(key);
  }, [mode, customWidgets, availableModes]);
  const forcesCardLayout = MODES_FORCING_CARD.has(mode);

  const setCustomWidget = useCallback(async (key: FeedWidgetKey, enabled: boolean) => {
    let computed: Partial<Record<FeedWidgetKey, boolean>> = {};
    flushSync(() => {
      setCustomWidgets((prev) => {
        const next = { ...prev, [key]: enabled };
        computed = next;
        return next;
      });
      setSavingWidget(key);
      setSaveState('saving');
    });
    try { window.localStorage.setItem('oculto:feed_widgets_custom', JSON.stringify(computed)); } catch {}
    try { window.dispatchEvent(new StorageEvent('storage', { key: 'oculto:feed_widgets_custom', newValue: JSON.stringify(computed) })); } catch {}
    let ok = true;
    if (user?.id) {
      try {
        const { error } = await supabase.rpc('set_feed_widgets_custom', { p_widgets: computed });
        if (error) { ok = false; console.warn('[FeedMode] set_feed_widgets_custom falhou:', error.message); }
      } catch (e) {
        ok = false;
        console.warn('[FeedMode] set_feed_widgets_custom exception:', e);
      }
    }
    setSaveState(ok ? 'saved' : 'error');
    setSavingWidget(null);
    window.setTimeout(() => {
      setSaveState((s) => (s === 'saved' || s === 'error' ? 'idle' : s));
    }, 1200);
  }, [user?.id]);

  const setCustomWidgetsBulk = useCallback(async (widgets: Partial<Record<FeedWidgetKey, boolean>>) => {
    flushSync(() => {
      setCustomWidgets(widgets);
      setSaveState('saving');
    });
    try { window.localStorage.setItem('oculto:feed_widgets_custom', JSON.stringify(widgets)); } catch {}
    try { window.dispatchEvent(new StorageEvent('storage', { key: 'oculto:feed_widgets_custom', newValue: JSON.stringify(widgets) })); } catch {}
    let ok = true;
    if (user?.id) {
      try {
        const { error } = await supabase.rpc('set_feed_widgets_custom', { p_widgets: widgets });
        if (error) { ok = false; console.warn('[FeedMode] set_feed_widgets_custom (bulk) falhou:', error.message); }
      } catch (e) { ok = false; console.warn('[FeedMode] set_feed_widgets_custom (bulk) exception:', e); }
    }
    setSaveState(ok ? 'saved' : 'error');
    window.setTimeout(() => setSaveState((s) => (s === 'saved' || s === 'error' ? 'idle' : s)), 1200);
  }, [user?.id]);

  const value = useMemo<FeedModeContextValue>(() => ({
    mode, setMode, shows, forcesCardLayout, availableModes, userPlan, canUseMode, loading,
    customWidgets, setCustomWidget, setCustomWidgetsBulk, savingWidget, saveState,
  }), [mode, setMode, shows, forcesCardLayout, availableModes, userPlan, canUseMode, loading, customWidgets, setCustomWidget, setCustomWidgetsBulk, savingWidget, saveState]);


  return <FeedModeContext.Provider value={value}>{children}</FeedModeContext.Provider>;
}

export function useFeedMode(): FeedModeContextValue {
  const ctx = useContext(FeedModeContext);
  if (!ctx) {
    return {
      mode: DEFAULT_FEED_MODE,
      setMode: async () => ({ ok: true }),
      shows: (k) => FEED_MODES[DEFAULT_FEED_MODE].has(k),
      forcesCardLayout: false,
      availableModes: [],
      userPlan: 'free',
      canUseMode: () => true,
      loading: false,
      customWidgets: {},
      setCustomWidgetsBulk: async () => {},
      setCustomWidget: async () => {},
      savingWidget: null,
      saveState: 'idle',
    };
  }
  return ctx;
}
