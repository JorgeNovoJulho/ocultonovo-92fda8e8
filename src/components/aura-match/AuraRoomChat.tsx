import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Send, Sparkles, Lock, Flame, Zap, Eye, Heart, Star, Gift,
  CornerUpLeft, ThumbsUp, ThumbsDown, X, ArrowDown, ArrowUp, Loader2, Keyboard,
  Pencil, Trash2, RefreshCw, AlertTriangle, Smile, ChevronUp, Check,
} from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuraRoomChat, type RoomMessage } from '@/hooks/useAuraRoomChat';
import { useMobileComposerSafeArea } from '@/hooks/useMobileComposerSafeArea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuraPulses } from '@/hooks/useAuraPulses';
import { useAuraResonance } from '@/hooks/useAuraResonance';
import { PulseOverlay } from './PulseOverlay';
import { PulseButton } from './PulseButton';
import { PulseDiagnosticsPanel } from './PulseDiagnosticsPanel';
import { ResonanceStrip } from './ResonanceStrip';
import { AuraXpGiftModal } from './AuraXpGiftModal';
import { RoomActiveXpBadge } from './RoomActiveXpBadge';
import { useRoomActiveXp } from '@/hooks/aura/useRoomActiveXp';
import { SpecialRoomXpDropCard } from './SpecialRoomXpDropCard';
import { useSpecialSessionForSlug } from '@/hooks/useSpecialRoomSession';
import { useMiningRoom } from '@/hooks/useMiningRoom';
import { useMiningMessageXp } from '@/hooks/useMiningMessageXp';
import { MiningBalanceChip } from './MiningBalanceChip';
import { MiningSidePanel } from './MiningSidePanel';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

const COMPOSER_EMOJIS = [
  '😀','😂','😍','🥰','😘','😏','😎','🤩',
  '🔥','❤️','💕','💖','💋','🌹','✨','💯',
  '👍','👏','🙌','🙏','👀','😈','🥵','💦',
  '🍑','🍆','💎','👑','⭐','🎉','💪','🤤',
];

// Persistido em localStorage para sobreviver ao fechamento do navegador.
const SCROLL_POS_KEY = (slug: string) => `aura-room-chat:scroll:${slug}`;
const LAST_MSG_KEY = (slug: string) => `aura-room-chat:last-msg:${slug}`;
const HINT_SEEN_KEY = (slug: string) => `aura-room-chat:hint-seen:${slug}`;

function fmtClockShort(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return '—'; }
}


const PLACEHOLDERS = [
  'Provocar a sala…',
  'Compartilhe sua presença…',
  'Chame atenção sem dizer muito…',
  'Envie uma faísca à sala…',
];

interface SocialEvent {
  id: string;
  text: string;
  at: number;
  hue: number;
  avatarUrl?: string | null;
}

interface PresentMini {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  plan_type?: string | null;
}

interface Props {
  slug: string;
  hue: number;
  isObserver: boolean;
  /** Quando true (usuário entrou via UI/é master/sala aberta), o chat trata presença como "presente" sem depender da RPC. */
  forcePresent?: boolean;
  observerReason?: string | null;
  socialEvents?: SocialEvent[];
  /** Resumo ao vivo */
  energy?: number;
  presentsCount?: number;
  mood?: string | null;
  /** Top destaques (dominant + bonded) — máx 3 */
  highlights?: PresentMini[];
  /** Reações compactas reaproveitando o react() do AuraRoomLive */
  onReact?: (kind: 'energy' | 'observe' | 'approach' | 'highlight') => void | Promise<void>;
  /** Dispara a entrada na sala (entrada unificada). Mostrado no composer quando em modo observador. */
  onRequestEnter?: () => void;
  /** True enquanto a verificação/entrada está em andamento — desabilita o botão e mostra loader. */
  enterLoading?: boolean;
  /** True quando a última tentativa de entrar foi bloqueada por requisitos (mostra rótulo e razão). */
  enterBlocked?: boolean;
  enterBlockedReasons?: string[];
}

const SEND_COOLDOWN_MS = 2200; // bloqueio frontend p/ evitar floods

function genderLabel(profileType?: string | null, gender?: string | null): string {
  const g = (gender || profileType || '').toLowerCase().trim();
  if (!g) return '';
  if (g.includes('casal') || g === 'couple') return 'casal';
  if (g.includes('homem') || g === 'male' || g === 'm' || g === 'man') return 'homem';
  if (g.includes('mulher') || g === 'female' || g === 'f' || g === 'woman') return 'mulher';
  if (g.includes('trans')) return 'trans';
  if (g.includes('não') || g.includes('nao') || g.includes('non')) return 'não-binárie';
  return g;
}

function handleAt(m: RoomMessage): string {
  // SEMPRE prefere @username — NUNCA derivar handle a partir do nome real
  // (regra de privacidade do projeto).
  if (m.username) return `@${m.username}`;
  if (m.user_id) return `@user${m.user_id.slice(0, 4)}`;
  return '@membro';
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 30_000) return 'agora';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

function renderBodyWithMentions(body: string, currentUsername?: string | null) {
  const parts: Array<{ type: 'text' | 'mention'; value: string; mine?: boolean }> = [];
  const re = /@([a-zA-Z0-9_.-]{2,32})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: body.slice(last, m.index) });
    const handle = m[1].toLowerCase();
    parts.push({
      type: 'mention',
      value: '@' + m[1],
      mine: !!currentUsername && handle === currentUsername.toLowerCase(),
    });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: 'text', value: body.slice(last) });
  return parts;
}

interface MessageRowProps {
  m: RoomMessage;
  hue: number;
  currentUsername?: string | null;
  isMine?: boolean;
  /** Cor do pulso recente (vinda do metadata) p/ realçar o autor; null = sem destaque. */
  pulsedHighlight?: string | null;
  /** Timestamp (ms) em que o destaque do pulso expira — sincronizado por created_at do servidor. */
  pulsedUntil?: number | null;
  onReply: (m: RoomMessage) => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  onToggleEmoji?: (id: string, emoji: string) => void;
  onResend?: (id: string) => void;
  /** Envia Pulso de Aura para o autor desta mensagem. undefined desabilita. */
  onPulse?: (targetUserId: string, messageId: string, pulseType?: 'default'|'premium'|'rare'|'silent') => boolean | Promise<boolean> | void;
  /** Abre o modal de presente XP travado no autor desta mensagem. undefined desabilita. */
  onGift?: (m: RoomMessage) => void;
  /** XP total minerado para esta mensagem (soma de likes/reações/menções/pulsos/destaques). */
  awardedXp?: number;
}

const EMOJI_PALETTE = ['👍', '❤️', '🔥', '😂', '😮', '😢'] as const;

function MessageRow({
  m, hue, currentUsername, isMine, pulsedHighlight, pulsedUntil, onReply, onLike, onDislike,
  onEdit, onDelete, onToggleEmoji, onResend, onPulse, onGift, awardedXp,
}: MessageRowProps) {
  const isVip = m.plan_type === 'vip';
  const gender = genderLabel(m.profile_type, m.gender);
  const parts = renderBodyWithMentions(m.body, currentUsername);
  const mentionsMe = parts.some((p) => p.type === 'mention' && p.mine);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(m.body);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => { if (!editing) setEditValue(m.body); }, [m.body, editing]);

  // Contador "ativo por Ns" — sincronizado pelo `until` (created_at + highlight_ms do servidor)
  const [pulseSecsLeft, setPulseSecsLeft] = useState<number>(() =>
    pulsedUntil ? Math.max(0, Math.ceil((pulsedUntil - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!pulsedUntil) { setPulseSecsLeft(0); return; }
    const tick = () => setPulseSecsLeft(Math.max(0, Math.ceil((pulsedUntil - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [pulsedUntil]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === m.body) { setEditing(false); return; }
    onEdit?.(m.id, trimmed);
    setEditing(false);
  };

  return (
    <div
      data-msg-id={m.id}
      // Virtualização CSS leve (zero-deps): o navegador pula layout/paint de mensagens
      // fora da viewport, mantendo a fluidez mesmo com centenas de itens.
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '64px',
        ...(pulsedHighlight
          ? {
              backgroundColor: `${pulsedHighlight}1A`,
              boxShadow: `inset 0 0 0 1px ${pulsedHighlight}80, 0 0 18px -4px ${pulsedHighlight}73`,
              borderRadius: '0.375rem',
            }
          : null),
      } as React.CSSProperties}
      className={cn(
        'group relative flex items-start gap-2 px-1 py-1 animate-fade-in',
        mentionsMe && 'rounded-md bg-fuchsia-500/[0.08] ring-1 ring-fuchsia-400/30',
        m.pending && 'opacity-70',
        m.failed && 'opacity-90 ring-1 ring-rose-400/40 rounded-md bg-rose-500/[0.06]'
      )}
    >
      <div className="relative h-8 w-8 shrink-0">
        <span
          className="absolute inset-0 rounded-full opacity-70"
          style={{ background: `radial-gradient(circle at 30% 30%, hsla(${hue},90%,65%,0.55), transparent 70%)` }}
        />
        <Avatar className="absolute inset-[10%] h-auto w-auto">
          <AvatarImage src={m.avatar_url || undefined} alt="" loading="lazy" decoding="async" />
          <AvatarFallback className="text-[9px]">{(m.username || 'U').slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span
            className={cn('truncate text-[11px] font-semibold text-white')}
            style={{ maxWidth: '50%' }}
          >
            {handleAt(m)}
          </span>
          {typeof awardedXp === 'number' && awardedXp > 0 && (
            <span
              className="inline-flex items-center rounded-full bg-amber-500/20 px-1.5 py-[1px] text-[9px] font-bold tabular-nums text-white ring-1 ring-amber-400/40"
              title="XP minerado por esta mensagem (mensagem + reações + likes + pulsos + menções)"
              aria-label={`+${awardedXp} XP minerado nesta mensagem`}
            >
              +{awardedXp} XP
            </span>
          )}
          {gender && (
            <span className="rounded-full bg-white/[0.06] px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-white/90">
              {gender}
            </span>
          )}
          {isVip && <span className="text-[8px] uppercase tracking-wider text-white">VIP</span>}
          <span className="text-[9px] text-white/80">· {timeAgo(m.created_at)}</span>
          {m.edited && (
            <span className="text-[9px] text-white/70 italic" title="Editada">· editada</span>
          )}
          {m.pending && !m.failed && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-300/80" aria-label="Enviando">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> enviando…
            </span>
          )}
          {m.failed && (
            <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-rose-300" aria-label="Falha ao enviar">
              <AlertTriangle className="h-2.5 w-2.5" /> falhou
            </span>
          )}
        </div>

        {/* Reply preview */}
        {m.reply_to_id && (m.reply_to_body || m.reply_to_user) && (
          <div className="mb-1 mt-0.5 flex items-center gap-1 rounded-md border-l-2 border-fuchsia-400/50 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/90">
            <CornerUpLeft className="h-2.5 w-2.5 shrink-0 text-white/80" />
            <span className="truncate">
              <b className="text-white">@{m.reply_to_user || '…'}</b>
              {m.reply_to_body ? <>: <span className="text-white/80">{m.reply_to_body.slice(0, 80)}</span></> : null}
            </span>
          </div>
        )}

        {editing ? (
          <div className="mt-0.5 flex items-center gap-1">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.slice(0, 240))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              maxLength={240}
              className="flex-1 rounded-md border border-amber-400/30 bg-black/40 px-2 py-0.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-amber-400/60 focus:outline-none"
              aria-label="Editar mensagem"
            />
            <button
              type="button"
              onClick={commitEdit}
              className="rounded-md bg-amber-500/20 p-1 text-amber-200 hover:bg-amber-500/30"
              title="Salvar (Enter)"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md p-1 text-foreground/60 hover:bg-white/10"
              title="Cancelar (Esc)"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <p className="break-words text-[12px] leading-snug text-amber-200">
            {parts.map((p, i) =>
              p.type === 'text' ? (
                <span key={i}>{p.value}</span>
              ) : (
                <span
                  key={i}
                  className={cn(
                    'rounded px-0.5 font-semibold',
                    p.mine
                      ? 'bg-fuchsia-500/30 text-fuchsia-100'
                      : 'text-fuchsia-300'
                  )}
                >
                  {p.value}
                </span>
              )
            )}
          </p>
        )}

        {/* Reações emoji (mock) */}
        {m.emoji_reactions && Object.keys(m.emoji_reactions).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(m.emoji_reactions).map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggleEmoji?.(m.id, emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10.5px] leading-none transition-colors',
                  info.mine
                    ? 'border-amber-400/40 bg-amber-500/15 text-white'
                    : 'border-white/10 bg-white/[0.04] text-white hover:bg-white/10'
                )}
                aria-label={`Reagir com ${emoji}`}
              >
                <span>{emoji}</span>
                <span className="font-semibold">{info.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onReply(m)}
            className="inline-flex items-center gap-0.5 text-[10px] text-white hover:text-fuchsia-300"
            title="Responder"
          >
            <CornerUpLeft className="h-3 w-3" /> responder
          </button>
          <button
            type="button"
            onClick={() => onLike(m.id)}
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px] text-white hover:text-emerald-300',
              m.my_reaction === 'like' && 'text-emerald-300'
            )}
            title="Curtir"
          >
            <ThumbsUp className="h-3 w-3" /> {m.like_count || 0}
          </button>
          <button
            type="button"
            onClick={() => onDislike(m.id)}
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px] text-white hover:text-rose-300',
              m.my_reaction === 'dislike' && 'text-rose-300'
            )}
            title="Não curtir"
          >
            <ThumbsDown className="h-3 w-3" /> {m.dislike_count || 0}
          </button>

          {/* Emoji picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[10px] text-white hover:text-amber-300"
              title="Reagir com emoji"
              aria-expanded={pickerOpen}
            >
              <Smile className="h-3 w-3" /> reagir
            </button>
            {pickerOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-full border border-amber-400/30 bg-[#0b0420]/95 px-1.5 py-1 shadow-lg shadow-black/40"
              >
                {EMOJI_PALETTE.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { onToggleEmoji?.(m.id, emoji); setPickerOpen(false); }}
                    className="rounded-full px-1 py-0.5 text-[14px] leading-none transition-transform hover:scale-125"
                    aria-label={`Reagir com ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pulso de Aura (apenas em mensagens de outros usuários) */}
          {!isMine && onPulse && !m.pending && (
            <PulseButton onClick={(t) => onPulse(m.user_id, m.id, t)} />
          )}

          {/* Presente de Aura (XP) — abre modal travado neste autor */}
          {!isMine && onGift && !m.pending && (
            <button
              type="button"
              onClick={() => onGift(m)}
              aria-label={`Enviar presente de XP para @${m.username ?? 'usuario'}`}
              title="Enviar presente de XP"
              className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-[3px] text-[10.5px] font-medium leading-none text-white transition-colors hover:bg-amber-400/20"
            >
              <Gift className="h-3 w-3" />
              Presente
            </button>
          )}

          {/* Contador visível "ativo por Ns" — mesmo timing nos dois lados */}
          {pulsedHighlight && pulseSecsLeft > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9.5px] font-medium tabular-nums leading-none border backdrop-blur-sm animate-fade-in"
              style={{
                borderColor: `${pulsedHighlight}66`,
                backgroundColor: `${pulsedHighlight}1A`,
                color: pulsedHighlight,
              }}
              title="Tempo restante do destaque de Pulso"
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: pulsedHighlight }}
              />
              ativo por {pulseSecsLeft}s
            </span>
          )}

          {isMine && m.failed && onResend && (
            <button
              type="button"
              onClick={() => onResend(m.id)}
              className="inline-flex items-center gap-0.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-1.5 py-[1px] text-[10px] font-semibold text-rose-100 hover:bg-rose-500/25"
              title="Reenviar mensagem"
            >
              <RefreshCw className="h-3 w-3" /> reenviar
            </button>
          )}

          {/* Edit (apenas mensagens próprias e já confirmadas).
              IMPORTANTE: usuários NÃO podem apagar mensagens enviadas — todas
              ficam preservadas por 30 dias para histórico/auditoria do master
              admin antes de serem arquivadas em log .txt. */}
          {isMine && !m.pending && !m.failed && !editing && onEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-0.5 text-[10px] text-white hover:text-amber-300"
              title="Editar"
            >
              <Pencil className="h-3 w-3" /> editar
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
const MessageRowMemo = memo(MessageRow);

function SocialEventRow({ ev }: { ev: SocialEvent }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-2 my-1.5 flex items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-[11px] leading-snug animate-fade-in min-w-0"
      style={{
        borderColor: 'hsl(var(--success))',
        backgroundColor: 'hsl(var(--success) / 0.08)',
        color: 'hsl(var(--success))',
      }}
    >
      {ev.avatarUrl ? (
        <Avatar className="h-5 w-5 shrink-0">
          <AvatarImage src={ev.avatarUrl} alt="" loading="lazy" decoding="async" />
          <AvatarFallback className="text-[9px]">·</AvatarFallback>
        </Avatar>
      ) : null}
      <span
        className="min-w-0 flex-1 break-words"
        style={{ color: 'hsl(var(--success))' }}
        title={ev.text}
      >
        {ev.text}
      </span>
    </div>
  );
}


function HighlightsBar({ items, hue }: { items: PresentMini[]; hue: number }) {
  if (!items?.length) return null;
  return (
    <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
      <span className="text-[9px] uppercase tracking-wider text-white/80">No centro</span>
      <div className="flex -space-x-2">
        {items.slice(0, 3).map((u) => (
          <div key={u.user_id} className="relative">
            <span
              className="absolute inset-0 -m-0.5 rounded-full"
              style={{ background: `radial-gradient(circle at 30% 30%, hsla(${hue},90%,65%,0.6), transparent 70%)` }}
            />
            <Avatar className="relative h-6 w-6 ring-1 ring-black/40">
              <AvatarImage src={u.avatar_url || undefined} loading="lazy" />
              <AvatarFallback className="text-[8px]">{(u.name || '?').slice(0, 1)}</AvatarFallback>
            </Avatar>
          </div>
        ))}
      </div>
      <span className="truncate text-[10px] text-white/90">
        {items.slice(0, 3).map((u) => u.name?.split(' ')[0] || '—').join(' · ')}
      </span>
    </div>
  );
}

function AuraRoomChatImpl({
  slug, hue, isObserver, forcePresent, observerReason, socialEvents = [],
  energy, presentsCount, mood, highlights = [], onReact, onRequestEnter,
  enterLoading = false, enterBlocked = false, enterBlockedReasons = [],
}: Props) {
  const {
    messages, loading, loadingOlder, hasMore, loadOlder,
    sending, send, react, presence, presenceRaw, outbox,
    editMessage, deleteMessage, toggleEmoji, resend, meUserId,
  } = useAuraRoomChat(slug, { forcePresent });

  // ============== Sala MINERAÇÃO — engine de XP em tempo real ==============
  const isMineracao = slug === 'mineracao';
  const { awardEvent: miningAward } = useMiningRoom(isMineracao ? slug : null, isMineracao);
  const visibleMsgIds = useMemo(
    () => (isMineracao ? messages.map((m) => m.id).filter(Boolean) : []),
    [isMineracao, messages],
  );
  const messageXpMap = useMiningMessageXp(isMineracao ? slug : null, visibleMsgIds);

  // Recompensa por permanência ativa: +10 XP a cada 10 min com atividade real.
  const { state: activeXpState, registerMessage: registerActiveXpMessage } =
    useRoomActiveXp({ slug, enabled: !isObserver && !!meUserId, meUserId });

  // Ciclo especial: se esta sala tem sessão especial aberta, mostra countdown
  // e o card de presentes XP.
  const specialSession = useSpecialSessionForSlug(slug);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!specialSession) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [specialSession]);
  const remainingMin = specialSession
    ? Math.max(0, Math.floor((new Date(specialSession.closes_at).getTime() - now) / 60000))
    : 0;

  // Detecta encerramento da sala especial em tempo real (status flip -> closed)
  useEffect(() => {
    if (!slug) return;
    const unsub = subscribeTable('oculto_special_cycle_sessions', (payload: any) => {
      if (payload?.eventType !== 'UPDATE') return;
      const row = payload?.new;
      if (!row || row.room_slug !== slug) return;
      if (row.status === 'closed') {
        try {
          toast.info('Sala especial encerrada — continue a conversa em outras salas.');
          window.setTimeout(() => { window.location.href = '/aura-match'; }, 1500);
        } catch { /* noop */ }
      }
    }, { events: ['UPDATE'] });
    return () => { unsub(); };
  }, [slug]);


  // Pulso de Aura — envio + recepção + highlight do remetente (resolve slug -> room_id internamente)
  const {
    sendPulse, respondPulse, highlighted: pulseHighlighted,
    lastIncoming: incomingPulse, clearLastIncoming: clearIncomingPulse,
    prefs: pulsePrefs, roomId: pulseRoomId,
    diagnostics: pulseDiagnostics, clearDiagnostics: clearPulseDiagnostics,
  } = useAuraPulses(slug);
  const { latest: resonance, phrases: resonancePhrases, dismiss: dismissResonance } =
    useAuraResonance(pulseRoomId, pulsePrefs.show_resonance_public && !pulsePrefs.silent_mode);
  // Detecta estado real de conexão de rede para diferenciar "offline" de "fora da sala"
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
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  /** Mensagem cujo autor receberá um presente XP — quando setado, abre o modal. */
  const [giftTarget, setGiftTarget] = useState<RoomMessage | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = useMemo(
    () => PLACEHOLDERS[Math.floor(Date.now() / 8000) % PLACEHOLDERS.length],
    []
  );
  const listRef = useRef<HTMLDivElement>(null);
  const lastSendRef = useRef<number>(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [unread, setUnread] = useState(0);
  const isAtBottomRef = useRef(true);
  // Dica discreta de atalhos: aparece somente na primeira vez por sala (persistida em localStorage).
  const [showShortcutsHint, setShowShortcutsHint] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(HINT_SEEN_KEY(slug)) !== '1'; } catch { return false; }
  });
  useEffect(() => {
    try { setShowShortcutsHint(localStorage.getItem(HINT_SEEN_KEY(slug)) !== '1'); } catch {}
  }, [slug]);
  const dismissShortcutsHint = useCallback(() => {
    setShowShortcutsHint(false);
    try { localStorage.setItem(HINT_SEEN_KEY(slug), '1'); } catch {}
  }, [slug]);
  // Auto-dismiss após 12s se o usuário não interagir.
  useEffect(() => {
    if (!showShortcutsHint) return;
    const t = window.setTimeout(() => dismissShortcutsHint(), 12000);
    return () => window.clearTimeout(t);
  }, [showShortcutsHint, dismissShortcutsHint]);
  // Rastreia última mudança de status de conexão para tooltip ("última atualização").
  const [presenceChangedAt, setPresenceChangedAt] = useState<number>(() => Date.now());
  const [reconnectReason, setReconnectReason] = useState<string | null>(null);
  const prevPresenceRef = useRef(presenceRaw);
  useEffect(() => {
    if (prevPresenceRef.current !== presenceRaw) {
      setPresenceChangedAt(Date.now());
      if (presenceRaw === 'reconnecting') {
        setReconnectReason(outbox.length > 0 ? 'mensagens na fila' : 'sinal instável');
      } else if (presenceRaw === 'present') {
        setReconnectReason(null);
      } else {
        setReconnectReason('reconectando sessão');
      }
      prevPresenceRef.current = presenceRaw;
    }
  }, [presenceRaw, outbox.length]);

  // Carrega meu @username p/ destacar menções dirigidas a mim
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/supabaseExternal');
        const { data: auth } = await mod.supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: prof } = await (mod.supabase as any)
          .from('profiles').select('username').eq('user_id', uid).maybeSingle();
        if (!cancelled) setCurrentUsername(prof?.username || null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, lastSendRef.current + SEND_COOLDOWN_MS - Date.now());
      setCooldownLeft(left);
      if (left === 0) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [cooldownLeft]);

  // prefers-reduced-motion: respeitamos para o indicador de digitação e animações
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Track scroll position para saber se o usuário está no rodapé.
  // Topo → carrega mensagens mais antigas (paginação incremental, com debounce e trava por slug).
  const loadOlderTimerRef = useRef<number | null>(null);
  const lastLoadOlderAtRef = useRef<number>(0);
  const [atBottom, setAtBottom] = useState(true);

  // Persistir/restaurar posição de scroll por sala (sessionStorage).
  // Restaura ao montar/trocar slug; salva (debounced) durante o scroll.
  const restoredRef = useRef(false);
  useEffect(() => {
    restoredRef.current = false;
  }, [slug]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || restoredRef.current) return;
    if (loading) return;
    if (messages.length === 0) return;
    try {
      const raw = localStorage.getItem(SCROLL_POS_KEY(slug));
      const saved = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(saved) && saved >= 0) {
        // pequeno delay p/ DOM ter as mensagens renderizadas
        requestAnimationFrame(() => {
          if (!listRef.current) return;
          const max = listRef.current.scrollHeight - listRef.current.clientHeight;
          listRef.current.scrollTop = Math.min(saved, Math.max(0, max));
          const nb = listRef.current.scrollHeight - listRef.current.scrollTop - listRef.current.clientHeight < 80;
          isAtBottomRef.current = nb;
          setAtBottom(nb);
        });
      } else {
        // sem snapshot → tenta retomar pela última mensagem lida/selecionada salva
        let scrolled = false;
        try {
          const lastId = localStorage.getItem(LAST_MSG_KEY(slug));
          if (lastId) {
            requestAnimationFrame(() => {
              const target = listRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(lastId)}"]`);
              if (target && listRef.current) {
                target.scrollIntoView({ block: 'center' });
                const nb = listRef.current.scrollHeight - listRef.current.scrollTop - listRef.current.clientHeight < 80;
                isAtBottomRef.current = nb;
                setAtBottom(nb);
              } else if (listRef.current) {
                listRef.current.scrollTop = listRef.current.scrollHeight;
              }
            });
            scrolled = true;
          }
        } catch {}
        if (!scrolled) el.scrollTop = el.scrollHeight;
      }
    } catch {}
    restoredRef.current = true;
  }, [slug, loading, messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const saveScrollSoon = (() => {
      let t: number | null = null;
      return () => {
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => {
          try { localStorage.setItem(SCROLL_POS_KEY(slug), String(el.scrollTop | 0)); } catch {}
        }, 250);
      };
    })();
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      isAtBottomRef.current = nearBottom;
      setAtBottom(nearBottom);
      if (nearBottom && unread > 0) setUnread(0);
      saveScrollSoon();
      if (el.scrollTop < 60 && hasMore && !loadingOlder) {
        // Throttle 700ms + debounce 120ms para evitar disparos em sequência
        if (Date.now() - lastLoadOlderAtRef.current < 700) return;
        if (loadOlderTimerRef.current) return;
        loadOlderTimerRef.current = window.setTimeout(() => {
          loadOlderTimerRef.current = null;
          if (!hasMore || loadingOlder) return;
          lastLoadOlderAtRef.current = Date.now();
          const prevH = el.scrollHeight;
          void loadOlder().then(() => {
            requestAnimationFrame(() => {
              const newH = el.scrollHeight;
              el.scrollTop += (newH - prevH);
            });
          });
        }, 120);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (loadOlderTimerRef.current) {
        window.clearTimeout(loadOlderTimerRef.current);
        loadOlderTimerRef.current = null;
      }
    };
  }, [unread, hasMore, loadingOlder, loadOlder, slug]);


  // Indicador de digitação: pool fixo determinístico por sala, sem rerenders aleatórios em loop.
  // Respeita prefers-reduced-motion (oculta o indicador para usuários sensíveis a animação).
  const [typingUser, setTypingUser] = useState<string | null>(null);
  useEffect(() => {
    if (isObserver || reducedMotion) { setTypingUser(null); return; }
    // Pool fixo: até 3 nomes derivados dos destaques presentes, ordenados estavelmente
    const pool = (highlights || [])
      .map((h) => h.name?.split(' ')[0])
      .filter((n): n is string => !!n && n.length > 0)
      .slice(0, 3)
      .sort();
    if (pool.length === 0) { setTypingUser(null); return; }

    let alive = true;
    let idx = 0;
    // Rodízio determinístico, ciclo lento (~9s) para evitar piscar/alternar demais
    const cycle = () => {
      if (!alive) return;
      const who = pool[idx % pool.length];
      idx += 1;
      setTypingUser(who);
      window.setTimeout(() => { if (alive) setTypingUser(null); }, 2400);
    };
    cycle();
    const id = window.setInterval(cycle, 9000);
    return () => { alive = false; window.clearInterval(id); };
  }, [highlights, isObserver, reducedMotion, slug]);

  // Quando chegam mensagens novas: se está no rodapé → auto-scroll;
  // caso contrário → incrementa contador de não-lidas.
  const lastCountRef = useRef(messages.length);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const delta = messages.length - lastCountRef.current;
    lastCountRef.current = messages.length;
    if (delta <= 0) return;
    // Mobile-friendly: se o usuário está perto do fim (< 200px) ou é a própria mensagem dele,
    // rola suavemente até o fim para garantir visibilidade da nova mensagem.
    const last = messages[messages.length - 1];
    const isMine = !!meUserId && last?.user_id === meUserId;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (isAtBottomRef.current || distFromBottom < 200 || isMine) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
        // Após nova mensagem + auto-scroll, revalida composer (cobre caso teclado aberto).
        validateComposer?.();
      });
      if (last?.id) {
        try { localStorage.setItem(LAST_MSG_KEY(slug), last.id); } catch {}
      }
    } else {
      setUnread((u) => Math.min(99, u + delta));
    }
  }, [messages, slug, meUserId, reducedMotion]);

  // Sempre que o usuário abre/reabre a sala (mudou slug) limpa contador.
  useEffect(() => { setUnread(0); }, [slug]);

  const merged = useMemo(() => {
    type Item = { kind: 'msg'; data: RoomMessage; ts: number } | { kind: 'evt'; data: SocialEvent; ts: number };
    const out: Item[] = [];
    for (const m of messages) out.push({ kind: 'msg', data: m, ts: new Date(m.created_at).getTime() });
    for (const e of socialEvents) out.push({ kind: 'evt', data: e, ts: e.at });
    out.sort((a, b) => a.ts - b.ts);
    // Cap maior (300) — content-visibility:auto na MessageRow garante perf.
    return out.slice(-300);
  }, [messages, socialEvents]);

  // Botão "ir ao topo": aparece quando o usuário rolou bastante para baixo do topo.
  const [showTopButton, setShowTopButton] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => setShowTopButton(el.scrollTop > 320);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [slug, merged.length]);

  const scrollToTop = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Hook centralizado: garante composer sempre visível (teclado, orientação, navbar).
  const { keyboardOffset, composerRef, inputRef: composerInputRef, validate: validateComposer } =
    useMobileComposerSafeArea({
      threshold: 80,
      onAdjust: () => {
        // Quando o teclado abre e usuário estava no rodapé, mantém visíveis as últimas mensagens.
        if (isAtBottomRef.current) {
          const el = listRef.current;
          if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
        }
      },
    });

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    setUnread(0);
    setAtBottom(true);
    isAtBottomRef.current = true;
  }, [reducedMotion]);

  // Atalho de teclado: tecla "j" ou End → pula para novas mensagens.
  // Ignora quando o foco está num input/textarea para não atrapalhar a digitação.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const editable = tgt?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
      if (e.key === 'End' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        scrollToBottom();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollToBottom]);

  const onReplyTo = useCallback((m: RoomMessage) => {
    setReplyTo(m);
    // Persiste como "última mensagem selecionada" para retomar no mesmo ponto ao voltar.
    try { localStorage.setItem(LAST_MSG_KEY(slug), m.id); } catch {}
    const handle = m.username ? `@${m.username} ` : '';
    setDraft((d) => (d.includes(handle) ? d : `${handle}${d}`));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [slug]);

  const onLike = useCallback((id: string) => {
    void react(id, 'like');
    if (isMineracao) {
      const target = messages.find((mm) => mm.id === id);
      if (target?.user_id && target.user_id !== meUserId) {
        void miningAward('receive_like', `like:${id}:${meUserId}`, target.user_id, null, id);
      }
    }
  }, [react, isMineracao, miningAward, messages, meUserId]);
  const onDislike = useCallback((id: string) => {
    void react(id, 'dislike');
    if (isMineracao) {
      const target = messages.find((mm) => mm.id === id);
      if (target?.user_id && target.user_id !== meUserId) {
        void miningAward('receive_dislike', `dislike:${id}:${meUserId}`, target.user_id, null, id);
      }
    }
  }, [react, isMineracao, miningAward, messages, meUserId]);

  // Wrapper de toggleEmoji que credita receive_reaction para o autor (mineração apenas).
  const toggleEmojiMining = useCallback(
    (id: string, emoji: string) => {
      const p = toggleEmoji(id, emoji);
      if (isMineracao) {
        const target = messages.find((mm) => mm.id === id);
        if (target?.user_id && target.user_id !== meUserId) {
          void miningAward(
            'receive_reaction',
            `react:${id}:${meUserId}:${emoji}`,
            target.user_id,
            null,
            id,
          );
        }
      }
      return p;
    },
    [toggleEmoji, isMineracao, miningAward, messages, meUserId],
  );

  // per_quality_message — fire automaticamente quando minha nova mensagem aparece
  // em `messages` (cobre envio direto E mensagens entregues após enfileiramento).
  const lastMineMsgRef = useRef<string | null>(null);
  const lastMineBodyRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!isMineracao || !meUserId || messages.length === 0) return;
    // Procura a última mensagem MINHA não-pendente ainda não premiada.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.user_id !== meUserId || m.pending) continue;
      if (lastMineMsgRef.current === m.id) return;
      lastMineMsgRef.current = m.id;
      // Usa corpo registrado no handleSend quando disponível
      const body = lastMineBodyRef.current[m.id] || m.body || '';
      void miningAward('per_quality_message', `msg:${m.id}`, null, body, m.id);
      // Limpa cache do corpo
      delete lastMineBodyRef.current[m.id];
      return;
    }
  }, [isMineracao, meUserId, messages, miningAward]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    if (isObserver) {
      toast.info('Você está observando — suba seus requisitos para falar.');
      return;
    }
    if (Date.now() - lastSendRef.current < SEND_COOLDOWN_MS) {
      setCooldownLeft(Math.max(0, lastSendRef.current + SEND_COOLDOWN_MS - Date.now()));
      return;
    }
    lastSendRef.current = Date.now();
    setCooldownLeft(SEND_COOLDOWN_MS);
    const mentions = Array.from(new Set(
      Array.from(draft.matchAll(/@([a-zA-Z0-9_.-]{2,32})/g)).map((mm) => mm[1].toLowerCase())
    ));
    const r = await send(draft, { replyTo: replyTo?.id ?? null, mentions });
    if (!r?.ok) {
      const reason = r?.reason ?? '';
      const reasons: Record<string, string> = {
        rate_limited: 'Calma, faísca demais — espere um instante.',
        invalid_length: 'Mensagem muito curta ou longa (até 240).',
        auth_required: 'Faça login para falar.',
        duplicate: 'Mensagem idêntica já enviada agora há pouco.',
      };
      toast.error(reasons[reason] ?? 'Não foi possível enviar.');
      return;
    }
    // Enfileiramento é silencioso — o badge "X na fila" no header já comunica o estado
    // sem interromper o usuário com toasts repetidos.

    // Limpa o rascunho mesmo quando enfileirado — a fila preserva o conteúdo.
    const sentText = draft;
    const repliedTo = replyTo;
    setDraft('');
    setReplyTo(null);
    // Sala Mineração: guarda o texto para o useEffect ligar à msg real
    // assim que ela aparecer em `messages` (linkagem via message_id).
    if (isMineracao) {
      // Cache do corpo por possíveis ids (vamos casar pelo último mine não premiado)
      // Como ainda não conhecemos o id da nova mensagem, guardamos por timestamp aproximado.
      // O useEffect usa o body do `m` quando o cache estiver vazio.
      lastMineBodyRef.current.__pending__ = sentText;
      // Premia reply_mention imediatamente quando há replyTo
      if (repliedTo?.id && repliedTo.user_id && repliedTo.user_id !== meUserId) {
        void miningAward(
          'reply_mention',
          `reply:${repliedTo.id}:${meUserId}:${Date.now()}`,
          repliedTo.user_id,
          null,
          repliedTo.id,
        );
      }
    }
    // Registra atividade para o ciclo de XP por permanência (10 min = +10 XP).
    try { registerActiveXpMessage(sentText); } catch { /* noop */ }
  };

  const notPresent = presence !== 'present';
  // Permite digitar mesmo sem presença (vai pra fila), mas mantém cooldown.
  const sendDisabled = sending || isObserver || cooldownLeft > 0 || !draft.trim();
  const cooldownSec = Math.ceil(cooldownLeft / 1000);

  const lastUpdateLabel = fmtClockShort(presenceChangedAt);
  const connDescId = `aura-room-conn-desc-${slug}`;

  return (
    <TooltipProvider delayDuration={150}>
    <PulseOverlay
      pulse={incomingPulse}
      onClose={clearIncomingPulse}
      onRespond={respondPulse}
    />
    <PulseDiagnosticsPanel
      slug={slug}
      roomId={pulseRoomId}
      diagnostics={pulseDiagnostics}
      onClear={clearPulseDiagnostics}
    />
    <ResonanceStrip event={resonance} phrases={resonancePhrases} onDismiss={dismissResonance} />
    {specialSession && (
      <div className="mb-2 space-y-2">
        <div
          className="rounded-xl border border-amber-400/40 px-3 py-2 flex items-center gap-3"
          style={{ background: `linear-gradient(90deg, hsl(${specialSession.hue} 70% 22% / 0.85), hsl(${specialSession.hue} 60% 14% / 0.55))` }}
        >
          <span className="text-xl">{specialSession.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">Sala especial</div>
            <div className="text-sm font-semibold text-white truncate">{specialSession.label}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/55">Fecha em</div>
            <div className="text-sm font-bold text-amber-200">{remainingMin} min</div>
          </div>
        </div>
        {!isObserver && meUserId && (
          <SpecialRoomXpDropCard sessionId={specialSession.id} meUserId={meUserId} />
        )}
      </div>
    )}
    <section className="flex h-full min-h-0 flex-1 flex-col rounded-xl border border-amber-400/30 bg-black/30 shadow-[0_0_0_1px_hsla(45,90%,55%,0.08)_inset] md:mt-0">
      <header className="flex items-center justify-between gap-2 border-b border-amber-400/20 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/90">
          <Flame className="h-3 w-3" style={{ color: `hsl(${hue}, 90%, 65%)` }} />
          Pulso da sala
          {isMineracao && <MiningBalanceChip />}
          {mood && (
            <span className="ml-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] normal-case text-foreground/70">
              {mood}
            </span>
          )}
          {/* Painel de atalhos do chat */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Mostrar atalhos do chat"
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-foreground/70 normal-case hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
              >
                <Keyboard className="h-3 w-3" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="max-w-[240px] space-y-1 border-amber-400/30 bg-[#0b0420] p-2 text-[11px] normal-case text-foreground/90"
            >
              <div className="text-[10px] uppercase tracking-wider text-amber-300/90">Atalhos do chat</div>
              <div className="flex items-center justify-between gap-3">
                <span>Recolher / expandir painel</span>
                <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">[</kbd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Pular para novas mensagens</span>
                <span className="flex gap-1">
                  <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">J</kbd>
                  <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">End</kbd>
                </span>
              </div>
              <p className="pt-1 text-[10px] italic text-muted-foreground">
                Os atalhos são ignorados enquanto você digita.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-white/85">
          {!isObserver && meUserId && <RoomActiveXpBadge state={activeXpState} />}
          {typeof energy === 'number' && (
            <span className="inline-flex items-center gap-0.5">
              <Zap className="h-2.5 w-2.5" style={{ color: `hsl(${hue},90%,65%)` }} />
              {energy}
            </span>
          )}
          {typeof presentsCount === 'number' && (
            <span>· {presentsCount} aqui</span>
          )}
          <span>· {messages.length} msgs</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => setUnread(0)}
              className="ml-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-1.5 py-[1px] text-[9px] font-medium text-fuchsia-200 hover:bg-fuchsia-500/25"
              title="Marcar todas como lidas"
            >
              {unread} não lidas · marcar
            </button>
          )}
          {(() => {
            // Indicador de presença/conexão com 3 estados explícitos:
            // • desconectado (sem internet) — vermelho
            // • reconectando (rede ok mas realtime/presence em recuperação) — âmbar
            // • online (tudo ok) — verde
            // O estado é mostrado mesmo quando forcePresent=true (usuário já
            // entrou) para que ele saiba se a conexão caiu momentaneamente.
            const showQueue = !networkOnline && outbox.length > 0;
            const isReconnecting = networkOnline && (presenceRaw === 'reconnecting' || (forcePresent && presenceRaw === 'idle'));
            const conn = !networkOnline
              ? { label: 'desconectado', cls: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40', dot: 'bg-rose-400' }
              : isReconnecting
                ? { label: 'reconectando…', cls: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40', dot: 'bg-amber-400 animate-pulse' }
                : showQueue
                  ? { label: `na fila (${outbox.length})`, cls: 'bg-fuchsia-500/15 text-fuchsia-300', dot: 'bg-fuchsia-400 animate-pulse' }
                  : { label: 'conexão OK', cls: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40', dot: 'bg-emerald-400' };
            const reasonLine =
              !networkOnline
                ? 'Verifique sua conexão à internet — reconectaremos automaticamente.'
                : isReconnecting && reconnectReason
                  ? `Motivo: ${reconnectReason} — sua sala e mensagens estão preservadas.`
                  : showQueue
                    ? `${outbox.length} mensagem(ns) aguardando envio`
                    : null;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="status"
                    aria-live="polite"
                    aria-describedby={connDescId}
                    aria-label={`Status do chat: ${conn.label}. Última atualização às ${lastUpdateLabel}.${reasonLine ? ` ${reasonLine}.` : ''}`}
                    className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${conn.cls}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} aria-hidden="true" />
                    {conn.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  id={connDescId}
                  side="bottom"
                  align="end"
                  role="tooltip"
                  className="max-w-[260px] space-y-0.5 border-amber-400/30 bg-[#0b0420] p-2 text-[11px] normal-case text-foreground/90"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} aria-hidden="true" />
                    Status: {conn.label}
                  </div>
                  <div className="text-[11px] text-foreground/80">
                    <span className="text-muted-foreground">Última atualização: </span>
                    <time dateTime={new Date(presenceChangedAt).toISOString()}>{lastUpdateLabel}</time>
                  </div>
                  {reasonLine && (
                    <div className="text-[11px] text-amber-200/90">{reasonLine}</div>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })()}
        </div>
      </header>

      {isMineracao && (
        <div className="mx-2 mt-2">
          <MiningSidePanel slug={slug} />
        </div>
      )}

      <HighlightsBar items={highlights} hue={hue} />


      {showShortcutsHint && (
        <div
          role="note"
          aria-label="Dica de atalhos do chat"
          className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/[0.08] px-2 py-1 text-[10.5px] text-amber-100 shadow-[0_0_0_1px_hsla(45,90%,55%,0.06)_inset] animate-fade-in"
        >
          <Keyboard className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            Dica: <kbd className="mx-0.5 rounded border border-amber-400/30 bg-amber-500/10 px-1 font-mono text-[10px]">[</kbd>
            recolhe o painel ·{' '}
            <kbd className="mx-0.5 rounded border border-amber-400/30 bg-amber-500/10 px-1 font-mono text-[10px]">J</kbd>
            pula para as novas mensagens
          </span>
          <button
            type="button"
            onClick={dismissShortcutsHint}
            className="rounded p-0.5 text-amber-200/80 hover:bg-amber-500/20 hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
            aria-label="Dispensar dica de atalhos"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          className="flex-1 min-h-[80px] overflow-y-auto overscroll-contain px-1 py-1 scrollbar-hide"
          style={{ contain: 'content' }}
        >
          {/* Carregar mais antigas (manual): aciona o mesmo loadOlder, preservando posição. */}
          {hasMore && messages.length > 0 && !loadingOlder && (
            <div className="flex items-center justify-center py-1.5">
              <button
                type="button"
                onClick={() => {
                  const el = listRef.current;
                  const prevH = el?.scrollHeight ?? 0;
                  void loadOlder().then(() => {
                    requestAnimationFrame(() => {
                      if (!el) return;
                      const newH = el.scrollHeight;
                      el.scrollTop += (newH - prevH);
                    });
                  });
                }}
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/[0.08] px-2.5 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                aria-label="Carregar mensagens anteriores"
              >
                <ChevronUp className="h-3 w-3" /> carregar mensagens anteriores
              </button>
            </div>
          )}
          {loadingOlder && (
            <div
              className="flex flex-col items-center justify-center gap-1 py-3"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2 className="h-4 w-4 animate-spin text-amber-300" aria-hidden="true" />
              <span className="text-[10px] text-amber-200/80">carregando mensagens anteriores…</span>
              <span className="text-[9px] text-muted-foreground/60">por favor, aguarde</span>
            </div>
          )}
          {!hasMore && messages.length >= 20 && (
            <div className="py-2 text-center text-[9px] uppercase tracking-wider text-muted-foreground/60">
              início do histórico desta sala
            </div>
          )}
          {loading && merged.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground">
              <Sparkles className="mr-2 h-3 w-3 animate-pulse" /> Captando vozes no escuro…
            </div>
          ) : merged.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center text-[11px] text-muted-foreground">
              <Sparkles className="h-4 w-4 text-fuchsia-400/60" />
              Silêncio total. Seja a primeira faísca.
            </div>
          ) : (
            merged.map((it) =>
              it.kind === 'msg'
                ? (
                  <MessageRowMemo
                    key={`m-${it.data.id}`}
                    m={it.data}
                    hue={hue}
                    currentUsername={currentUsername}
                    isMine={!!meUserId && it.data.user_id === meUserId}
                    pulsedHighlight={pulseHighlighted.get(it.data.user_id)?.color || null}
                    pulsedUntil={pulseHighlighted.get(it.data.user_id)?.until || null}
                    onReply={onReplyTo}
                    onLike={onLike}
                    onDislike={onDislike}
                    onEdit={editMessage}
                    /* onDelete removido: mensagens preservadas por 30d para auditoria master */
                    onToggleEmoji={isMineracao ? toggleEmojiMining : toggleEmoji}
                    onResend={resend}
                    onPulse={(targetId, msgId, pulseType) => {
                      const r = sendPulse(targetId, { messageId: msgId, pulseType });
                      if (isMineracao && targetId && targetId !== meUserId) {
                        void miningAward(
                          'receive_pulse',
                          `pulse:${msgId}:${meUserId}`,
                          targetId,
                          null,
                          msgId,
                        );
                      }
                      return r;
                    }}
                    onGift={(msg) => setGiftTarget(msg)}
                    awardedXp={isMineracao ? messageXpMap[it.data.id] : undefined}
                  />
                )
                : <SocialEventRow key={`e-${it.data.id}`} ev={it.data} />
            )
          )}
        </div>
        {(!atBottom || unread > 0) && (
          <button
            type="button"
            onClick={scrollToBottom}
            className={cn(
              'absolute bottom-2 left-1/2 z-10 -translate-x-1/2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg transition-colors',
              unread > 0
                ? 'bg-fuchsia-500 text-white shadow-fuchsia-500/40 hover:bg-fuchsia-600'
                : 'bg-white/10 text-foreground/90 backdrop-blur shadow-black/30 hover:bg-white/20'
            )}
            aria-label={unread > 0
              ? `${unread} mensagens não lidas — pular para as novas`
              : 'Voltar para o fim do chat'}
          >
            <ArrowDown className="h-3 w-3" />
            {unread > 0
              ? <>pular para as novas · {unread}</>
              : <>voltar para o fim</>}
          </button>
        )}
        {/* Botao flutuante "ir ao topo" — aparece quando rolou bastante para baixo */}
        {/* aria-live anuncia ao leitor de tela quando o botao aparece/desaparece */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {showTopButton ? 'Botao voltar ao topo do chat esta visivel' : ''}
        </div>
        {showTopButton && (
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Voltar ao topo do chat. Voce rolou para baixo e pode retornar as mensagens mais antigas no topo."
            title="Voltar ao topo do chat (mensagens mais antigas)"
            className="absolute right-2 bottom-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-foreground/90 backdrop-blur shadow-lg shadow-black/30 hover:bg-white/20 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Topo do chat</span>
          </button>
        )}
      </div>

      {/* Banner de retry para envios otimistas que falharam — permite reenviar todos */}
      {(() => {
        const failed = messages.filter((m) => m.failed);
        if (failed.length === 0) return null;
        return (
          <div
            role="alert"
            className="flex items-center gap-2 border-t border-rose-400/30 bg-rose-500/[0.08] px-3 py-1.5 text-[11px] text-rose-100 animate-fade-in"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-300" />
            <span className="min-w-0 flex-1">
              {failed.length === 1
                ? '1 mensagem falhou ao enviar.'
                : `${failed.length} mensagens falharam ao enviar.`}
            </span>
            <button
              type="button"
              onClick={() => failed.forEach((m) => resend(m.id))}
              className="inline-flex items-center gap-1 rounded-full border border-rose-300/40 bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-50 hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
              aria-label="Reenviar todas as mensagens que falharam"
            >
              <RefreshCw className="h-3 w-3" /> reenviar {failed.length > 1 ? 'todas' : ''}
            </button>
          </div>
        );
      })()}

      {/* Outbox: status por mensagem enquanto presença reconecta */}
      {!networkOnline && outbox.length > 0 && (
        <ul className="border-t border-white/5 bg-fuchsia-500/[0.04] px-2 py-1 space-y-0.5 max-h-24 overflow-y-auto scrollbar-hide">
          {outbox.map((it) => {
            const status =
              it.attempts === 0
                ? { label: 'pendente', cls: 'text-fuchsia-300', dot: 'bg-fuchsia-400 animate-pulse' }
                : it.attempts < 4
                  ? { label: `reenviando (${it.attempts})`, cls: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' }
                  : { label: `falhando (${it.attempts})`, cls: 'text-rose-300', dot: 'bg-rose-400' };
            return (
              <li
                key={it.id}
                className="flex items-center gap-2 text-[10.5px] text-foreground/80 px-1"
                title={`${status.label} — ${it.body}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${status.dot}`} />
                <span className="truncate flex-1">{it.body}</span>
                <span className={`text-[9px] uppercase tracking-wider ${status.cls}`}>
                  {status.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Indicador de digitação (mockado a partir dos destaques presentes) */}
      {typingUser && !isObserver && (
        <div
          className="flex items-center gap-1.5 border-t border-white/5 px-3 py-1 text-[10.5px] italic text-foreground/70"
          aria-live="polite"
        >
          <span className="inline-flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-fuchsia-400 animate-bounce [animation-delay:-0.2s]" />
            <span className="h-1 w-1 rounded-full bg-fuchsia-400 animate-bounce [animation-delay:-0.1s]" />
            <span className="h-1 w-1 rounded-full bg-fuchsia-400 animate-bounce" />
          </span>
          <span><b className="not-italic text-fuchsia-300">{typingUser}</b> está digitando…</span>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div
          className="flex items-center gap-2 border-t border-white/5 bg-emerald-500/[0.08] px-3 py-1 text-[10.5px] text-emerald-200"
        >
          <CornerUpLeft className="h-3 w-3 text-emerald-300" />
          <span className="truncate text-emerald-200">
            respondendo <b className="text-emerald-300">@{replyTo.username || replyTo.name?.split(' ')[0] || '…'}</b>
            {replyTo.body ? <span className="text-emerald-200/80">: {replyTo.body.slice(0, 80)}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="ml-auto rounded p-0.5 text-emerald-200/70 hover:bg-white/10 hover:text-emerald-100"
            aria-label="Cancelar resposta"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Composer — sempre visível: shrink-0 + safe-area + offset dinâmico do teclado virtual */}
      <div
        ref={composerRef}
        className="shrink-0 sticky bottom-0 z-20 flex items-center gap-1.5 border-t border-white/10 bg-[#0b0420]/98 backdrop-blur-md p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] will-change-transform"
        style={{
          transform: keyboardOffset > 0 ? `translate3d(0, -${keyboardOffset}px, 0)` : undefined,
          transition: 'transform 140ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {isObserver ? (
          onRequestEnter ? (
            <div className="flex w-full flex-col gap-1">
              <button
                type="button"
                onClick={onRequestEnter}
                disabled={enterLoading}
                className={`flex w-full items-center justify-center gap-2 rounded-md font-semibold px-3 py-2 text-xs text-white shadow-[0_0_16px_-4px_hsl(150,80%,50%)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${
                  enterBlocked
                    ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_16px_-4px_hsl(0,80%,50%)]'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
                aria-label="Entrar na sala"
                aria-busy={enterLoading}
              >
                {enterLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando acesso…</>
                ) : enterBlocked ? (
                  <><Lock className="h-3.5 w-3.5" /> Acesso bloqueado — tentar novamente</>
                ) : (
                  <><Lock className="h-3.5 w-3.5" /> Entrar na sala</>
                )}
              </button>
              {enterBlocked && enterBlockedReasons.length > 0 && (
                <p className="px-1 text-center text-[10px] text-red-200/90" aria-live="polite">
                  {enterBlockedReasons.join(' · ')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-1.5 text-[10.5px] text-amber-300/80">
              <Lock className="h-3 w-3" />
              {observerReason
                ? 'Modo observador — você só pode ouvir.'
                : 'Suba seus requisitos para entrar no fluxo.'}
            </div>
          )
        ) : (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Inserir emoji"
                  title="Emojis"
                  className="h-8 w-8 shrink-0 rounded-full p-0 text-foreground/70 hover:text-foreground"
                  disabled={cooldownLeft > 0}
                >
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-64 border-white/10 bg-[#0b0420]/98 p-2 backdrop-blur-md"
              >
                <div className="grid grid-cols-8 gap-1">
                  {COMPOSER_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setDraft((prev) => (prev + emoji).slice(0, 240));
                        setTimeout(() => inputRef.current?.focus(), 30);
                      }}
                      className="h-8 w-8 rounded text-lg leading-none transition-colors hover:bg-white/10 active:scale-90"
                      aria-label={`Emoji ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <input
              ref={(el) => {
                inputRef.current = el;
                composerInputRef.current = el;
              }}
              type="text"
              inputMode="text"
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 240))}
              onFocus={() => {
                // Aguarda teclado subir e revalida posição do composer.
                setTimeout(() => {
                  validateComposer();
                  inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }, 280);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                if (e.key === 'Escape') setReplyTo(null);
              }}
              maxLength={240}
              placeholder={
                cooldownLeft > 0
                  ? `Aguarde ${cooldownSec}s…`
                  : notPresent
                    ? 'Reconectando — sua mensagem entra na fila e será enviada ao reconectar.'
                    : (replyTo ? `Responder @${replyTo.username || ''}…` : placeholder)
              }
              aria-label="Falar com a sala"
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-green-400 placeholder:text-green-400/60 focus:border-green-400/40 focus:outline-none disabled:opacity-60 md:py-1.5 md:text-[12px]"
              disabled={cooldownLeft > 0}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sendDisabled}
              aria-label="Enviar sussurro"
              className="h-9 w-9 shrink-0 rounded-full p-0 border border-white/10 shadow-md"
              style={{
                background: `linear-gradient(135deg, hsl(${hue},90%,55%), hsl(${(hue+30)%360},85%,45%))`,
                color: '#fff',
              }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Modal de presente XP — travado no autor da mensagem clicada.
          Mesma UX do modal já usado em AuraRoomLive (presetReceivers da sala). */}
      <AuraXpGiftModal
        open={!!giftTarget}
        onOpenChange={(v) => { if (!v) setGiftTarget(null); }}
        title="Enviar presente de XP"
        contextLabel="diretamente para este usuário"
        lockedReceiver={giftTarget ? {
          id: giftTarget.user_id,
          user_id: giftTarget.user_id,
          username: giftTarget.username ?? null,
          name: giftTarget.name ?? null,
          avatar_url: giftTarget.avatar_url ?? null,
        } : null}
        onSent={async ({ receiver, amount }) => {
          try {
            const handle = receiver.username ? `@${receiver.username}` : (receiver.name ?? 'alguém');
            const body = `🎁 Presente de Aura · +${amount} XP enviados para ${handle}`;
            await (supabase as any).rpc('aura_room_post_message', {
              p_slug: slug,
              p_body: body.slice(0, 240),
              p_reply_to: null,
              p_mentions: receiver.user_id ? [receiver.user_id] : [],
            });
          } catch {}
        }}
      />
    </section>
    </TooltipProvider>
  );
}

export const AuraRoomChat = memo(AuraRoomChatImpl);
