/**
 * useProfileCompletion — Etapa 3 (Google OAuth)
 * Consulta my_profile_completion() no Supabase EXTERNO.
 * Determina se o usuário precisa ser redirecionado para /completar-cadastro.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface ProfileCompletionState {
  loading: boolean;
  isComplete: boolean | null;
  missing: string[];
  refresh: () => Promise<void>;
}

export function useProfileCompletion(): ProfileCompletionState {
  const { user, authReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setIsComplete(null);
      setMissing([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('my_profile_completion');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setIsComplete(!!row?.is_complete);
      setMissing(Array.isArray(row?.missing) ? row.missing : []);
    } catch (err) {
      // Em falha de rede assume completo p/ não bloquear navegação.
      console.warn('[useProfileCompletion] erro:', err);
      setIsComplete(true);
      setMissing([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authReady) return;
    refresh();
  }, [authReady, refresh]);

  return { loading, isComplete, missing, refresh };
}
