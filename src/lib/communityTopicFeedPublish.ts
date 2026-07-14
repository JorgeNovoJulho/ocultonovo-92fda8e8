/**
 * Publica manualmente um tópico de comunidade no feed principal, gerando o
 * mesmo snapshot consumido por CommunityTopicFeedCard. Útil como fallback
 * quando o post automático falhou.
 */
import { supabase } from '@/lib/supabaseExternal';

export interface PublishTopicArgs {
  topicId: string;
  topicTitle: string;
  topicBody?: string | null;
  communityId: string;
  userId: string;
  isAdult?: boolean;
}

export interface PublishTopicResult {
  ok: boolean;
  alreadyExists?: boolean;
  postId?: string;
  error?: string;
}

const MARKER = '__COMMUNITY_TOPIC__';

export async function publishTopicToFeed(args: PublishTopicArgs): Promise<PublishTopicResult> {
  try {
    // Resolve profile + community em paralelo.
    const [{ data: community }, { data: profile }] = await Promise.all([
      (supabase as any)
        .from('oculto_communities')
        .select('id, title, slug, cover_url, avatar_url, accent_color, is_adult')
        .eq('id', args.communityId)
        .maybeSingle(),
      (supabase as any)
        .from('profiles')
        .select('id, user_id')
        .or(`user_id.eq.${args.userId},id.eq.${args.userId}`)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!community) return { ok: false, error: 'community-not-found' };
    const profileId = (profile as any)?.id || args.userId;

    // Anti-duplicidade: procura post existente do mesmo tópico (mesmo autor).
    try {
      const { data: existing } = await (supabase as any)
        .from('posts')
        .select('id, content_text')
        .eq('author_id', profileId)
        .eq('post_type', 'community_topic')
        .ilike('content_text', `%"topic_id":"${args.topicId}"%`)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return { ok: true, alreadyExists: true, postId: existing.id };
    } catch {
      /* best-effort */
    }

    const snapshot = {
      v: 1,
      kind: 'community_topic' as const,
      community_id: args.communityId,
      community_title: (community as any).title,
      community_slug: (community as any).slug,
      community_cover_url: (community as any).cover_url ?? null,
      community_avatar_url: (community as any).avatar_url ?? null,
      accent_color: (community as any).accent_color ?? null,
      topic_id: args.topicId,
      topic_title: args.topicTitle,
      topic_body: args.topicBody ?? null,
    };
    const payload = `${MARKER}\n${JSON.stringify(snapshot)}`;

    const { data, error } = await (supabase as any)
      .from('posts')
      .insert({
        author_id: profileId,
        content_text: payload,
        privacy_level: 'public',
        post_type: 'community_topic',
        is_adult: !!args.isAdult || !!(community as any).is_adult,
      })
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    return { ok: true, postId: (data as any)?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
