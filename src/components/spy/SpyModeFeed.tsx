/**
 * Feed do Modo Espião
 * Exibe posts com blur em imagens e nomes, limitado a 20 posts
 */
import { useState, useEffect } from "react";
import { FeedTabs, FeedTab } from "@/components/FeedTabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SpyModeConversionBanner } from "./SpyModeConversionBanner";
import { SpyModeStoriesBar } from "./SpyModeStoriesBar";
import { SpyModeProgressBar } from "./SpyModeProgressBar";
import { SpyModeConversionPopup, ConversionAction } from "./SpyModeConversionPopup";
import { usePosts } from "@/hooks/usePosts";
import { useSpyModeStore } from "@/store/useSpyModeStore";
import { cn } from "@/lib/utils";
import { 
  Heart, 
  MessageCircle, 
  Bookmark, 
  Lock, 
  Eye,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function SpyModeFeed() {
  const [activeTab, setActiveTab] = useState<FeedTab>('foryou');
  const [showPopup, setShowPopup] = useState(false);
  const [popupAction, setPopupAction] = useState<ConversionAction>('general');
  const postsLimit = useSpyModeStore((s) => s.postsLimit);
  const viewedPosts = useSpyModeStore((s) => s.viewedPosts);
  const incrementViewedPosts = useSpyModeStore((s) => s.incrementViewedPosts);
  const { data: allPosts, isLoading, error, refetch } = usePosts({ limit: 50 });

  // Limitar posts para o modo espião
  const posts = allPosts?.slice(0, postsLimit) || [];

  // Atualizar contador quando posts carregam
  useEffect(() => {
    if (posts.length > 0 && viewedPosts === 0) {
      incrementViewedPosts();
    }
  }, [posts.length]);

  const handleBlockedAction = (action: ConversionAction) => {
    setPopupAction(action);
    setShowPopup(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="space-y-6 p-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col">
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="p-4">
          <Card className="overflow-hidden">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                Erro ao carregar posts. Tente novamente.
              </p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Empty state
  if (!posts || posts.length === 0) {
    return (
      <div className="flex flex-col">
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="p-4">
          <Card className="overflow-hidden">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhum post ainda
              </h3>
              <p className="text-muted-foreground">
                O feed está vazio no momento.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Barra de progresso */}
      <SpyModeProgressBar />

      {/* Stories borrados */}
      <SpyModeStoriesBar onStoryClick={() => handleBlockedAction('general')} />

      {/* Feed Tabs */}
      <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Aviso de Modo Espião */}
      <div className="mx-4 mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-3">
        <Eye className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Modo Espião</span> - Conteúdo censurado. 
            <span className="text-primary"> Crie uma conta</span> para ver tudo!
          </p>
        </div>
      </div>

      {/* Posts com blur */}
      <div className="space-y-6 p-4">
        {posts.map((post, index) => (
          <SpyModePostCard 
            key={post.id} 
            post={post} 
            index={index} 
            onBlockedAction={handleBlockedAction}
          />
        ))}
      </div>

      {/* Banner de Conversão após os posts */}
      <SpyModeConversionBanner />

      {/* Popup de Conversão */}
      <SpyModeConversionPopup 
        open={showPopup} 
        onOpenChange={setShowPopup} 
        action={popupAction} 
      />
    </div>
  );
}

// Card de Post com Blur (Modo Espião)
interface SpyModePostCardProps {
  post: any;
  index: number;
  onBlockedAction: (action: ConversionAction) => void;
}

function SpyModePostCard({ post, index, onBlockedAction }: SpyModePostCardProps) {
  const incrementViewedPosts = useSpyModeStore((s) => s.incrementViewedPosts);
  const timeAgo = formatDistanceToNow(new Date(post.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  useEffect(() => {
    incrementViewedPosts();
  }, []);

  return (
    <Card className="overflow-hidden bg-card/50 border-border/50">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center gap-3">
          {/* Avatar com blur leve */}
          <Avatar className="h-12 w-12 ring-2 ring-primary/20">
            <AvatarImage 
              src={post.profile?.avatar_url} 
              alt="Usuário"
              className="blur-[3px]"
            />
            <AvatarFallback className="bg-primary/10 text-primary blur-[2px]">
              {post.profile?.name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            {/* Nome borrado */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground blur-[4px] select-none">
                {post.profile?.name || 'Usuário'}
              </span>
              <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30">
                <Lock className="h-2.5 w-2.5 mr-1" />
                Oculto
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Texto do post (parcialmente visível) */}
        {post.content_text && (
          <p className="px-4 pb-3 text-sm text-foreground line-clamp-2">
            {post.content_text.substring(0, 50)}
            <span className="blur-[4px]">{post.content_text.substring(50, 150)}</span>
            {post.content_text.length > 100 && '...'}
          </p>
        )}

        {/* Imagem/Vídeo com blur forte */}
        {post.media_url && (
          <div className="relative">
            <img loading="lazy" decoding="async"
              src={post.media_url}
              alt="Conteúdo"
              className="w-full aspect-[4/3] object-cover blur-[8px]"
            />
            {/* Overlay com cadeado */}
            <div className="absolute inset-0 bg-background/30 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-background/80 flex items-center justify-center mb-3">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <p className="text-foreground font-semibold text-sm">Conteúdo Censurado</p>
              <p className="text-muted-foreground text-xs">Crie uma conta para ver</p>
            </div>
          </div>
        )}

        {/* Barra de ações (bloqueadas com popup) */}
        <div className="px-4 py-3 flex items-center justify-between border-t border-border/30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => onBlockedAction('like')}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <Heart className="h-5 w-5" />
              <span className="text-sm blur-[3px]">{post.likes_count || 0}</span>
            </button>
            <button 
              onClick={() => onBlockedAction('comment')}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-sm blur-[3px]">{post.comments_count || 0}</span>
            </button>
          </div>
          <button 
            onClick={() => onBlockedAction('save')}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <Bookmark className="h-5 w-5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
