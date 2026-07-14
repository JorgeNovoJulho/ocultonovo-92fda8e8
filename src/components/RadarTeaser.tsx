import { useState } from "react";
import { genderLabels, desireLabels } from "@/data/radarData";
import { MapPin, Lock, Sparkles, Radar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useQuery } from "@tanstack/react-query";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";

interface TeaserRadarUser {
  id: string;
  username: string | null;
  name: string;
  avatar_url: string | null;
  profile_type: string;
  gender: string;
  bio: string | null;
  is_online: boolean;
  tags_adult: string[] | null;
}

function useRadarTeaserUsers() {
  return useQuery({
    queryKey: ['radar-teaser-users'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, name, avatar_url, profile_type, gender, bio, is_online, tags_adult')
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(6);
        if (error) {
          console.warn('[Oculto] radar-teaser query failed:', error.message);
          return [];
        }
        return (data || []) as TeaserRadarUser[];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function RadarTeaser() {
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const { data: teaserUsers = [], isLoading } = useRadarTeaserUsers();

  const handleCardClick = (userName: string) => {
    setSelectedUser(userName);
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <section className="relative z-10 py-20 px-6 overflow-hidden">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (teaserUsers.length === 0) return null;

  const onlineCount = teaserUsers.filter(u => u.is_online).length;

  return (
    <section className="relative z-10 py-20 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/10 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px]" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full border border-primary/10 animate-ping-slow opacity-30" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-primary/20 animate-ping-slow opacity-40" style={{ animationDelay: '1s' }} />
        <div className="absolute w-[200px] h-[200px] rounded-full border border-primary/30 animate-ping-slow opacity-50" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 px-4 py-1.5">
            <div className="relative mr-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            {onlineCount} pessoas online agora
          </Badge>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Quem está{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              perto de você
            </span>
            ?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Descubra pessoas e casais liberais na sua região. Conexões reais, sem julgamentos.
          </p>
        </div>

        <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
          {teaserUsers.map((user, index) => {
            const isVisible = index === 0 || index === 3;
            const desires = (user.tags_adult || []) as string[];
            const gender = (user.gender || 'homem') as keyof typeof genderLabels;

            return (
              <div
                key={user.id}
                onClick={() => handleCardClick(user.username ? `@${user.username}` : 'Misterioso(a)')}
                className="relative flex-shrink-0 w-72 rounded-2xl overflow-hidden cursor-pointer group transition-all duration-500 hover:scale-[1.03] bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(255,0,127,0.15)]"
              >
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={buildSupabaseImageThumb(user.avatar_url, { width: 576, quality: 70 }) || user.avatar_url || ''}
                    alt=""
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    style={{ filter: isVisible ? "none" : "blur(20px)" }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />

                  {!isVisible && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(255,0,127,0.3)] border border-primary/30">
                        <Lock className="h-7 w-7 text-primary" />
                      </div>
                    </div>
                  )}

                  {user.profile_type === "couple" && (
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-gradient-to-r from-pink-500 to-amber-500 text-white text-[10px] font-bold shadow-lg">
                        👫 CASAL
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-bold text-lg text-foreground truncate">
                      {isVisible ? (user.username ? `@${user.username}` : 'Misterioso(a)') : "???"}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {desires.slice(0, 2).map((desire) => (
                      <Badge
                        key={desire}
                        variant="outline"
                        className="text-[10px] px-2.5 py-1 border-primary/30 text-primary/90 bg-primary/5"
                      >
                        {desireLabels[desire as keyof typeof desireLabels] || desire}
                      </Badge>
                    ))}
                    <Badge
                      variant="outline"
                      className="text-[10px] px-2.5 py-1 border-secondary/30 text-secondary bg-secondary/5"
                    >
                      {genderLabels[gender] || gender}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <Link to="/signup">
            <Button
              size="lg"
              className="relative overflow-hidden bg-gradient-to-r from-primary via-pink-500 to-secondary hover:opacity-90 text-primary-foreground font-bold h-14 px-12 text-lg shadow-[0_0_30px_rgba(255,0,127,0.4)] hover:shadow-[0_0_40px_rgba(255,0,127,0.6)] transition-all duration-300 group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <Radar className="mr-2 h-5 w-5" />
              Explorar o Radar
            </Button>
          </Link>
          <p className="text-muted-foreground text-sm mt-4">
            Crie uma conta grátis para ver perfis completos
          </p>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-primary/20 max-w-sm shadow-[0_0_50px_rgba(255,0,127,0.2)]">
          <DialogHeader className="text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(255,0,127,0.2)]">
              <MapPin className="h-10 w-10 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold text-center">
              Descubra quem está perto
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground pt-2">
              Cadastre-se para ver o perfil completo de{" "}
              <span className="text-primary font-semibold">{selectedUser}</span>{" "}
              e descobrir mais pessoas na sua região.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Link to="/signup" className="w-full">
              <Button className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold h-12 shadow-[0_0_20px_rgba(255,0,127,0.3)]">
                <Sparkles className="mr-2 h-4 w-4" />
                Criar Conta Grátis
              </Button>
            </Link>
            <Link to="/login" className="w-full">
              <Button variant="outline" className="w-full border-border/50 hover:border-primary/50 h-12">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
