import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { useQuery } from "@tanstack/react-query";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";

interface StoryCreator {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_online: boolean;
}

function useStoryCreators() {
  return useQuery({
    queryKey: ['story-creators'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url, is_verified, is_online')
          .order('updated_at', { ascending: false })
          .limit(12);

        if (error) {
          console.warn('[Oculto] story-creators query failed:', error.message);
          return [];
        }
        return (data || []) as StoryCreator[];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function StoriesCarousel() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<StoryCreator | null>(null);
  const { data: creators = [], isLoading } = useStoryCreators();

  const handleStoryClick = (creator: StoryCreator) => {
    setSelectedCreator(creator);
    setShowAuthModal(true);
  };

  if (isLoading) {
    return (
      <section className="relative z-10 py-8 px-6">
        <div className="flex items-center justify-center h-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (creators.length === 0) return null;

  return (
    <>
      <section className="relative z-10 py-8 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-foreground">
                Stories em destaque
              </h3>
              <Badge
                variant="outline"
                className="text-xs border-primary/30 text-primary bg-primary/5"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Novos
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {creators.length} perfis
            </span>
          </div>

          <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
            {creators.map((creator, index) => (
              <button
                key={creator.id}
                onClick={() => handleStoryClick(creator)}
                className="flex-shrink-0 flex flex-col items-center gap-3 group"
              >
                <div className="relative" style={{ animationDelay: `${index * 0.15}s` }}>
                  <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary via-secondary to-amber-500 opacity-50 blur-md group-hover:opacity-70 transition-opacity" />
                  <div
                    className="relative w-20 h-20 md:w-24 md:h-24 rounded-full p-[3px] group-hover:scale-110 transition-all duration-300"
                    style={{
                      background: `linear-gradient(${45 + index * 30}deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(45, 93%, 47%), hsl(var(--primary)))`,
                      backgroundSize: "300% 300%",
                      animation: `gradient-rotate 3s ease infinite ${index * 0.2}s`,
                    }}
                  >
                    <div className="w-full h-full rounded-full p-[2px] bg-background">
                      <img decoding="async"
                        src={buildSupabaseImageThumb(creator.avatar_url, { width: 160, quality: 72 }) || creator.avatar_url || ''}
                        alt={creator.name}
                        className="w-full h-full rounded-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  {creator.is_online && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white uppercase tracking-wide shadow-lg">
                      Live
                    </div>
                  )}

                  {creator.is_verified && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-background flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-primary fill-primary/20" />
                    </div>
                  )}
                </div>

                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[80px] font-medium">
                  {creator.name?.split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-primary/20 max-w-sm shadow-[0_0_50px_rgba(255,0,127,0.2)]">
          <DialogHeader className="text-center">
            {selectedCreator && (
              <div className="flex flex-col items-center gap-4 mb-4">
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-primary via-secondary to-amber-500 opacity-50 blur-lg" />
                  <div className="relative w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-primary via-secondary to-primary">
                    <div className="w-full h-full rounded-full p-[2px] bg-background">
                      <img loading="lazy" decoding="async"
                        src={buildSupabaseImageThumb(selectedCreator.avatar_url, { width: 320, quality: 75 }) || selectedCreator.avatar_url || ''}
                        alt={selectedCreator.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogTitle className="text-2xl font-bold text-center">
              Ver Story de {selectedCreator?.name}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Crie uma conta para ver stories exclusivos e se conectar com seus
              criadores favoritos.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-4">
            <Link to="/signup" className="w-full">
              <Button className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold h-12 shadow-[0_0_20px_rgba(255,0,127,0.3)]">
                <Sparkles className="mr-2 h-4 w-4" />
                Criar Conta Grátis
              </Button>
            </Link>
            <Link to="/login" className="w-full">
              <Button
                variant="outline"
                className="w-full border-border/50 hover:border-primary/50 h-12"
              >
                Já tenho conta
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes gradient-rotate {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </>
  );
}
