import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  FileText, 
  FlaskConical, 
  MoreHorizontal, 
  Eye, 
  EyeOff, 
  Trash2,
  Heart,
  MessageCircle,
  Lock,
  Globe,
  Users,
  Crown,
  Image as ImageIcon,
  Zap
} from "lucide-react";
import { useAdminPosts, useAdminPostStats, useHidePost, useUnhidePost, useDeletePost, AdminPost } from "@/hooks/useAdminPosts";
import { AdminPostFilters, PostFilterState } from "@/components/admin/AdminPostFilters";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAudit } from "@/hooks/useAudit";

type HideReason = 'inappropriate' | 'spam' | 'harassment' | 'copyright' | 'other';

const hideReasons: { value: HideReason; label: string }[] = [
  { value: 'inappropriate', label: 'Conteúdo inapropriado' },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Assédio' },
  { value: 'copyright', label: 'Violação de direitos autorais' },
  { value: 'other', label: 'Outro' },
];

function PostActions({ post, onHide, onUnhide, onDelete }: { 
  post: AdminPost; 
  onHide: () => void; 
  onUnhide: () => void; 
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais opções">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem><Eye className="h-4 w-4 mr-2" /> Visualizar</DropdownMenuItem>
        <DropdownMenuSeparator />
        {post.is_hidden ? (
          <DropdownMenuItem onClick={onUnhide}><Eye className="h-4 w-4 mr-2" /> Reativar</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onHide} className="text-destructive focus:text-destructive">
            <EyeOff className="h-4 w-4 mr-2" /> Ocultar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminPostsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSeed, setShowSeed] = useState(true);
  const [filters, setFilters] = useState<PostFilterState>({
    privacyFilter: 'all',
    statusFilter: 'all',
    sortBy: 'recent'
  });
  const [hideModal, setHideModal] = useState<{ open: boolean; post: AdminPost | null }>({
    open: false,
    post: null
  });
  const [hideReason, setHideReason] = useState<HideReason>('inappropriate');

  const queryClient = useQueryClient();
  const { logAction } = useAudit();
  const hidePost = useHidePost();
  const unhidePost = useUnhidePost();
  const deletePost = useDeletePost();

  const { data: posts, isLoading } = useAdminPosts({
    showSeed,
    privacyFilter: filters.privacyFilter,
    statusFilter: filters.statusFilter,
    searchQuery,
    sortBy: filters.sortBy
  });

  const { data: stats } = useAdminPostStats();

  const handleHidePost = async () => {
    if (!hideModal.post) return;
    try {
      await hidePost.mutateAsync({ 
        postId: hideModal.post.id, 
        reason: hideReasons.find(r => r.value === hideReason)?.label || hideReason 
      });
      await logAction('HIDE_POST' as any, {
        targetResource: 'posts',
        targetId: hideModal.post.id,
        details: {
          reason: hideReason,
          author: hideModal.post.author?.name
        }
      });
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] });
      toast.success('Post ocultado com sucesso');
      setHideModal({ open: false, post: null });
    } catch (error) {
      toast.error('Erro ao ocultar post');
    }
  };

  const handleUnhidePost = async (post: AdminPost) => {
    try {
      await unhidePost.mutateAsync(post.id);
      await logAction('UNHIDE_POST' as any, {
        targetResource: 'posts',
        targetId: post.id,
        details: {
          author: post.author?.name
        }
      });
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-post-stats'] });
      toast.success('Post reativado com sucesso');
    } catch (error) {
      toast.error('Erro ao reativar post');
    }
  };

  const getPrivacyBadge = (level: string) => {
    switch (level) {
      case 'public':
        return <Badge variant="outline" className="gap-1 text-green-500 border-green-500/30"><Globe className="h-3 w-3" /> Público</Badge>;
      case 'friends':
        return <Badge variant="outline" className="gap-1 text-blue-500 border-blue-500/30"><Users className="h-3 w-3" /> Amigos</Badge>;
      case 'vip':
        return <Badge variant="outline" className="gap-1 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30"><Crown className="h-3 w-3" /> VIP</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  const getStatusBadge = (post: AdminPost) => {
    if (post.is_hidden) {
      return <Badge variant="destructive" className="gap-1"><EyeOff className="h-3 w-3" /> Oculto</Badge>;
    }
    return <Badge className="gap-1 bg-green-500/20 text-green-500 border-green-500/30"><Eye className="h-3 w-3" /> Ativo</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Gestão de Posts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie e modere o conteúdo da plataforma
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-foreground">{stats?.total || 0}</div>
            <div className="text-sm text-muted-foreground">Total de Posts</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">{stats?.real?.count || 0}</div>
            <div className="text-sm text-muted-foreground">Posts Reais</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-[hsl(280,100%,70%)]">{stats?.seed?.count || 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <FlaskConical className="h-3 w-3" /> Posts Pioneiros
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{stats?.hidden || 0}</div>
            <div className="text-sm text-muted-foreground">Posts Ocultos</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Seed Toggle */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por conteúdo ou autor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background border-border/50"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(280,100%,70%)]/10 border border-[hsl(280,100%,70%)]/30">
              <FlaskConical className="h-4 w-4 text-[hsl(280,100%,70%)]" />
              <Label htmlFor="show-seed" className="text-sm text-[hsl(280,100%,70%)] cursor-pointer">
                Posts Pioneiros
              </Label>
              <Switch
                id="show-seed"
                checked={showSeed}
                onCheckedChange={setShowSeed}
              />
            </div>
          </div>

          {/* Advanced Filters */}
          <AdminPostFilters filters={filters} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      {/* Posts - Desktop Table / Mobile Cards */}
      <Card className="bg-card/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (posts?.posts?.length || 0) === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Nenhum post encontrado
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Autor</TableHead>
                      <TableHead>Conteúdo</TableHead>
                      <TableHead>Privacidade</TableHead>
                      <TableHead className="text-center">Engajamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts?.posts?.map((post) => (
                      <TableRow key={post.id} className="border-border/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={post.author?.avatar_url || undefined} />
                              <AvatarFallback className="bg-muted text-xs">
                                {post.author?.name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm">{post.author?.name || 'Desconhecido'}</span>
                                {post.author?.is_seed && <FlaskConical className="h-3 w-3 text-[hsl(280,100%,70%)]" />}
                              </div>
                              <span className="text-xs text-muted-foreground">@{post.author?.username || 'sem_usuario'}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 max-w-[200px]">
                            {post.media_url && <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                            <span className="text-sm truncate">{post.content_text || '[Mídia]'}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getPrivacyBadge(post.privacy_level)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {post.likes_count}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.comments_count}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(post)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <PostActions post={post} onHide={() => setHideModal({ open: true, post })} onUnhide={() => handleUnhidePost(post)} onDelete={() => deletePost.mutate(post.id)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-border/50">
                {posts?.posts?.map((post) => (
                  <div key={post.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={post.author?.avatar_url || undefined} />
                          <AvatarFallback className="bg-muted text-xs">{post.author?.name?.charAt(0) || '?'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium text-sm">{post.author?.name || 'Desconhecido'}</span>
                          <span className="text-xs text-muted-foreground block">
                            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <PostActions post={post} onHide={() => setHideModal({ open: true, post })} onUnhide={() => handleUnhidePost(post)} onDelete={() => deletePost.mutate(post.id)} />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{post.content_text || '[Mídia]'}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {getStatusBadge(post)}
                      {getPrivacyBadge(post.privacy_level)}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="h-3 w-3" /> {post.likes_count}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="h-3 w-3" /> {post.comments_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Hide Post Modal */}
      <Dialog open={hideModal.open} onOpenChange={(open) => setHideModal({ open, post: hideModal.post })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ocultar Post</DialogTitle>
            <DialogDescription>
              Este post ficará invisível para todos os usuários. Escolha o motivo:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Avatar className="h-10 w-10">
                <AvatarImage src={hideModal.post?.author?.avatar_url || undefined} />
                <AvatarFallback>{hideModal.post?.author?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{hideModal.post?.author?.name}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                  {hideModal.post?.content_text || '[Mídia]'}
                </p>
              </div>
            </div>
            <Select value={hideReason} onValueChange={(v) => setHideReason(v as HideReason)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {hideReasons.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHideModal({ open: false, post: null })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleHidePost}>
              Ocultar Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
