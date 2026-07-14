import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  Ban,
  Trash2,
  Search,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  FileText,
  Flag,
  Bot,
  EyeOff,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

interface UserRow {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  plan_type: string;
  account_status: string | null;
  is_shadowbanned: boolean | null;
  created_at: string;
}

interface PostRow {
  id: string;
  user_id: string;
  content_text: string | null;
  media_url: string | null;
  is_hidden: boolean | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles: { name: string; username: string | null; is_seed?: boolean } | null;
}

interface ReportRow {
  id: string;
  category: string;
  status: string;
  priority_level: string;
  description: string | null;
  created_at: string;
  reporter_id: string;
  reported_user_id: string | null;
  post_id: string | null;
  reporter_profile: { name: string; username: string | null } | null;
  reported_profile: { name: string; username: string | null } | null;
}

function useModUsers(page: number, search: string) {
  return useQuery({
    queryKey: ["mod-users", page, search],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, user_id, name, username, avatar_url, plan_type, account_status, is_shadowbanned, created_at", { count: "exact" })
        .or("is_seed.eq.false,is_seed.is.null")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,username.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { users: (data || []) as UserRow[], total: count || 0 };
    },
    staleTime: 10000,
  });
}

function useModPosts(page: number, search: string, showBotsOnly: boolean) {
  return useQuery({
    queryKey: ["mod-posts", page, search, showBotsOnly],
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("id, user_id, content_text, media_url, is_hidden, likes_count, comments_count, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.ilike("content_text", `%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rawPosts = (data || []) as any[];
      const userIds = [...new Set(rawPosts.map((p) => p.user_id).filter(Boolean))];
      let profilesData: any[] = [];
      if (userIds.length) {
        const idList = userIds.join(',');
        const { data: pd } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, name, username, is_seed')
          .or(`id.in.(${idList}),user_id.in.(${idList})`);
        profilesData = pd || [];
      }
      const profileMap = new Map<string, any>();
      profilesData.forEach((p: any) => {
        if (p.id) profileMap.set(p.id, p);
        if (p.user_id) profileMap.set(p.user_id, p);
      });

      let posts = rawPosts.map((p) => ({ ...p, profiles: profileMap.get(p.user_id) || null })) as unknown as PostRow[];
      if (showBotsOnly) {
        posts = posts.filter((p: any) => p.profiles?.is_seed === true);
      }
      return { posts, total: count || 0 };
    },
    staleTime: 10000,
  });
}

function useModReports(page: number) {
  return useQuery({
    queryKey: ["mod-reports", page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("content_reports")
        .select(
          "id, category, status, priority_level, description, created_at, reporter_id, reported_user_id, post_id",
          { count: "exact" }
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      return { reports: (data || []) as ReportRow[], total: count || 0 };
    },
    staleTime: 10000,
  });
}

function useModSummary() {
  return useQuery({
    queryKey: ["mod-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_moderation_summary");
      if (error) throw error;
      return data as {
        pending_reports: number;
        seed_posts_5d: number;
        banned_users: number;
        shadowbanned_users: number;
      };
    },
    staleTime: 30000,
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Assédio",
  fake_profile: "Perfil Falso",
  minor: "Menor de Idade",
  revenge_porn: "Conteúdo Não Autorizado",
  other: "Outro",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-destructive/20 text-destructive",
  medium: "bg-orange-500/20 text-orange-500",
  low: "bg-muted text-muted-foreground",
};

export default function AdminModerationPage() {
  const queryClient = useQueryClient();
  const [userPage, setUserPage] = useState(0);
  const [postPage, setPostPage] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const [userSearch, setUserSearch] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const [showBotsOnly, setShowBotsOnly] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "ban" | "unban" | "delete_post" | "hide_post" | "shadowban" | "resolve_report" | "bulk_delete_bots";
    id: string;
    name: string;
  } | null>(null);
  const [bulkDeleteDays, setBulkDeleteDays] = useState(5);

  const { data: userData, isLoading: usersLoading } = useModUsers(userPage, userSearch);
  const { data: postData, isLoading: postsLoading } = useModPosts(postPage, postSearch, showBotsOnly);
  const { data: reportData, isLoading: reportsLoading } = useModReports(reportPage);
  const { data: summary } = useModSummary();

  const banMutation = useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ account_status: ban ? "banned" : "active" })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_, { ban }) => {
      queryClient.invalidateQueries({ queryKey: ["mod-users"] });
      queryClient.invalidateQueries({ queryKey: ["mod-summary"] });
      toast({ title: ban ? "Usuário banido" : "Ban removido" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const shadowbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_shadowbanned: true })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mod-users"] });
      queryClient.invalidateQueries({ queryKey: ["mod-summary"] });
      toast({ title: "Shadow ban aplicado" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mod-posts"] });
      toast({ title: "Post deletado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const hidePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("posts").update({ is_hidden: true }).eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mod-posts"] });
      toast({ title: "Post ocultado" });
    },
  });

  const resolveReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from("content_reports")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mod-reports"] });
      queryClient.invalidateQueries({ queryKey: ["mod-summary"] });
      toast({ title: "Denúncia resolvida" });
    },
  });

  const bulkDeleteBotsMutation = useMutation({
    mutationFn: async (days: number) => {
      const { data, error } = await supabase.rpc("admin_bulk_delete_seed_posts", { days_back: days });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["mod-posts"] });
      queryClient.invalidateQueries({ queryKey: ["mod-summary"] });
      toast({ title: `${count} posts de bots removidos` });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case "ban": banMutation.mutate({ userId: confirmAction.id, ban: true }); break;
      case "unban": banMutation.mutate({ userId: confirmAction.id, ban: false }); break;
      case "shadowban": shadowbanMutation.mutate(confirmAction.id); break;
      case "delete_post": deletePostMutation.mutate(confirmAction.id); break;
      case "hide_post": hidePostMutation.mutate(confirmAction.id); break;
      case "resolve_report": resolveReportMutation.mutate(confirmAction.id); break;
      case "bulk_delete_bots": bulkDeleteBotsMutation.mutate(bulkDeleteDays); break;
    }
    setConfirmAction(null);
  };

  const userTotalPages = Math.ceil((userData?.total || 0) / PAGE_SIZE);
  const postTotalPages = Math.ceil((postData?.total || 0) / PAGE_SIZE);
  const reportTotalPages = Math.ceil((reportData?.total || 0) / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Moderação Unificada
        </h1>
        <p className="text-sm text-muted-foreground">Usuários, posts, denúncias e limpeza de bots</p>
      </div>

      {/* Summary Cards — Mobile: 2-col grid */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card className="bg-card border-destructive/30">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Denúncias pendentes</p>
            <p className="text-2xl font-bold text-destructive">{summary?.pending_reports ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Posts de bots (5d)</p>
            <p className="text-2xl font-bold text-orange-500">{summary?.seed_posts_5d ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Usuários banidos</p>
            <p className="text-2xl font-bold">{summary?.banned_users ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/40">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Shadow bans</p>
            <p className="text-2xl font-bold">{summary?.shadowbanned_users ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk bot cleanup tool */}
      <Card className="bg-destructive/5 border-destructive/20">
        <CardHeader className="p-3 pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4 text-destructive" />
            Limpeza em Massa de Bots
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground flex-1 min-w-0">
            Remove todos os posts de perfis marcados como "seed" dos últimos
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={bulkDeleteDays}
              onChange={e => setBulkDeleteDays(Number(e.target.value))}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background"
            >
              {[1, 3, 5, 7, 14, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs h-8"
              disabled={bulkDeleteBotsMutation.isPending}
              onClick={() => setConfirmAction({ type: "bulk_delete_bots", id: "", name: `posts de bots dos últimos ${bulkDeleteDays} dias` })}
            >
              {bulkDeleteBotsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Executar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reports" className="gap-1 text-xs">
            <Flag className="h-3 w-3" />
            Denúncias
            {(summary?.pending_reports ?? 0) > 0 && (
              <Badge className="bg-destructive text-destructive-foreground text-[10px] h-4 min-w-4 p-0 flex items-center justify-center ml-1">
                {summary?.pending_reports}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1 text-xs">
            <Users className="h-3 w-3" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-1 text-xs">
            <FileText className="h-3 w-3" />
            Posts
          </TabsTrigger>
        </TabsList>

        {/* REPORTS TAB */}
        <TabsContent value="reports" className="space-y-3">
          {reportsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {reportData?.reports.length === 0 && (
                <div className="text-center py-10">
                  <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma denúncia pendente 🎉</p>
                </div>
              )}
              {reportData?.reports.map((report) => (
                <Card key={report.id} className="bg-card border-border/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {CATEGORY_LABELS[report.category] || report.category}
                        </Badge>
                        <Badge className={`text-[10px] ${PRIORITY_COLORS[report.priority_level] || PRIORITY_COLORS.low}`}>
                          {report.priority_level}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(report.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {report.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{report.description}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => setConfirmAction({ type: "resolve_report", id: report.id, name: "esta denúncia" })}
                      >
                        <CheckCircle className="h-3 w-3" />
                        Resolver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {reportTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Pág {reportPage + 1}/{reportTotalPages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={reportPage === 0} onClick={() => setReportPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={reportPage >= reportTotalPages - 1} onClick={() => setReportPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou username..."
              value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); setUserPage(0); }}
              className="pl-10"
            />
          </div>
          {usersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {userData?.users.map((user) => (
                <Card key={user.id} className="bg-card border-border/50">
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {user.avatar_url ? (
                          <img loading="lazy" decoding="async" src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">@{user.username || "sem-username"}</p>
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{user.plan_type || "free"}</Badge>
                        {user.account_status === "banned" && <Badge variant="destructive" className="text-[10px]">Banido</Badge>}
                        {user.is_shadowbanned && <Badge className="bg-orange-500/20 text-orange-500 text-[10px]">Shadow</Badge>}
                      </div>
                    </div>
                    {/* Actions — column on mobile */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {user.account_status === "banned" ? (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirmAction({ type: "unban", id: user.id, name: user.name })}>
                          Desbanir
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="destructive" className="h-7 px-2 text-xs gap-1" onClick={() => setConfirmAction({ type: "ban", id: user.id, name: user.name })}>
                            <Ban className="h-3 w-3" />Banir
                          </Button>
                          {!user.is_shadowbanned && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setConfirmAction({ type: "shadowban", id: user.id, name: user.name })}>
                              <EyeOff className="h-3 w-3" />Shadow
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {userData?.users.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum usuário encontrado</p>
              )}
            </div>
          )}
          {userTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{userData?.total || 0} usuários • Pág {userPage + 1}/{userTotalPages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={userPage === 0} onClick={() => setUserPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={userPage >= userTotalPages - 1} onClick={() => setUserPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* POSTS TAB */}
        <TabsContent value="posts" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por conteúdo..."
                value={postSearch}
                onChange={(e) => { setPostSearch(e.target.value); setPostPage(0); }}
                className="pl-10"
              />
            </div>
            <Button
              size="sm"
              variant={showBotsOnly ? "default" : "outline"}
              className="gap-1 text-xs shrink-0"
              onClick={() => { setShowBotsOnly(b => !b); setPostPage(0); }}
            >
              <Bot className="h-3 w-3" />
              {showBotsOnly ? "Só bots" : "Todos"}
            </Button>
          </div>
          {postsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {postData?.posts.map((post) => (
                <Card key={post.id} className={`bg-card border-border/50 ${post.is_hidden ? 'opacity-50' : ''}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {post.profiles?.name || "Desconhecido"} • @{post.profiles?.username || "?"}
                        </p>
                        {post.profiles?.is_seed && (
                          <Badge className="bg-orange-500/20 text-orange-500 text-[10px]">Bot</Badge>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {post.is_hidden && <Badge variant="outline" className="text-[10px]">Oculto</Badge>}
                      </div>
                    </div>
                    <p className="text-sm line-clamp-2">{post.content_text || "(sem texto)"}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">❤️ {post.likes_count} • 💬 {post.comments_count}</p>
                      <div className="flex gap-1">
                        {!post.is_hidden && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setConfirmAction({ type: "hide_post", id: post.id, name: "este post" })}>
                            <Eye className="h-3 w-3" />Ocultar
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs gap-1" onClick={() => setConfirmAction({ type: "delete_post", id: post.id, name: "este post" })}>
                          <Trash2 className="h-3 w-3" />Deletar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {postData?.posts.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum post encontrado</p>
              )}
            </div>
          )}
          {postTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{postData?.total || 0} posts • Pág {postPage + 1}/{postTotalPages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={postPage === 0} onClick={() => setPostPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={postPage >= postTotalPages - 1} onClick={() => setPostPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Unified Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Ação
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "ban" && `Tem certeza que deseja banir "${confirmAction.name}"?`}
              {confirmAction?.type === "unban" && `Deseja remover o ban de "${confirmAction.name}"?`}
              {confirmAction?.type === "shadowban" && `Aplicar shadow ban em "${confirmAction.name}"? O usuário não saberá que está oculto.`}
              {confirmAction?.type === "delete_post" && "Deletar este post permanentemente?"}
              {confirmAction?.type === "hide_post" && "Ocultar este post? Ele não será mais visível publicamente."}
              {confirmAction?.type === "resolve_report" && "Marcar esta denúncia como resolvida?"}
              {confirmAction?.type === "bulk_delete_bots" && `Deletar TODOS os ${confirmAction.name}? Esta ação é irreversível.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
