import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type SocialBetaLevel = 'leve' | 'divertido' | 'provocante' | 'avancado';

export interface SocialBetaModule {
  code: string;
  label: string;
  description: string | null;
  max_level: SocialBetaLevel;
  cooldown_seconds: number;
  allowed_context: 'duo' | 'grupo' | 'ambos';
  enabled: boolean;
  sort_order: number;
}

export interface SocialBetaCard {
  id: string;
  module_code: string;
  category: string | null;
  level: SocialBetaLevel;
  content: string;
  payload?: Record<string, unknown> | null;
}

const LOCALE = 'pt-BR';

export function useSocialBetaModules() {
  return useQuery<SocialBetaModule[]>({
    queryKey: ['social-beta-modules', LOCALE],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('social_beta_list_modules', { _locale: LOCALE });
      if (error) throw error;
      return ((data ?? []) as SocialBetaModule[])
        .filter((m) => m.enabled)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
  });
}

export function useSocialBetaConsent() {
  const { user } = useAuth();
  const [accepting, setAccepting] = useState(false);

  const accept = useCallback(async (maxLevel: SocialBetaLevel) => {
    if (!user?.id) return;
    setAccepting(true);
    try {
      await (supabase as any).rpc('social_beta_accept_consent', {
        _max_accepted_level: maxLevel, _version: 'v1',
      });
    } finally { setAccepting(false); }
  }, [user?.id]);

  return { accept, accepting };
}

export function useSocialBetaRuntime(sessionId: string, moduleCode: string | null) {
  const [card, setCard] = useState<SocialBetaCard | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logEvent = useCallback(async (kind: string, payload: Record<string, unknown> = {}) => {
    if (!moduleCode) return;
    await (supabase as any).rpc('social_beta_log_event', {
      _session_id: sessionId,
      _module_code: moduleCode,
      _kind: kind,
      _card_id: (payload as any).card_id ?? null,
      _target_id: (payload as any).target_id ?? null,
      _level: (payload as any).level ?? null,
      _payload: payload ?? {},
    });
  }, [sessionId, moduleCode]);

  const drawCard = useCallback(async () => {
    if (!moduleCode || drawing) return;
    setDrawing(true); setError(null);
    try {
      const { data, error } = await (supabase as any).rpc('social_beta_draw_card', {
        _session_id: sessionId, _module_code: moduleCode, _max_level: null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setCard((row as SocialBetaCard) ?? null);
      if (row) await logEvent('card_drawn', { card_id: row.id, level: row.level });
    } catch (e: any) {
      setError(e?.message || 'Erro ao sortear card');
    } finally { setDrawing(false); }
  }, [sessionId, moduleCode, drawing, logEvent]);

  useEffect(() => { setCard(null); setError(null); }, [moduleCode]);

  return { card, drawing, error, drawCard, logEvent };
}
