/**
 * useTodayInOculto — Bloco 1 "Hoje no Oculto".
 *
 * Agrega sinais reais (comunidades novas, eventos próximos, novos no Play,
 * radar ativo, criadores em destaque) em UMA única consulta paralela e
 * resiliente (cada fonte falha de forma silenciosa e degrada para vazio).
 *
 * - SOMENTE leitura. Sem realtime. staleTime alto. Mobile-friendly.
 * - Reusa exclusivamente tabelas/RPCs já existentes do Supabase Externo.
 * - Se TUDO vier vazio, o consumidor deve usar fallback inteligente.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface TodayHighlight {
  kind: 'community' | 'event' | 'play' | 'creator' | 'radar';
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  icon?: string;
}

export interface TodayInOcultoData {
  highlights: TodayHighlight[];
  counts: {
    newCommunities: number;
    upcomingEvents: number;
    newPlay: number;
    radarActive: number;
    newCreators: number;
  };
  isEmpty: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

async function safe<T>(p: Promise<{ data: any; error: any }>, fb: T): Promise<T> {
  try {
    const { data, error } = await p;
    if (error) return fb;
    return (data ?? fb) as T;
  } catch {
    return fb;
  }
}

export function useTodayInOculto() {
  return useQuery<TodayInOcultoData>({
    queryKey: ['retention', 'today-in-oculto'],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const since7d = new Date(Date.now() - 7 * DAY).toISOString();
      const since24h = new Date(Date.now() - DAY).toISOString();
      const nowIso = new Date().toISOString();

      const [communities, events, play, creators, radar] = await Promise.all([
        safe<any[]>(
          (supabase as any)
            .from('oculto_community_topics')
            .select('id,title,slug,created_at,community_id')
            .gte('created_at', since7d)
            .order('created_at', { ascending: false })
            .limit(3),
          [],
        ),
        safe<any[]>(
          (supabase as any)
            .from('events')
            .select('id,title,event_date,location')
            .eq('is_active', true)
            .gte('event_date', nowIso)
            .order('event_date', { ascending: true })
            .limit(3),
          [],
        ),
        safe<any[]>(
          (supabase as any)
            .from('oculto_play_content')
            .select('id,title,created_at,author_id')
            .gte('created_at', since24h)
            .order('created_at', { ascending: false })
            .limit(3),
          [],
        ),
        safe<any[]>(
          (supabase as any)
            .from('profiles')
            .select('id,username,display_name,plan_type,updated_at')
            .in('plan_type', ['vip', 'premium'])
            .gte('updated_at', since7d)
            .order('updated_at', { ascending: false })
            .limit(3),
          [],
        ),
        safe<any[]>(
          (supabase as any)
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .gte('last_seen_at', new Date(Date.now() - 15 * 60_000).toISOString()),
          [],
        ),
      ]);

      const highlights: TodayHighlight[] = [];

      for (const c of communities.slice(0, 2)) {
        highlights.push({
          kind: 'community',
          id: c.id,
          title: c.title ?? 'Novo tópico',
          subtitle: 'na comunidade',
          href: c.slug ? `/comunidades/${c.slug}` : '/comunidades',
          icon: '🏘️',
        });
      }
      for (const e of events.slice(0, 2)) {
        const d = e.event_date ? new Date(e.event_date) : null;
        highlights.push({
          kind: 'event',
          id: e.id,
          title: e.title ?? 'Evento',
          subtitle:
            d
              ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
                (e.location ? ` · ${e.location}` : '')
              : e.location ?? null,
          href: `/events`,
          icon: '🎉',
        });
      }
      for (const p of play.slice(0, 2)) {
        highlights.push({
          kind: 'play',
          id: p.id,
          title: p.title ?? 'Novo no Oculto Play',
          subtitle: 'estreou agora',
          href: `/oculto-play`,
          icon: '🎬',
        });
      }
      for (const cr of creators.slice(0, 2)) {
        highlights.push({
          kind: 'creator',
          id: cr.id,
          title: cr.display_name || cr.username || 'Criador em destaque',
          subtitle: cr.plan_type === 'vip' ? 'Criador VIP ativo' : 'Premium ativo',
          href: cr.username ? `/profile/${cr.username}` : '/discover',
          icon: '⭐',
        });
      }

      const radarCount =
        Array.isArray(radar)
          ? (radar as any[]).length
          : (radar as any)?.count ?? 0;

      return {
        highlights,
        counts: {
          newCommunities: communities.length,
          upcomingEvents: events.length,
          newPlay: play.length,
          radarActive: radarCount,
          newCreators: creators.length,
        },
        isEmpty: highlights.length === 0,
      };
    },
  });
}
