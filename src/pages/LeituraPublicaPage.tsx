/**
 * LeituraPublicaPage — rota pública /leitura/:postId
 * Mostra capa + título + teaser + CTA "Continuar lendo".
 * • Visitante sem conta → redireciona para /login com retorno.
 * • Usuário logado → abre o canal do criador no post correto.
 * Apenas posts narrativos públicos (privacy_level='public') são expostos.
 */
import { useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, BookOpen, Lock, Clock } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function LeituraPublicaPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["public-narrative-post", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data: post } = await (supabase as any)
        .from("posts")
        .select(
          "id, author_id, creator_id, title, subtitle, teaser, thumbnail_url, read_time_minutes, content_format, section_type, privacy_level, created_at",
        )
        .eq("id", postId)
        .maybeSingle();
      if (!post) return { post: null, author: null } as const;

      // Só expor publicamente quando o autor marcou como público
      if (post.privacy_level !== "public") return { post, author: null, locked: true } as const;

      const { data: author } = await (supabase as any)
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .or(`id.eq.${post.author_id},user_id.eq.${post.creator_id || post.author_id}`)
        .limit(1)
        .maybeSingle();
      return { post, author, locked: false } as const;
    },
  });

  const targetPath = useMemo(() => {
    if (!data?.post || !data?.author) return null;
    const handle = data.author.user_id || data.author.id || data.author.username;
    const section = data.post.section_type || "diary";
    return `/canal/${handle}?section=${encodeURIComponent(section)}&post=${encodeURIComponent(data.post.id)}`;
  }, [data]);

  const handleContinue = () => {
    if (!targetPath) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(targetPath)}`);
      return;
    }
    navigate(targetPath);
  };

  // Atualiza meta tags para preview de compartilhamento
  useEffect(() => {
    if (!data?.post) return;
    const title = data.post.title ? `${data.post.title} · OCULTO` : "Leitura no OCULTO";
    const desc = (data.post.teaser || data.post.subtitle || "Leitura exclusiva no Canal VIP").slice(0, 200);
    document.title = title;
    const ensure = (selector: string, attrs: Record<string, string>) => {
      let el = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
        document.head.appendChild(el);
      }
      return el;
    };
    ensure('meta[property="og:title"]', { property: "og:title" }).setAttribute("content", title);
    ensure('meta[property="og:description"]', { property: "og:description" }).setAttribute("content", desc);
    ensure('meta[property="og:type"]', { property: "og:type" }).setAttribute("content", "article");
    if (data.post.thumbnail_url) {
      ensure('meta[property="og:image"]', { property: "og:image" }).setAttribute("content", data.post.thumbnail_url);
      ensure('meta[name="twitter:image"]', { name: "twitter:image" }).setAttribute("content", data.post.thumbnail_url);
    }
    ensure('meta[name="twitter:card"]', { name: "twitter:card" }).setAttribute("content", "summary_large_image");
    ensure('meta[name="twitter:title"]', { name: "twitter:title" }).setAttribute("content", title);
    ensure('meta[name="twitter:description"]', { name: "twitter:description" }).setAttribute("content", desc);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando leitura…</div>
      </div>
    );
  }

  if (!data?.post || data.locked || !data.author) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full p-6 text-center space-y-3 border-border/60">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Lock className="h-6 w-6 text-amber-400" />
          </div>
          <h1 className="text-lg font-semibold">Conteúdo indisponível</h1>
          <p className="text-sm text-muted-foreground">
            Este conteúdo não está mais disponível publicamente ou foi removido.
          </p>
          <Button asChild className="w-full bg-amber-500 hover:bg-amber-600 text-black">
            <Link to="/">Voltar para o início</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const post = data.post;
  const author = data.author;

  return (
    <div className="min-h-dvh bg-background flex flex-col [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between sm:border-b sm:border-border/60">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
        </Link>
        <Link to={user ? "/feed" : "/login"} className="text-xs text-muted-foreground hover:text-foreground">
          {user ? "Ir para o feed" : "Entrar"}
        </Link>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-5 sm:py-10 max-w-2xl w-full mx-auto overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {post.thumbnail_url ? (
          <div className="relative aspect-[16/8] overflow-hidden rounded-xl bg-muted mb-5">
            <img decoding="async" src={post.thumbnail_url} alt={post.title || "Capa"} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
          </div>
        ) : (
          <div className="relative aspect-[16/8] overflow-hidden rounded-xl mb-5 bg-gradient-to-br from-amber-500/30 via-amber-700/20 to-background flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-amber-400/70" />
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500 mb-2">
          <BookOpen className="h-3.5 w-3.5" /> OCULTO Canal VIP · @{author.username || "criador"}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-foreground">
          {post.title || "Leitura exclusiva"}
        </h1>

        {post.subtitle && (
          <p className="text-base text-muted-foreground italic mt-1">{post.subtitle}</p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-3">
          {post.read_time_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {post.read_time_minutes} min de leitura
            </span>
          ) : null}
          {post.created_at && (
            <span>{new Date(post.created_at).toLocaleDateString("pt-BR")}</span>
          )}
        </div>

        {post.teaser ? (
          <p className="text-[15px] sm:text-base text-foreground/85 leading-relaxed border-l-2 border-amber-500/60 pl-4 my-6">
            {post.teaser}
          </p>
        ) : (
          <p className="text-[15px] text-muted-foreground/80 leading-relaxed border-l-2 border-amber-500/40 pl-4 my-6 italic">
            Continue lendo no app para acessar o conteúdo completo do criador.
          </p>
        )}

        <Button
          onClick={handleContinue}
          size="lg"
          className="w-full bg-amber-500 hover:bg-amber-600 text-black gap-2 h-12 text-base font-semibold"
        >
          Continuar lendo <ArrowRight className="h-4 w-4" />
        </Button>

        {!user && (
          <p className="text-xs text-center text-muted-foreground mt-3 pb-4">
            Você precisa entrar na sua conta para continuar a leitura.
          </p>
        )}
      </main>
    </div>
  );
}
