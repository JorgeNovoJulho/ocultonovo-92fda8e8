/**
 * Aba Mídia da Comunidade — galeria consolidada.
 * Fonte primária: tabela `oculto_community_media` (persistida no upload).
 * Fallback: parse de markdown `![imagem](url)`, `[vídeo](url)` e `[áudio](url)`
 * nos tópicos antigos que não possuem registro estruturado.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Video, Music } from 'lucide-react';

type MediaKind = 'image' | 'video' | 'audio';

interface MediaEntry {
  url: string;
  kind: MediaKind;
  topicId: string;
  topicTitle: string;
  createdAt: string;
}

const RE_IMG = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
const RE_VID = /\[(?:vídeo|video)\]\((https?:\/\/[^\s)]+)\)/gi;
const RE_AUD = /\[(?:áudio|audio)\]\((https?:\/\/[^\s)]+)\)/gi;

function extract(body: string | null, topicId: string, topicTitle: string, createdAt: string): MediaEntry[] {
  if (!body) return [];
  const out: MediaEntry[] = [];
  const push = (re: RegExp, kind: MediaKind) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) out.push({ url: m[1], kind, topicId, topicTitle, createdAt });
  };
  push(RE_IMG, 'image');
  push(RE_VID, 'video');
  push(RE_AUD, 'audio');
  return out;
}

export function CommunityMediaGallery({ communityId, slug }: { communityId: string; slug: string }) {
  // Fonte primária: oculto_community_media (estruturado)
  const { data: structured = [], isLoading: l1 } = useQuery({
    queryKey: ['oculto_community_media', communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_community_media')
        .select('id,url,kind,topic_id,created_at,oculto_community_topics(title)')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 30_000,
  });

  // Fallback: tópicos antigos com mídia em markdown
  const { data: topics = [], isLoading: l2 } = useQuery({
    queryKey: ['oculto_community_media_topics', communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_community_topics')
        .select('id,title,body,created_at')
        .eq('community_id', communityId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 60_000,
  });

  const items = useMemo(() => {
    const all: MediaEntry[] = [];
    const seen = new Set<string>();

    // 1) Estruturado primeiro (autoritativo)
    structured.forEach((m: any) => {
      const key = `${m.topic_id}|${m.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      all.push({
        url: m.url,
        kind: m.kind as MediaKind,
        topicId: m.topic_id,
        topicTitle: m.oculto_community_topics?.title ?? '',
        createdAt: m.created_at,
      });
    });

    // 2) Fallback markdown (deduplicado)
    topics.forEach((t: any) => {
      extract(t.body, t.id, t.title, t.created_at).forEach((e) => {
        const key = `${e.topicId}|${e.url}`;
        if (seen.has(key)) return;
        seen.add(key);
        all.push(e);
      });
    });

    return all.slice(0, 200);
  }, [structured, topics]);

  const isLoading = l1 || l2;

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma mídia publicada ainda.</p>;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
      {items.map((m, i) => (
        <Link
          key={`${m.topicId}-${i}-${m.url}`}
          to={`/comunidades/${slug}/topico/${m.topicId}`}
          className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border group"
          title={m.topicTitle}
        >
          {m.kind === 'image' ? (
            <img src={m.url} alt={m.topicTitle} className="h-full w-full object-cover group-active:opacity-70" loading="lazy" />
          ) : m.kind === 'video' ? (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-fuchsia-900/50 to-indigo-900/50">
              <Video className="h-7 w-7 text-white/80" />
            </div>
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-emerald-900/50 to-cyan-900/50">
              <Music className="h-7 w-7 text-white/80" />
            </div>
          )}
          <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center">
            {m.kind === 'image' && <ImageIcon className="h-3 w-3 text-white" />}
            {m.kind === 'video' && <Video className="h-3 w-3 text-white" />}
            {m.kind === 'audio' && <Music className="h-3 w-3 text-white" />}
          </div>
        </Link>
      ))}
    </div>
  );
}
