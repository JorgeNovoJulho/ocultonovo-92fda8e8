/**
 * useUserHistory — Linha do tempo histórica + Retrospectiva.
 *
 * Constrói EVENTOS reais a partir do que JÁ existe no banco externo. Não cria
 * nenhum sistema novo. Cada fonte falha de forma silenciosa e degrada para
 * vazio — o bloco só renderiza quando há algo a contar.
 *
 * Fontes (todas opcionais — `safe()` tolera ausência da tabela):
 *  - profiles.created_at, plan_type, aura_level (entrada, plano, nível)
 *  - posts (primeiro post)
 *  - post_likes (primeira curtida recebida)
 *  - oculto_community_members + oculto_communities (comunidades)
 *  - stories (estimativa via posts is_flash quando existir)
 *  - user_achievements (conquistas reais, se a tabela estiver populada)
 *
 * Mobile-perf: 1 query agregada, staleTime 10min, sem realtime.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { ACHIEVEMENT_CATALOG } from '@/hooks/useAuraAchievements';

export interface HistoryEvent {
  id: string;
  date: string;          // ISO
  icon: string;
  title: string;
  subtitle?: string;
}

export interface UserHistoryData {
  daysOnOculto: number;
  totals: {
    posts: number;
    stories: number;
    communities: number;
    achievements: number;
    likesReceived: number;
    interactions: number;
  };
  isVeteran: boolean;     // 90+ dias
  timeline: HistoryEvent[];
  retrospective: string[]; // frases curtas baseadas em dados reais
  isEmpty: boolean;
}

async function safe<T>(p: Promise<{ data: any; error: any; count?: number | null }>, fb: T): Promise<T> {
  try {
    const { data, error, count } = await p as any;
    if (error) return fb;
    if (count != null && !Array.isArray(fb)) return count as unknown as T;
    return (data ?? fb) as T;
  } catch {
    return fb;
  }
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export function useUserHistory() {
  const { user } = useAuth();
  return useQuery<UserHistoryData | null>({
    queryKey: ['retention', 'user-history', user?.id ?? 'anon'],
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const uid = user!.id;

      const [profile, firstPost, firstLike, postsCount, storiesCount, firstStory, communities, achievements, likesReceived, followersCount, firstFollower, giftsReceived, giftsSent, superDmsSent, auraClaims] =
        await Promise.all([
          safe<any>((supabase as any).from('profiles').select('id,user_id,created_at,plan_type,aura_level,username,display_name').or(`user_id.eq.${uid},id.eq.${uid}`).maybeSingle(), null),
          safe<any[]>((supabase as any).from('posts').select('id,created_at,content').eq('author_id', uid).order('created_at', { ascending: true }).limit(1), []),
          safe<any[]>((supabase as any).from('post_likes').select('id,created_at,post_id').in('post_id',
            (await safe<any[]>((supabase as any).from('posts').select('id').eq('author_id', uid).limit(50), [])).map((p: any) => p.id)
          ).order('created_at', { ascending: true }).limit(1), []),
          safe<number>((supabase as any).from('posts').select('id', { count: 'exact', head: true }).eq('author_id', uid), 0),
          safe<number>((supabase as any).from('posts').select('id', { count: 'exact', head: true }).eq('author_id', uid).eq('is_flash', true), 0),
          safe<any[]>((supabase as any).from('posts').select('id,created_at').eq('author_id', uid).eq('is_flash', true).order('created_at', { ascending: true }).limit(1), []),
          safe<any[]>((supabase as any).from('oculto_community_members').select('id,joined_at,community_id').eq('user_id', uid).order('joined_at', { ascending: true }).limit(50), []),
          safe<any[]>((supabase as any).from('user_achievements').select('id,earned_at,achievement_id').eq('user_id', uid).order('earned_at', { ascending: false }).limit(5), []),
          safe<number>((supabase as any).from('profile_likes').select('id', { count: 'exact', head: true }).eq('liked_id', uid), 0),
          safe<number>((supabase as any).from('followers').select('id', { count: 'exact', head: true }).eq('following_id', uid), 0),
          safe<any[]>((supabase as any).from('followers').select('id,created_at').eq('following_id', uid).order('created_at', { ascending: true }).limit(1), []),
          safe<number>((supabase as any).from('oculto_gifts_log').select('id', { count: 'exact', head: true }).eq('receiver_id', uid), 0),
          safe<number>((supabase as any).from('oculto_gifts_log').select('id', { count: 'exact', head: true }).eq('sender_id', uid), 0),
          safe<number>((supabase as any).from('super_dms').select('id', { count: 'exact', head: true }).eq('sender_id', uid), 0),
          // Claims do Aura (para Jornada: conquistas raras + coleção completa)
          safe<any[]>((supabase as any).from('oculto_aura_achievement_claims').select('achievement_id,xp_awarded,claimed_at').eq('user_id', uid).order('claimed_at', { ascending: false }).limit(200), []),
        ]);

      const createdAt = (profile as any)?.created_at ?? null;
      const planType = (profile as any)?.plan_type ?? 'free';
      const auraLevel = (profile as any)?.aura_level ?? 1;

      const daysOnOculto = createdAt
        ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
        : 0;
      const isVeteran = daysOnOculto >= 90;

      const timeline: HistoryEvent[] = [];
      if (createdAt) {
        timeline.push({
          id: 'joined',
          date: createdAt,
          icon: '🚪',
          title: 'Você entrou no Oculto',
          subtitle: fmt(createdAt),
        });
      }
      const fp = (firstPost as any[])[0];
      if (fp?.created_at) {
        timeline.push({ id: `first-post-${fp.id}`, date: fp.created_at, icon: '✍️', title: 'Sua primeira publicação', subtitle: fmt(fp.created_at) });
      }
      const fs = (firstStory as any[])[0];
      if (fs?.created_at) {
        timeline.push({ id: `first-story-${fs.id}`, date: fs.created_at, icon: '⚡', title: 'Seu primeiro story', subtitle: fmt(fs.created_at) });
      }
      const fl = (firstLike as any[])[0];
      if (fl?.created_at) {
        timeline.push({ id: `first-like-${fl.id}`, date: fl.created_at, icon: '❤️', title: 'Sua primeira curtida recebida', subtitle: fmt(fl.created_at) });
      }
      const ff = (firstFollower as any[])[0];
      if (ff?.created_at) {
        timeline.push({ id: `first-follower-${ff.id}`, date: ff.created_at, icon: '🫂', title: 'Seu primeiro seguidor', subtitle: fmt(ff.created_at) });
      }
      const firstCommunity = (communities as any[])[0];
      if (firstCommunity?.joined_at) {
        timeline.push({ id: `first-com-${firstCommunity.id}`, date: firstCommunity.joined_at, icon: '🏘️', title: 'Entrou na sua primeira comunidade', subtitle: fmt(firstCommunity.joined_at) });
      }
      // Marcos por contagem (sem data exata → exibe como conquistas atuais)
      const nowIso = new Date().toISOString();
      const pc = Number(postsCount) || 0;
      [10, 50, 100, 500].forEach((m) => {
        if (pc >= m) timeline.push({ id: `posts-${m}`, date: nowIso, icon: '📚', title: `${m} publicações no Oculto`, subtitle: 'marco alcançado' });
      });
      const lc = Number(likesReceived) || 0;
      [10, 100, 1000, 10000].forEach((m) => {
        if (lc >= m) timeline.push({ id: `likes-${m}`, date: nowIso, icon: '💖', title: `${m} curtidas recebidas`, subtitle: 'sua presença está crescendo' });
      });
      const fc = Number(followersCount) || 0;
      [10, 50, 100, 500, 1000].forEach((m) => {
        if (fc >= m) timeline.push({ id: `followers-${m}`, date: nowIso, icon: '🌟', title: `${m} seguidores`, subtitle: 'sua aura atrai pessoas' });
      });
      const sc = Number(storiesCount) || 0;
      [10, 50, 100].forEach((m) => {
        if (sc >= m) timeline.push({ id: `stories-${m}`, date: nowIso, icon: '⚡', title: `${m} stories publicados` });
      });
      const cc = (communities as any[]).length;
      if (cc >= 3) timeline.push({ id: `com-${cc}`, date: nowIso, icon: '🌐', title: `Participa de ${cc} comunidades` });
      const gr = Number(giftsReceived) || 0;
      if (gr > 0) timeline.push({ id: `gifts-r-${gr}`, date: nowIso, icon: '🎁', title: `${gr} presente${gr === 1 ? '' : 's'} recebido${gr === 1 ? '' : 's'}` });
      const gs = Number(giftsSent) || 0;
      if (gs > 0) timeline.push({ id: `gifts-s-${gs}`, date: nowIso, icon: '🤝', title: `${gs} presente${gs === 1 ? '' : 's'} enviado${gs === 1 ? '' : 's'}` });
      const sd = Number(superDmsSent) || 0;
      if (sd > 0) timeline.push({ id: `sdm-${sd}`, date: nowIso, icon: '💌', title: `${sd} Super DM enviada${sd === 1 ? '' : 's'}` });
      // Aniversários
      if (createdAt) {
        const start = new Date(createdAt).getTime();
        [30, 60, 180, 365, 730].forEach((d) => {
          if (daysOnOculto >= d) {
            const date = new Date(start + d * 86_400_000).toISOString();
            const label = d === 365 ? '1 ano no Oculto' : d === 730 ? '2 anos no Oculto' : `${d} dias no Oculto`;
            timeline.push({ id: `anniv-${d}`, date, icon: d >= 365 ? '🎂' : '📅', title: label, subtitle: fmt(date) });
          }
        });
      }
      // Marcos de Aura
      [5, 10, 15, 25, 50, 100].forEach((m) => {
        if (auraLevel >= m) timeline.push({ id: `aura-${m}`, date: nowIso, icon: '✨', title: `Aura nível ${m} alcançado` });
      });
      if (auraLevel > 1) {
        timeline.push({ id: 'aura-lvl', date: nowIso, icon: '🌠', title: `Aura atual: nível ${auraLevel}`, subtitle: 'continue evoluindo' });
      }
      if (planType === 'premium' || planType === 'vip') {
        timeline.push({ id: 'plan', date: nowIso, icon: planType === 'vip' ? '👑' : '⭐', title: planType === 'vip' ? 'Tornou-se VIP' : 'Tornou-se Premium' });
      }
      if (isVeteran) {
        timeline.push({ id: 'veteran', date: nowIso, icon: '🛡️', title: 'Entrou para os Veteranos', subtitle: `${daysOnOculto} dias no Oculto` });
      }
      for (const ach of (achievements as any[]).slice(0, 5)) {
        if (!ach?.earned_at) continue;
        timeline.push({ id: `ach-${ach.id}`, date: ach.earned_at, icon: '🏆', title: 'Nova conquista desbloqueada', subtitle: fmt(ach.earned_at) });
      }

      // ── Aura: claims de conquistas (Jornada) ───────────────────────────
      // 1) Cada Conquista RARA (xp_awarded >= 10000) vira um marco brilhante.
      // 2) Quando o usuário desbloqueia TODAS as conquistas do catálogo,
      //    adiciona o marco "Lendário do Aura — coleção completa".
      const claims = (auraClaims as any[]) || [];
      const catalogById: Record<string, { title: string }> = Object.fromEntries(
        ACHIEVEMENT_CATALOG.map((d) => [d.id, { title: d.title }])
      );
      const totalCatalog = ACHIEVEMENT_CATALOG.length;
      const claimedIds = new Set<string>();
      let latestClaimAt: string | null = null;
      for (const c of claims) {
        if (!c?.achievement_id) continue;
        claimedIds.add(c.achievement_id);
        const when = c?.claimed_at || nowIso;
        if (!latestClaimAt || when > latestClaimAt) latestClaimAt = when;
        const xp = Number(c?.xp_awarded) || 0;
        if (xp >= 10000) {
          const def = catalogById[c.achievement_id];
          const title = def?.title || c.achievement_id;
          timeline.push({
            id: `rare-${c.achievement_id}`,
            date: when,
            icon: '🌟',
            title: `Conquista RARA desbloqueada: ${title}`,
            subtitle: `+${xp.toLocaleString('pt-BR')} XP · ${fmt(when)}`,
          });
        }
      }
      if (totalCatalog > 0 && claimedIds.size >= totalCatalog) {
        timeline.push({
          id: 'aura-all-achievements',
          date: latestClaimAt || nowIso,
          icon: '👑',
          title: 'Lendário do Aura — coleção completa',
          subtitle: `Você desbloqueou todas as ${totalCatalog} conquistas do Aura`,
        });
      }

      // Ordenar por data desc (recentes primeiro), mas mantendo "Você entrou" no fim como âncora.
      timeline.sort((a, b) => +new Date(b.date) - +new Date(a.date));

      const totals = {
        posts: Number(postsCount) || 0,
        stories: Number(storiesCount) || 0,
        communities: (communities as any[]).length,
        achievements: (achievements as any[]).length,
        likesReceived: Number(likesReceived) || 0,
        interactions: 0,
      };
      totals.interactions = totals.posts + totals.stories + totals.likesReceived;

      const retrospective: string[] = [];
      if (daysOnOculto > 0) retrospective.push(`${daysOnOculto} dias no Oculto`);
      if (totals.posts > 0) retrospective.push(`${totals.posts} publicaç${totals.posts === 1 ? 'ão' : 'ões'}`);
      if (totals.stories > 0) retrospective.push(`${totals.stories} story${totals.stories === 1 ? '' : 'ies'}`);
      if (totals.communities > 0) retrospective.push(`${totals.communities} comunidade${totals.communities === 1 ? '' : 's'}`);
      if (totals.likesReceived > 0) retrospective.push(`${totals.likesReceived} curtida${totals.likesReceived === 1 ? '' : 's'} recebida${totals.likesReceived === 1 ? '' : 's'}`);
      if (totals.achievements > 0) retrospective.push(`${totals.achievements} conquista${totals.achievements === 1 ? '' : 's'}`);

      return {
        daysOnOculto,
        totals,
        isVeteran,
        timeline,
        retrospective,
        isEmpty: timeline.length === 0 && retrospective.length === 0,
      };
    },
  });
}
