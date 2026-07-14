/**
 * useAuraPulses — envia e recebe "Pulsos de Aura" nas salas.
 *
 * Backend (Lote 1):
 *   - Tabela: public.aura_pulses (sender_id, target_id, room_id, message_id, status)
 *   - RPC:    aura_pulse_send(p_room_id uuid, p_target_id uuid, p_message_id uuid)
 *             aura_pulse_respond(p_pulse_id uuid)
 *   - Prefs:  aura_pulse_user_preferences (receive_pulses, sound_enabled, haptic_enabled)
 *
 * Frontend:
 *   - Realtime canal `aura_pulses:user:{uid}` filtrando target_id=eq.uid.
 *   - Som curto + vibração opcional (respeita prefers-reduced-motion).
 *   - Highlight do remetente por 12s (Map<user_id, expiresAt>) p/ realçar
 *     mensagens dele no chat.
 *   - Cooldown local otimista de 4s por par (servidor é a verdade).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { playChimeByType, tryVibrate } from '@/lib/pulseSound';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getAuraRoomIdFromSlug } from '@/lib/auraRoomIdentity';
import { logger } from '@/lib/logger';

export type PulseType = 'default' | 'premium' | 'rare' | 'silent';

export interface PulseEvent {
  id: string;
  sender_id: string;
  target_id: string;
  room_id: string | null;
  message_id: string | null;
  status: 'sent' | 'responded' | 'ignored' | 'blocked';
  pulse_type?: PulseType;
  metadata?: { color?: string; highlight_ms?: number } | null;
  created_at: string;
  sender_name?: string | null;
  sender_username?: string | null;
  sender_avatar?: string | null;
}

export interface PulsePreferences {
  receive_pulses: boolean;
  sound_enabled: boolean;
  haptic_enabled: boolean;
  allow_premium_pulse: boolean;
  allow_rare_pulse: boolean;
  show_resonance_public: boolean;
  save_attention_history: boolean;
  hide_my_history: boolean;
  silent_mode: boolean;
  block_rare_sound: boolean;
  block_rare_effects: boolean;
}

const DEFAULT_PREFS: PulsePreferences = {
  receive_pulses: true,
  sound_enabled: true,
  haptic_enabled: true,
  allow_premium_pulse: true,
  allow_rare_pulse: true,
  show_resonance_public: true,
  save_attention_history: true,
  hide_my_history: false,
  silent_mode: false,
  block_rare_sound: false,
  block_rare_effects: false,
};

const HIGHLIGHT_MS = 12_000;
const LOCAL_COOLDOWN_MS = 15_000;

const ERROR_MAP: Record<string, string> = {
  room_not_found: 'Sala não encontrada ou inativa. Tente reabrir a sala.',
  room_required: 'Entre numa sala antes de enviar um pulso.',
  cooldown: 'Aguarde o cooldown terminar antes de pulsar este usuário de novo.',
  rate_limit: 'Você atingiu o limite de pulsos nesta janela.',
  blocked: 'Não foi possível enviar — você ou este usuário tem bloqueio ativo.',
  target_opted_out: 'Este usuário desativou o recebimento de pulsos.',
  disabled: 'Pulsos estão temporariamente desativados pelo administrador.',
  self_target: 'Você não pode pulsar a si mesmo.',
  plan_required: 'Pulsos disponíveis apenas para planos pagos no momento.',
  unauthenticated: 'Entre para enviar pulsos.',
  premium_disabled: 'Pulso Premium desativado pelo administrador.',
  rare_disabled: 'Pulso Raro desativado pelo administrador.',
  rare_vip_required: 'Pulso Raro é exclusivo para usuários VIP.',
  rare_trust_required: 'Trust Score insuficiente para enviar Pulso Raro.',
  rare_prestige_required: 'Nível de prestígio insuficiente para Pulso Raro.',
  target_blocks_premium: 'Este usuário desativou o recebimento de Pulsos Premium.',
  target_blocks_rare: 'Este usuário desativou o recebimento de Pulsos Raros.',
  sender_suspended: 'Seus pulsos foram suspensos temporariamente pela moderação.',
};

const ERROR_TITLE: Record<string, string> = {
  room_not_found: '🚪 Sala indisponível',
  room_required: '🚪 Entre numa sala',
  cooldown: '⏳ Cooldown ativo',
  rate_limit: '🚦 Limite de pulsos atingido',
  blocked: '🚫 Pulso bloqueado',
  target_opted_out: '🔕 Usuário com pulsos desativados',
  disabled: '⛔ Pulsos desativados',
  plan_required: '💎 Upgrade necessário',
  premium_disabled: '⛔ Pulso Premium indisponível',
  rare_disabled: '⛔ Pulso Raro indisponível',
  rare_vip_required: '👑 Apenas VIP',
  rare_trust_required: '🛡️ Trust Score baixo',
  rare_prestige_required: '🏆 Prestígio insuficiente',
  target_blocks_premium: '🔕 Premium bloqueado pelo usuário',
  target_blocks_rare: '🔕 Raro bloqueado pelo usuário',
  sender_suspended: '⏸️ Pulsos suspensos',
};

export interface PulseHighlight {
  until: number;
  color: string;
}

export interface PulseDiagnostic {
  at: number;
  slug: string | null;
  roomId: string | null;
  targetId: string;
  pulseType: PulseType;
  messageId: string | null;
  ok: boolean;
  durationMs: number;
  response: unknown;
  error: { code?: string; message?: string; status?: number; details?: string } | null;
}

const DEFAULT_HIGHLIGHT_COLOR = '#D946EF';
const MAX_DIAGNOSTICS = 25;

export function useAuraPulses(roomSlug?: string | null) {
  const { user } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [prefs, setPrefs] = useState<PulsePreferences>(DEFAULT_PREFS);
  const [highlighted, setHighlighted] = useState<Map<string, PulseHighlight>>(new Map());
  const [lastIncoming, setLastIncoming] = useState<PulseEvent | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const lastSendRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const processedRef = useRef<Set<string>>(new Set());
  const [diagnostics, setDiagnostics] = useState<PulseDiagnostic[]>([]);
  const pushDiagnostic = useCallback((d: PulseDiagnostic) => {
    setDiagnostics((prev) => {
      const next = [d, ...prev];
      if (next.length > MAX_DIAGNOSTICS) next.length = MAX_DIAGNOSTICS;
      return next;
    });
    if (typeof window !== 'undefined') {
      try {
        // eslint-disable-next-line no-console
        logger.log('[AuraPulse][diag]', d);
      } catch { /* noop */ }
    }
  }, []);
  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);

  useEffect(() => {
    let alive = true;
    setRoomId(null);
    void getAuraRoomIdFromSlug(roomSlug).then((id) => {
      if (alive) setRoomId(id);
    });
    return () => { alive = false; };
  }, [roomSlug]);


  // Preferências
  const loadPrefs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await (supabase as any)
      .from('aura_pulse_user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) setPrefs({ ...DEFAULT_PREFS, ...data });
  }, [user?.id]);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const savePrefs = useCallback(async (next: Partial<PulsePreferences>) => {
    if (!user?.id) return;
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    const { error } = await (supabase as any)
      .from('aura_pulse_user_preferences')
      .upsert({ user_id: user.id, ...merged }, { onConflict: 'user_id' });
    if (error) toast.error('Não foi possível salvar preferências de pulso');
  }, [user?.id, prefs]);

  // Highlight remetente — usa cor vinda do metadata do pulso para diferenciar
  // visualmente default / premium / raro nas mensagens do AuraRoomChat.
  /**
   * Sinaliza highlight de uma mensagem.
   * @param anchorMs timestamp (ms) em que o pulso foi criado no servidor.
   *                 Garante mesmo `until` (mesmo timing) para remetente e destinatário.
   */
  const flagSender = useCallback((
    senderId: string, color: string, durationMs: number, anchorMs?: number,
  ) => {
    const anchor = anchorMs ?? Date.now();
    const until = anchor + durationMs;
    const remaining = Math.max(0, until - Date.now());
    if (remaining <= 0) return;
    setHighlighted((prev) => {
      const next = new Map(prev);
      next.set(senderId, { until, color });
      return next;
    });
    const t = timersRef.current.get(senderId);
    if (t) clearTimeout(t);
    timersRef.current.set(
      senderId,
      setTimeout(() => {
        setHighlighted((prev) => {
          const next = new Map(prev);
          next.delete(senderId);
          return next;
        });
        timersRef.current.delete(senderId);
      }, remaining)
    );
  }, []);

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable('aura_pulses', async (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const ev = payload?.new as PulseEvent | undefined;
      if (!ev?.id || ev.target_id !== user.id) return;
      if (processedRef.current.has(ev.id)) return;
      processedRef.current.add(ev.id);
      if (!prefs.receive_pulses || prefs.silent_mode) return;
      if (ev.status === 'blocked') return;
      const type = (ev.pulse_type || 'default') as PulseType;
      if (type === 'premium' && !prefs.allow_premium_pulse) return;
      if (type === 'rare' && !prefs.allow_rare_pulse) return;

      let enriched: PulseEvent = ev;
      try {
        const { data: prof } = await (supabase as any)
          .from('v_public_profiles')
          .select('name, username, avatar_url')
          .eq('user_id', ev.sender_id)
          .maybeSingle();
        if (prof) {
          enriched = {
            ...ev,
            sender_name: prof.name,
            sender_username: prof.username,
            sender_avatar: prof.avatar_url,
          };
        }
      } catch { /* ignore */ }

      if (!(type === 'rare' && prefs.block_rare_effects) && type !== 'silent') {
        setLastIncoming(enriched);
      }
      const hlColor = ev.metadata?.color
        || (type === 'rare' ? '#FF3DE0' : type === 'premium' ? '#B57BFF' : DEFAULT_HIGHLIGHT_COLOR);
      const hlMs = ev.metadata?.highlight_ms ?? HIGHLIGHT_MS;
      const anchor = ev.created_at ? Date.parse(ev.created_at) : Date.now();
      flagSender(ev.sender_id, hlColor, hlMs, anchor);

      const soundAllowed =
        prefs.sound_enabled
        && !reducedMotion
        && type !== 'silent'
        && !(type === 'rare' && prefs.block_rare_sound);
      if (soundAllowed) {
        try { playChimeByType(type); } catch { /* ignore */ }
      }
      if (prefs.haptic_enabled && type !== 'silent') {
        tryVibrate(type === 'rare' ? [40, 30, 40, 30, 60] : [35, 25, 35]);
      }
    }, { events: ['INSERT'] });

    return () => { unsub(); };
  }, [user?.id, prefs.receive_pulses, prefs.sound_enabled, prefs.haptic_enabled, prefs.silent_mode, prefs.allow_premium_pulse, prefs.allow_rare_pulse, prefs.block_rare_sound, prefs.block_rare_effects, reducedMotion, flagSender]);


  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const sendPulse = useCallback(async (
    targetUserId: string,
    opts?: { messageId?: string | null; pulseType?: PulseType }
  ) => {
    if (!user?.id) { toast.error(ERROR_MAP.unauthenticated); return false; }
    if (!roomSlug) { toast.warning('Entre numa sala para pulsar.'); return false; }
    if (targetUserId === user.id) return false;

    const last = lastSendRef.current.get(targetUserId) || 0;
    if (Date.now() - last < LOCAL_COOLDOWN_MS) {
      toast.info('Aguarde alguns segundos antes de pulsar de novo');
      return false;
    }
    lastSendRef.current.set(targetUserId, Date.now());

    const pulseType: PulseType = (opts?.pulseType ?? 'default') as PulseType;
    const messageId = opts?.messageId ?? null;
    const startedAt = Date.now();
    const payload = {
      p_room_slug: roomSlug,
      p_target_id: targetUserId,
      p_message_id: messageId,
      p_pulse_type: pulseType,
    };

    // Server-side resolve por slug — SECURITY DEFINER ignora RLS e elimina
    // o "Sala não encontrada" que vinha do select cliente em oculto_aura_rooms.
    const { data, error } = await (supabase as any).rpc('aura_pulse_send_by_slug', payload);
    const durationMs = Date.now() - startedAt;

    if (error) {
      pushDiagnostic({
        at: Date.now(), slug: roomSlug, roomId, targetId: targetUserId,
        pulseType, messageId, ok: false, durationMs,
        response: null,
        error: {
          code: (error as any).code,
          message: (error as any).message,
          status: (error as any).status,
          details: (error as any).details,
        },
      });
      const detailLines = [
        (error as any).message || 'Erro desconhecido',
        (error as any).code ? `code: ${(error as any).code}` : null,
        (error as any).status ? `status: ${(error as any).status}` : null,
        `slug: ${roomSlug} · room_id: ${roomId ?? '—'}`,
      ].filter(Boolean).join(' · ');
      toast.error('⚠️ Pulso não enviado (RPC)', { description: detailLines, duration: 7000 });
      return false;
    }
    const r = (Array.isArray(data) ? data[0] : data) as
      { ok?: boolean; error?: string; retry_after_seconds?: number;
        pulse_type?: string; highlight_color?: string; highlight_ms?: number;
        created_at?: string; server_now?: string;
        limit?: number; window_minutes?: number;
        required?: number; current?: number; required_plan?: string } | undefined;

    if (r && r.ok === false) {
      const key = r.error || '';
      const title = ERROR_TITLE[key] || '⚠️ Pulso não enviado';
      let desc = ERROR_MAP[key] || key || 'Pulso bloqueado';
      const extras: string[] = [];

      if (key === 'cooldown' && r.retry_after_seconds) {
        const s = r.retry_after_seconds;
        desc = s >= 60
          ? `Aguarde ${Math.ceil(s / 60)} min antes de pulsar este usuário novamente.`
          : `Aguarde ${s}s antes de pulsar este usuário novamente.`;
      }
      if (key === 'rate_limit' && r.limit && r.window_minutes) {
        desc = `Você atingiu o limite de ${r.limit} pulsos a cada ${r.window_minutes} min. Tente novamente em alguns minutos.`;
      }
      if (key === 'plan_required' && r.required_plan) {
        desc = `Disponível apenas para o plano ${r.required_plan.toUpperCase()}. Faça upgrade para enviar.`;
      }
      if (key === 'rare_trust_required' && r.required != null && r.current != null) {
        extras.push(`Trust necessário: ${r.required} · atual: ${r.current}`);
      }
      if (key === 'rare_prestige_required' && r.required != null && r.current != null) {
        extras.push(`Nível necessário: ${r.required} · atual: ${r.current}`);
      }
      if (extras.length) desc = `${desc} ${extras.join(' · ')}`;
      // Anexa contexto técnico (ajuda master a debugar sem abrir DevTools).
      desc = `${desc}\ncode: ${key || '—'} · slug: ${roomSlug} · room_id: ${roomId ?? '—'}`;

      pushDiagnostic({
        at: Date.now(), slug: roomSlug, roomId, targetId: targetUserId,
        pulseType, messageId, ok: false, durationMs,
        response: r,
        error: { code: key, message: desc },
      });
      toast.warning(title, { description: desc, duration: 6000 });
      return false;
    }

    // ✨ Feedback espelhado para o REMETENTE (mesmo som, highlight e háptico)
    const type = (opts?.pulseType ?? 'default') as PulseType;
    const hlColor = r?.highlight_color
      || (type === 'rare' ? '#FF3DE0' : type === 'premium' ? '#B57BFF' : DEFAULT_HIGHLIGHT_COLOR);
    const hlMs = r?.highlight_ms ?? HIGHLIGHT_MS;
    // Âncora: timestamp do servidor (created_at | server_now). Garante que
    // o highlight expire EXATAMENTE no mesmo instante para remetente e destinatário.
    const anchor = r?.created_at ? Date.parse(r.created_at)
                  : r?.server_now ? Date.parse(r.server_now)
                  : Date.now();
    flagSender(targetUserId, hlColor, hlMs, anchor);
    // Som idêntico ao do receptor
    const soundAllowed =
      prefs.sound_enabled
      && !prefs.silent_mode
      && !reducedMotion
      && type !== 'silent'
      && !(type === 'rare' && prefs.block_rare_sound);
    if (soundAllowed) {
      try { playChimeByType(type); } catch { /* ignore */ }
    }
    if (prefs.haptic_enabled && type !== 'silent') {
      tryVibrate(type === 'rare' ? [40, 30, 40, 30, 60] : [35, 25, 35]);
    }

    const label =
      type === 'rare' ? '✨ Pulso raro enviado'
      : type === 'premium' ? '💜 Pulso premium enviado'
      : '✨ Pulso enviado';
    toast.success(label);
    pushDiagnostic({
      at: Date.now(), slug: roomSlug, roomId, targetId: targetUserId,
      pulseType, messageId, ok: true, durationMs,
      response: r ?? null, error: null,
    });
    return true;
  }, [user?.id, roomSlug, roomId, flagSender, pushDiagnostic,
      prefs.sound_enabled, prefs.silent_mode, prefs.haptic_enabled,
      prefs.block_rare_sound, reducedMotion]);

  const respondPulse = useCallback(async (pulseId: string) => {
    if (!pulseId) {
      toast.error('Pulso inválido');
      return { ok: false };
    }
    try {
      const { data, error } = await (supabase as any).rpc('aura_pulse_respond', { p_pulse_id: pulseId });
      if (error) {
        toast.error('⚠️ Resposta não enviada', { description: (error as any).message || 'Erro RPC' });
        return { ok: false, error };
      }
      const r = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string; resonance?: boolean } | undefined;
      if (r && r.ok === false) {
        const msg = r.error === 'not_found_or_not_owner'
          ? 'Este pulso já foi respondido ou expirou.'
          : (ERROR_MAP[r.error || ''] || r.error || 'Não foi possível responder.');
        toast.warning('⚠️ Resposta não registrada', { description: msg });
        return r;
      }
      toast.success(r?.resonance ? '✨ Ressonância criada!' : '💜 Resposta enviada', {
        description: r?.resonance ? 'Vocês entraram em sintonia.' : 'O remetente foi notificado.',
        duration: 3500,
      });
      // Limpa overlay
      setLastIncoming(null);
      return r ?? { ok: true };
    } catch (e: any) {
      toast.error('⚠️ Falha ao responder', { description: e?.message || 'Erro desconhecido' });
      return { ok: false, error: e };
    }
  }, []);

  // ===== Reconciliação / fallback de polling =====
  // Caso o realtime falhe (websocket caiu, RLS, replication), buscamos os
  // últimos pulsos direcionados ao usuário a cada 15s e processamos os que
  // ainda não foram vistos. Idempotente via Set de IDs já processados.
  // (processedRef já declarado acima)
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    const processIncoming = async (ev: PulseEvent) => {
      if (!ev?.id || processedRef.current.has(ev.id)) return;
      processedRef.current.add(ev.id);
      if (!prefs.receive_pulses || prefs.silent_mode) return;
      if (ev.status === 'blocked' || ev.status === 'responded') return;
      const type = (ev.pulse_type || 'default') as PulseType;
      if (type === 'premium' && !prefs.allow_premium_pulse) return;
      if (type === 'rare' && !prefs.allow_rare_pulse) return;

      let enriched: PulseEvent = ev;
      try {
        const { data: prof } = await (supabase as any)
          .from('v_public_profiles')
          .select('name, username, avatar_url')
          .eq('user_id', ev.sender_id)
          .maybeSingle();
        if (prof) enriched = { ...ev, sender_name: prof.name, sender_username: prof.username, sender_avatar: prof.avatar_url };
      } catch { /* ignore */ }

      if (!(type === 'rare' && prefs.block_rare_effects) && type !== 'silent') {
        setLastIncoming(enriched);
      }
      const hlColor = ev.metadata?.color
        || (type === 'rare' ? '#FF3DE0' : type === 'premium' ? '#B57BFF' : DEFAULT_HIGHLIGHT_COLOR);
      const hlMs = ev.metadata?.highlight_ms ?? HIGHLIGHT_MS;
      const anchor = ev.created_at ? Date.parse(ev.created_at) : Date.now();
      flagSender(ev.sender_id, hlColor, hlMs, anchor);
    };

    // Expor processador para realtime usar (substitui a lógica inline duplicada)
    (window as any).__auraPulseProcess = processIncoming;

    const poll = async () => {
      if (!alive) return;
      try {
        const sinceIso = new Date(Date.now() - 30_000).toISOString();
        const { data } = await (supabase as any)
          .from('aura_pulses')
          .select('*')
          .eq('target_id', user.id)
          .eq('status', 'sent')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!alive || !Array.isArray(data)) return;
        for (const row of data) await processIncoming(row as PulseEvent);
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(poll, 8_000);
    return () => { alive = false; clearInterval(id); };
  }, [user?.id, prefs.receive_pulses, prefs.silent_mode, prefs.allow_premium_pulse, prefs.allow_rare_pulse, prefs.block_rare_effects, flagSender]);

  return {
    prefs,
    savePrefs,
    sendPulse,
    respondPulse,
    /** room_id resolvido a partir do slug — útil para canais por sala */
    roomId,
    /** Map<sender_id, expiresAt_ms> — realçar mensagens do remetente */
    highlighted,
    /** Último pulso recebido (overlay/toast) */
    lastIncoming,
    clearLastIncoming: () => setLastIncoming(null),
    /** Diagnóstico técnico (uso master/dev) — últimos envios com payload, RPC e erros */
    diagnostics,
    clearDiagnostics,
  };
}
