import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { selectFollowers, selectFollowing, deleteFollow } from "@/lib/followsApi";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trash2, Ban, Snowflake, Loader2, UserX, Search, X, MessageCircle, MapPin } from "lucide-react";
import { formatTipoCidade } from "@/lib/profileFormat";
import { useChat } from "@/hooks/useChat";
import { IconButtonTip } from "@/components/ui/icon-button-tip";


type ModalMode = "followers" | "following";

interface FollowUser {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  plan_type: string | null;
  is_verified: boolean;
  follow_date: string;
  gender?: string | null;
  profile_type?: string | null;
  address_city?: string | null;
  address_state?: string | null;
}

interface ConfirmAction {
  type: "remove" | "block" | "freeze";
  user: FollowUser;
  alsoBlock?: boolean;
}

interface FollowersFollowingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ModalMode;
}

function dedupeUsersById(list: FollowUser[]) {
  const seen = new Set<string>();

  return list.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

export function FollowersFollowingModal({ open, onOpenChange, mode }: FollowersFollowingModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { getOrCreateConversation } = useChat();

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openingChat, setOpeningChat] = useState<string | null>(null);

  const handleOpenChat = async (u: FollowUser) => {
    if (!user || openingChat) return;
    setOpeningChat(u.id);
    try {
      // Resolve user_id (auth) from profile id
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", u.id)
        .maybeSingle();
      const targetUserId = (prof as any)?.user_id;
      if (!targetUserId) {
        toast.error("Não foi possível abrir a conversa");
        return;
      }
      const { conversation, error } = await getOrCreateConversation(targetUserId);
      if (error || !conversation?.id) {
        toast.error("Erro ao iniciar conversa");
        return;
      }
      onOpenChange(false);
      navigate(`/messages?conversation=${conversation.id}`);
    } catch (e) {
      toast.error("Erro ao abrir conversa");
    } finally {
      setOpeningChat(null);
    }
  };

  useEffect(() => {
    if (open && user) {
      fetchUsers();
    }
  }, [open, user, mode]);

  const fetchUsers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // First get the profile ID (follows table uses profiles.id, not auth user.id)
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profileData) throw new Error("Perfil não encontrado");
      const fetchedProfileId = profileData.id;
      setMyProfileId(fetchedProfileId);

      const { data, error } = mode === "followers"
        ? await selectFollowers(fetchedProfileId)
        : await selectFollowing(fetchedProfileId);

      if (error) throw error;

      const relatedProfileIds = Array.from(new Set(
        (data || []).map((row: any) => mode === "followers" ? row.follower_id : row.following_id).filter(Boolean)
      ));

      if (relatedProfileIds.length === 0) {
        setUsers([]);
        queryClient.setQueryData(['my-profile-stats', fetchedProfileId], (prev: any) => ({
          totalPosts: prev?.totalPosts ?? 0,
          totalViews: prev?.totalViews ?? 0,
          totalFollowers: mode === 'followers' ? 0 : (prev?.totalFollowers ?? 0),
          totalFollowing: mode === 'following' ? 0 : (prev?.totalFollowing ?? 0),
        }));
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url, plan_type, is_verified, gender, profile_type, address_city, address_state")
        .in("id", relatedProfileIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));

      const finalUsers = dedupeUsersById(
        (data || []).map((f: any) => {
          const relationProfileId = mode === "followers" ? f.follower_id : f.following_id;
          const profile = profileMap.get(relationProfileId);
          if (!profile) return null;

          return {
            id: profile.id,
            name: profile.username ? `@${profile.username}` : 'Misterioso(a)',
            username: profile.username || "",
            avatar_url: profile.avatar_url,
            plan_type: profile.plan_type,
            is_verified: profile.is_verified,
            follow_date: f.created_at,
            gender: (profile as any).gender ?? null,
            profile_type: (profile as any).profile_type ?? null,
            address_city: (profile as any).address_city ?? null,
            address_state: (profile as any).address_state ?? null,
          };
        }).filter(Boolean) as FollowUser[]
      );

      setUsers(finalUsers);
      queryClient.setQueryData(['my-profile-stats', fetchedProfileId], (prev: any) => ({
        totalPosts: prev?.totalPosts ?? 0,
        totalViews: prev?.totalViews ?? 0,
        totalFollowers: mode === 'followers' ? finalUsers.length : (prev?.totalFollowers ?? 0),
        totalFollowing: mode === 'following' ? finalUsers.length : (prev?.totalFollowing ?? 0),
      }));
    } catch (err) {
      console.error("Error fetching users:", err);
      toast.error("Erro ao carregar lista");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirmAction || !user || !myProfileId) return;
    setProcessing(true);
    try {
      const sourceProfileId = mode === "followers" ? confirmAction.user.id : myProfileId;
      const targetProfileId = mode === "followers" ? myProfileId : confirmAction.user.id;

      const { error } = await deleteFollow(sourceProfileId, targetProfileId);

      if (error) throw error;

      // Also block if requested (using profile IDs)
      if (alsoBlock) {
        await supabase.from("blocked_contacts").insert({
          user_id: myProfileId,
          blocked_user_id: confirmAction.user.id,
          block_type: "blocked",
        });
      }

      setUsers((prev) => prev.filter((u) => u.id !== confirmAction.user.id));
      queryClient.invalidateQueries({ queryKey: ['my-profile-stats'] });
      toast.success(
        alsoBlock
          ? `@${confirmAction.user.username || "usuario"} removido(a) e bloqueado(a)`
          : `@${confirmAction.user.username || "usuario"} removido(a)`
      );

    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover usuário");
    } finally {
      setProcessing(false);
      setConfirmAction(null);
      setAlsoBlock(false);
    }
  };

  const handleBlock = async () => {
    if (!confirmAction || !user || !myProfileId) return;
    setProcessing(true);
    try {
      const { error } = await supabase.from("blocked_contacts").insert({
        user_id: myProfileId,
        blocked_user_id: confirmAction.user.id,
        block_type: "blocked",
      });

      if (error) throw error;

      toast.success(`@${confirmAction.user.username || "usuario"} bloqueado(a). Não poderá enviar mensagens, comentar ou ver seu perfil.`);
      setUsers((prev) => prev.filter((u) => u.id !== confirmAction.user.id));
      queryClient.invalidateQueries({ queryKey: ['my-profile-stats'] });

    } catch (err) {
      console.error(err);
      toast.error("Erro ao bloquear usuário");
    } finally {
      setProcessing(false);
      setConfirmAction(null);
    }
  };

  const handleFreeze = async () => {
    if (!confirmAction || !user || !myProfileId) return;
    setProcessing(true);
    try {
      const { error } = await supabase.from("blocked_contacts").upsert(
        {
          user_id: myProfileId,
          blocked_user_id: confirmAction.user.id,
          block_type: "blocked",
        },
        { onConflict: "user_id,blocked_user_id" }
      );

      if (error) throw error;

      toast.success(`@${confirmAction.user.username || "usuario"} congelado(a). Seus posts e perfil ficarão invisíveis para essa pessoa.`);
      setUsers((prev) => prev.filter((u) => u.id !== confirmAction.user.id));
      queryClient.invalidateQueries({ queryKey: ['my-profile-stats'] });

    } catch (err) {
      console.error(err);
      toast.error("Erro ao congelar usuário");
    } finally {
      setProcessing(false);
      setConfirmAction(null);
    }
  };

  const executeAction = () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case "remove":
        handleRemove();
        break;
      case "block":
        handleBlock();
        break;
      case "freeze":
        handleFreeze();
        break;
    }
  };

  const getConfirmTitle = () => {
    if (!confirmAction) return "";
    switch (confirmAction.type) {
      case "remove":
        return "Remover seguidor";
      case "block":
        return "Bloquear usuário";
      case "freeze":
        return "Congelar usuário";
    }
  };

  const getConfirmDescription = () => {
    if (!confirmAction) return "";
    const name = `@${confirmAction.user.username || "usuario"}`;
    switch (confirmAction.type) {
      case "remove":
        return `Deseja remover ${name} da sua lista? Esta ação pode ser desfeita se a pessoa seguir novamente.`;
      case "block":
        return `Ao bloquear ${name}, esta pessoa não poderá enviar mensagens, fazer comentários ou visualizar seu perfil e mídias.`;
      case "freeze":
        return `Ao congelar ${name}, esta pessoa não verá mais seus posts, não conseguirá acessar seu perfil e seu conteúdo não aparecerá no feed dela. Você continua vendo o perfil dela normalmente. Reversível em Configurações › Bloqueados.`;
    }
  };

  const handleUserClick = (userId: string) => {
    onOpenChange(false);
    navigate(`/creator/${userId}`);
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.replace(/^@/, "").toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md max-h-[88dvh] p-0 flex flex-col rounded-2xl overflow-hidden gap-0 [&>button]:hidden">
          {/* Header fixo */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">
                {mode === "followers" ? "Seguidores" : "Seguindo"}
              </h2>
              {users.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {users.length}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Search input fixo — sempre visível */}
          <div className="px-4 py-2 shrink-0 border-b border-border/20">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou @username..."
                className="w-full h-9 pl-9 pr-8 rounded-lg bg-muted/50 border border-border/50 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista com scroll vertical invisível */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UserX className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">
                  {mode === "followers" ? "Nenhum seguidor ainda" : "Você não segue ninguém ainda"}
                </p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Nenhum resultado para "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/30 hover:border-primary/30 transition-colors"
                  >
                    {/* Avatar + Info - clickable */}
                    <button
                      onClick={() => handleUserClick(u.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={buildSupabaseImageThumb(u.avatar_url, { width: 96, quality: 70 }) || u.avatar_url || undefined} alt={`@${u.username || "usuario"}`} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {(u.username?.[0] || "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm truncate">@{u.username || "usuario"}</span>
                          {u.plan_type === "vip" && (
                            <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] text-[9px] px-1 py-0 h-3.5 border-[hsl(45,93%,47%)]/40">VIP</Badge>
                          )}
                          {u.plan_type === "premium" && (
                            <Badge className="bg-primary/20 text-primary text-[9px] px-1 py-0 h-3.5 border-primary/40">PREMIUM</Badge>
                          )}
                          {(!u.plan_type || u.plan_type === "free") && (
                            <Badge variant="outline" className="text-muted-foreground text-[9px] px-1 py-0 h-3.5">FREE</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {format(new Date(u.follow_date), "dd MMM yyyy", { locale: ptBR })}
                        </p>
                        {(() => {
                          const meta = formatTipoCidade(u);
                          if (!meta) return null;
                          return (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/90 truncate mt-0.5">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{meta}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </button>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButtonTip label="Enviar mensagem — abre o chat direto com este usuário">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          aria-label="Enviar mensagem"
                          onClick={() => handleOpenChat(u)}
                          disabled={openingChat === u.id}
                        >
                          {openingChat === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MessageCircle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </IconButtonTip>
                      <IconButtonTip label="Remover — tira da sua lista de seguindo (pode ser desfeito)">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Remover"
                          onClick={() => setConfirmAction({ type: "remove", user: u })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </IconButtonTip>
                      <IconButtonTip label="Bloquear — impede mensagens, comentários e visualização do seu perfil e mídias">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Bloquear"
                          onClick={() => setConfirmAction({ type: "block", user: u })}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </IconButtonTip>
                      <IconButtonTip side="left" label="Congelar — torna você invisível para essa pessoa: ela não vê seus posts nem seu perfil. Reversível.">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-[hsl(200,80%,50%)] hover:bg-[hsl(200,80%,50%)]/10"
                          aria-label="Congelar"
                          onClick={() => setConfirmAction({ type: "freeze", user: u })}
                        >
                          <Snowflake className="h-3.5 w-3.5" />
                        </Button>
                      </IconButtonTip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getConfirmTitle()}</AlertDialogTitle>
            <AlertDialogDescription>{getConfirmDescription()}</AlertDialogDescription>
          </AlertDialogHeader>

          {/* Show "also block" checkbox for remove action */}
          {confirmAction?.type === "remove" && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-muted-foreground">Também bloquear este usuário</span>
            </label>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={processing}
              className={
                confirmAction?.type === "freeze"
                  ? "bg-[hsl(200,80%,50%)] hover:bg-[hsl(200,80%,45%)]"
                  : "bg-destructive hover:bg-destructive/90"
              }
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
