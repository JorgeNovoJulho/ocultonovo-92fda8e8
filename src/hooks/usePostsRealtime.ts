/**
 * usePostsRealtime — assina INSERT/UPDATE/DELETE em `posts` no Supabase EXTERNO
 * e mantém o feed sincronizado SOMENTE quando algo novo realmente acontece.
 *
 * Filosofia (alvo: mobile com pouca RAM/CPU, zero piscadas):
 *  - Realtime é a ÚNICA fonte de "algo novo" — sem polling, sem safety tick,
 *    sem refetch em focus/visibility/online por padrão.
 *  - INSERT/DELETE em `posts` → invalidate + refetch ativo das queries de feed
 *    (única forma de aparecer publicação nova sem reload manual).
 *  - UPDATE em likes/comments/saves/dislikes → invalidate suave (sem refetch
 *    forçado): o React Query usa o cache atual e atualiza quando voltar
 *    organicamente, sem piscada e sem novo round-trip imediato.
 *  - Volta de aba após >5 min em background → uma única revalidação para
 *    cobrir o cenário em que o socket caiu silenciosamente no celular.
 *    Abaixo desse tempo: cache permanece intacto.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeTable } from "@/lib/realtimeBus";
import { supabase } from "@/lib/supabaseExternal";

const FEED_QUERY_PREFIXES = [
  ["posts-infinite"],
  ["posts"],
  ["feed"],
  ["flash-stories"],
  ["my-flash-stories"],
  ["creator-channel"],
  ["creator-posts"],
  ["my-diary-posts"],
  ["my-posts"],
  ["subscribed-vip-posts"],
] as const;

// Ultra-rápido: INSERT/DELETE refletem instantaneamente (sem debounce).
// UPDATE de contadores (likes/comments) agrupa em 150ms para evitar flood.
const INSERT_DEBOUNCE_MS = 0;
const UPDATE_DEBOUNCE_MS = 150;
// Só revalida ao voltar para a aba se ficou mais que isto em background.
const STALE_AFTER_HIDDEN_MS = 5 * 60 * 1000;
let realtimeFeedOwnerMounted = false;

const isOverlayOpen = () => {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
};

export function usePostsRealtime() {
  const qc = useQueryClient();
  const hiddenSinceRef = useRef<number | null>(null);
  const lastSeenCreatedAtRef = useRef<string | null>(null);
  const lastRealtimeAtRef = useRef<number>(Date.now());

  useEffect(() => {
    // Garante UMA instância por app. Antes o hook podia montar no layout e no
    // feed ao mesmo tempo, duplicando subscriptions/watchdogs e invalidando o
    // cache duas vezes por evento — principal causa de piscadas/remounts.
    if (realtimeFeedOwnerMounted) return;
    realtimeFeedOwnerMounted = true;
    let insertTimer: ReturnType<typeof setTimeout> | null = null;
    let counterUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    let postUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let pendingHardRefresh = false;


    /**
     * Atualiza o feed.
     *  - hard=true  → refetch ativo (publicação nova chegou)
     *  - hard=false → apenas marca stale; o RQ atualiza no próximo acesso,
     *    sem disparar request agora (evita piscadas em mobile).
     */
    const refreshFeed = (hard = false) => {
      if (hard && isOverlayOpen()) {
        pendingHardRefresh = true;
        return;
      }
      for (const queryKey of FEED_QUERY_PREFIXES) {
        if (hard) {
          qc.invalidateQueries({ queryKey, refetchType: "active" });
        }
      }
    };

    const scheduleInsert = () => {
      if (insertTimer) return;
      insertTimer = setTimeout(() => {
        insertTimer = null;
        refreshFeed(true);
      }, INSERT_DEBOUNCE_MS);
    };

    const scheduleCounterUpdate = () => {
      if (counterUpdateTimer) return;
      counterUpdateTimer = setTimeout(() => {
        counterUpdateTimer = null;
        // Likes/comentários/saves/dislikes não podem mais invalidar o feed
        // inteiro. Mesmo `refetchType:none` muda estado do React Query e fazia
        // o Virtuoso/cards re-renderizarem em cascata durante modais.
      }, UPDATE_DEBOUNCE_MS);
    };

    const schedulePostUpdate = () => {
      if (postUpdateTimer) return;
      postUpdateTimer = setTimeout(() => {
        postUpdateTimer = null;
        // UPDATE em `posts` muda conteúdo, is_adult, hidden, privacy e ordem.
        // Precisa sincronizar desktop/mobile imediatamente; contadores seguem
        // otimistas nos hooks próprios e não passam por este caminho.
        refreshFeed(true);
      }, UPDATE_DEBOUNCE_MS);
    };

    const clearTimers = () => {
      if (insertTimer) { clearTimeout(insertTimer); insertTimer = null; }
      if (counterUpdateTimer) { clearTimeout(counterUpdateTimer); counterUpdateTimer = null; }
      if (postUpdateTimer) { clearTimeout(postUpdateTimer); postUpdateTimer = null; }
    };

    const onPostsChange = (payload: any) => {
      lastRealtimeAtRef.current = Date.now();
      const evt = payload?.eventType || payload?.event;
      if (evt === "INSERT" || evt === "DELETE") {
        if (evt === "INSERT" && payload?.new && !isOverlayOpen()) {
          if (payload.new.created_at) {
            lastSeenCreatedAtRef.current = payload.new.created_at;
          }
          tryOptimisticPrepend(payload.new).catch(() => { /* noop */ });
        }
        scheduleInsert();
      } else if (evt === "UPDATE") {
        schedulePostUpdate();
      } else {
        scheduleCounterUpdate();
      }
    };


    // Prepend otimista no cache do feed (posts-infinite) usando o payload
    // do realtime. Hidrata o perfil em paralelo para evitar avatar/nome vazios.
    async function tryOptimisticPrepend(row: any) {
      if (!row || row.is_hidden === true || row.privacy_level === 'hidden') return;
      // Hidrata profile (não bloqueia UI — se falhar, refetch cobre)
      let profile: any = null;
      try {
        const authorId = row.author_id || row.creator_id || row.user_id;
        if (authorId) {
          const { data } = await supabase
            .from('profiles')
            .select('id, user_id, username, display_name, avatar_url, banner_url, is_verified, is_verified_couple, plan_type, profile_type, is_creator, is_seed, is_test_account, gender, gender_category')
            .or(`id.eq.${authorId},user_id.eq.${authorId}`)
            .maybeSingle();
          profile = data;
        }
      } catch { /* noop */ }
      if (profile?.is_seed) return; // seeds entram pelo filtro do feed normal

      const author = profile ? {
        id: profile.id,
        user_id: profile.user_id || profile.id,
        name: profile.display_name || profile.username || 'Usuário',
        username: profile.username || null,
        avatar_url: profile.avatar_url || null,
        cover_image_url: profile.banner_url || null,
        is_verified: profile.is_verified ?? false,
        is_verified_couple: profile.is_verified_couple ?? false,
        plan_type: profile.plan_type || 'free',
        profile_type: profile.profile_type || 'individual',
        is_creator: profile.is_creator ?? false,
        is_seed: false,
        gender: profile.gender || null,
        gender_category: profile.gender_category ?? null,
      } : undefined;

      const enriched = {
        ...row,
        is_adult: row?.is_adult === true,
        user_id: author?.user_id || row.creator_id || row.author_id,
        author,
        profiles: author,
      };

      qc.setQueriesData({
        predicate: (query) => {
          const key = query.queryKey as any[];
          if (!Array.isArray(key) || key[0] !== 'posts-infinite') return false;
          const queryAdultOnly = key[key.length - 1] === true;
          return !queryAdultOnly || row.is_adult === true;
        },
      }, (old: any) => {
        if (!old?.pages?.length) return old;
        // Dedupe global: se já está em qualquer página, não duplica.
        const exists = old.pages.some((p: any) => (p?.posts || []).some((x: any) => x.id === row.id));
        if (exists) return old;
        const firstPage = old.pages[0];
        const currentPosts: any[] = firstPage?.posts || [];
        // Ordenação determinística: insere mantendo created_at DESC.
        const ts = (p: any) => new Date(p?.created_at || 0).getTime();
        const newTs = ts(enriched);
        let inserted = false;
        const merged: any[] = [];
        for (const p of currentPosts) {
          if (!inserted && newTs > ts(p)) {
            merged.push(enriched);
            inserted = true;
          }
          // Dedupe defensivo intra-página
          if (p.id !== enriched.id) merged.push(p);
        }
        if (!inserted) merged.unshift(enriched); // fallback (page vazia)
        const newFirst = { ...firstPage, posts: merged };
        return { ...old, pages: [newFirst, ...old.pages.slice(1)] };
      });
    }


    // Assina apenas o necessário. Likes/comments/saves apenas marcam stale
    // — não disparam refetch imediato (o contador local é otimista).
    // INSERT em tópicos de comunidades também dispara refresh hard, pois
    // alguns modos de feed mostram tópicos no feed principal.
    const unsubs = [
      subscribeTable("posts", onPostsChange),
      subscribeTable("post_likes", () => scheduleCounterUpdate()),
      subscribeTable("post_comments", () => scheduleCounterUpdate()),
      subscribeTable("post_dislikes", () => scheduleCounterUpdate()),
      subscribeTable("saved_posts", () => scheduleCounterUpdate()),
      subscribeTable("oculto_community_topics", onPostsChange),
    ];

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }
      // voltou ao primeiro plano
      const since = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (since && Date.now() - since > STALE_AFTER_HIDDEN_MS) {
        // Aba ficou muito tempo escondida: socket pode ter perdido eventos.
        // Faz UMA revalidação leve. Nada de polling.
        refreshFeed(true);
      }
    };

    const onOnline = () => {
      // Rede voltou após cair: melhor sincronizar uma vez.
      refreshFeed(true);
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }

    const overlayObserver = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          if (!pendingHardRefresh || isOverlayOpen()) return;
          pendingHardRefresh = false;
          refreshFeed(true);
        })
      : null;
    overlayObserver?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });

    // ============================================================
    // WATCHDOG anti-feed-travado
    // ------------------------------------------------------------
    // O Realtime do Supabase pode silenciosamente parar de entregar
    // eventos (socket "joined" porém zumbi em mobile/4G, ou eventos
    // descartados por RLS quando o token expira no canal).
    // A cada 45s, com a aba visível, consultamos só o `created_at`
    // mais recente da tabela `posts`. Se for mais novo que o último
    // INSERT que vimos via realtime → invalida o feed. Custo: 1
    // query indexada (idx_posts_created_at_desc). Zero piscada
    // quando não há nada novo (não dispara refetch sem motivo).
    // ============================================================
    const WATCHDOG_INTERVAL_MS = 45_000;
    const SILENT_REALTIME_THRESHOLD_MS = 30_000;

    const runWatchdog = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      // Só age se o realtime ficou quieto por um tempo (evita query
      // redundante logo após um evento legítimo).
      if (Date.now() - lastRealtimeAtRef.current < SILENT_REALTIME_THRESHOLD_MS) return;
      try {
        const { data, error } = await supabase
          .from("posts")
          .select("id, created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data?.created_at) return;
        const latest = data.created_at as string;
        const known = lastSeenCreatedAtRef.current;
        if (!known) {
          lastSeenCreatedAtRef.current = latest;
          return;
        }
        if (new Date(latest).getTime() > new Date(known).getTime()) {
          lastSeenCreatedAtRef.current = latest;
          refreshFeed(true);
        }
      } catch { /* noop */ }
    };

    watchdogTimer = setInterval(runWatchdog, WATCHDOG_INTERVAL_MS);


    return () => {
      clearTimers();
      if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
      realtimeFeedOwnerMounted = false;
      overlayObserver?.disconnect();

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
      unsubs.forEach((u) => { try { u(); } catch { /* noop */ } });
    };
  }, [qc]);
}

export default usePostsRealtime;
