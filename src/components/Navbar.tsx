import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import * as LucideIcons from "lucide-react";
import { Search, DollarSign, Loader2, X, Crown, Lock, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { useState, useCallback, useRef, useEffect, memo, lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { GhostModeToggle } from "./GhostModeToggle";
import { useSearchUsers, SearchedUser, getHighlightTerms, detectGenderMatch } from "@/hooks/useSearchUsers";
import { useSystemSearch } from "@/hooks/useSystemSearch";
import { useFaqSearch } from "@/hooks/useFaqSearch";
import { FaqResultItem } from "@/components/search/FaqResultItem";
import { HighlightMatch } from "@/components/search/HighlightMatch";
import { useOcultoPlaySearch } from "@/hooks/useOcultoPlaySearch";
import { Music, Video, Image as ImageIcon } from "lucide-react";
import type { SystemSearchEntry } from "@/data/systemSearchIndex";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { useProfile } from "@/hooks/useProfile";

const SubscriptionPlansModal = lazy(() => import("./SubscriptionPlansModal").then(m => ({ default: m.SubscriptionPlansModal })));
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SearchResultItem = memo(function SearchResultItem({
  user,
  onClick,
  highlightTerms,
}: {
  user: SearchedUser;
  onClick: () => void;
  highlightTerms: string[];
}) {
  // Dispara no pointerdown para vencer o handler global de outside-click (mousedown)
  // e funcionar em mobile (toque) e desktop sem perder o clique.
  const fire = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  // Detecta se o perfil casou por gênero/tipo, para mostrar badge contextual.
  const matchedByGender = (() => {
    const fields = [user.gender, user.profile_type].filter(Boolean) as string[];
    for (const f of fields) {
      const m = detectGenderMatch(f);
      if (m) return m.label;
    }
    return null;
  })();

  return (
    <button
      type="button"
      onPointerDown={fire}
      onClick={fire}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted/70 transition-colors min-h-[3rem] touch-manipulation cursor-pointer"
    >
      <Avatar className="h-8 w-8 shrink-0 pointer-events-none">
        <AvatarImage src={buildSupabaseImageThumb(user.avatar_url, { width: 96, quality: 70 }) || user.avatar_url || undefined} loading="lazy" />
        <AvatarFallback className="text-xs bg-muted">{(user.username || '?').charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-none">
        <span className="text-sm font-medium text-foreground truncate">
          @<HighlightMatch text={user.username || 'usuario'} terms={highlightTerms} />
        </span>
        {matchedByGender && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 uppercase tracking-wide font-semibold">
            {matchedByGender}
          </span>
        )}
      </div>
    </button>
  );
});


export function Navbar() {
  // Theme is handled by ThemeToggle component
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [showFreeBlockModal, setShowFreeBlockModal] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: searchResults = [], isLoading, isFetching } = useSearchUsers(searchQuery);
  const systemResults = useSystemSearch(searchQuery);
  const faqResults = useFaqSearch(searchQuery);
  const { results: playResults } = useOcultoPlaySearch(searchQuery, 6);
  const { profile } = useProfile();
  const planType = (profile as any)?.plan_type;
  const isVipFlag = (profile as any)?.is_vip === true;
  const isPremiumOrVip =
    isVipFlag ||
    planType === 'premium' ||
    planType === 'monthly' ||
    planType === 'vip';
  const isFree = !isPremiumOrVip;

  const handleEarningsClick = (e: React.MouseEvent) => {
    if (isFree) {
      e.preventDefault();
      e.stopPropagation();
      setShowFreeBlockModal(true);
    }
  };

  // Theme toggle removed — handled by ThemeToggle component

  const handleSelectUser = useCallback((user: SearchedUser) => {
    const handle = (user.username || '').trim();
    navigate(handle ? `/u/${encodeURIComponent(handle)}` : `/creator/${user.id}`);
    setSearchQuery('');
    setShowResults(false);
    setMobileSearchOpen(false);
  }, [navigate]);

  const handleSelectSystem = useCallback((entry: SystemSearchEntry) => {
    if (entry.action?.type === 'open-plans-modal') {
      window.dispatchEvent(new Event('open-plans-modal'));
    } else if (entry.action?.type === 'open-financeiro-modal') {
      window.dispatchEvent(new Event('open-financeiro-modal'));
    } else if (entry.route) {
      navigate(entry.route);
    }
    setSearchQuery('');
    setShowResults(false);
    setMobileSearchOpen(false);
  }, [navigate]);

  useEffect(() => {
    const openGlobalSearch = () => {
      setMobileSearchOpen(true);
      setShowResults(true);
      window.setTimeout(() => {
        mobileInputRef.current?.focus();
      }, 30);
    };

    window.addEventListener('oculto:open-global-search', openGlobalSearch);
    return () => window.removeEventListener('oculto:open-global-search', openGlobalSearch);
  }, []);

  // Close on outside click (desktop)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global trigger: any component can dispatch `window.dispatchEvent(new Event('open-plans-modal'))`
  useEffect(() => {
    const open = () => setShowPlansModal(true);
    window.addEventListener('open-plans-modal', open);
    return () => window.removeEventListener('open-plans-modal', open);
  }, []);

  // Focus mobile input when opened
  useEffect(() => {
    if (mobileSearchOpen && mobileInputRef.current) {
      setTimeout(() => mobileInputRef.current?.focus(), 100);
    }
  }, [mobileSearchOpen]);

  const SystemResultItem = ({ entry }: { entry: SystemSearchEntry }) => {
    const IconComp = (entry.icon && (LucideIcons as any)[entry.icon]) || LucideIcons.Sparkles;
    const fire = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); handleSelectSystem(entry); };
    return (
      <button
        type="button"
        onPointerDown={fire}
        onClick={fire}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted/70 transition-colors min-h-[3rem] touch-manipulation cursor-pointer"
      >
        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center pointer-events-none">
          <IconComp className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1 pointer-events-none">
          <span className="text-sm font-medium text-foreground truncate">{entry.title}</span>
          <span className="text-xs text-muted-foreground truncate">
            {entry.description || entry.section}
          </span>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 pointer-events-none" />
      </button>
    );
  };

  const handleFaqNavigate = useCallback((route: string) => {
    navigate(route);
    setSearchQuery('');
    setShowResults(false);
    setMobileSearchOpen(false);
  }, [navigate]);

  const SearchDropdown = ({ results }: { results: SearchedUser[] }) => {
    const hasFaq = faqResults.length > 0;
    const hasSystem = systemResults.length > 0;
    const hasUsers = results.length > 0;
    const hasPlay = playResults.length > 0;
    const showEmpty = !isLoading && !hasFaq && !hasSystem && !hasUsers && !hasPlay;
    const highlightTerms = getHighlightTerms(searchQuery);

    const handlePlayClick = (id: string) => {
      navigate(`/play/p/${id}`);
      setSearchQuery('');
      setShowResults(false);
      setMobileSearchOpen(false);
    };


    return (
      <div className="scrollbar-hide absolute top-full left-0 right-0 mt-2 rounded-xl border border-border bg-popover shadow-lg overflow-y-auto overflow-x-hidden z-50 w-full max-w-[calc(100vw-1rem)] max-h-[min(28rem,70vh)] overscroll-contain">
        {hasFaq && (
          <div>
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
              Central de ajuda · Respostas
            </div>
            {faqResults.map((entry) => (
              <FaqResultItem key={entry.id} entry={entry} onNavigate={handleFaqNavigate} />
            ))}
          </div>
        )}

        {hasSystem && (
          <div className={hasFaq ? 'border-t border-border/60' : ''}>
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sistema · Atalhos
            </div>
            {systemResults.map((entry) => (
              <SystemResultItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {hasUsers && (
          <div className={hasSystem || hasFaq ? 'border-t border-border/60' : ''}>
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mistériosos(as)
            </div>
            {results.map((user) => (
              <SearchResultItem
                key={user.id}
                user={user}
                onClick={() => handleSelectUser(user)}
                highlightTerms={highlightTerms}
              />
            ))}

          </div>
        )}

        {hasPlay && (
          <div className={hasUsers || hasSystem || hasFaq ? 'border-t border-border/60' : ''}>
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300/90">
              Oculto Play · Conteúdos
            </div>
            {playResults.map((it) => {
              const KindIcon = it.kind === 'audio' ? Music : it.kind === 'short_video' || it.kind === 'vip_teaser' ? Video : ImageIcon;
              const subtitle = it.composer_name || it.author_display_name || (it.author_username ? `@${it.author_username}` : '');
              return (
                <button
                  key={it.id}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handlePlayClick(it.id); }}
                  className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted/50 active:bg-muted/70 transition-colors min-h-[3rem]"
                >
                  <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted/40 flex items-center justify-center">
                    {it.thumb_url
                      ? <img src={it.thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <KindIcon className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      <HighlightMatch text={it.title || 'Sem título'} terms={highlightTerms} />
                    </div>
                    {subtitle && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        <HighlightMatch text={subtitle} terms={highlightTerms} />
                      </div>
                    )}
                  </div>
                  <KindIcon className="h-3.5 w-3.5 text-fuchsia-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {isLoading && !hasSystem && !hasFaq && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {showEmpty && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nada encontrado. Tente "como ganhar xp", "planos", "como sacar"…
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Navbar */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 w-full items-center justify-between px-4 md:px-6">
          {/* Logo */}
          <Link to="/feed">
            <Logo />
          </Link>

          {/* Center - Search */}
          <div className="flex flex-1 max-w-md mx-8" ref={searchRef}>
            <div className="relative w-full">
              {isFetching ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                placeholder="Buscar pessoas, configurações, atalhos…"
                className="w-full h-10 pl-10 pr-4 rounded-full bg-muted/50 border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              {showResults && searchQuery.length >= 2 && (
                <SearchDropdown results={searchResults} />
              )}
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {isFree ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFreeBlockModal(true)}
                className="hidden md:flex gap-2 text-[hsl(45,93%,47%)] hover:text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10"
              >
                <Lock className="h-4 w-4" />
                Rendimentos
              </Button>
            ) : (
              <Link to="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:flex gap-2 text-[hsl(45,93%,47%)] hover:text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10"
                >
                  <DollarSign className="h-4 w-4" />
                  Rendimentos
                </Button>
              </Link>
            )}
            <GhostModeToggle />
            <ThemeToggle />
            <LanguageSelector compact />
            <NotificationBell />
          </div>
        </div>
      </nav>

      {/* Mobile / Tablet Top Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2 h-14 px-3">
          {mobileSearchOpen ? (
            /* Expanded search mode */
            <div className="flex items-center gap-2 flex-1" ref={mobileSearchRef}>
              <div className="relative flex-1">
                {isFetching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  placeholder="Buscar pessoas, configurações, atalhos…"
                  className="w-full h-10 pl-10 pr-4 rounded-full bg-muted/50 border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                {showResults && searchQuery.length >= 2 && (
                  <SearchDropdown results={searchResults} />
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={() => {
                  setMobileSearchOpen(false);
                  setSearchQuery('');
                  setShowResults(false);
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            /* Normal header */
            <>
              <Link to="/feed" className="shrink-0">
                <Logo />
              </Link>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setMobileSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
              </Button>
              <NotificationBell />
              <ThemeToggle />
              <LanguageSelector compact />
            </>
          )}
        </div>
      </header>

      {/* Spacer for mobile header */}
      <div className="md:hidden h-14" />

      {/* Modal: aviso para Free ao clicar em Rendimentos */}
      <Dialog open={showFreeBlockModal} onOpenChange={setShowFreeBlockModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-[hsl(45,93%,47%)]/15 flex items-center justify-center">
              <Crown className="h-6 w-6 text-[hsl(45,93%,47%)]" />
            </div>
            <DialogTitle className="text-center">Recurso exclusivo</DialogTitle>
            <DialogDescription className="text-center">
              A área de <strong>Rendimentos</strong> está disponível apenas para
              assinantes dos planos <strong>Premium</strong> ou <strong>VIP</strong>.
              Faça upgrade para acessar saques, relatórios e monetização.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-gradient-to-r from-gold to-gold/80 text-gold-foreground font-semibold hover:opacity-90"
              onClick={() => {
                setShowFreeBlockModal(false);
                setShowPlansModal(true);
              }}
            >
              <Crown className="h-4 w-4" />
              Ver planos disponíveis
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowFreeBlockModal(false)}
            >
              Agora não
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPlansModal && (
        <Suspense fallback={null}>
          <SubscriptionPlansModal open={showPlansModal} onOpenChange={setShowPlansModal} />
        </Suspense>
      )}
    </>
  );
}
