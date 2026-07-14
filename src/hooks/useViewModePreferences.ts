/**
 * Hook central para os Modos de Visualização do Oculto.
 *
 * - Persistência em oculto_user_experience_preferences (Supabase externo).
 * - Auto-cria a preferência (view_mode='simple') no primeiro acesso.
 * - Optimistic updates via React Query.
 * - Atualização realtime entre dispositivos.
 * - Fallback local quando offline / pré-login.
 *
 * Independente do FeedModeProvider legado (que continua ativo).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useExperienceSettings } from '@/hooks/useExperienceSettings';
import {
  HOME_SECTIONS,
  ALWAYS_ON_SECTIONS,
  DEFAULT_SIMPLE_SECTIONS,
  DEFAULT_COMPLETE_SECTIONS,
  type HomeViewMode,
  type HomeSectionKey,
} from '@/config/homeSections';

const LS_KEY = 'oculto:view_mode_prefs_v1';
const BC_NAME = 'oculto:view_mode_prefs';
const DEFAULT_SNOOZE_HOURS = 24 * 30; // 30 dias

// BroadcastChannel singleton — sincroniza toggles entre abas sem reload.
let _bc: BroadcastChannel | null = null;
function getBC(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!_bc) {
    try { _bc = new BroadcastChannel(BC_NAME); } catch { _bc = null; }
  }
  return _bc;
}

interface PreferencesRow {
  id: string;
  user_id: string;
  view_mode: HomeViewMode;
  has_seen_view_mode_modal: boolean;
  modal_seen_at: string | null;
  modal_snoozed_until: string | null;
  custom_sections: Record<string, boolean>;
  version: number;
  created_at: string;
  updated_at: string;
}

interface LocalCache {
  view_mode: HomeViewMode;
  custom_sections: Record<string, boolean>;
  has_seen_view_mode_modal: boolean;
  modal_snoozed_until: string | null;
}

function readLocal(): LocalCache | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeLocal(c: Partial<LocalCache>) {
  try {
    const prev = readLocal() ?? {
      view_mode: 'simple' as HomeViewMode,
      custom_sections: {},
      has_seen_view_mode_modal: false,
      modal_snoozed_until: null,
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...c }));
  } catch {}
}

const DEFAULT_ROW: Pick<PreferencesRow, 'view_mode' | 'has_seen_view_mode_modal' | 'modal_snoozed_until' | 'custom_sections'> = {
  view_mode: 'simple',
  has_seen_view_mode_modal: false,
  modal_snoozed_until: null,
  custom_sections: {},
};

async function fetchOrCreate(userId: string, defaultMode: HomeViewMode = 'simple'): Promise<PreferencesRow> {
  const { data: existing } = await supabase
    .from('oculto_user_experience_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return existing as PreferencesRow;

  const { data: created, error } = await supabase
    .from('oculto_user_experience_preferences')
    .insert({ user_id: userId, ...DEFAULT_ROW, view_mode: defaultMode })
    .select('*')
    .single();

  if (error) {
    const { data: retry } = await supabase
      .from('oculto_user_experience_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (retry) return retry as PreferencesRow;
    throw error;
  }
  return created as PreferencesRow;
}

export interface UseViewModePreferences {
  viewMode: HomeViewMode;
  customSections: Record<string, boolean>;
  isLoading: boolean;
  isSectionEnabled: (key: HomeSectionKey | string) => boolean;
  setViewMode: (mode: HomeViewMode) => Promise<void>;
  toggleSection: (key: HomeSectionKey | string, enabled: boolean) => Promise<void>;
  setCustomSections: (sections: Record<string, boolean>) => Promise<void>;
  shouldShowMigrationModal: boolean;
  markModalSeen: () => Promise<void>;
  snoozeModal: (hours?: number) => Promise<void>;
  resetToSimple: () => Promise<void>;
  enableComplete: () => Promise<void>;
}

export function useViewModePreferences(): UseViewModePreferences {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const { data: settings } = useExperienceSettings();

  const queryKey = useMemo(() => ['oculto-view-mode-prefs', userId], [userId]);

  const query = useQuery<PreferencesRow | null>({
    queryKey,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      if (!userId) return null;
      // Usuários existentes/migrando recebem o default_existing_user_mode.
      // (Novos signups podem ser bootstrapados via default_new_user_mode em um hook
      // dedicado de signup; aqui mantemos o padrão "existing" para segurança.)
      const defaultMode = settings?.default_existing_user_mode ?? 'simple';
      const row = await fetchOrCreate(userId, defaultMode);
      writeLocal({
        view_mode: row.view_mode,
        custom_sections: row.custom_sections ?? {},
        has_seen_view_mode_modal: row.has_seen_view_mode_modal,
        modal_snoozed_until: row.modal_snoozed_until,
      });
      return row;
    },
  });

  // Realtime — atualiza entre dispositivos
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeTable('oculto_user_experience_preferences', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.user_id !== userId) return;
      qc.invalidateQueries({ queryKey });
    });
    return () => { unsub(); };
  }, [userId, qc, queryKey]);


  // BroadcastChannel — sincroniza outras abas do mesmo navegador sem reload.
  useEffect(() => {
    const bc = getBC();
    if (!bc) return;
    const handler = (ev: MessageEvent) => {
      const msg = ev?.data;
      if (!msg || msg.userId !== userId) return;
      if (msg.type === 'prefs:update' && msg.row) {
        qc.setQueryData(queryKey, msg.row);
        writeLocal({
          view_mode: msg.row.view_mode,
          custom_sections: msg.row.custom_sections ?? {},
          has_seen_view_mode_modal: !!msg.row.has_seen_view_mode_modal,
          modal_snoozed_until: msg.row.modal_snoozed_until ?? null,
        });
      }
    };
    bc.addEventListener('message', handler);
    return () => { try { bc.removeEventListener('message', handler); } catch {} };
  }, [userId, qc, queryKey]);

  // Fallback extra para mobile/Safari: sincroniza entre abas via evento storage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== LS_KEY || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue) as LocalCache;
        qc.setQueryData(queryKey, (prev: PreferencesRow | null) => {
          if (!prev || !userId) return prev;
          return {
            ...prev,
            view_mode: parsed.view_mode ?? prev.view_mode,
            custom_sections: parsed.custom_sections ?? prev.custom_sections,
            has_seen_view_mode_modal: parsed.has_seen_view_mode_modal ?? prev.has_seen_view_mode_modal,
            modal_snoozed_until: parsed.modal_snoozed_until ?? prev.modal_snoozed_until,
          };
        });
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [qc, queryKey, userId]);



  const local = readLocal();
  const row = query.data ?? null;

  const viewMode: HomeViewMode = row?.view_mode ?? local?.view_mode ?? 'simple';
  const customSections: Record<string, boolean> = row?.custom_sections ?? local?.custom_sections ?? {};

  const shouldShowMigrationModal = useMemo(() => {
    if (!userId) return false;
    if (!row) return false;
    if (settings && settings.enabled === false) return false;
    if (settings && settings.force_migration_modal === false) return false;
    if (row.has_seen_view_mode_modal) return false;
    if (row.modal_snoozed_until && new Date(row.modal_snoozed_until).getTime() > Date.now()) return false;
    return true;
  }, [userId, row, settings]);

  const isSectionEnabled = useCallback((key: HomeSectionKey | string): boolean => {
    if (ALWAYS_ON_SECTIONS.has(key as HomeSectionKey)) return true;

    // Override do admin (sections_config) só afeta o Modo Simples.
    // No Completo tudo segue ligado; no Custom prevalece a escolha do usuário.
    const override = settings?.sections_config?.[key as HomeSectionKey];

    if (viewMode === 'complete') return DEFAULT_COMPLETE_SECTIONS[key as HomeSectionKey] ?? true;
    if (viewMode === 'simple') {
      if (override && typeof override.in_simple === 'boolean') return override.in_simple;
      return DEFAULT_SIMPLE_SECTIONS[key as HomeSectionKey] ?? false;
    }
    // custom
    return customSections[key] ?? false;
  }, [viewMode, customSections, settings]);


  // Mutation genérica — optimistic
  const mutation = useMutation({
    mutationFn: async (patch: Partial<PreferencesRow>) => {
      if (!userId) throw new Error('not_authenticated');
      const { data, error } = await supabase
        .from('oculto_user_experience_preferences')
        .update(patch)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) throw error;
      return data as PreferencesRow;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<PreferencesRow | null>(queryKey);
      const optimistic: PreferencesRow | null = prev
        ? { ...prev, ...patch }
        : null;
      if (optimistic) qc.setQueryData(queryKey, optimistic);
      writeLocal({
        view_mode: optimistic?.view_mode ?? viewMode,
        custom_sections: optimistic?.custom_sections ?? customSections,
        has_seen_view_mode_modal: optimistic?.has_seen_view_mode_modal ?? false,
        modal_snoozed_until: optimistic?.modal_snoozed_until ?? null,
      });
      return { prev };
    },
    onError: (err: any, _p, ctx) => {
      // Rollback otimista — UI + cache local.
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKey, ctx.prev);
        const prev = ctx.prev as PreferencesRow | null;
        if (prev) {
          writeLocal({
            view_mode: prev.view_mode,
            custom_sections: prev.custom_sections ?? {},
            has_seen_view_mode_modal: !!prev.has_seen_view_mode_modal,
            modal_snoozed_until: prev.modal_snoozed_until ?? null,
          });
        }
      }
      const msg = err?.message || 'Não foi possível salvar sua preferência. Tente novamente.';
      try { toast.error('Falha ao atualizar seção', { description: msg }); } catch {}
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKey, data);
      writeLocal({
        view_mode: data.view_mode,
        custom_sections: data.custom_sections ?? {},
        has_seen_view_mode_modal: !!data.has_seen_view_mode_modal,
        modal_snoozed_until: data.modal_snoozed_until ?? null,
      });
      // Notifica outras abas instantaneamente.
      try { getBC()?.postMessage({ type: 'prefs:update', userId, row: data }); } catch {}
    },
  });

  // Telemetria fire-and-forget — não bloqueia UI, nunca lança.
  const logEvent = useCallback(
    (eventType: 'view_mode_changed' | 'section_toggled', payload: Record<string, unknown>) => {
      if (!userId) return;
      (supabase as any)
        .rpc('log_view_mode_event', {
          p_event_type: eventType,
          p_payload: payload,
        })
        .then(() => {})
        .catch(() => {});
    },
    [userId]
  );

  const setViewMode = useCallback(async (mode: HomeViewMode, source: 'settings' | 'modal' | 'admin' | 'system' = 'settings') => {
    const previous = viewMode;
    await mutation.mutateAsync({ view_mode: mode });
    if (previous !== mode) logEvent('view_mode_changed', { from: previous, to: mode, source });
  }, [mutation, viewMode, logEvent]);

  const setCustomSectionsMut = useCallback(async (sections: Record<string, boolean>) => {
    await mutation.mutateAsync({ custom_sections: sections, view_mode: 'custom' });
  }, [mutation]);

  const toggleSection = useCallback(async (key: HomeSectionKey | string, enabled: boolean) => {
    if (ALWAYS_ON_SECTIONS.has(key as HomeSectionKey)) return;
    const base = (row?.custom_sections && Object.keys(row.custom_sections).length > 0)
      ? row.custom_sections
      : (viewMode === 'simple' ? DEFAULT_SIMPLE_SECTIONS : DEFAULT_COMPLETE_SECTIONS);
    const next = { ...base, [key]: enabled };
    await mutation.mutateAsync({ custom_sections: next, view_mode: 'custom' });
    logEvent('section_toggled', { section: key, enabled });
  }, [mutation, row, viewMode, logEvent]);

  const markModalSeen = useCallback(async () => {
    await mutation.mutateAsync({
      has_seen_view_mode_modal: true,
      modal_seen_at: new Date().toISOString(),
    });
  }, [mutation]);

  const snoozeModal = useCallback(async (hours?: number) => {
    const h = typeof hours === 'number' && hours > 0 ? hours : DEFAULT_SNOOZE_HOURS;
    const until = new Date(Date.now() + h * 3_600_000).toISOString();
    await mutation.mutateAsync({ modal_snoozed_until: until });
  }, [mutation]);

  const resetToSimple = useCallback(async () => {
    await mutation.mutateAsync({ view_mode: 'simple', custom_sections: {} });
  }, [mutation]);

  const enableComplete = useCallback(async () => {
    await mutation.mutateAsync({ view_mode: 'complete' });
  }, [mutation]);

  return {
    viewMode,
    customSections,
    isLoading: query.isLoading,
    isSectionEnabled,
    setViewMode,
    toggleSection,
    setCustomSections: setCustomSectionsMut,
    shouldShowMigrationModal,
    markModalSeen,
    snoozeModal,
    resetToSimple,
    enableComplete,
  };
}
