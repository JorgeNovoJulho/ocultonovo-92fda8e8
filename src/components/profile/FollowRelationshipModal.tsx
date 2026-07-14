import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFollowers, useFollowing } from "@/hooks/useFollows";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Crown, Users, MapPin, Search, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { formatTipoCidade } from "@/lib/profileFormat";

interface FollowRelationshipModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string | undefined;
  profileName?: string;
  defaultTab?: "followers" | "following" | "common";
}

const PAGE_SIZE = 20;

function UserRow({ user, onClick }: { user: any; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 transition text-left"
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={user.avatar_url || undefined} alt={user.username ? `@${user.username}` : 'usuário'} />
        <AvatarFallback>{(user.username || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">
            {user.username ? `@${user.username}` : 'usuário'}
          </span>
          {user.is_verified && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
          {(user.plan_type === "vip" || user.plan_type === "creator") && (
            <Crown className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          )}
        </div>
        {(() => {
          const meta = formatTipoCidade(user);
          if (!meta) return null;
          return (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/90 truncate mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{meta}</span>
            </div>
          );
        })()}
      </div>
      {user.is_creator && (
        <Badge variant="outline" className="text-[10px] shrink-0">Creator</Badge>
      )}
    </button>
  );
}

function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32 max-w-[60%]" />
            <Skeleton className="h-3 w-20 max-w-[40%]" />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Carregando conexões…
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-3">
      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
        <p className="text-xs text-muted-foreground mt-1 break-words">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>
      )}
    </div>
  );
}

function filterUsers(list: any[] | undefined, q: string) {
  if (!list) return [];
  const term = q.trim().toLowerCase();
  if (!term) return list;
  return list.filter((u: any) => {
    const n = (u.name || "").toLowerCase();
    const un = (u.username || "").toLowerCase();
    return n.includes(term) || un.includes(term);
  });
}

interface PaginatedListProps {
  loading: boolean;
  error: unknown;
  items: any[];
  emptyText: string;
  search: string;
  onSearchChange: (v: string) => void;
  goTo: (id: string) => void;
  onRetry?: () => void;
}

function PaginatedList({
  loading, error, items, emptyText, search, onSearchChange, goTo, onRetry,
}: PaginatedListProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Reset paginação quando muda busca ou lista
  useEffect(() => { setVisible(PAGE_SIZE); }, [search, items.length]);

  const filtered = useMemo(() => filterUsers(items, search), [items, search]);
  const slice = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nome ou @usuário"
          className="pl-8 h-9 text-sm"
        />
      </div>

      <ScrollArea className="h-[55vh] max-h-[440px] pr-2">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState
            message={(error as any)?.message || "Erro ao carregar conexões."}
            onRetry={onRetry}
          />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search.trim() ? "Nenhum resultado para sua busca." : emptyText}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              {slice.map((u: any) => (
                <UserRow key={u.id} user={u} onClick={() => goTo(u.id)} />
              ))}
            </div>
            {hasMore && (
              <div className="pt-3 pb-1 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="gap-1.5"
                >
                  <Loader2 className="h-3.5 w-3.5" />
                  Carregar mais ({filtered.length - visible} restantes)
                </Button>
              </div>
            )}
            {!hasMore && filtered.length > PAGE_SIZE && (
              <p className="text-[11px] text-muted-foreground text-center pt-2">
                Fim da lista — {filtered.length} {filtered.length === 1 ? "perfil" : "perfis"}
              </p>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}

export function FollowRelationshipModal({
  open,
  onOpenChange,
  profileId,
  profileName,
  defaultTab = "followers",
}: FollowRelationshipModalProps) {
  const [tab, setTab] = useState<"followers" | "following" | "common">(defaultTab);
  const [searchFollowers, setSearchFollowers] = useState("");
  const [searchFollowing, setSearchFollowing] = useState("");
  const [searchCommon, setSearchCommon] = useState("");
  const navigate = useNavigate();
  const { profile: myProfile } = useProfile();
  const myId = myProfile?.id;
  const isOwnProfile = !!myId && !!profileId && myId === profileId;

  useEffect(() => { if (open) setTab(defaultTab); }, [open, defaultTab]);

  const {
    data: followers, isLoading: loadingFollowers, error: errFollowers, refetch: refetchFollowers,
  } = useFollowers(open ? profileId : undefined);
  const {
    data: following, isLoading: loadingFollowing, error: errFollowing, refetch: refetchFollowing,
  } = useFollowing(open ? profileId : undefined);

  const {
    data: myFollowers, isLoading: loadingMyFollowers, error: errMyFollowers,
  } = useFollowers(open && !isOwnProfile ? myId : undefined);
  const {
    data: myFollowing, isLoading: loadingMyFollowing, error: errMyFollowing,
  } = useFollowing(open && !isOwnProfile ? myId : undefined);

  const commonFollowers = useMemo(() => {
    if (!followers || !myFollowers) return [];
    const mine = new Set(myFollowers.map((u: any) => u.id));
    return followers.filter((u: any) => mine.has(u.id));
  }, [followers, myFollowers]);

  const commonFollowing = useMemo(() => {
    if (!following || !myFollowing) return [];
    const mine = new Set(myFollowing.map((u: any) => u.id));
    return following.filter((u: any) => mine.has(u.id));
  }, [following, myFollowing]);

  const commonList = useMemo(() => {
    // Dedup mantendo prioridade: seguidor em comum > seguindo em comum
    const map = new Map<string, any>();
    for (const u of commonFollowers) map.set(u.id, u);
    for (const u of commonFollowing) if (!map.has(u.id)) map.set(u.id, u);
    return Array.from(map.values());
  }, [commonFollowers, commonFollowing]);

  const loadingCommon = loadingMyFollowers || loadingMyFollowing || loadingFollowers || loadingFollowing;
  const errCommon = errMyFollowers || errMyFollowing || errFollowers || errFollowing;

  const goTo = (id: string) => {
    onOpenChange(false);
    navigate(`/creator/${id}`);
  };

  const isRefreshing =
    loadingFollowers || loadingFollowing || loadingMyFollowers || loadingMyFollowing;

  const handleRefresh = () => {
    refetchFollowers();
    refetchFollowing();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md max-h-[92vh] overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-8">
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1">
              Conexões {profileName ? `de ${profileName}` : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Atualizar lista"
              aria-label="Atualizar lista"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className={isOwnProfile ? "grid w-full grid-cols-2" : "grid w-full grid-cols-3"}>
            <TabsTrigger value="followers" className="text-xs sm:text-sm">
              Seguidores{followers ? ` (${followers.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="following" className="text-xs sm:text-sm">
              Seguindo{following ? ` (${following.length})` : ""}
            </TabsTrigger>
            {!isOwnProfile && (
              <TabsTrigger value="common" className="text-xs sm:text-sm">
                Em comum{!loadingCommon ? ` (${commonList.length})` : ""}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="followers" className="mt-3">
            <PaginatedList
              loading={loadingFollowers}
              error={errFollowers}
              items={followers || []}
              emptyText="Nenhum seguidor ainda."
              search={searchFollowers}
              onSearchChange={setSearchFollowers}
              goTo={goTo}
              onRetry={() => refetchFollowers()}
            />
          </TabsContent>

          <TabsContent value="following" className="mt-3">
            <PaginatedList
              loading={loadingFollowing}
              error={errFollowing}
              items={following || []}
              emptyText="Não segue ninguém ainda."
              search={searchFollowing}
              onSearchChange={setSearchFollowing}
              goTo={goTo}
              onRetry={() => refetchFollowing()}
            />
          </TabsContent>

          {!isOwnProfile && (
            <TabsContent value="common" className="mt-3">
              <PaginatedList
                loading={loadingCommon}
                error={errCommon}
                items={commonList}
                emptyText="Vocês ainda não têm conexões em comum."
                search={searchCommon}
                onSearchChange={setSearchCommon}
                goTo={goTo}
                onRetry={() => { refetchFollowers(); refetchFollowing(); }}
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
