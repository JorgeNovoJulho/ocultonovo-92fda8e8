import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { playMasterAlert, primeAudio, type MasterAlertPreset } from '@/lib/masterAlertSound';
import { isMasterUsernameVariant } from '@/lib/masterUsername';

const OnlineUsersDialog = lazy(() =>
  import('./OnlineUsersDialog').then((m) => ({ default: m.OnlineUsersDialog }))
);

/** Evento global escutado pelo OnlineUsersDialog para abrir automaticamente. */
export const MASTER_OPEN_ONLINE_GIFT_EVENT = 'master:open-online-gift';

export interface MasterAlertSettings {
  id: string;
  enabled: boolean;
  sound_preset: MasterAlertPreset;
  sound_url: string | null;
  volume: number;
  recurrence_seconds: number;
  auto_open_modal: boolean;
  last_triggered_at: string | null;
  updated_at: string;
}

const SETTINGS_QUERY_KEY = ['master-alert-settings'] as const;

const DEFAULT_SETTINGS: MasterAlertSettings = {
  id: 'singleton',
  enabled: true,
  sound_preset: 'chime' as MasterAlertPreset,
  sound_url: null,
  volume: 0.85,
  recurrence_seconds: 30,
  auto_open_modal: true,
  last_triggered_at: null,
  updated_at: new Date(0).toISOString(),
};

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;
const FIRST_POLL_ALERT_WINDOW_MS = 45_000;

function toMs(value: unknown): number | null {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isMasterProfileRow(row: any): boolean {
  return isMasterUsernameVariant(row?.username)
    || isMasterUsernameVariant(row?.name)
    || String(row?.email ?? '').trim().toLowerCase() === 'ocultomaster@ocultoswing.com.br';
}

function getProfileUid(row: any): string | null {
  return row?.user_id || row?.id || null;
}

function isAlertableOnlineRow(row: any, now = Date.now()): boolean {
  if (!row || row.is_online !== true) return false;
  if (row.is_seed === true || row.is_test_account === true || row.banned_at) return false;
  if (isMasterProfileRow(row)) return false;
  const lastSeenMs = toMs(row.last_seen);
  return !!lastSeenMs && now - lastSeenMs <= ONLINE_WINDOW_MS;
}

export function useMasterAlertSettings() {
  const { data: isMaster } = useIsMasterAdmin();
  return useQuery<MasterAlertSettings | null>({
    queryKey: SETTINGS_QUERY_KEY,
    enabled: !!isMaster,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_master_alert_settings')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle();
      if (error) {
        console.warn('[MasterAlert] settings load fail — using defaults', error.message);
        return DEFAULT_SETTINGS;
      }
      return (data as MasterAlertSettings) ?? DEFAULT_SETTINGS;
    },
  });
}

/**
 * Provider global. Apenas para o master canônico.
 * - Escuta UPDATEs em public.profiles e detecta usuários ficando online
 *   (is_online: false → true, ignorando is_seed e o próprio master).
 * - Respeita recurrence_seconds com dedupe in-memory.
 * - Toca som configurado e (opcionalmente) abre o modal de presente.
 */
export function MasterOnlineAlertProvider() {
  const { data: isMaster } = useIsMasterAdmin();
  const { data: settings } = useMasterAlertSettings();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings ?? null;

  const lastTriggerRef = useRef<number>(0);
  const recentRef = useRef<Map<string, number>>(new Map());
  const pollSeenRef = useRef<Map<string, number>>(new Map());
  const didInitialPollRef = useRef(false);

  // Prime de áudio no primeiro gesto do master (destrava autoplay)
  useEffect(() => {
    if (!isMaster) return;
    const onGesture = () => {
      primeAudio();
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [isMaster]);

  // Realtime: detecta usuários ficando online
  useEffect(() => {
    if (!isMaster) return;

    const fireForRow = (newRow: any, source: 'realtime' | 'poll' | 'poll-initial') => {
      const now = Date.now();
      const cfg = settingsRef.current ?? DEFAULT_SETTINGS;
      if (!cfg.enabled) { console.debug('[MasterAlert] disabled'); return; }
      if (!isAlertableOnlineRow(newRow, now)) return;

      const uid = getProfileUid(newRow);
      if (!uid) return;

      const last = recentRef.current.get(uid) ?? 0;
      if (now - last < 60 * 1000) return;
      recentRef.current.set(uid, now);

      const recurMs = Math.max(5, cfg.recurrence_seconds ?? 30) * 1000;
      if (now - lastTriggerRef.current < recurMs) return;
      lastTriggerRef.current = now;

      console.info('[MasterAlert] firing for', newRow.username ?? uid, `(${source})`);

      playMasterAlert({
        preset: cfg.sound_preset,
        volume: cfg.volume,
        customUrl: cfg.sound_url,
      });

      (supabase as any)
        .from('oculto_master_alert_settings')
        .update({ last_triggered_at: new Date().toISOString() })
        .eq('id', 'singleton')
        .then(() => {/* best-effort */});

      qc.invalidateQueries({ queryKey: ['master-online-unrewarded'] });
      qc.invalidateQueries({ queryKey: ['online-users'] });
      qc.invalidateQueries({ queryKey: ['online-count-real'] });

      if (cfg.auto_open_modal) {
        window.dispatchEvent(new CustomEvent(MASTER_OPEN_ONLINE_GIFT_EVENT, {
          detail: { userId: uid, username: newRow.username ?? null },
        }));
      }
    };

    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const oldRow = payload?.old || {};
      const newRow = payload?.new || {};
      const now = Date.now();
      const oldWasRecent = isAlertableOnlineRow(oldRow, now);
      const oldLastSeenMs = toMs(oldRow.last_seen);
      const newLastSeenMs = toMs(newRow.last_seen);
      const becameOnline = oldRow.is_online !== true && newRow.is_online === true;
      const revivedFromStale = !!newLastSeenMs && (!oldLastSeenMs || now - oldLastSeenMs > ONLINE_WINDOW_MS);
      if (isAlertableOnlineRow(newRow, now) && (becameOnline || !oldWasRecent || revivedFromStale)) {
        fireForRow(newRow, 'realtime');
      }
    }, { events: ['UPDATE'] });

    const pollRecentOnline = async () => {
      const now = Date.now();
      try {
        const cutoff = new Date(now - ONLINE_WINDOW_MS).toISOString();
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, username, name, email, is_online, last_seen, is_seed, is_test_account, banned_at')
          .eq('is_online', true)
          .gte('last_seen', cutoff)
          .or('is_seed.is.null,is_seed.eq.false')
          .or('is_test_account.is.null,is_test_account.eq.false')
          .is('banned_at', null)
          .order('last_seen', { ascending: false })
          .limit(100);

        if (error) {
          console.warn('[MasterAlert] polling fallback failed:', error.message);
          return;
        }

        const active = new Set<string>();
        let newestInitial: any = null;
        let newestInitialMs = 0;

        for (const row of data || []) {
          if (!isAlertableOnlineRow(row, now)) continue;
          const uid = getProfileUid(row);
          if (!uid) continue;
          const lastSeenMs = toMs(row.last_seen) ?? now;
          active.add(uid);

          const wasKnown = pollSeenRef.current.has(uid);
          pollSeenRef.current.set(uid, lastSeenMs);

          if (didInitialPollRef.current) {
            if (!wasKnown) fireForRow(row, 'poll');
          } else if (now - lastSeenMs <= FIRST_POLL_ALERT_WINDOW_MS && lastSeenMs > newestInitialMs) {
            newestInitial = row;
            newestInitialMs = lastSeenMs;
          }
        }

        for (const uid of Array.from(pollSeenRef.current.keys())) {
          if (!active.has(uid)) pollSeenRef.current.delete(uid);
        }

        if (!didInitialPollRef.current) {
          didInitialPollRef.current = true;
          if (newestInitial) fireForRow(newestInitial, 'poll-initial');
        }
      } catch (err: any) {
        console.warn('[MasterAlert] polling fallback exception:', err?.message ?? err);
      }
    };

    pollRecentOnline();
    const pollTimer = window.setInterval(pollRecentOnline, POLL_INTERVAL_MS);

    const unsubSettings = subscribeTable('oculto_master_alert_settings', () => {
      qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    }, { events: ['UPDATE'] });

    console.info('[MasterAlert] provider mounted (master detected)');

    return () => {
      unsubProfiles();
      unsubSettings();
      window.clearInterval(pollTimer);
    };
  }, [isMaster, qc]);



  // Escuta o evento global para abrir o modal em qualquer rota (feed mobile/desktop, admin, etc.)
  useEffect(() => {
    if (!isMaster) return;
    const onOpen = () => setDialogOpen(true);
    window.addEventListener(MASTER_OPEN_ONLINE_GIFT_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(MASTER_OPEN_ONLINE_GIFT_EVENT, onOpen as EventListener);
  }, [isMaster]);

  if (!isMaster) return null;

  return (
    <Suspense fallback={null}>
      <OnlineUsersDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Suspense>
  );
}
