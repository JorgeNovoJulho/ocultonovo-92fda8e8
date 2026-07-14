import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { subscribeTable } from '@/lib/realtimeBus';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, User, MessageCircle, Sparkles } from 'lucide-react';
import {
  NEW_ACCOUNT_RARE_LOCK_DAYS,
  RARE_XP_THRESHOLD,
  accountAgeDaysFromCreatedAt,
} from '@/hooks/auraEntryDayGuard';

interface RareUnlock {
  id: string;
  user_id: string;
  profile_id: string | null;
  achievement_id: string;
  achievement_title: string | null;
  xp_awarded: number;
  created_at: string;
  // hidratado
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  aura_xp?: number | null;
  aura_level?: number | null;
  profile_created_at?: string | null;
}

const isRareUnlockStillValid = (row: RareUnlock): boolean => {
  const xpAwarded = Number(row.xp_awarded ?? 0);
  const ageKnown = Boolean(row.profile_created_at);
  const accountAgeDays = ageKnown ? accountAgeDaysFromCreatedAt(row.profile_created_at) : 0;
  const isEntryDay = !ageKnown || accountAgeDays < NEW_ACCOUNT_RARE_LOCK_DAYS;

  // Fail-closed: broadcast raro sem created_at confiável ou no dia da entrada não aparece.
  if (xpAwarded >= RARE_XP_THRESHOLD && isEntryDay) return false;
  if (row.achievement_id === 'xp_10000') {
    return !isEntryDay && Number(row.aura_xp ?? 0) >= RARE_XP_THRESHOLD;
  }
  if (row.achievement_id === 'lvl_50') {
    return !isEntryDay && Number(row.aura_level ?? 1) >= 50;
  }
  if (row.achievement_id === 'streak_30') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  if (row.achievement_id === 'gifts_10') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  if (row.achievement_id === 'match_50') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  if (row.achievement_id === 'play_views_1k') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  if (row.achievement_id === 'play_movie_15') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  if (row.achievement_id === 'play_listen_streak_10') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  if (row.achievement_id === 'rank_top10') return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
  return !isEntryDay && xpAwarded >= RARE_XP_THRESHOLD;
};

const SEEN_KEY = (uid: string) => `aura.rare-unlocks.seen.${uid}`;

const loadSeen = (uid: string): Set<string> => {
  try {
    const raw = localStorage.getItem(SEEN_KEY(uid));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
};

const saveSeen = (uid: string, set: Set<string>) => {
  try { localStorage.setItem(SEEN_KEY(uid), JSON.stringify([...set].slice(-200))); } catch {}
};

const hydrate = async (row: RareUnlock): Promise<RareUnlock> => {
  try {
    const profileFilters = [`user_id.eq.${row.user_id}`, `id.eq.${row.user_id}`];
    if (row.profile_id) profileFilters.push(`id.eq.${row.profile_id}`);
    const { data } = await (supabase as any)
      .from('profiles')
      .select('username,display_name,avatar_url,user_id,id,created_at,aura_xp,aura_level')
      .or(profileFilters.join(','))
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        ...row,
        username: data.username ?? null,
        display_name: data.display_name ?? null,
        avatar_url: data.avatar_url ?? null,
        aura_xp: data.aura_xp ?? null,
        aura_level: data.aura_level ?? null,
        profile_created_at: data.created_at ?? null,
      };
    }
  } catch {}
  return row;
};

export function RareAchievementBroadcastMount() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<RareUnlock[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const [open, setOpen] = useState(false);

  const current = queue[0] ?? null;

  const dismiss = useCallback(() => {
    if (current && user?.id) {
      const seen = seenRef.current ?? new Set();
      seen.add(current.id);
      seenRef.current = seen;
      saveSeen(user.id, seen);
    }
    setQueue((q) => q.slice(1));
    setOpen(false);
    setTimeout(() => setQueue((q) => { if (q.length) setOpen(true); return q; }), 250);
  }, [current, user?.id]);

  // Carrega o set de "já vistos" do localStorage no login.
  // IMPORTANTE: NÃO buscamos backlog. O modal só aparece para conquistas
  // que acontecem AO VIVO (via realtime INSERT) enquanto o usuário está
  // online. Conquistas antigas nunca devem ressurgir em logins futuros.
  useEffect(() => {
    if (!user?.id) return;
    seenRef.current = loadSeen(user.id);
  }, [user?.id]);

  // Realtime — janela máxima de 60s desde o created_at para evitar replay
  // de eventos antigos quando o socket reconecta.
  const REALTIME_FRESH_MS = 60_000;
  useEffect(() => {
    if (!user?.id) return;
    const handler = (payload: any) => {
      const row = payload?.new as RareUnlock | undefined;
      if (!row || row.user_id === user.id) return;
      const seen = seenRef.current ?? new Set();
      if (seen.has(row.id)) return;
      const createdAtMs = new Date(row.created_at).getTime();
      if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > REALTIME_FRESH_MS) {
        // Marca como visto para nunca reaparecer, sem exibir.
        seen.add(row.id);
        seenRef.current = seen;
        saveSeen(user.id, seen);
        return;
      }
      (async () => {
        const hydrated = await hydrate(row);
        if (!isRareUnlockStillValid(hydrated)) return;
        setQueue((q) => q.some((item) => item.id === hydrated.id) ? q : [...q, hydrated]);
        setOpen(true);
      })();
    };
    const unsub = subscribeTable('oculto_aura_rare_unlocks', handler, { events: ['INSERT'] });
    return () => unsub();
  }, [user?.id]);

  if (!current) return null;

  // Privacidade: jamais expor display_name/nome real. Sempre @username.
  const name = current.username ? `@${current.username}` : 'Alguém';
  const handle = current.username ? `@${current.username}` : '';
  const title = current.achievement_title || 'Conquista Rara';

  const goProfile = () => {
    const target = current.username ? `/@${current.username}` : `/profile/${current.user_id}`;
    dismiss();
    navigate(target);
  };
  const goMessage = () => {
    dismiss();
    navigate(`/chat?to=${current.user_id}`);
  };
  const goBoard = () => {
    dismiss();
    navigate('/aura-match#aura-anchor-achievements');
    setTimeout(() => {
      const el = document.getElementById('aura-anchor-achievements');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-950/90 via-background to-amber-950/40 shadow-[0_0_40px_-10px_hsl(300_85%_60%/0.6)]">
        <DialogHeader>
          <div className="flex items-center justify-center gap-3 mb-2">
            {current.avatar_url ? (
              <img
                src={current.avatar_url}
                alt={name}
                className="h-16 w-16 rounded-full object-cover border-2 border-fuchsia-400/70 shadow-[0_0_18px_-4px_hsl(300_85%_60%/0.7)]"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted/40 border-2 border-fuchsia-400/40 flex items-center justify-center">
                <User className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-fuchsia-500 to-amber-400 flex items-center justify-center shadow-[0_0_24px_-4px_hsl(300_85%_60%/0.8)] animate-pulse">
              <Trophy className="h-8 w-8 text-white" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg">
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white mr-2 align-middle">
              ★ Rara
            </span>
            Conquista desbloqueada!
          </DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-bold text-foreground">{name}</span>
            {handle && <span className="text-muted-foreground"> ({handle})</span>}
            <br />
            acaba de conquistar <span className="font-bold text-amber-300">{title}</span>
            <span className="inline-flex items-center gap-1 ml-1 text-amber-300 font-bold">
              <Sparkles className="h-3 w-3" /> +{current.xp_awarded.toLocaleString('pt-BR')} XP
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 mt-2">
          <Button onClick={goProfile} variant="secondary" className="w-full">
            <User className="h-4 w-4 mr-2" /> Ver perfil
          </Button>
          <Button onClick={goMessage} variant="outline" className="w-full">
            <MessageCircle className="h-4 w-4 mr-2" /> Enviar mensagem
          </Button>
          <Button onClick={goBoard} className="w-full bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white hover:opacity-90">
            <Trophy className="h-4 w-4 mr-2" /> Ver quadro de conquistas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
