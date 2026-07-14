import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { MessageCircle, MapPin, Flame, CheckCircle2, Users, User, Crown, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SuperMatchBadge } from './SuperMatchBadge';
import type { Match } from '@/hooks/useMatches';
import { OnlineDot } from '@/components/ui/OnlineDot';

interface MatchCardProps {
  match: Match;
  onStartChat: () => void;
}

export function MatchCard({ match, onStartChat }: MatchCardProps) {
  const navigate = useNavigate();
  const { other_user, distance_km, matched_at, is_expired, chat_started, is_super_match } = match;

  const isStillLooking = other_user.is_looking_now && !is_expired;
  const isCouple = other_user.profile_type === 'couple';
  const isVip = other_user.plan_type === 'vip';

  const timeAgo = formatDistanceToNow(new Date(matched_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const handleViewProfile = () => {
    navigate(`/creator/${other_user.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-xl border transition-all",
        is_super_match
          ? "bg-gradient-to-r from-yellow-500/15 via-amber-500/10 to-orange-500/10 border-yellow-400/50 shadow-[0_0_30px_rgba(234,179,8,0.25)]"
          : is_expired 
            ? "bg-card/30 border-border/30 opacity-60" 
            : isStillLooking
              ? "bg-gradient-to-r from-orange-500/10 to-yellow-500/5 border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.15)]"
              : "bg-card/50 border-yellow-400/30"
      )}
    >
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="relative">
          <Avatar 
            className={cn(
              "h-14 w-14 ring-2 cursor-pointer transition-transform hover:scale-105",
              is_super_match
                ? "ring-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                : isStillLooking 
                  ? "ring-orange-500/50" 
                  : is_expired 
                    ? "ring-muted/30" 
                    : "ring-yellow-400/40"
            )}
            onClick={handleViewProfile}
          >
            <AvatarImage src={other_user.avatar_url || undefined} alt={`@${(other_user as any).username || 'usuario'}`} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {((other_user as any).username?.[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          {/* Super Match Crown */}
          {is_super_match && (
            <div className="absolute -top-2 -right-2 p-1.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 shadow-lg animate-pulse">
              <Crown className="h-3 w-3 text-black" />
            </div>
          )}

          {/* Looking Now indicator (only if not super match) */}
          {isStillLooking && !is_super_match && (
            <div className="absolute -top-1 -right-1 p-1 rounded-full bg-orange-500 animate-pulse">
              <Flame className="h-3 w-3 text-white" />
            </div>
          )}

          {/* Online indicator */}
          {!is_expired && <OnlineDot user={other_user as any} size="lg" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 
              className="font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
              onClick={handleViewProfile}
            >
              @{(other_user as any).username || 'usuario'}
            </h3>
            
            {/* Badges */}
            {other_user.is_verified && (
              <CheckCircle2 className="h-4 w-4 text-blue-400 flex-shrink-0" />
            )}
            {other_user.is_verified_couple && (
              <Badge className="bg-pink-500/20 text-pink-400 text-xs border-none">
                <Users className="h-3 w-3 mr-1" />
                Casal
              </Badge>
            )}
            {isCouple && !other_user.is_verified_couple && (
              <Users className="h-4 w-4 text-muted-foreground" />
            )}
            {isVip && !is_super_match && (
              <Badge className="bg-yellow-500/20 text-yellow-400 text-xs border-none">
                <Crown className="h-3 w-3" />
              </Badge>
            )}
          </div>

          {/* Super Match Badge */}
          {is_super_match && (
            <div className="mt-1">
              <SuperMatchBadge size="sm" />
            </div>
          )}
          
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            {isStillLooking ? (
              <span className="flex items-center gap-1 text-orange-400">
                <Flame className="h-3 w-3" />
                Buscando agora
              </span>
            ) : is_expired ? (
              <span className="text-muted-foreground/70">Match expirado</span>
            ) : (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Offline
              </span>
            )}
            
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {distance_km}km
            </span>
            
            <span>·</span>
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {is_expired ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleViewProfile}
              className="text-muted-foreground"
            >
              Ver Perfil
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onStartChat}
              className={cn(
                "gap-2",
                is_super_match
                  ? "bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 hover:from-yellow-600 hover:via-amber-600 hover:to-orange-600 text-black font-semibold shadow-lg shadow-yellow-500/30"
                  : isStillLooking 
                    ? "bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white shadow-lg shadow-orange-500/25"
                    : "bg-gradient-to-r from-primary to-[#FF007F] hover:opacity-90"
              )}
            >
              <MessageCircle className="h-4 w-4" />
              {chat_started ? 'Continuar' : is_super_match ? 'Chat VIP' : 'Iniciar Chat'}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
