import { memo, useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Send, Loader2, Search, Users, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuraRoomInvites } from '@/hooks/useAuraRoomInvites';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

interface PresentMini {
  user_id: string;
  name: string | null;
  username?: string | null;
  avatar_url: string | null;
  plan_type: string | null;
}

interface Props {
  slug: string;
  roomName: string;
  hue: number;
  excludeUserIds?: string[];
  suggestions: Array<{ user_id?: string | null; id?: string; name?: string | null; username?: string | null; avatar_url?: string | null; plan_type?: string | null }>;
}

type Tab = 'search' | 'followers';

function AuraRoomInviteButtonImpl({ slug, roomName, hue, excludeUserIds = [], suggestions }: Props) {
  const { send } = useAuraRoomInvites();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PresentMini[]>([]);
  const [followers, setFollowers] = useState<PresentMini[]>([]);
  const [followersFilter, setFollowersFilter] = useState('');
  const [followersCursor, setFollowersCursor] = useState<number>(0);
  const [followersDone, setFollowersDone] = useState(false);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PresentMini | null>(null);
  const [busy, setBusy] = useState(false);

  const exclude = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);

  // Busca por username/nome (debounced)
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await (supabase as any).rpc('aura_room_invite_search_targets', { p_query: query.trim() });
      if (!cancel) {
        const list = ((data as PresentMini[]) ?? []).filter((u) => !exclude.has(u.user_id));
        setResults(list);
        setSearching(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [query, open, exclude]);

  // Carrega seguidores (paginado por cursor) ao abrir aba "seguidores"
  const PAGE = 30;
  const loadFollowersPage = async (reset = false) => {
    if (followersLoading) return;
    setFollowersLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setFollowersLoading(false); return; }
    const from = reset ? 0 : followersCursor;
    const { data: rows } = await supabase
      .from('followers')
      .select('follower_id, created_at')
      .eq('following_id', uid)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    const ids = (rows || []).map((r: any) => r.follower_id).filter(Boolean);
    if (!ids.length) {
      setFollowersDone(true);
      if (reset) setFollowers([]);
      setFollowersLoading(false);
      return;
    }
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, name, username, avatar_url, plan_type')
      .in('user_id', ids);
    const list = ((profs as PresentMini[]) ?? []).filter((u) => !exclude.has(u.user_id));
    setFollowers((prev) => reset ? list : [...prev, ...list]);
    setFollowersCursor(from + PAGE);
    if (rows!.length < PAGE) setFollowersDone(true);
    setFollowersLoading(false);
  };

  useEffect(() => {
    if (!open || tab !== 'followers' || followers.length > 0) return;
    loadFollowersPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  // Filtro local (instant) sobre seguidores carregados; fallback: aciona busca global
  const filteredFollowers = useMemo(() => {
    const q = followersFilter.trim().toLowerCase();
    if (!q) return followers;
    return followers.filter((u) =>
      (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)
    );
  }, [followers, followersFilter]);

  const handleSend = async () => {
    if (!selected) {
      toast.error('Selecione um usuário primeiro');
      return;
    }
    setBusy(true);
    const targetId = selected.user_id;

    // 0) Otimista: oculta a bolha imediatamente no AuraMatch
    try {
      window.dispatchEvent(new CustomEvent('aura-match:refresh', {
        detail: { source: 'invite-pending', to: targetId },
      }));
    } catch {}

    const rollback = (reasonText: string) => {
      try {
        window.dispatchEvent(new CustomEvent('aura-match:refresh', {
          detail: { source: 'invite-failed', to: targetId, reason: reasonText },
        }));
      } catch {}
    };

    // 1) Verifica requisitos do convidado
    const { data: check } = await (supabase as any).rpc('aura_room_invite_target_check', {
      p_slug: slug, p_to_user: targetId,
    });
    const missing: string[] = check?.missing ?? [];

    if (!check?.ok && missing.length > 0) {
      // Notifica o convidado para subir requisitos no Aura Match
      await (supabase as any).rpc('aura_room_invite_nudge_to_aura', {
        p_to_user: targetId,
        p_room: roomName,
        p_missing: missing,
      });
      rollback('requirements_missing');
      setBusy(false);
      toast.error(
        `${selected.name || 'Usuário'} ainda não cumpre os requisitos da sala. Enviamos um aviso para ele subir no Aura Match.`,
        { duration: 5000 }
      );
      return;
    }

    // 2) Envia convite
    const r = await send(slug, roomName, targetId, reason.trim().slice(0, 140));
    setBusy(false);

    if (!r?.ok) {
      const map: Record<string, string> = {
        rate_limited: 'Aguarde alguns segundos para reenviar.',
        invalid_target: 'Destinatário inválido.',
        auth_required: 'Faça login para convidar.',
      };
      const reasonText = map[r?.reason ?? ''] ?? 'Não foi possível convidar';
      rollback(r?.reason || 'unknown');
      toast.error(`${reasonText} A bolha foi restaurada no Aura Match.`);
      return;
    }
    toast.success(`Convite enviado para ${selected.name || 'a pessoa'}`);
    try { window.dispatchEvent(new CustomEvent('aura-match:refresh', { detail: { source: 'invite-sent', to: targetId } })); } catch {}
    setSelected(null);
    setReason('');
    setOpen(false);
  };

  const list = tab === 'search' ? results : filteredFollowers;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="flex h-auto flex-col gap-0.5 rounded-lg border-fuchsia-400/40 bg-fuchsia-500/10 py-2 text-[10px] text-fuchsia-200 hover:bg-fuchsia-500/20"
        >
          <UserPlus className="h-4 w-4" />
          Convidar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm border-white/10 bg-[#0b0420]/95">
        <DialogHeader>
          <DialogTitle className="text-sm" style={{ color: `hsl(${hue}, 80%, 80%)` }}>
            Convidar para {roomName}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-md bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setTab('search')}
            className={`flex items-center justify-center gap-1 rounded px-2 py-1 text-[11px] ${tab === 'search' ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-muted-foreground'}`}
          >
            <Search className="h-3 w-3" /> Buscar
          </button>
          <button
            type="button"
            onClick={() => setTab('followers')}
            className={`flex items-center justify-center gap-1 rounded px-2 py-1 text-[11px] ${tab === 'followers' ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-muted-foreground'}`}
          >
            <Users className="h-3 w-3" /> Seguidores
          </button>
        </div>

        {/* Search input */}
        {tab === 'search' && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Username ou nome do convidado…"
              className="w-full rounded-md border border-white/10 bg-white/[0.04] pl-7 pr-2 py-2 text-[12px] placeholder:text-muted-foreground/70 focus:border-fuchsia-400/40 focus:outline-none"
            />
          </div>
        )}

        {/* Filtro local de seguidores */}
        {tab === 'followers' && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={followersFilter}
              onChange={(e) => setFollowersFilter(e.target.value)}
              placeholder="Filtrar seguidores por nome ou @username…"
              className="w-full rounded-md border border-white/10 bg-white/[0.04] pl-7 pr-2 py-2 text-[12px] placeholder:text-muted-foreground/70 focus:border-fuchsia-400/40 focus:outline-none"
            />
          </div>
        )}

        {/* Selected pill */}
        {selected && (
          <div className="flex items-center gap-2 rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 p-2">
            <Avatar className="h-7 w-7"><AvatarImage src={selected.avatar_url || undefined} /><AvatarFallback>{selected.name?.[0] || '?'}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[11px] font-medium text-fuchsia-100">{selected.name || 'Usuário'}</p>
              {selected.username && <p className="truncate text-[10px] text-muted-foreground">@{selected.username}</p>}
            </div>
            <button onClick={() => setSelected(null)} className="text-[10px] text-muted-foreground hover:text-foreground">trocar</button>
          </div>
        )}

        {/* Lista */}
        <div className="max-h-[34vh] overflow-y-auto">
          {searching ? (
            <div className="flex items-center justify-center py-6 text-[11px] text-muted-foreground"><Loader2 className="mr-2 h-3 w-3 animate-spin" />buscando…</div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              {tab === 'search' ? 'Nenhum usuário encontrado.' : 'Você ainda não tem seguidores.'}
            </p>
          ) : (
            <div className="space-y-1">
              {list.map((u) => (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => setSelected(u)}
                  className={`flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors ${selected?.user_id === u.user_id ? 'bg-fuchsia-500/15' : 'hover:bg-white/5'}`}
                >
                  <Avatar className="h-8 w-8"><AvatarImage src={u.avatar_url || undefined} loading="lazy" /><AvatarFallback className="text-[10px]">{u.name?.[0] || '?'}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[11px]">{u.name || u.username || 'Usuário'}</p>
                    {u.username && <p className="truncate text-[10px] text-muted-foreground">@{u.username}</p>}
                  </div>
                  {u.plan_type === 'vip' && <Sparkles className="h-3 w-3 text-amber-300" />}
                </button>
              ))}
              {tab === 'followers' && !followersDone && (
                <button
                  type="button"
                  onClick={() => loadFollowersPage(false)}
                  disabled={followersLoading}
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.03] py-1.5 text-[10px] text-muted-foreground hover:bg-white/5 disabled:opacity-50"
                >
                  {followersLoading ? 'Carregando…' : 'Carregar mais seguidores'}
                </button>
              )}
            </div>
          )}
        </div>

        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 140))}
          maxLength={140}
          placeholder="Motivo do convite (opcional)"
          className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] placeholder:text-muted-foreground/70 focus:border-fuchsia-400/40 focus:outline-none"
        />

        <Button
          onClick={handleSend}
          disabled={!selected || busy}
          className="w-full gap-1.5 bg-fuchsia-500 text-white hover:bg-fuchsia-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? 'Verificando requisitos…' : 'Enviar convite'}
        </Button>

        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-amber-400/70" />
          Se o convidado não cumprir os requisitos, ele recebe um aviso para evoluir no Aura Match.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export const AuraRoomInviteButton = memo(AuraRoomInviteButtonImpl);
