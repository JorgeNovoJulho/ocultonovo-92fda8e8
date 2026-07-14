/**
 * useLGPDConsent — Onda 2 LGPD
 * Consentimentos granulares por tipo, persistidos no Supabase externo via RPC.
 * Cache local em sessionStorage para evitar refetch durante navegação.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export type LGPDConsentType =
  | 'cookies_analytics'
  | 'cookies_marketing'
  | 'cookies_personalization'
  | 'geolocation_radar'
  | 'geolocation_aura'
  | 'geolocation_events'
  | 'aura_match'
  | 'realtime_presence'
  | 'notifications_push'
  | 'notifications_email'
  | 'marketing_campaigns'
  | 'adult_content'
  | 'data_sharing_partners'
  | 'privacy_policy'
  | 'terms_of_use';

export interface LGPDConsentRow {
  consent_type: LGPDConsentType;
  granted: boolean;
  policy_version: string | null;
  source: string | null;
  granted_at: string;
  revoked_at: string | null;
}

const CACHE_KEY = 'oculto_lgpd_consents_v1';

function readCache(): Record<string, LGPDConsentRow> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function writeCache(map: Record<string, LGPDConsentRow>) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function useLGPDConsent() {
  const { user, loading: authLoading } = useAuth();
  const [consents, setConsents] = useState<Record<string, LGPDConsentRow>>(() => readCache());
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('lgpd_get_my_consents');
      if (!error && Array.isArray(data)) {
        const map: Record<string, LGPDConsentRow> = {};
        for (const row of data as LGPDConsentRow[]) map[row.consent_type] = row;
        setConsents(map);
        writeCache(map);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  const isGranted = useCallback(
    (type: LGPDConsentType): boolean => !!consents[type]?.granted,
    [consents]
  );

  const setConsent = useCallback(
    async (type: LGPDConsentType, granted: boolean, source: string = 'settings') => {
      // Optimistic update
      setConsents(prev => {
        const next = {
          ...prev,
          [type]: {
            ...(prev[type] ?? { policy_version: null, granted_at: new Date().toISOString(), revoked_at: null, source }),
            consent_type: type,
            granted,
            source,
            granted_at: granted ? new Date().toISOString() : (prev[type]?.granted_at ?? new Date().toISOString()),
            revoked_at: granted ? null : new Date().toISOString(),
          } as LGPDConsentRow,
        };
        writeCache(next);
        return next;
      });

      const { error } = await (supabase as any).rpc('lgpd_set_consent', {
        p_consent_type: type,
        p_granted: granted,
        p_source: source,
      });
      if (error) {
        // Rollback on error
        await refresh();
        throw error;
      }
    },
    [refresh]
  );

  return { consents, isGranted, setConsent, refresh, loading };
}
