import { useEffect, useMemo, useState } from 'react';
import { useAuraSignalUnlock, type AuraSignalKind } from '@/hooks/useAuraSignalUnlock';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Eye, EyeOff, Lock, Loader2, Zap, Clock, RefreshCw, Sparkles, Users, History, MapPin, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';

const HIDDEN_KEY = (kind: string) => `aura-signal:hidden:v1:${kind}`;

function readHidden(kind: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_KEY(kind));
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function writeHidden(kind: string, ids: Set<string>) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(HIDDEN_KEY(kind), JSON.stringify(Array.from(ids))); } catch {}
}

interface Props {
  kind: AuraSignalKind;
  title: string;
  emptyHint?: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`;
  return `${Math.floor(diff / 86400)} d atrás`;
}

function fmtCountdown(s: number): string {
  if (s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Resumo bloqueável + modal com timer que só corre enquanto aberto. */
export function AuraSignalHistory({ kind, title, emptyHint }: Props) {
  const [open, setOpen] = useState(false);
  const {
    items, loading, busy, secondsLeft, unlock, unlocked,
    xpBalance, revealCost, budgetSeconds, actorsCount, historyDays, refresh,
  } = useAuraSignalUnlock(kind, 25, open);
  const navigate = useNavigate();

  // IDs ocultados localmente ("Limpar")
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHidden(kind));
  const clearAll = () => {
    setHiddenIds((prev) => {
      const next = new Set(prev); items.forEach((i) => next.add(i.id)); writeHidden(kind, next); return next;
    });
  };

  // Enriquecer com gender/city/avatar — sempre que houver actor_user_id (não depende de unlock).
  const [profiles, setProfiles] = useState<Record<string, { gender?: string | null; profile_type?: string | null; city?: string | null; username?: string | null; avatar_url?: string | null }>>({});
  const visibleItems = useMemo(() => items.filter((i) => !hiddenIds.has(i.id)), [items, hiddenIds]);
  const userIds = useMemo(() => Array.from(new Set(visibleItems.map((i) => i.actor_user_id).filter(Boolean))) as string[], [visibleItems]);
  useEffect(() => {
    if (userIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('user_id, username, gender, profile_type, city, avatar_url')
        .in('user_id', userIds);
      if (cancelled || !Array.isArray(data)) return;
      const map: typeof profiles = {};
      for (const p of data as any[]) {
        if (p?.user_id) map[p.user_id] = { gender: p.gender, profile_type: p.profile_type, city: p.city, username: p.username, avatar_url: p.avatar_url };
      }
      setProfiles((prev) => ({ ...prev, ...map }));
    })();
    return () => { cancelled = true; };
  }, [userIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const enough = xpBalance >= revealCost;
  const progressPct = unlocked ? Math.max(0, Math.min(100, (secondsLeft / Math.max(budgetSeconds, 1)) * 100)) : 0;

  const displayItems = useMemo(() => {
    const sortKey = (it: typeof visibleItems[number]) => {
      const extra = (it.actor_user_id && profiles[it.actor_user_id]) || null;
      // PRIVACIDADE: ordena apenas por @username (jamais pelo nome real).
      const uname = it.actor_username || extra?.username || 'zzz';
      return uname.toLowerCase();
    };
    return visibleItems.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'pt-BR'));
  }, [visibleItems, profiles]);

  return (
    <>
      <section className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2.5">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {unlocked ? <Eye className="h-3.5 w-3.5 text-emerald-400" /> : <EyeOff className="h-3.5 w-3.5 text-amber-400" />}
            {title}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="gap-1 border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100 text-[10px]">
              <Users className="h-2.5 w-2.5" />
              {actorsCount} {actorsCount === 1 ? 'pessoa' : 'pessoas'}
            </Badge>
            <Badge variant="outline" className="gap-1 border-amber-400/40 bg-amber-500/10 text-amber-200 text-[10px]">
              <Sparkles className="h-2.5 w-2.5" />
              {xpBalance} XP
            </Badge>
            <Button size="icon" variant="ghost" onClick={refresh} disabled={loading}
              className="h-6 w-6" title="Atualizar agora" aria-label="Atualizar">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </header>

        {!unlocked && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/[0.07] p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="h-4 w-4 text-fuchsia-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-fuchsia-100">Histórico bloqueado</p>
                <p className="text-[10px] text-muted-foreground">
                  Pague <strong className="text-amber-200">{revealCost} XP</strong> · {Math.round(budgetSeconds/60)} min de leitura
                  · válido {historyDays}d · saldo {xpBalance} XP
                </p>
              </div>
            </div>
            <Button size="sm" onClick={unlock} disabled={busy || !enough}
              className="shrink-0 gap-1 bg-gradient-to-r from-fuchsia-500 to-amber-500 text-white">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {enough ? `Revelar (${revealCost} XP)` : `Faltam ${Math.max(0, revealCost - xpBalance)} XP`}
            </Button>
          </div>
        )}

        {unlocked && (
          <div className="space-y-2 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.05] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="h-4 w-4 text-emerald-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-100">Histórico aberto</p>
                  <p className="text-[10px] text-muted-foreground">
                    Restam <strong className="text-emerald-200">{fmtCountdown(secondsLeft)}</strong> de leitura
                    {' · '}{actorsCount} {actorsCount === 1 ? 'pessoa interagiu' : 'pessoas interagiram'} em {historyDays}d
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setOpen(true)} className="shrink-0 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white">
                <History className="h-3.5 w-3.5" /> Abrir
              </Button>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-background/60">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-fuchsia-400 to-amber-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Preview inline — sempre mostra os atores (foto/username/gênero) com blur quando bloqueado */}
        {displayItems.length > 0 ? (
          <ul className="space-y-1.5">
            {displayItems.slice(0, 3).map((it) => {
              const locked = it.locked || !unlocked;
              const extra = (it.actor_user_id && profiles[it.actor_user_id]) || null;
              const username = it.actor_username || extra?.username || null;
              // PRIVACIDADE: nunca exibir nome real. Mostrar apenas @username.
              const handleLabel = username ? `@${username}` : 'Usuário';
              const avatarSrc = it.actor_avatar || extra?.avatar_url || undefined;
              const targetHref = username ? `/u/${username}` : (it.actor_user_id ? `/creator/${it.actor_user_id}` : null);
              const handleOpenProfile = () => { if (!locked && targetHref) navigate(targetHref); };
              return (
                <li key={`inline-${it.id}`}
                  className={`flex items-center gap-2 rounded-lg p-1.5 ${locked ? 'bg-background/30' : 'bg-background/55 hover:bg-background/80 cursor-pointer'}`}
                  onClick={handleOpenProfile}
                  role={locked ? undefined : 'button'}
                  tabIndex={locked ? -1 : 0}
                >
                  <Avatar className={`h-9 w-9 shrink-0 ${locked ? 'blur-md grayscale opacity-70' : ''}`}>
                    <AvatarImage src={avatarSrc} alt={handleLabel} loading="lazy" />
                    <AvatarFallback className="text-[10px]">{(username || 'U').slice(0,1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">
                      {locked ? <span className="italic text-muted-foreground">Identidade oculta</span> : handleLabel}
                    </p>
                    {!locked && (extra?.gender || extra?.profile_type || extra?.city) && (
                      <p className="text-[10px] text-fuchsia-200/90 truncate flex items-center gap-1">
                        {(extra?.gender || extra?.profile_type) && (
                          <span className="capitalize">{extra?.gender || extra?.profile_type}</span>
                        )}
                        {extra?.city && (<><span className="text-muted-foreground">·</span><MapPin className="h-2.5 w-2.5" /><span className="truncate">{extra.city}</span></>)}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(it.happened_at)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground py-0.5">
            {actorsCount === 0
              ? (emptyHint || 'Sem registros recentes — quando alguém interagir, aparecerá aqui.')
              : `${actorsCount} ${actorsCount === 1 ? 'pessoa' : 'pessoas'} nas últimas ${historyDays * 24}h.`}
          </p>
        )}

        {displayItems.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            {displayItems.length > 3 && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setOpen(true)}>
                <History className="h-3 w-3" /> Ver todos ({displayItems.length})
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-destructive ml-auto" onClick={clearAll}>
              <Trash2 className="h-3 w-3" /> Limpar
            </Button>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-fuchsia-400" /> {title}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-3 text-xs">
              {unlocked ? (
                <>
                  <span className="flex items-center gap-1 text-emerald-300">
                    <Clock className="h-3 w-3" /> {fmtCountdown(secondsLeft)} restantes
                  </span>
                  <span className="flex items-center gap-1 text-fuchsia-300">
                    <Users className="h-3 w-3" /> {actorsCount} {actorsCount === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </>
              ) : (
                <span className="text-amber-300">Bloqueado · pague {revealCost} XP para abrir</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {unlocked && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-background/60">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-fuchsia-400 to-amber-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {loading && displayItems.length === 0 ? (
            <ul className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg p-2 bg-background/40 animate-pulse">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted/60" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-2/5 rounded bg-muted/60" />
                    <div className="h-2.5 w-3/5 rounded bg-muted/40" />
                  </div>
                </li>
              ))}
            </ul>
          ) : displayItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {emptyHint || 'Nenhum registro nas últimas 72h.'}
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto scrollbar-hide">
              {displayItems.map((it) => {
                const locked = it.locked || !unlocked;
                const extra = (it.actor_user_id && profiles[it.actor_user_id]) || null;
                const username = it.actor_username || extra?.username || null;
                // PRIVACIDADE: somente @username, nunca o nome real.
                const handleLabel = username ? `@${username}` : 'Usuário misterioso';
                const avatarSrc = it.actor_avatar || extra?.avatar_url || undefined;
                const targetHref = username
                  ? `/u/${username}`
                  : (it.actor_user_id ? `/creator/${it.actor_user_id}` : null);
                const handleOpen = () => {
                  if (locked || !targetHref) return;
                  setOpen(false);
                  navigate(targetHref);
                };
                return (
                  <li key={it.id}
                    className={`flex items-center gap-2 rounded-lg p-2 transition-all duration-500 ${
                      locked ? 'bg-background/30' : 'bg-background/55 hover:bg-background/80 cursor-pointer'
                    }`}
                    onClick={handleOpen}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); handleOpen(); } }}
                    role={locked ? undefined : 'button'}
                    tabIndex={locked ? -1 : 0}
                    aria-label={locked ? 'Identidade oculta' : `Abrir perfil de ${handleLabel}`}
                  >
                    <Avatar className={`h-10 w-10 shrink-0 transition-all duration-700 ${
                      locked ? 'blur-md grayscale opacity-70' : 'blur-0 grayscale-0 opacity-100'
                    }`}>
                      <AvatarImage src={avatarSrc} alt={handleLabel} loading="lazy" />
                      <AvatarFallback className="text-[10px]">
                        {(username || 'U').slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {locked ? <span className="italic text-muted-foreground">Identidade oculta</span> : handleLabel}
                        </p>
                      {!locked && (extra?.gender || extra?.profile_type || extra?.city) && (
                        <p className="text-[11px] text-fuchsia-200/90 truncate flex items-center gap-1">
                          {(extra?.gender || extra?.profile_type) && (
                            <span className="capitalize">{extra?.gender || extra?.profile_type}</span>
                          )}
                          {extra?.city && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <MapPin className="h-2.5 w-2.5" />
                              <span className="truncate">{extra.city}</span>
                            </>
                          )}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground truncate">
                        {it.summary} · {timeAgo(it.happened_at)}
                      </p>
                    </div>
                    {locked && <Lock className="h-3 w-3 text-fuchsia-300 shrink-0" />}
                  </li>
                );
              })}
            </ul>
          )}

          {!unlocked && (
            <Button onClick={unlock} disabled={busy || !enough}
              className="w-full gap-1 bg-gradient-to-r from-fuchsia-500 to-amber-500 text-white">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {enough ? `Revelar (${revealCost} XP)` : `Faltam ${Math.max(0, revealCost - xpBalance)} XP`}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
