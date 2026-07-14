import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Zap, Eye, Heart, Star, Loader2, LogOut, DoorOpen, X, PanelLeftClose, PanelLeftOpen, Check, ShieldCheck, WifiOff, Clock, AlertTriangle, RefreshCw, Crown, BadgeCheck, Users as UsersIcon, Trophy, Gauge, CalendarClock, Gift } from 'lucide-react';
import { useAuraRoomLive, type RoomPresent } from '@/hooks/useAuraRoomLive';
import { useActiveAuraRoom } from '@/hooks/useActiveAuraRoom';
import { useAdminBypass } from '@/hooks/useAdminBypass';
import { supabase } from '@/lib/supabaseExternal';
import { AuraRoomGateBadge, AuraRoomRequirementsLine, GATE_REASON_LABELS } from './AuraRoomGateBadge';
import { AuraRoomMoodBadge } from './AuraRoomMoodBadge';
import { AuraRoomChat } from './AuraRoomChat';
import { AuraRoomInviteButton } from './AuraRoomInviteButton';
import { describeRoomRequirements } from '@/lib/auraRoomRequirements';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AuraRoomItem } from '@/hooks/useAuraRoomsList';
import { toast } from 'sonner';
import { MyPlanStatusPill } from '@/components/MyPlanStatusPill';
import { useMyPlanStatus, formatPlanCountdown } from '@/hooks/useMyPlanStatus';
import { AuraRoomKycMockModal } from './AuraRoomKycMockModal';
import { AuraXpGiftModal } from './AuraXpGiftModal';


const REACTION_LABELS: Record<string, string> = {
  energy: 'Alguém te enviou energia',
  observe: 'Alguém te observou',
  approach: 'Alguém aproximou da sua aura',
  highlight: 'Alguém destacou sua aura',
};

interface SocialEv { id: string; text: string; at: number; hue: number; avatarUrl?: string | null }

const REACTION_EVENT_TEXT: Record<string, string> = {
  energy:    '⚡ alguém enviou energia à sala',
  observe:   '👁 alguém observou em silêncio',
  approach:  '💜 uma aura se aproximou',
  highlight: '✨ uma aura foi destacada',
};

function genderLabel(profileType?: string | null, gender?: string | null): string {
  const g = (gender || profileType || '').toLowerCase();
  if (!g) return '';
  if (g.includes('casal') || g === 'couple') return 'casal';
  if (g.includes('homem') || g === 'male' || g === 'm' || g === 'man') return 'homem';
  if (g.includes('mulher') || g === 'female' || g === 'f' || g === 'woman') return 'mulher';
  if (g.includes('trans')) return 'trans';
  if (g.includes('não') || g.includes('nao') || g.includes('non')) return 'não-binárie';
  return g;
}

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

/**
 * Card de erro do gate da sala. Detecta queda de rede (offline ou
 * Failed to fetch / network) e oferece auto-retry em 10s + botão manual
 * com mensagens de fallback amigáveis.
 */
type GateErrorKind = 'offline' | 'network' | 'timeout' | 'unexpected';

function classifyGateError(error: string, online: boolean): GateErrorKind {
  if (!online) return 'offline';
  if (/timeout|timed out|ETIMEDOUT|deadline/i.test(error)) return 'timeout';
  if (/failed to fetch|networkerror|network request|fetch error|load failed|ECONN|ENETUNREACH/i.test(error)) return 'network';
  return 'unexpected';
}

function normalizeGateErrorMessage(error: string) {
  if (/column\s+"prestige_xp"\s+does not exist/i.test(error)) {
    return 'A verificação desta sala está desatualizada no banco e precisa do patch de sincronização do gate.';
  }

  if (/column|relation|function/i.test(error)) {
    return 'A verificação da sala encontrou uma função desatualizada. Atualize o patch do banco externo e tente novamente.';
  }

  return error;
}

function GateErrorCard({ error, loading, onRetry, requiresKyc, onStartKyc }: { error: string; loading: boolean; onRetry: () => void; requiresKyc?: boolean; onStartKyc?: () => void }) {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [secs, setSecs] = useState<number>(10);
  const kind = classifyGateError(error, online);
  const autoRetryable = kind === 'network' || kind === 'timeout';

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Auto-retry só quando faz sentido (rede/timeout) e estamos online
  useEffect(() => {
    if (!autoRetryable || loading) return;
    setSecs(kind === 'timeout' ? 5 : 10);
    const id = window.setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { window.clearInterval(id); onRetry(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRetryable, kind, loading, onRetry, error]);

  const title =
    kind === 'offline'   ? 'Você está offline'
    : kind === 'timeout' ? 'Tempo esgotado ao verificar acesso'
    : kind === 'network' ? 'Falha de rede ao verificar acesso'
    : 'Erro inesperado ao verificar acesso';

  const hint =
    kind === 'offline'   ? 'Reconecte-se à internet — tentaremos automaticamente assim que a conexão voltar.'
    : kind === 'timeout' ? `O servidor demorou para responder (>10s). Nova tentativa automática em ${secs}s — ou clique em "Tentar agora".`
    : kind === 'network' ? `Sua conexão pode estar instável ou o servidor inacessível. Nova tentativa em ${secs}s — ou clique em "Tentar agora".`
    : 'Algo inesperado aconteceu na verificação. Você pode tentar novamente agora; se persistir, recarregue a página.';

  const Icon =
    kind === 'offline'   ? WifiOff
    : kind === 'timeout' ? Clock
    : kind === 'network' ? WifiOff
    : AlertTriangle;

  // Botão sempre habilitado quando faz sentido (online ou erro inesperado)
  const canRetryNow = (kind !== 'offline') && !loading;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-200" role="alert" aria-live="assertive">
      <p className="mb-1 flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {title}
      </p>
      <p className="mb-2 text-[11px] text-red-200/70 break-words font-mono">{normalizeGateErrorMessage(error)}</p>
      <p className="mb-2 text-[11px] text-red-100/90">{hint}</p>
      <button
        type="button"
        onClick={() => { setSecs(autoRetryable ? (kind === 'timeout' ? 5 : 10) : 0); onRetry(); }}
        disabled={!canRetryNow}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <RefreshCw className="h-3 w-3" />}
        {kind === 'offline' ? 'Aguardando conexão…' : loading ? 'Verificando…' : 'Tentar agora'}
      </button>
      {requiresKyc && onStartKyc && (
        <button
          type="button"
          onClick={onStartKyc}
          className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/30"
        >
          <BadgeCheck className="h-3 w-3" /> Iniciar KYC
        </button>
      )}
    </div>
  );
}

/**
 * Cartão de regras da sala — sempre visível na coluna da AuraRoomLive
 * para o usuário entender exatamente o que precisa para acessar.
 * Cada requisito mostra ✓ (cumprido) ou ✗ (faltando) quando há contexto;
 * sem contexto, exibe apenas o requisito.
 */
function RoomRulesCard({
  room,
  blockedReasons,
  onStartKyc,
  fromCache,
}: {
  room: Pick<AuraRoomItem,
    'vip_only' | 'required_plan' | 'requires_kyc' | 'couple_only' |
    'min_aura_level' | 'min_social_score' | 'min_prestige_xp' |
    'hour_from' | 'hour_to'
  >;
  blockedReasons: string[];
  onStartKyc?: () => void;
  fromCache?: boolean;
}) {
  const reasonSet = new Set(blockedReasons);
  type Rule = { icon: typeof Crown; label: string; failed: boolean; show: boolean };

  const rules: Rule[] = [
    {
      icon: Crown,
      label: room.vip_only ? 'Plano VIP ativo' : 'Plano Premium ou VIP',
      failed: reasonSet.has('plan_vip_required') || reasonSet.has('plan_premium_required') || reasonSet.has('required_plan'),
      show: !!room.vip_only || (room.required_plan && room.required_plan !== 'free'),
    },
    {
      icon: BadgeCheck,
      label: 'Verificação KYC concluída',
      failed: reasonSet.has('kyc_required'),
      show: !!room.requires_kyc,
    },
    {
      icon: UsersIcon,
      label: 'Conta de casal',
      failed: reasonSet.has('couple_only'),
      show: !!room.couple_only,
    },
    {
      icon: Gauge,
      label: `Aura nível ${room.min_aura_level}+`,
      failed: reasonSet.has('aura_level_low'),
      show: (room.min_aura_level ?? 0) > 0,
    },
    {
      icon: Star,
      label: `Score Social ${room.min_social_score}+`,
      failed: reasonSet.has('social_score_low'),
      show: (room.min_social_score ?? 0) > 0,
    },
    {
      icon: Trophy,
      label: `Prestígio ${room.min_prestige_xp}+ XP`,
      failed: reasonSet.has('prestige_low'),
      show: (room.min_prestige_xp ?? 0) > 0,
    },
    {
      icon: CalendarClock,
      label: `Janela ativa ${String(room.hour_from ?? 0).padStart(2, '0')}h–${String(room.hour_to ?? 0).padStart(2, '0')}h`,
      failed: false,
      show: room.hour_from != null && room.hour_to != null,
    },
  ];

  const visible = rules.filter((r) => r.show);
  if (visible.length === 0) return null;

  const anyFailed = visible.some((r) => r.failed);

  return (
    <div
      className={`rounded-xl border p-2.5 text-[11.5px] ${
        anyFailed
          ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100'
          : 'border-white/10 bg-black/20 text-foreground/80'
      }`}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        Regras desta sala
      </p>
      <ul className="space-y-1">
        {visible.map((r) => {
          const Ico = r.icon;
          return (
            <li key={r.label} className="flex items-center gap-1.5">
              <Ico className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
              <span className={r.failed ? 'text-red-300/95' : ''}>{r.label}</span>
              {r.failed && <span className="ml-auto text-[10px] font-semibold text-red-300">✗ falta</span>}
            </li>
          );
        })}
      </ul>
      {anyFailed && (
        <p className="mt-1.5 text-[10.5px] text-amber-200/80">
          Resolva os itens marcados em vermelho para liberar o acesso.
        </p>
      )}
      {fromCache && (
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Última verificação salva localmente — atualizada ao tentar entrar.
        </p>
      )}
      {reasonSet.has('kyc_required') && onStartKyc && (
        <button
          type="button"
          onClick={onStartKyc}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1.5 text-[11.5px] font-medium text-amber-100 hover:bg-amber-500/30"
        >
          <BadgeCheck className="h-3.5 w-3.5" /> Iniciar verificação KYC
        </button>
      )}
    </div>
  );
}


function AuraRoomLiveImpl({ room, open, onOpenChange, autoJoinOnOpen = false, onAutoJoinConsumed }: { room: AuraRoomItem; open: boolean; onOpenChange: (v: boolean) => void; autoJoinOnOpen?: boolean; onAutoJoinConsumed?: () => void }) {
  const navigate = useNavigate();
  const { shouldBypass: isMaster } = useAdminBypass();
  const enterRoom = useActiveAuraRoom((s) => s.enter);
  const exitRoom = useActiveAuraRoom((s) => s.exit);
  const setMaster = useActiveAuraRoom((s) => s.setMaster);
  const setExitStatus = useActiveAuraRoom((s) => s.setExitStatus);
  const currentSlug = useActiveAuraRoom((s) => s.currentSlug);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [socialEvents, setSocialEvents] = useState<SocialEv[]>([]);
  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => { setHasEntered(false); }, [room.slug]);

  // IMPORTANTE: o hook só ativa join no servidor quando o usuário JÁ entrou.
  // Sem isso, a Sheet aberta auto-entra na sala mesmo após Sair.
  const { state, joined, incomingReaction, react, leave, joinError, joinLoading, retryJoin, joinNow } = useAuraRoomLive(
    open ? room.slug : null,
    { active: open && hasEntered },
  );
  // Mock de checagem visual ao entrar: VIP ativo + ferramentas liberadas.
  // Enquanto verifying=true, o chat NÃO recebe forcePresent (envio fica indisponível).
  const [verifying, setVerifying] = useState(false);
  const [verifySteps, setVerifySteps] = useState<{ vip: boolean; tools: boolean; chat: boolean }>({ vip: false, tools: false, chat: false });
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  // Persiste o estado recolhido por sala (slug) em localStorage.
  const COLLAPSED_KEY = (slug: string) => `aura-room-live:left-collapsed:${slug}`;
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY(room.slug)) === '1'; } catch { return false; }
  });
  // Estado dedicado para mobile: por padrão recolhido, dando todo o espaço ao chat.
  const MOBILE_COLLAPSED_KEY = (slug: string) => `aura-room-live:mobile-collapsed:${slug}`;
  const [mobileCollapsed, setMobileCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(MOBILE_COLLAPSED_KEY(room.slug));
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try {
      const v = localStorage.getItem(MOBILE_COLLAPSED_KEY(room.slug));
      setMobileCollapsed(v === null ? true : v === '1');
    } catch {}
  }, [room.slug]);
  useEffect(() => {
    try { localStorage.setItem(MOBILE_COLLAPSED_KEY(room.slug), mobileCollapsed ? '1' : '0'); } catch {}
  }, [mobileCollapsed, room.slug]);
  // Ao trocar de sala, restaura o estado salvo daquela sala.
  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSED_KEY(room.slug));
      setLeftCollapsed(v === '1');
    } catch {}
  }, [room.slug]);
  // Salva sempre que mudar.
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY(room.slug), leftCollapsed ? '1' : '0'); } catch {}
  }, [leftCollapsed, room.slug]);
  // Atalho de teclado: "[" alterna o painel esquerdo (sem conflitar com inputs).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt?.isContentEditable) return;
      if (e.key === '[') {
        e.preventDefault();
        setLeftCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const prevPresentsRef = useRef<Set<string>>(new Set());
  const prevDominantRef = useRef<string | null>(null);

  // Single-room enforcement (master pode estar em N salas)
  useEffect(() => { setMaster(isMaster); }, [isMaster, setMaster]);

  // Não resetamos hasEntered ao apenas fechar/recolher a Sheet — só limpamos
  // o estado de confirmação de troca. A "saída de fato" da sala ocorre só via
  // botão Sair (handleLeaveRoom) ou pelo timer de inatividade.
  useEffect(() => {
    if (!open) setConfirmSwitch(false);
  }, [open, room.slug]);

  // Auto-rejoin foi REMOVIDO. O hook `useAuraRoomLive` agora só envia `aura_room_join`
  // quando `active=true` (que depende de `hasEntered`). Reload restaura `hasEntered=true`
  // (sala ainda válida) e o hook reanexa presença automaticamente; após Sair/Fechar,
  // `hasEntered=false` e o hook fica em modo apenas-observação até o usuário clicar Entrar.

  // "Tema Livre" é aberta a todos. Master admin tem acesso a tudo.
  const isOpenRoom = room.slug === 'tema-livre' || room.slug === 'tema_livre';
  const isObserver = !isMaster && !isOpenRoom && !joined?.allowed;
  const energy = state.energy ?? 0;
  const hue = room.hue;

  const lastActivityRef = useRef<number>(Date.now());
  const bumpActivity = () => { lastActivityRef.current = Date.now(); };
  // Mantém o próprio usuário sempre visível em "Auras presentes" enquanto estiver na sala,
  // independentemente da latência do realtime do servidor.
  const [mePresent, setMePresent] = useState<{ user_id: string; name: string | null; avatar_url: string | null; plan_type: string | null } | null>(null);
  useEffect(() => {
    if (!hasEntered) { setMePresent(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: prof } = await (supabase as any)
          .from('profiles')
          .select('name, username, avatar_url, plan_type')
          .eq('user_id', uid).maybeSingle();
        if (cancelled) return;
        // PRIVACIDADE: nunca exibir o nome real do usuário nas salas — sempre @username.
        const uname = (prof?.username || '').toString().trim().replace(/^@+/, '');
        setMePresent({
          user_id: uid,
          name: uname ? `@${uname}` : 'Você',
          avatar_url: prof?.avatar_url || null,
          plan_type: prof?.plan_type || null,
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [hasEntered]);
  const effectivePresents = (() => {
    if (!mePresent) return state.presents;
    if (state.presents.find((p) => p.user_id === mePresent.user_id)) return state.presents;
    return [
      { ...mePresent, is_observer: false, entered_at: new Date().toISOString() } as RoomPresent,
      ...state.presents,
    ];
  })();

  // Status do processo de entrada — alimenta o botão e mensagens.
  type JoinUiStatus = 'idle' | 'loading' | 'queued' | 'blocked' | 'success' | 'error';
  const [joinStatus, setJoinStatus] = useState<JoinUiStatus>('idle');

  // Persistência local do contexto do gate (motivos do bloqueio + regras)
  // por sala (slug). Permite que a AuraRoomLive continue mostrando "por que
  // foi bloqueado" mesmo após F5 / reabrir a aba.
  const GATE_CTX_KEY = (slug: string) => `aura-room-live:gate-ctx:${slug}`;
  const GATE_CTX_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const readGateCtx = (slug: string): { reasons: string[]; savedAt: number } | null => {
    try {
      const raw = localStorage.getItem(GATE_CTX_KEY(slug));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.reasons)) return null;
      if (Date.now() - (parsed.savedAt ?? 0) > GATE_CTX_TTL_MS) return null;
      return parsed;
    } catch { return null; }
  };
  const [joinBlockedReasons, setJoinBlockedReasons] = useState<string[]>(() => {
    const c = readGateCtx(room.slug);
    return c?.reasons ?? [];
  });
  const [gateCtxFromCache, setGateCtxFromCache] = useState<boolean>(() => !!readGateCtx(room.slug));
  const [kycMockOpen, setKycMockOpen] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);

  // Re-hidrata ao trocar de sala
  useEffect(() => {
    const c = readGateCtx(room.slug);
    setJoinBlockedReasons(c?.reasons ?? []);
    setGateCtxFromCache(!!c);
  }, [room.slug]);

  // Persiste sempre que mudar (live > cache); limpa quando vazio
  useEffect(() => {
    try {
      if (joinBlockedReasons.length === 0) {
        localStorage.removeItem(GATE_CTX_KEY(room.slug));
      } else {
        localStorage.setItem(
          GATE_CTX_KEY(room.slug),
          JSON.stringify({ reasons: joinBlockedReasons, savedAt: Date.now() }),
        );
        setGateCtxFromCache(false);
      }
    } catch {}
  }, [joinBlockedReasons, room.slug]);

  // Sempre que houver requisitos não atendidos (gate bloqueando a entrada),
  // expande automaticamente o painel mobile da sala — assim o usuário que
  // tocou "Entrar" vê de imediato o card de Requisitos e o "Como conseguir",
  // em vez de apenas um toast. No desktop, força também a coluna esquerda
  // aberta caso esteja colapsada.
  useEffect(() => {
    if (joinBlockedReasons.length === 0 && joinStatus !== 'blocked') return;
    setMobileCollapsed(false);
    setLeftCollapsed(false);
    try { localStorage.setItem(MOBILE_COLLAPSED_KEY(room.slug), '0'); } catch {}
  }, [joinBlockedReasons, joinStatus, room.slug]);

  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  // Lock anti-double-click (sincrônico via ref)
  const enterLockRef = useRef(false);
  const lastEnterAtRef = useRef(0);
  const ENTER_COOLDOWN_MS = 1200;

  // Sincroniza motivos de bloqueio vindos do hook (observer/joined) para o
  // estado persistido — assim o RoomRulesCard mantém o contexto após F5.
  useEffect(() => {
    if (joined?.allowed) {
      setJoinBlockedReasons((prev) => (prev.length ? [] : prev));
      setGateCtxFromCache(false);
      try { localStorage.removeItem(GATE_CTX_KEY(room.slug)); } catch {}
      return;
    }

    const live = joined?.reasons?.length
      ? joined.reasons
      : (joined?.reason ? [joined.reason] : []);
    if (live.length === 0) return;
    setJoinBlockedReasons((prev) => {
      if (prev.length === live.length && prev.every((r, i) => r === live[i])) return prev;
      return live;
    });
  }, [joined?.allowed, joined?.reasons, joined?.reason, room.slug]);

  const actuallyEnter = async () => {
    // Debounce + protect contra múltiplos cliques (síncrono)
    const now = Date.now();
    if (enterLockRef.current) return;
    if (now - lastEnterAtRef.current < ENTER_COOLDOWN_MS) return;
    enterLockRef.current = true;
    lastEnterAtRef.current = now;
    setJoinStatus('loading');
    setJoinBlockedReasons([]);
    setQueuePosition(null);
    try {
      const joinData = await joinNow();
      if (!joinData) {
        setJoinStatus('error');
        toast.error('Falha ao entrar na sala. Tente novamente.');
        return;
      }
      if (joinData && (joinData as any).queued) {
        const pos = (joinData as any).position ?? null;
        setQueuePosition(pos);
        setJoinStatus('queued');
        toast.info(`Sala cheia — você está na fila${pos ? ` #${pos}` : ''}`);
        return;
      }
      if (joinData && (joinData as any).allowed === false && !(joinData as any).master) {
        const rs: string[] = Array.isArray((joinData as any).reasons)
          ? (joinData as any).reasons
          : ((joinData as any).reason ? [(joinData as any).reason] : []);
        setJoinBlockedReasons(rs);
        setJoinStatus('blocked');
        const friendly = rs.map((r) => GATE_REASON_LABELS[r] ?? r).join(' · ') || 'requisitos não atendidos';
        toast.error(`Acesso bloqueado: ${friendly}`);
        return;
      }

      await enterRoom(room.slug);
      setHasEntered(true);
      bumpActivity();
      setJoinStatus('success');

      // Sucesso → limpa motivos do gate persistidos no localStorage
      setJoinBlockedReasons([]);
      setGateCtxFromCache(false);
      try { localStorage.removeItem(GATE_CTX_KEY(room.slug)); } catch {}

      setVerifying(true);
      setVerifySteps({ vip: false, tools: false, chat: false });
      window.setTimeout(() => setVerifySteps((s) => ({ ...s, vip: true })), 300);
      window.setTimeout(() => setVerifySteps((s) => ({ ...s, tools: true })), 800);
      window.setTimeout(() => setVerifySteps((s) => ({ ...s, chat: true })), 1300);
      window.setTimeout(() => setVerifying(false), 1700);

      try { const { progressAuraQuest } = await import('@/lib/auraQuests'); await progressAuraQuest('visit_room', 1); } catch {}

      let myName = 'você';
      let myUsername: string | null = null;
      let myAvatar: string | null = null;
      let myGender = '';
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user?.id) {
          const { data: prof } = await (supabase as any)
            .from('profiles')
            .select('name, username, avatar_url, profile_type, gender')
            .eq('user_id', auth.user.id)
            .maybeSingle();
          if (prof) {
            myName = prof.name || myName;
            myUsername = prof.username || null;
            myAvatar = prof.avatar_url || null;
            myGender = genderLabel(prof.profile_type, prof.gender);
          }
        }
      } catch {}

      const display = myUsername ? `@${myUsername}` : myName;
      const genderTag = myGender ? ` · ${myGender}` : '';
      const ev: SocialEv = {
        id: `me-in-${Date.now()}`,
        text: `🌙 ${display}${genderTag} entrou na sala`,
        at: Date.now(),
        hue: room.hue,
        avatarUrl: myAvatar,
      };
      setSocialEvents((p) => [...p, ev].slice(-30));
      toast.success(`Você entrou em ${room.name}`);
      try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'enter-room', slug: room.slug } })); } catch {}
    } catch {
      setJoinStatus('error');
      toast.error('Não foi possível entrar agora.');
    } finally {
      // Libera o lock após a janela de cooldown
      window.setTimeout(() => { enterLockRef.current = false; }, ENTER_COOLDOWN_MS);
    }
  };

  // Reasons que justificam um "Tentar novamente" útil (transitórios) vs.
  // bloqueios permanentes (que exigem upgrade/KYC, não retry).
  const RETRYABLE_REASONS = new Set(['rate_limited', 'temporary', 'busy', 'queue_full', 'unknown_error']);
  const isBlockedRetryable =
    joinStatus === 'blocked' &&
    joinBlockedReasons.length > 0 &&
    joinBlockedReasons.every((r) => RETRYABLE_REASONS.has(r));

  const handleEnterRoom = async () => {
    if (enterLockRef.current || joinStatus === 'loading') return;
    if (!isMaster && currentSlug && currentSlug !== room.slug) {
      setConfirmSwitch(true);
      return;
    }
    await actuallyEnter();
  };

  const confirmEnterAfterLeave = async () => {
    setConfirmSwitch(false);
    try {
      if (currentSlug) {
        await (supabase as any).rpc('aura_room_leave', { p_slug: currentSlug });
        await exitRoom(currentSlug);
      }
    } catch {}
    await actuallyEnter();
  };

  useEffect(() => {
    if (!open || !autoJoinOnOpen || hasEntered || joinStatus !== 'idle') return;
    onAutoJoinConsumed?.();
    void handleEnterRoom();
  }, [autoJoinOnOpen, handleEnterRoom, hasEntered, joinStatus, onAutoJoinConsumed, open]);

  // Antes saíamos automaticamente ao fechar a Sheet — isso fazia a bolha do
  // usuário sumir de "Auras presentes" ao recolher o painel ou recarregar.
  // Agora a saída só acontece via botão Sair (handleLeaveRoom) ou pelo
  // timer de inatividade. O store local mantém a flag até a saída explícita.

  // ====== Validação extra: usuário em mais de uma sala (não-master) ======
  useEffect(() => {
    if (!hasEntered || isMaster) return;
    let cancelled = false;
    const check = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: rows } = await (supabase as any)
          .from('oculto_aura_room_presence')
          .select('room_slug')
          .eq('user_id', uid);
        const slugs = ((rows || []) as Array<{ room_slug: string }>).map((r) => r.room_slug);
        const others = slugs.filter((s) => s && s !== room.slug);
        if (!cancelled && others.length > 0) {
          toast.warning(`Você estava ativo em ${others.length} outra(s) sala(s) — corrigindo…`);
          for (const s of others) {
            try { await (supabase as any).rpc('aura_room_leave', { p_slug: s }); } catch {}
          }
          try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'single-room-fix' } })); } catch {}
        }
      } catch {}
    };
    check();
    const id = window.setInterval(check, 45_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [hasEntered, isMaster, room.slug]);

  // ====== Saída automática DESATIVADA ======
  // Por decisão de UX (jun/2026): o usuário só sai da sala ao clicar no botão
  // "Sair" (handleLeaveRoom). Não há expiração por inatividade nem reentrada
  // automática — o ping silencioso de presença em useAuraRoomLive já mantém a
  // sessão viva enquanto a aba estiver aberta, mesmo após quedas momentâneas
  // de rede (reconexão silenciosa, sem flicker "entra/sai").


  // ====== Lifecycle do plano: animação + toast ao expirar/renovar ======
  // Os eventos são disparados pelo hook useMyPlanStatus quando detecta a
  // transição. Aqui, refletimos visualmente na sala (overlay pulsante)
  // e bloqueamos/liberamos a UI dos posts pagos imediatamente.
  const [planFlash, setPlanFlash] = useState<null | 'expired' | 'renewed'>(null);
  useEffect(() => {
    const onExpired = () => {
      setPlanFlash('expired');
      toast.error('Seu plano expirou — posts VIP foram bloqueados.', { duration: 5000 });
      try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'plan-expired' } })); } catch {}
      window.setTimeout(() => setPlanFlash(null), 2500);
    };
    const onRenewed = () => {
      setPlanFlash('renewed');
      toast.success('Plano renovado — posts VIP liberados.', { duration: 4000 });
      try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'plan-renewed' } })); } catch {}
      window.setTimeout(() => setPlanFlash(null), 2500);
    };
    window.addEventListener('oculto-plan:expired', onExpired as any);
    window.addEventListener('oculto-plan:renewed', onRenewed as any);
    return () => {
      window.removeEventListener('oculto-plan:expired', onExpired as any);
      window.removeEventListener('oculto-plan:renewed', onRenewed as any);
    };
  }, []);


  const handleLeaveRoom = async () => {
    if (leaveBusy) return;
    setLeaveBusy(true);
    setExitStatus('pending');
    // Otimista: dispara refresh imediato no Aura Match
    try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'leave-room-optimistic', slug: room.slug } })); } catch {}
    let status: 'ok' | 'fallback' | 'error' = 'ok';
    try {
      await leave();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const { count } = await (supabase as any)
          .from('oculto_aura_room_presence')
          .select('user_id', { count: 'exact', head: true })
          .eq('room_slug', room.slug)
          .eq('user_id', uid);
        if ((count ?? 0) > 0) {
          await (supabase as any).rpc('aura_room_leave_all');
          status = 'fallback';
        }
      }
    } catch { status = 'error'; }
    await exitRoom(room.slug);
    setHasEntered(false);
    setExitStatus(status);
    try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'leave-room', slug: room.slug, status } })); } catch {}
    setLeaveBusy(false);
    if (status === 'error') toast.error('Erro ao sair — tentando novamente'); else toast.success('Você saiu da sala');
    onOpenChange(false);
  };

  // Fechar a sala (X / clique fora / Esc) deve sair de verdade quando o usuário já entrou.
  const closingRef = useRef(false);
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (hasEntered) {
      // dispara saída completa (leave + exit local) — não bloqueia o fechamento
      void handleLeaveRoom();
    } else {
      onOpenChange(false);
    }
    setTimeout(() => { closingRef.current = false; }, 600);
  }, [hasEntered, onOpenChange]);

  // Toast leve em reações recebidas + injeta evento social no chat
  useEffect(() => {
    if (!incomingReaction) return;
    const label = REACTION_LABELS[incomingReaction.kind] ?? 'Nova reação';
    toast(label, { duration: 2400 });
    const text = REACTION_EVENT_TEXT[incomingReaction.kind] ?? '✨ nova reação na sala';
    setSocialEvents((prev) => [
      ...prev.slice(-30),
      { id: `r-${incomingReaction.from}-${incomingReaction.at}`, text, at: incomingReaction.at, hue: room.hue },
    ]);
  }, [incomingReaction, room.hue]);

  // Detecta entradas/saídas e presença dominante para alimentar o ticker
  useEffect(() => {
    const ids = new Set(state.presents.map((p) => p.user_id));
    const prev = prevPresentsRef.current;
    const newcomers = [...ids].filter((id) => !prev.has(id));
    const leavers = [...prev].filter((id) => !ids.has(id));
    const now = Date.now();
    if (prev.size > 0 && (newcomers.length > 0 || leavers.length > 0)) {
      const evs: SocialEv[] = [];
      if (newcomers.length === 1) evs.push({ id: `in-${newcomers[0]}-${now}`, text: '🌙 uma aura entrou na sala', at: now, hue: room.hue });
      else if (newcomers.length > 1) evs.push({ id: `in-multi-${now}`, text: `🌙 ${newcomers.length} novas auras entraram`, at: now, hue: room.hue });
      if (leavers.length === 1) evs.push({ id: `out-${leavers[0]}-${now}`, text: '· uma aura se afastou', at: now + 1, hue: room.hue });
      setSocialEvents((p) => [...p, ...evs].slice(-30));
    }
    prevPresentsRef.current = ids;
  }, [state.presents, room.hue]);

  useEffect(() => {
    if (!state.dominant_user_id) return;
    if (prevDominantRef.current === state.dominant_user_id) return;
    prevDominantRef.current = state.dominant_user_id;
    setSocialEvents((p) => [
      ...p,
      { id: `dom-${state.dominant_user_id}-${Date.now()}`, text: '🔥 presença dominante detectada', at: Date.now(), hue: room.hue },
    ].slice(-30));
  }, [state.dominant_user_id, room.hue]);

  // "Tema Livre" é aberta a todos. Master admin tem acesso a tudo.
  // (variáveis declaradas no topo)

  const REACT_LABEL: Record<string,string> = {
    energy: 'Para enviar energia',
    observe: 'Para observar',
    approach: 'Para se aproximar',
    highlight: 'Para destacar uma aura',
  };
  const handleReact = async (kind: 'energy' | 'observe' | 'approach' | 'highlight') => {
    // Master/Tema Livre nunca devem ser tratados como observador
    const treatedAsObserver = isObserver && !isMaster && !isOpenRoom;
    if (treatedAsObserver) {
      const reqs = describeRoomRequirements(room as any);
      toast.info(
        `${REACT_LABEL[kind]} você precisa cumprir os requisitos da sala${reqs.length ? ': ' + reqs.join(' · ') : '.'}`
      );
      return;
    }
    bumpActivity();
    let r = await react(kind, selectedTarget);
    // Auto-recover silencioso: se o servidor disser que não estamos presentes ou
    // que somos observador, garantimos a presença e retry imediato.
    if (!r?.ok && (r?.reason === 'not_present' || r?.reason === 'observer_only')) {
      try { await (supabase as any).rpc('aura_room_join', { p_slug: room.slug }); } catch {}
      r = await react(kind, selectedTarget);
    }
    if (!r?.ok) {
      const reasons: Record<string, string> = {
        rate_limited: 'Aguarde um instante…',
        target_rate_limited: 'Você já interagiu bastante com essa pessoa agora.',
      };
      toast.error(reasons[r?.reason ?? ''] ?? `Não foi possível ${kind === 'highlight' ? 'destacar' : kind === 'approach' ? 'aproximar' : kind === 'observe' ? 'observar' : 'enviar energia'} agora.`);
    } else {
      const ok: Record<string,string> = {
        energy: '⚡ Energia enviada à sala',
        observe: '👁 Você está observando em silêncio',
        approach: '💜 Aura aproximada',
        highlight: '✨ Aura destacada',
      };
      toast.success(ok[kind]);
    }
  };

  const bondedSet = new Set<string>();
  (state.bonded_pairs ?? []).forEach(([a, b]) => { bondedSet.add(a); bondedSet.add(b); });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <SheetContent
        side="bottom"
        onClick={bumpActivity}
        onKeyDown={bumpActivity}
        onTouchStart={bumpActivity}
        className={`border-amber-400/40 bg-[#0b0420] flex flex-col h-[100dvh] sm:h-[100dvh] sm:max-h-[100dvh] sm:rounded-t-2xl rounded-none overflow-hidden px-3 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-[env(safe-area-inset-bottom)] w-full shadow-[0_0_24px_-8px_hsla(45,90%,55%,0.35)_inset] ${state.rising ? 'aura-rising-halo' : ''}`}
        style={state.rising ? ({ ['--rising-hue' as any]: hue }) : undefined}
      >
        {/* Botão fechar destacado (sobrescreve o do Sheet com tamanho maior em mobile) */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar sala"
          className="absolute top-3 right-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/15 text-white shadow-lg sm:h-9 sm:w-9"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header compacto fixo no topo (apenas mobile) — nome da sala sempre visível */}
        <div className="md:hidden sticky top-0 z-20 -mx-3 -mt-3 mb-2 flex items-center gap-2 border-b border-amber-400/20 bg-[#0b0420]/95 px-3 py-2 pr-14 backdrop-blur-md">
          <span aria-hidden className="text-xl leading-none">{room.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold leading-tight" style={{ color: `hsl(${hue}, 80%, 80%)` }}>
                {room.name}
              </h2>
              <AuraRoomMoodBadge mood={state.mood} rising={state.rising} />
            </div>
            <p className="truncate text-[10px] text-muted-foreground">
              {state.count} {state.count === 1 ? 'presente' : 'presentes'} · energia {energy}/100
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileCollapsed((v) => !v)}
            aria-label={mobileCollapsed ? 'Expandir painel da sala' : 'Recolher painel da sala'}
            aria-expanded={!mobileCollapsed}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200 hover:bg-amber-500/20 active:scale-95"
          >
            {mobileCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            {mobileCollapsed ? 'Painel' : 'Recolher'}
          </button>
        </div>

        {/* Overlay transitório quando o plano expira/renova durante a sessão */}
        {planFlash && (
          <div
            className={`pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-12 animate-in fade-in zoom-in-95 duration-300 ${
              planFlash === 'expired'
                ? 'bg-gradient-to-b from-red-500/25 via-red-500/5 to-transparent'
                : 'bg-gradient-to-b from-emerald-400/25 via-emerald-500/5 to-transparent'
            }`}
            role="status"
            aria-live="polite"
          >
            <div
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold backdrop-blur-md shadow-lg animate-pulse ${
                planFlash === 'expired'
                  ? 'border-red-400/60 bg-red-500/20 text-red-100'
                  : 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
              }`}
            >
              {planFlash === 'expired' ? '⚠️ Plano expirado — posts VIP bloqueados' : '✨ Plano renovado — posts VIP liberados'}
            </div>
          </div>
        )}

        {/* Layout em duas colunas no desktop: esquerda (header + presentes + ações) | direita (chat).
            No mobile mantém empilhado para preservar a leitura natural. */}
        <div
          className={`mt-1 flex min-h-0 flex-1 flex-col gap-3 md:grid md:gap-5 md:items-stretch md:transition-[grid-template-columns] md:duration-300 md:ease-out motion-reduce:md:transition-none ${
            leftCollapsed ? 'md:grid-cols-[2.75rem_minmax(0,1fr)]' : 'md:grid-cols-[22rem_minmax(0,1fr)]'
          }`}
        >
          {/* Coluna esquerda colapsada: rail fino com botão de expandir */}
          {leftCollapsed ? (
            <aside className="hidden md:flex min-h-0 flex-col items-center justify-start border-r border-amber-400/30 pr-1 pt-1 transition-opacity duration-300 motion-reduce:transition-none">
              <button
                type="button"
                onClick={() => setLeftCollapsed(false)}
                aria-label="Expandir painel da sala (atalho: [ )"
                title="Expandir painel da sala — atalho: [ "
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 active:scale-95 transition-transform motion-reduce:transition-none"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </aside>
          ) : null}

          {/* Coluna esquerda: header + presentes + barra de ações */}
          <aside className={`min-h-0 flex-col gap-3 overflow-y-auto pr-1 md:border-r md:border-amber-400/30 md:pr-4 transition-opacity duration-300 motion-reduce:transition-none max-h-[42dvh] md:max-h-none shrink-0 md:shrink ${leftCollapsed ? 'md:hidden opacity-0' : 'opacity-100'} ${mobileCollapsed ? 'hidden md:flex' : 'flex'}`}>
            {/* Botão recolher (desktop only) */}
            <div className="hidden md:flex justify-end">
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                aria-label="Recolher painel da sala (atalho: [ )"
                title="Recolher painel da sala — atalho: [ "
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/10 text-amber-200/80 hover:bg-amber-400/20 active:scale-95 transition-transform motion-reduce:transition-none"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            {/* Header */}
            <SheetHeader className="pr-12 text-left space-y-0 hidden md:block">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-lg sm:text-xl" style={{ color: `hsl(${hue}, 80%, 80%)` }}>
                <span aria-hidden className="text-2xl">{room.emoji}</span>
                <span className="font-semibold">{room.name}</span>
                <AuraRoomMoodBadge mood={state.mood} rising={state.rising} />
                <MyPlanStatusPill className="ml-auto" variant="compact" />
              </SheetTitle>
              {/* Banner full do plano (status + contagem regressiva) */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MyPlanStatusPill variant="full" />
              </div>
            </SheetHeader>

            {/* Objetivo + Requisitos */}
            <div
              className="rounded-xl border p-3"
              style={{
                borderColor: `hsla(${hue},80%,60%,0.25)`,
                background: `linear-gradient(135deg, hsla(${hue},80%,40%,0.08), hsla(${(hue+40)%360},80%,40%,0.04))`,
              }}
            >
              {room.description && (
                <p className="text-[12px] leading-snug text-amber-100/95">
                  <span className="mr-1 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">Objetivo</span>
                  {room.description}
                </p>
              )}
              <div className="mt-2">
                <span className="mr-1 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">Requisitos</span>
                <AuraRoomRequirementsLine
                  room={room}
                  allowed={!isObserver}
                  extraReasons={joined?.reasons ?? (joined?.reason ? [joined.reason] : [])}
                />
              </div>
            </div>

            {/* Energia da sala */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Energia da sala</span>
                <span>{energy}/100 · {state.count} {state.count === 1 ? 'presente' : 'presentes'}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${Math.max(4, energy)}%`,
                    background: `linear-gradient(90deg, hsl(${hue},80%,55%), hsl(${(hue + 40) % 360},80%,65%))`,
                  }}
                />
              </div>
              {!state.within_window && (
                <p className="mt-1 text-[10px] text-amber-300/80">Sala fora do horário ativo — visível apenas no ciclo certo.</p>
              )}
              {bondedSet.size > 0 && (
                <p className="mt-1 text-[10px] text-fuchsia-300/90">
                  💜 Sintonia detectada · {(state.bonded_pairs ?? []).length} {((state.bonded_pairs ?? []).length === 1 ? 'par' : 'pares')} em ressonância
                </p>
              )}
            </div>

            {/* Erro de gate (falha de query) com retry inteligente */}
            {joinError && (
              <GateErrorCard
                error={joinError}
                loading={joinLoading}
                onRetry={() => { void handleEnterRoom(); }}
                requiresKyc={
                  !!room.requires_kyc ||
                  joinBlockedReasons.includes('kyc_required') ||
                  (joined?.reasons?.includes('kyc_required') ?? false)
                }
                onStartKyc={() => setKycMockOpen(true)}
              />
            )}

            {/* Motivos de bloqueio (gate) — visíveis sem hover */}
            {!joinError && isObserver && (joined?.reasons?.length || joined?.reason) && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-100">
                <p className="mb-1 font-medium">Você está em modo observador — motivos:</p>
                <ul className="space-y-0.5 text-[11px] text-amber-200/90">
                  {(joined?.reasons?.length ? joined.reasons : [joined?.reason as string]).map((r) => (
                    <li key={r}>• {GATE_REASON_LABELS[r] ?? r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Regras da sala — sempre visíveis para o usuário entender o que precisa */}
            <RoomRulesCard
              room={room}
              blockedReasons={
                joinBlockedReasons.length
                  ? joinBlockedReasons
                  : (joined?.reasons?.length ? joined.reasons : (joined?.reason ? [joined.reason] : []))
              }
              fromCache={gateCtxFromCache && !joined && !joinError}
              onStartKyc={() => setKycMockOpen(true)}
            />

            {/* Status do user */}
            <div className="flex items-center gap-2">
              {joined?.queued ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  ⏳ Sala cheia · você está na fila #{joined.position ?? '?'}
                </span>
              ) : isObserver ? <AuraRoomGateBadge reason={joined?.reason} reasons={joined?.reasons} room={room} /> : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  {isMaster ? '👑 Master · acesso total' : 'Você está presente'}
                </span>
              )}
            </div>

            {/* Presentes */}
            <div className="rounded-xl border border-white/5 bg-black/20 p-2">
              <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                <span>Auras presentes</span>
                <span className="text-amber-200">{effectivePresents.length}</span>
              </div>
              {!joined ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sintonizando…
                </div>
              ) : effectivePresents.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-8 text-center text-xs text-muted-foreground">
                  <Sparkles className="h-5 w-5 text-fuchsia-400/60" />
                  Nenhuma aura presente agora.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 pb-1 md:grid-cols-3">
                  {effectivePresents.slice(0, 12).map((u) => {
                    const isDominant = state.dominant_user_id === u.user_id;
                    const isSelected = selectedTarget === u.user_id;
                    const isBonded = bondedSet.has(u.user_id);
                    return (
                      <button
                        key={u.user_id}
                        type="button"
                        onClick={() => setSelectedTarget(isSelected ? null : u.user_id)}
                        onDoubleClick={() => {
                          // Navega ao perfil social — rota correta é /u/:creatorId
                          // (resolveProfileByIdentifier aceita user_id, profile.id ou username).
                          handleClose();
                          navigate(`/u/${u.user_id}`);
                        }}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}
                        aria-label={u.name || 'aura'}
                      >
                        <div className={`relative h-14 w-14 ${isBonded ? 'aura-bonded' : ''}`}>
                          <span
                            className={`absolute inset-0 rounded-full ${isDominant ? 'animate-pulse' : ''}`}
                            style={{
                              background: `radial-gradient(circle at 30% 30%, hsla(${hue},90%,65%,${isDominant || isBonded ? 0.85 : 0.5}), transparent 70%)`,
                              boxShadow: `0 0 ${isDominant ? 20 : isBonded ? 16 : 12}px hsla(${hue},90%,60%,${isDominant ? 0.75 : isBonded ? 0.65 : 0.45})`,
                            }}
                          />
                          <Avatar className="absolute inset-[14%] h-auto w-auto">
                            <AvatarImage src={u.avatar_url || undefined} alt={u.name || ''} loading="lazy" decoding="async" />
                            <AvatarFallback className="text-xs">{u.name?.slice(0, 1) || '?'}</AvatarFallback>
                          </Avatar>
                          {u.is_observer && (
                            <span className="absolute -right-1 -top-1 rounded-full bg-amber-500/80 p-0.5">
                              <Eye className="h-2.5 w-2.5 text-black" />
                            </span>
                          )}
                        </div>
                        <span className="w-full truncate text-center text-[10px] font-medium text-white">{u.name || '—'}</span>
                        {isDominant && (
                          <span className="text-[9px] text-fuchsia-300">🔥 centro</span>
                        )}
                        {!isDominant && isBonded && (
                          <span className="text-[9px] text-fuchsia-300/80">💜 vínculo</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Barra de ações — só aparece depois de entrar (entrada unificada via chat) */}
            {hasEntered && (
            <div className="mt-auto rounded-xl border border-amber-400/30 bg-black/40 p-1.5">
              {verifying ? (
                <div className="rounded-lg border border-amber-400/40 bg-amber-500/[0.06] p-2" role="status" aria-live="polite">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-200">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Liberando ferramentas…
                  </div>
                  <ul className="space-y-1 text-[10.5px] text-amber-100/90">
                    {[
                      { ok: verifySteps.vip, label: 'Plano VIP ativo' },
                      { ok: verifySteps.tools, label: 'Ferramentas da sala liberadas' },
                      { ok: verifySteps.chat, label: 'Chat pronto para enviar' },
                    ].map((step, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        {step.ok
                          ? <Check className="h-3 w-3 text-emerald-300" aria-hidden="true" />
                          : <Loader2 className="h-3 w-3 animate-spin text-amber-300/80" aria-hidden="true" />}
                        <span className={step.ok ? 'text-emerald-200' : 'text-amber-100/70'}>{step.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1 md:grid-cols-2">
                    {/* Energia — amber */}
                    <Button
                      size="sm" variant="outline" disabled={isObserver}
                      onClick={() => handleReact('energy')}
                      className="flex h-auto flex-col gap-0 rounded-md border-amber-400/40 bg-amber-500/10 px-1 py-1 text-[9px] font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      <Zap className="h-3 w-3" /> Energia
                    </Button>
                    {/* Observar — cyan */}
                    <Button
                      size="sm" variant="outline" disabled={isObserver}
                      onClick={() => handleReact('observe')}
                      className="flex h-auto flex-col gap-0 rounded-md border-cyan-400/40 bg-cyan-500/10 px-1 py-1 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
                    >
                      <Eye className="h-3 w-3" /> Observar
                    </Button>
                    {/* Aproximar — pink */}
                    <Button
                      size="sm" variant="outline" disabled={isObserver}
                      onClick={() => handleReact('approach')}
                      className="flex h-auto flex-col gap-0 rounded-md border-pink-400/40 bg-pink-500/10 px-1 py-1 text-[9px] font-semibold text-pink-200 hover:bg-pink-500/20 disabled:opacity-40"
                    >
                      <Heart className="h-3 w-3" /> Aproximar
                    </Button>
                    {/* Destacar — purple */}
                    <Button
                      size="sm" variant="outline" disabled={isObserver}
                      onClick={() => handleReact('highlight')}
                      className="flex h-auto flex-col gap-0 rounded-md border-purple-400/40 bg-purple-500/10 px-1 py-1 text-[9px] font-semibold text-purple-200 hover:bg-purple-500/20 disabled:opacity-40"
                    >
                      <Star className="h-3 w-3" /> Destacar
                    </Button>
                    {/* Convidar — fuchsia (componente próprio com mesmo padrão) */}
                    <div className="contents">
                      <AuraRoomInviteButton
                        slug={room.slug}
                        roomName={room.name}
                        hue={hue}
                        excludeUserIds={state.presents.map((p) => p.user_id)}
                        suggestions={state.presents}
                      />
                    </div>
                    {/* Presente XP — amber/gold (mesma UX das missões) */}
                    <Button
                      size="sm" variant="outline" disabled={isObserver}
                      onClick={() => setGiftModalOpen(true)}
                      className="flex h-auto flex-col gap-0 rounded-md border-amber-300/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10 px-1 py-1 text-[9px] font-semibold text-amber-200 hover:from-amber-500/25 hover:to-orange-500/20 disabled:opacity-40"
                      aria-label="Enviar presente de XP a alguém da sala"
                    >
                      <Gift className="h-3 w-3" /> Presente
                    </Button>
                    {/* Sair — red */}
                    <Button
                      size="sm" variant="outline"
                      onClick={handleLeaveRoom}
                      disabled={leaveBusy}
                      className="flex h-auto flex-col gap-0 rounded-md border-red-400/40 bg-red-500/10 px-1 py-1 text-[9px] font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {leaveBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                      {leaveBusy ? 'Saindo…' : 'Sair'}
                    </Button>
                  </div>
                  {/* Descrição mais visível: contraste maior + fundo sutil + ícone */}
                  <p className="mt-1.5 rounded-md bg-amber-400/[0.06] px-2 py-1 text-center text-[10.5px] font-medium leading-snug text-amber-100/90">
                    {selectedTarget
                      ? '🎯 Reação direcionada — toque novamente para desselecionar'
                      : '✨ Toque numa aura para direcionar · duplo toque abre o perfil'}
                  </p>
                </>
              )}
            </div>
            )}
          </aside>

          {/* Coluna direita: chat + histórico + campo de digitação (maior espaço) */}
          <section className="flex min-h-0 flex-1 flex-col md:pl-1">
            <AuraRoomChat
              slug={room.slug}
              hue={hue}
              isObserver={!hasEntered || isObserver}
              forcePresent={hasEntered && !verifying}
              observerReason={!hasEntered ? 'manual_entry_required' : (joined?.reason ?? null)}
              socialEvents={socialEvents}
              energy={energy}
              presentsCount={state.count}
              mood={state.mood ?? null}
              highlights={(() => {
                const out: typeof state.presents = [];
                const dom = state.presents.find((p) => p.user_id === state.dominant_user_id);
                if (dom) out.push(dom);
                for (const p of state.presents) {
                  if (out.find((x) => x.user_id === p.user_id)) continue;
                  if (bondedSet.has(p.user_id)) out.push(p);
                  if (out.length >= 3) break;
                }
                for (const p of state.presents) {
                  if (out.length >= 3) break;
                  if (!out.find((x) => x.user_id === p.user_id)) out.push(p);
                }
                return out.slice(0, 3);
              })()}
              onReact={(k) => handleReact(k)}
              onRequestEnter={!hasEntered ? handleEnterRoom : undefined}
              enterLoading={joinStatus === 'loading' || joinStatus === 'queued'}
              enterBlocked={joinStatus === 'blocked'}
              enterBlockedReasons={joinBlockedReasons}
            />
          </section>
        </div>

        {/* Confirmação de troca de sala */}
        <AlertDialog open={confirmSwitch} onOpenChange={setConfirmSwitch}>
          <AlertDialogContent className="border-white/10 bg-[#0b0420]">
            <AlertDialogHeader>
              <AlertDialogTitle>Sair da sala atual?</AlertDialogTitle>
              <AlertDialogDescription>
                Você só pode estar em uma sala por vez. Para entrar em <b style={{ color: `hsl(${hue},80%,75%)` }}>{room.name}</b>, precisamos sair da sala atual.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmEnterAfterLeave} className="bg-emerald-500 hover:bg-emerald-600">
                Sair e entrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modal mock de KYC — desbloqueia o requisito kyc_required */}
        <AuraRoomKycMockModal
          open={kycMockOpen}
          onOpenChange={setKycMockOpen}
          onCompleted={() => {
            // Atualiza imediatamente o RoomRulesCard removendo kyc_required
            setJoinBlockedReasons((prev) => prev.filter((r) => r !== 'kyc_required'));
            setGateCtxFromCache(false);
            // Persiste a remoção (ou limpa se ficou vazio) no localStorage
            try {
              const remaining = (joined?.reasons ?? joinBlockedReasons).filter((r) => r !== 'kyc_required');
              if (remaining.length === 0) {
                localStorage.removeItem(GATE_CTX_KEY(room.slug));
              } else {
                localStorage.setItem(
                  GATE_CTX_KEY(room.slug),
                  JSON.stringify({ reasons: remaining, savedAt: Date.now() }),
                );
              }
            } catch {}
            try { void handleEnterRoom(); } catch {}
          }}
        />

        {/* Modal de presente XP — mesma UX das missões.
            Lista pré-carregada com auras presentes (exceto eu). */}
        <AuraXpGiftModal
          open={giftModalOpen}
          onOpenChange={setGiftModalOpen}
          title="Presentear alguém da sala"
          contextLabel="presente nesta sala"
          presetReceivers={effectivePresents
            .filter((p) => p.user_id !== mePresent?.user_id)
            .map((p) => ({
              id: p.user_id, // RPC resolve por id OU user_id
              user_id: p.user_id,
              username: null,
              name: p.name ?? null,
              avatar_url: p.avatar_url ?? null,
            }))}
          onSent={async ({ receiver, amount }) => {
            try {
              const handle = receiver.username ? `@${receiver.username}` : (receiver.name ?? 'alguém');
              const body = `🎁 Presente de Aura · +${amount} XP enviados para ${handle}`;
              await (supabase as any).rpc('aura_room_post_message', {
                p_slug: room.slug,
                p_body: body.slice(0, 240),
                p_reply_to: null,
                p_mentions: receiver.user_id ? [receiver.user_id] : [],
              });
            } catch {}
          }}
        />

      </SheetContent>
    </Sheet>
  );
}

export const AuraRoomLive = memo(AuraRoomLiveImpl);

/** Wrapper com trigger pílula */
export function AuraRoomTrigger({ room }: { room: AuraRoomItem }) {
  const [open, setOpen] = useState(false);
  // Status ONLINE/OFFLINE baseado APENAS em navigator.onLine + estado de entrada do usuário,
  // sem depender de presença/realtime (que pode oscilar). Sala = sempre online se há internet.
  const [networkOnline, setNetworkOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );
  useEffect(() => {
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`relative flex shrink-0 items-center gap-1.5 rounded-full border bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-white/[0.08] ${room.rising ? 'ring-1 ring-fuchsia-400/60 border-fuchsia-400/40' : 'border-white/10'}`}
          style={{ color: `hsl(${room.hue}, 80%, 75%)` }}
          aria-label={`Entrar em ${room.name}${room.rising ? ' — em ascensão' : ''} — ${networkOnline ? 'online' : 'sem internet'}`}
        >
          <span aria-hidden>{room.emoji}</span>
          <span className="text-foreground/90">{room.name}</span>
          {/* Badge de status: SEMPRE online se navigator.onLine, sem depender do realtime. */}
          <span
            className={`ml-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-wider ${
              networkOnline
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
            aria-hidden="true"
          >
            <span className={`h-1 w-1 rounded-full ${networkOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {networkOnline ? 'online' : 'offline'}
          </span>
          {room.rising && (
            <span className="rounded-sm bg-fuchsia-500/30 px-1 text-[9px] font-bold text-fuchsia-100">🔥 alta</span>
          )}
          {room.active_count > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
              {room.active_count}
            </span>
          )}
          {!room.allowed && (
            <span className="ml-0.5 text-[9px] text-amber-300/80">🔒</span>
          )}
        </button>
      </SheetTrigger>
      {open && <AuraRoomLive room={room} open={open} onOpenChange={setOpen} />}
    </Sheet>
  );
}
