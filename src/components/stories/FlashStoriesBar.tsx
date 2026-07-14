import { useState, useRef, useEffect, forwardRef } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlashStories, useMyFlashStories, type UserWithStories } from '@/hooks/useFlashStories';
import { useProfile } from '@/hooks/useProfile';
import { StoryViewer } from './StoryViewer';
import { CreateStoryModal } from './CreateStoryModal';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useQueryClient } from '@tanstack/react-query';
import { OnlineDot } from '@/components/ui/OnlineDot';
import { useI18n } from '@/lib/i18n';

// Componente do arco de progresso circular
const StoryProgressRing = forwardRef<SVGSVGElement, { 
  progress: number; 
  hasUnviewed: boolean; 
  size?: number;
}>(function StoryProgressRing({ progress, hasUnviewed, size = 100 }, ref) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
    >
      {/* Fundo do arco */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted) / 0.3)"
        strokeWidth={strokeWidth}
      />
      {/* Arco de progresso */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={hasUnviewed ? '#FF007F' : 'hsl(var(--muted-foreground) / 0.4)'}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="transition-all duration-300"
        style={{
          filter: hasUnviewed ? 'drop-shadow(0 0 6px #FF007F)' : 'none'
        }}
      />
    </svg>
  );
});

// Função auxiliar para obter URL do avatar com fallbacks robustos
function getAvatarUrl(author: any): string {
  if (author?.avatar_url && author.avatar_url.trim() !== '') {
    return author.avatar_url;
  }
  
  // Fallback para UI Avatars
  const name = author?.name || 'Usuário';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;
}

// Componente do item de story
function StoryItem({ 
  userStories, 
  onClick,
  isOwn = false,
}: { 
  userStories: UserWithStories | null;
  onClick: () => void;
  isOwn?: boolean;
}) {
  const { profile } = useProfile();
  const { t } = useI18n();
  const author = isOwn ? profile : userStories?.author;
  const hasUnviewed = userStories?.hasUnviewed ?? false;
  const progress = userStories?.oldestUnviewedProgress ?? 1;
  const hasStories = (userStories?.stories.length ?? 0) > 0;
  const hasMedia = userStories?.stories.some(s => s.media_url);

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center gap-1.5 group"
    >
      {/* Container do avatar com arco de progresso — menor no mobile */}
      <div className="relative w-[72px] h-[72px] sm:w-[100px] sm:h-[100px] flex items-center justify-center">
        {/* Arco de progresso */}
        {hasStories && (
          <>
            <span className="sm:hidden">
              <StoryProgressRing progress={progress} hasUnviewed={hasUnviewed} size={72} />
            </span>
            <span className="hidden sm:block">
              <StoryProgressRing progress={progress} hasUnviewed={hasUnviewed} size={100} />
            </span>
          </>
        )}

        {/* Avatar */}
        <div className={cn(
          "w-[64px] h-[64px] sm:w-[90px] sm:h-[90px] rounded-full p-[2px] bg-background transition-transform duration-200",
          "group-hover:scale-105"
        )}>
          <Avatar className="w-full h-full">
            <AvatarImage 
              src={getAvatarUrl(author)} 
              className="object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
            <AvatarFallback className={cn(
              "text-white text-lg sm:text-xl font-semibold",
              hasStories && !hasMedia 
                ? "bg-gradient-to-br from-primary via-pink-500 to-purple-600" 
                : "bg-muted text-muted-foreground"
            )}>
              {(author?.username || '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Botão de adicionar (apenas para "Seu Story") */}
        {isOwn && (
          <div className="absolute bottom-0 right-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#FF007F] border-2 border-background flex items-center justify-center shadow-lg">
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 text-white" strokeWidth={3} />
          </div>
        )}

        {/* Indicador online */}
        {!isOwn && <OnlineDot user={author as any} size="xl" />}
      </div>

      {/* Nome */}
      <span className={cn(
        "text-[10px] sm:text-xs truncate max-w-[72px] sm:max-w-[96px] transition-colors",
        hasUnviewed ? "text-foreground font-medium" : "text-muted-foreground",
        "group-hover:text-foreground"
      )}>
        {isOwn ? t('stories.your') : (author?.username ? `@${author.username}` : t('stories.user.fallback'))}
      </span>
    </button>
  );
}

// Componente principal da barra de stories
export function FlashStoriesBar() {
  const [selectedUserIndex, setSelectedUserIndex] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  
  const { data: usersWithStories, isLoading } = useFlashStories();
  const { data: myStories } = useMyFlashStories();
  const { profile } = useProfile();

  // Realtime subscription para atualizar stories automaticamente
  useEffect(() => {
    const unsubIns = subscribeTable('posts', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      if (payload.new?.is_flash || payload.new?.post_type === 'story') {
        queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
        queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
      }
    }, { events: ['INSERT'] });
    const unsubDel = subscribeTable('posts', (payload: any) => {
      if (payload?.eventType !== 'DELETE') return;
      queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
      queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
    }, { events: ['DELETE'] });
    return () => { unsubIns(); unsubDel(); };
  }, [queryClient]);


  // Scroll horizontal com botões
  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Handler para clicar em "Seu Story"
  const handleOwnStoryClick = () => {
    if (myStories && myStories.length > 0) {
      // Se tem stories, abre o viewer
      setSelectedUserIndex(-1); // -1 indica próprios stories
    } else {
      // Se não tem, abre modal de criação
      setShowCreateModal(true);
    }
  };

  // Handler para clicar em story de outro usuário
  const handleStoryClick = (index: number) => {
    setSelectedUserIndex(index);
  };

  // Navegar para próximo/anterior usuário no viewer
  const handleNavigateUser = (direction: 'prev' | 'next') => {
    if (selectedUserIndex === null || !usersWithStories) return;

    if (direction === 'next') {
      if (selectedUserIndex === -1) {
        // Indo de "meus stories" para primeiro usuário
        if (usersWithStories.length > 0) {
          setSelectedUserIndex(0);
        } else {
          setSelectedUserIndex(null);
        }
      } else if (selectedUserIndex < usersWithStories.length - 1) {
        setSelectedUserIndex(selectedUserIndex + 1);
      } else {
        setSelectedUserIndex(null);
      }
    } else {
      if (selectedUserIndex === 0) {
        // Voltando para "meus stories" se existir
        if (myStories && myStories.length > 0) {
          setSelectedUserIndex(-1);
        } else {
          setSelectedUserIndex(null);
        }
      } else if (selectedUserIndex === -1) {
        setSelectedUserIndex(null);
      } else {
        setSelectedUserIndex(selectedUserIndex - 1);
      }
    }
  };

  // Dados do usuário selecionado para o viewer
  const selectedUserStories = selectedUserIndex === -1 
    ? (myStories && profile ? {
        userId: profile.id,
        author: {
          id: profile.id,
          name: profile.name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          is_verified_couple: profile.is_verified_couple || false,
          is_verified: profile.is_verified || false,
          is_online: true,
          plan_type: profile.plan_type || 'free',
          is_creator: profile.is_creator || false,
          aura_xp: (profile as any)?.aura_xp ?? 0,
          aura_level: (profile as any)?.aura_level ?? null,
        },
        stories: myStories,
        hasUnviewed: false,
        oldestUnviewedProgress: 1,
      } : null)
    : (selectedUserIndex !== null ? usersWithStories?.[selectedUserIndex] : null);

  // Loading state
  if (isLoading) {
    return (
      <div className="px-2 sm:px-4 py-3 border-b border-border/30 bg-background/80">
        <div className="flex gap-3 overflow-hidden">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Skeleton className="w-[72px] h-[72px] sm:w-[100px] sm:h-[100px] rounded-full" />
              <Skeleton className="w-12 sm:w-16 h-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Barra de Stories */}
      <div className="relative px-1 sm:px-2 py-3 border-b border-border/30 bg-background/80">
        {/* Botão scroll esquerda — apenas desktop */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-md opacity-0 hover:opacity-100 transition-opacity hidden md:flex"
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Container scrollável (touch-friendly) */}
        <div 
          ref={scrollRef}
          className="flex gap-2 sm:gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide px-1 sm:px-2"
          style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity' }}
        >
          {/* Seu Story - sempre primeiro */}
          <StoryItem
            userStories={myStories && myStories.length > 0 ? {
              userId: profile?.id || '',
              author: {
                id: profile?.id || '',
                name: profile?.name || '',
                username: profile?.username || null,
                avatar_url: profile?.avatar_url || null,
                is_verified_couple: profile?.is_verified_couple || false,
                is_verified: profile?.is_verified || false,
                is_online: true,
                plan_type: profile?.plan_type || 'free',
                is_creator: profile?.is_creator || false,
              },
              stories: myStories,
              hasUnviewed: false,
              oldestUnviewedProgress: 1,
            } : null}
            onClick={handleOwnStoryClick}
            isOwn
          />

          {/* Stories de outros usuários */}
          {usersWithStories?.map((userStories, index) => (
            <StoryItem
              key={userStories.userId}
              userStories={userStories}
              onClick={() => handleStoryClick(index)}
            />
          ))}

          {/* Placeholder se não há stories */}
          {(!usersWithStories || usersWithStories.length === 0) && (
            <div className="flex items-center justify-center px-4 py-2">
              <p className="text-sm text-muted-foreground">
                {t('stories.empty')}
              </p>
            </div>
          )}
        </div>

        {/* Botão scroll direita */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-md opacity-0 hover:opacity-100 transition-opacity hidden md:flex"
          onClick={() => scroll('right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Story Viewer Modal */}
      {selectedUserStories && (
        <StoryViewer
          open={selectedUserIndex !== null}
          onOpenChange={(open) => !open && setSelectedUserIndex(null)}
          userStories={selectedUserStories}
          onNavigateUser={handleNavigateUser}
          hasNextUser={selectedUserIndex !== null && selectedUserIndex < (usersWithStories?.length ?? 0) - 1}
          hasPrevUser={selectedUserIndex !== null && (selectedUserIndex > 0 || (selectedUserIndex === 0 && myStories && myStories.length > 0))}
        />
      )}

      {/* Modal de Criação de Story */}
      <CreateStoryModal 
        open={showCreateModal} 
        onOpenChange={setShowCreateModal} 
      />

      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
}
