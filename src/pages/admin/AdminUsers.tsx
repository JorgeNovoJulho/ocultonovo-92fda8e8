import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { 
  Search, 
  MoreHorizontal, 
  Ban, 
  CheckCircle, 
  Eye, 
  KeyRound,
  Filter,
  UserCheck,
  UserX,
  FlaskConical,
  Users,
  Shield,
  Snowflake,
  Loader2,
  UserCog,
  Mail,
  Link2,
  Copy,
  Crown,
  FileUser,
  RefreshCw,
  Pause,
  Play,
  ArrowUpDown,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  useAdminUsers, 
  useAdminUserStats, 
  useBanUser, 
  useUnbanUser, 
  useVerifyUser,
  type AdminUser 
} from "@/hooks/useAdminUsers";
import { useOnlineUserIds } from "@/hooks/useOnlineUserIds";
import { lazyAdminModal } from "@/components/admin/LazyAdminModal";

// Modais pesados — carregados sob demanda quando o admin abre cada um.
// Reduz o JS inicial do AdminUsers e evita travamentos em celulares fracos.
const UserDisciplineModal = lazyAdminModal(() =>
  import("@/components/admin/UserDisciplineModal").then((m) => ({ default: m.UserDisciplineModal }))
);
const TestProfilesModal = lazyAdminModal(() =>
  import("@/components/admin/TestProfilesModal").then((m) => ({ default: m.TestProfilesModal }))
);
const UserSignupDataModal = lazyAdminModal(() =>
  import("@/components/admin/UserSignupDataModal").then((m) => ({ default: m.UserSignupDataModal }))
);
import { useGenerateTestProfiles } from "@/hooks/useTestProfiles";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useFreezeUser, useUnfreezeUser } from "@/hooks/useDiscipline";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";
import { Textarea } from "@/components/ui/textarea";

type BanReason = 'violations' | 'spam' | 'harassment' | 'fraud';
type FreezeReason = 'violations' | 'spam' | 'harassment' | 'inappropriate';

export default function AdminUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showSeedProfiles, setShowSeedProfiles] = useState(false);
  const [optimisticUsers, setOptimisticUsers] = useState<Record<string, Partial<AdminUser>>>({});
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [isApprovingVerification, setIsApprovingVerification] = useState(false);
  const [isDocumentImageLoading, setIsDocumentImageLoading] = useState(false);
  
  const [showBanModal, setShowBanModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState<BanReason>('violations');
  const [showDisciplineModal, setShowDisciplineModal] = useState(false);
  const [disciplineUser, setDisciplineUser] = useState<AdminUser | null>(null);
  const [showTestProfilesModal, setShowTestProfilesModal] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [signupDataUserId, setSignupDataUserId] = useState<string | null>(null);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [freezeReason, setFreezeReason] = useState<FreezeReason>('violations');
  const [freezeDays, setFreezeDays] = useState(7);
  const [freezeCustomReason, setFreezeCustomReason] = useState('');
  const [userInfoData, setUserInfoData] = useState<{ email: string; name: string; avatar_url: string | null } | null>(null);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  // Hook para gerar perfis de teste
  const { 
    generateTestProfiles, 
    isGenerating, 
    credentials, 
    clearCredentials 
  } = useGenerateTestProfiles();

  // Use real data from Supabase
  const { data: users = [], isLoading, error: usersError, refetch } = useAdminUsers({
    showSeed: showSeedProfiles,
    statusFilter,
    roleFilter,
    searchQuery,
  });
  // Controles do indicador Online (intervalo + pausa)
  const [onlineIntervalMs, setOnlineIntervalMs] = useState<number>(30_000);
  const [onlinePaused, setOnlinePaused] = useState(false);
  const [prioritizeOnline, setPrioritizeOnline] = useState(true);
  const [sortMode, setSortMode] = useState<'recent' | 'logins_desc' | 'logins_asc'>('recent');


  const {
    data: onlineData,
    refetch: refetchOnline,
    isFetching: isFetchingOnline,
    dataUpdatedAt: onlineUpdatedAt,
  } = useOnlineUserIds({ intervalMs: onlinePaused ? false : onlineIntervalMs });
  const onlineIds = onlineData?.ids;
  const onlineLastSeen = onlineData?.lastSeenById;
  const isUserOnline = (u: any) => !!onlineIds && onlineIds.has(u.id);
  const formatLastSeen = (iso?: string | null) => {
    if (!iso) return 'Sem registro de último acesso';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return 'Sem registro de último acesso'; }
  };

  const MASTER_EMAIL = 'oculto_master@gmail.com';
  const mergedUsers = useMemo(() => {
    let list = users.map((user) => ({ ...user, ...(optimisticUsers[user.id] || {}) }));
    if (sortMode === 'logins_desc') {
      list = [...list].sort((a, b) => (b.login_count ?? 0) - (a.login_count ?? 0));
    } else if (sortMode === 'logins_asc') {
      list = [...list].sort((a, b) => (a.login_count ?? 0) - (b.login_count ?? 0));
    }
    if (!prioritizeOnline || !onlineIds || onlineIds.size === 0) return list;
    return [...list].sort((a, b) => {
      const ao = onlineIds.has(a.id) ? 1 : 0;
      const bo = onlineIds.has(b.id) ? 1 : 0;
      return bo - ao; // online primeiro, mantém ordem relativa
    });
  }, [users, optimisticUsers, onlineIds, prioritizeOnline, sortMode]);


  // Pagination state
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(mergedUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = mergedUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset page when filters change
  const handleSearchChange = (value: string) => { setSearchQuery(value); setCurrentPage(1); };
  const handleStatusChange = (value: string) => { setStatusFilter(value); setCurrentPage(1); };
  const handleRoleChange = (value: string) => { setRoleFilter(value); setCurrentPage(1); };

  
  const handleToggleVip = async (user: AdminUser) => {
    const previousPlan = user.plan_type;
    const newPlan = user.plan_type === 'vip' ? 'free' : 'vip';

    setOptimisticUsers((prev) => ({
      ...prev,
      [user.id]: { ...prev[user.id], plan_type: newPlan },
    }));

    const { error } = await supabase
      .from('profiles')
      .update({ plan_type: newPlan, is_vip: newPlan === 'vip' } as any)
      .eq('id', user.id);

    if (error) {
      setOptimisticUsers((prev) => ({
        ...prev,
        [user.id]: { ...prev[user.id], plan_type: previousPlan },
      }));
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: newPlan === 'vip' ? 'VIP ativado' : 'VIP removido', description: `Plano de ${user.name} alterado.` });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const { data: stats } = useAdminUserStats();
  const totalUsersInDatabase = stats?.totalUsers || 0;
  const banUserMutation = useBanUser();
  const unbanUserMutation = useUnbanUser();
  const verifyUserMutation = useVerifyUser();
  const { impersonateUser, isLoading: isImpersonating } = useImpersonation();
  const freezeUserMutation = useFreezeUser();
  const unfreezeUserMutation = useUnfreezeUser();

  // Fetch admin user IDs
  const { data: adminUserIds = [] } = useQuery({
    queryKey: ['admin-user-ids'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin_master');
      return (data || []).map(r => r.user_id);
    },
  });

  const isMasterUser = (user: AdminUser) => user.email?.toLowerCase() === MASTER_EMAIL;

  const adminProfileIds = useMemo(() => {
    if (!mergedUsers.length) return new Set<string>();
    return new Set(
      mergedUsers
        .filter((u) => adminUserIds.includes(u.user_id) || isMasterUser(u))
        .map((u) => u.id)
    );
  }, [adminUserIds, mergedUsers]);

  const getPlanBadge = (user: AdminUser) => {
    if (adminProfileIds.has(user.id) || isMasterUser(user)) {
      return (
        <div className="flex items-center gap-1">
          <Badge variant="destructive" className="text-xs">ADMIN</Badge>
          <Badge variant="outline" className="text-xs">VIP</Badge>
        </div>
      );
    }
    switch (user.plan_type) {
      case 'vip':
        return <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30 text-xs">VIP</Badge>;
      case 'premium':
      case 'monthly':
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">Premium</Badge>;
      default:
        return <Badge className="bg-muted/50 text-muted-foreground border-border/50 text-xs">Gratuito</Badge>;
    }
  };

  const handleBanUser = () => {
    if (selectedUser) {
      banUserMutation.mutate({ userId: selectedUser.id, reason: banReason });
      setShowBanModal(false);
      setSelectedUser(null);
    }
  };

  const handleUnbanUser = (user: AdminUser) => {
    unbanUserMutation.mutate(user.id);
  };

  const handleOpenVerifyModal = (user: AdminUser) => {
    setSelectedUser(user);
    setIsDocumentImageLoading(Boolean(user.document_url));
    setShowVerifyModal(true);
  };

  const handleVerifyUser = async (user: AdminUser) => {
    const previousVerified = user.is_verified;
    const previousDocVerified = user.document_verified;

    setIsApprovingVerification(true);
    setOptimisticUsers((prev) => ({
      ...prev,
      [user.id]: { ...prev[user.id], is_verified: true, document_verified: true, status: 'active' },
    }));

    const { error } = await supabase
      .from('profiles')
      .update({
        is_verified: true,
      } as any)
      .eq('id', user.id);

    if (error) {
      setOptimisticUsers((prev) => ({
        ...prev,
        [user.id]: { ...prev[user.id], is_verified: previousVerified, document_verified: previousDocVerified },
      }));
      toast({ title: 'Erro ao verificar usuário', description: error.message, variant: 'destructive' });
      setIsApprovingVerification(false);
      return;
    }

    verifyUserMutation.mutate(user.id);
    setShowVerifyModal(false);
    setIsApprovingVerification(false);
  };

  const handleViewUserInfo = async (user: AdminUser) => {
    setIsLoadingUserInfo(true);
    setMagicLink(null);
    try {
      // Fetch email from auth via edge function or profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();
      
      setUserInfoData({
        email: (data as any)?.email || 'E-mail não disponível',
        name: user.name,
        avatar_url: user.avatar_url,
      });
      setSelectedUser(user);
      setShowUserInfoModal(true);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar os dados.", variant: "destructive" });
    } finally {
      setIsLoadingUserInfo(false);
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    setIsSendingReset(true);
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();
      
      const email = (profileData as any)?.email;
      if (!email) {
        toast({ title: "Erro", description: "E-mail do usuário não encontrado.", variant: "destructive" });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) throw error;
      
      toast({
        title: "E-mail enviado",
        description: `Link de redefinição enviado para ${email}`,
      });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Falha ao enviar e-mail.", variant: "destructive" });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleGenerateMagicLink = async () => {
    if (!selectedUser) return;
    setIsGeneratingLink(true);
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', selectedUser.id)
        .single();
      
      const email = (profileData as any)?.email;
      if (!email) {
        toast({ title: "Erro", description: "E-mail não encontrado.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      
      if (error) throw error;
      
      setMagicLink(`Link enviado para ${email}`);
      toast({
        title: "Magic Link enviado",
        description: `Link de acesso temporário enviado para ${email}`,
      });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Falha ao gerar link.", variant: "destructive" });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleFreezeUser = () => {
    if (!selectedUser) return;
    const reasonLabels: Record<FreezeReason, string> = {
      violations: 'Violações dos Termos',
      spam: 'Spam / Comportamento Abusivo',
      harassment: 'Assédio',
      inappropriate: 'Conteúdo Impróprio',
    };
    const reason = freezeCustomReason.trim() || reasonLabels[freezeReason];
    freezeUserMutation.mutate(
      { profileId: selectedUser.id, reason, days: freezeDays },
      {
        onSuccess: () => {
          setShowFreezeModal(false);
          setFreezeCustomReason('');
          setFreezeReason('violations');
          setFreezeDays(7);
          setSelectedUser(null);
        },
      }
    );
  };

  const handleUnfreezeUser = (user: AdminUser) => {
    unfreezeUserMutation.mutate({ profileId: user.id, reason: 'Descongelamento manual pelo admin' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Texto copiado para a área de transferência." });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Ativo</Badge>;
      case 'banned':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Banido</Badge>;
      case 'frozen':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Congelado</Badge>;
      case 'pending':
        return <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">Pendente</Badge>;
      default:
        return null;
    }
  };

  const getGenderBadge = (u: AdminUser) => {
    const candidates = [u?.gender, u?.profile_type, u?.role]
      .map((value) => String(value || '').toLowerCase().trim())
      .filter(Boolean);

    const raw = candidates.find((value) => {
      return [
        'homem', 'man', 'male', 'm',
        'mulher', 'woman', 'female', 'f',
        'casal', 'couple',
        'trans', 'travesti',
        'não-binário', 'nao-binario', 'nao_binario', 'non_binary',
        'outro', 'other',
      ].includes(value);
    }) || candidates[0] || '';

    if (!raw) return null;
    const map: Record<string, { label: string; cls: string }> = {
      homem:    { label: 'Homem',    cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
      man:      { label: 'Homem',    cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
      male:     { label: 'Homem',    cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
      m:        { label: 'Homem',    cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
      mulher:   { label: 'Mulher',   cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
      woman:    { label: 'Mulher',   cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
      female:   { label: 'Mulher',   cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
      f:        { label: 'Mulher',   cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
      casal:    { label: 'Casal',    cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
      couple:   { label: 'Casal',    cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
      trans:    { label: 'Trans',    cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
      travesti: { label: 'Trans',    cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
      'não-binário': { label: 'Não-binário', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      'nao-binario': { label: 'Não-binário', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      nao_binario:   { label: 'Não-binário', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      non_binary:    { label: 'Não-binário', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      outro:    { label: 'Outro',    cls: 'bg-muted text-muted-foreground border-border' },
      other:    { label: 'Outro',    cls: 'bg-muted text-muted-foreground border-border' },
    };
    const m = map[raw] || { label: raw.charAt(0).toUpperCase() + raw.slice(1), cls: 'bg-muted text-muted-foreground border-border' };
    return <Badge variant="outline" className={`${m.cls} capitalize whitespace-nowrap`}>{m.label}</Badge>;
  };

  const handleOpenDiscipline = (user: AdminUser) => {
    setDisciplineUser(user);
    setShowDisciplineModal(true);
  };

  // Abrir modal quando credenciais são geradas
  const handleGenerateTestProfiles = () => {
    generateTestProfiles();
  };

  // Efeito para abrir modal quando credenciais são geradas
  if (credentials && credentials.length > 0 && !showTestProfilesModal) {
    setShowTestProfilesModal(true);
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
            <p className="text-muted-foreground">
              {stats?.totalUsers || 0} usuários reais • {stats?.seedUsers || 0} perfis de teste
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await Promise.all([
                  refetch(),
                  refetchOnline(),
                  queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
                  queryClient.invalidateQueries({ queryKey: ['admin-user-stats'] }),
                  queryClient.invalidateQueries({ queryKey: ['admin-user-ids'] }),
                ]);
                toast({ title: 'Lista atualizada', description: 'Dados sincronizados em tempo real.' });
              }}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button variant="outline" onClick={() => navigate('/feed')} className="gap-2">
              <Eye className="h-4 w-4" /> Acessar Feed
            </Button>
          </div>
        </div>

        {/* Controle do indicador Online em tempo real */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className={`w-2 h-2 rounded-full ${onlinePaused ? 'bg-muted-foreground' : 'bg-emerald-500 animate-pulse'}`} />
            Status Online em tempo real
          </span>
          <span className="text-muted-foreground">
            {onlineIds ? `${onlineIds.size} online agora` : '—'}
            {isFetchingOnline && <span className="ml-1 italic">atualizando…</span>}
          </span>
          <span className="text-muted-foreground">
            • Atualizado às {onlineUpdatedAt ? new Date(onlineUpdatedAt).toLocaleTimeString('pt-BR') : '—'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="online-interval" className="text-xs text-muted-foreground">Intervalo:</Label>
            <Select
              value={String(onlineIntervalMs)}
              onValueChange={(v) => setOnlineIntervalMs(Number(v))}
              disabled={onlinePaused}
            >
              <SelectTrigger id="online-interval" className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10000">10 segundos</SelectItem>
                <SelectItem value="30000">30 segundos</SelectItem>
                <SelectItem value="60000">1 minuto</SelectItem>
                <SelectItem value="120000">2 minutos</SelectItem>
                <SelectItem value="300000">5 minutos</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setOnlinePaused((p) => !p)}
            >
              {onlinePaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {onlinePaused ? 'Retomar' : 'Pausar'}
            </Button>
            <Button
              variant={prioritizeOnline ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setPrioritizeOnline((p) => !p)}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {prioritizeOnline ? 'Online no topo' : 'Ordem padrão'}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Botão Gerar Perfis de Teste */}
          <Button
            variant="outline"
            onClick={handleGenerateTestProfiles}
            disabled={isGenerating}
            className="gap-2 border-[hsl(45,93%,47%)]/50 text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Gerar Perfis de Teste
          </Button>
          
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {stats?.creators || 0} criadores
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-muted-foreground">
              {stats?.verified || 0} verificados
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, @username ou e-mail..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="frozen">Congelados</SelectItem>
                  <SelectItem value="banned">Banidos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={handleRoleChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="creator">Criadores</SelectItem>
                  <SelectItem value="user">Usuários</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortMode} onValueChange={(v) => { setSortMode(v as any); setCurrentPage(1); }}>
                <SelectTrigger className="w-[170px]">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="logins_desc">Mais logins</SelectItem>
                  <SelectItem value="logins_asc">Menos logins</SelectItem>
                </SelectContent>
              </Select>

              
              {/* Seed profiles toggle */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 rounded-lg border border-border/50">
                <FlaskConical className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                <Label htmlFor="show-seed" className="text-sm cursor-pointer">
                  Perfis de Teste
                </Label>
                <Switch
                  id="show-seed"
                  checked={showSeedProfiles}
                  onCheckedChange={setShowSeedProfiles}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users - Desktop Table / Mobile Cards */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-0">
          <CardTitle className="text-lg">Lista de Usuários</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : usersError ? (
            <div className="p-12 text-center">
              <Shield className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
              <p className="text-muted-foreground mb-2">Erro ao carregar usuários</p>
              <p className="text-xs text-muted-foreground mb-4">{(usersError as Error).message}</p>
              <Button variant="outline" onClick={() => refetch()}>Tentar Novamente</Button>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {totalUsersInDatabase === 0 ? 'Nenhum usuário cadastrado na base' : 'Nenhum resultado para os filtros atuais'}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>Recarregar</Button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>Usuário</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="whitespace-nowrap">Logins</TableHead>
                      <TableHead>Último Acesso</TableHead>
                      <TableHead>Ações Rápidas</TableHead>
                      <TableHead className="w-[50px]"></TableHead>

                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.map((user) => (
                      <TableRow key={user.id} className="border-border/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img loading="lazy" decoding="async"
                                src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                                alt={user.name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                              {user.is_seed && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[hsl(45,93%,47%)] rounded-full flex items-center justify-center">
                                  <FlaskConical className="h-2.5 w-2.5 text-black" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{user.username ? `@${user.username}` : user.name}</span>
                                {isUserOnline(user) && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-semibold text-emerald-400 cursor-help">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Online
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Último acesso: {formatLastSeen(onlineLastSeen?.get(user.id))}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {user.username && <span className="text-xs text-muted-foreground">{user.name}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="capitalize whitespace-nowrap">{user.is_creator ? 'Criador' : 'Usuário'}</Badge>
                            {getGenderBadge(user)}
                            {getPlanBadge(user)}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-tight">
                            <span className="text-sm font-semibold tabular-nums">{user.login_count ?? 0}</span>
                            {user.last_login_at && (
                              <span className="text-[10px] text-muted-foreground">{formatLastSeen(user.last_login_at)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>

                          {(() => {
                            const iso = onlineLastSeen?.get(user.id) ?? (user as any).last_seen ?? user.created_at;
                            const online = isUserOnline(user);
                            return (
                              <div className="flex flex-col leading-tight">
                                <span className={`text-xs ${online ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}`}>
                                  {formatLastSeen(iso)}
                                </span>
                                {online && <span className="text-[10px] text-emerald-500/80">agora</span>}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!user.is_verified && (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-400" onClick={() => handleOpenVerifyModal(user)}>
                                <UserCheck className="h-3.5 w-3.5 mr-1" /> Verificar Perfil
                              </Button>
                            )}
                            {user.is_verified && <CheckCircle className="h-4 w-4 text-emerald-500 mr-1" />}
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleToggleVip(user)}>
                              <Crown className="h-3.5 w-3.5 mr-1" /> {user.plan_type === 'vip' ? 'Remover VIP' : 'VIP'}
                            </Button>
                            {user.status !== 'banned' ? (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => { setSelectedUser(user); setShowBanModal(true); }}>
                                <Ban className="h-3.5 w-3.5 mr-1" /> Banir
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-400" onClick={() => handleUnbanUser(user)}>
                                <UserCheck className="h-3.5 w-3.5 mr-1" /> Unban
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Mais opções"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem className="gap-2 text-orange-500 focus:text-orange-500" disabled={isImpersonating}
                                onClick={() => impersonateUser({ id: user.id, user_id: user.user_id, name: user.name, username: user.username || undefined, plan_type: user.plan_type || 'free', avatar_url: user.avatar_url || undefined })}>
                                <UserCog className="h-4 w-4" /> Acessar Painel
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2" onClick={() => navigate(`/creator/${user.id}`)}>
                                <Eye className="h-4 w-4" /> Ver Perfil
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => handleOpenDiscipline(user)}>
                                <Shield className="h-4 w-4" /> Gerenciar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => setSignupDataUserId(user.id)}>
                                <FileUser className="h-4 w-4" /> Ver Cadastro
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => handleViewUserInfo(user)}>
                                <Mail className="h-4 w-4" /> Ver E-mail / Acesso
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => handleResetPassword(user)} disabled={isSendingReset}>
                                <KeyRound className="h-4 w-4" /> Resetar Senha
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => { setSelectedUser(user); handleViewUserInfo(user); }}>
                                <Link2 className="h-4 w-4" /> Login Temporário
                              </DropdownMenuItem>
                              {!user.is_verified && (
                                <DropdownMenuItem className="gap-2" onClick={() => handleOpenVerifyModal(user)}>
                                  <UserCheck className="h-4 w-4" /> Verificar Perfil
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {user.status === 'frozen' ? (
                                <DropdownMenuItem className="gap-2 text-blue-500 focus:text-blue-500" onClick={() => handleUnfreezeUser(user)}>
                                  <Snowflake className="h-4 w-4" /> Descongelar
                                </DropdownMenuItem>
                              ) : user.status !== 'banned' && (
                                <DropdownMenuItem className="gap-2 text-blue-500 focus:text-blue-500" onClick={() => { setSelectedUser(user); setShowFreezeModal(true); }}>
                                  <Snowflake className="h-4 w-4" /> Congelar
                                </DropdownMenuItem>
                              )}
                              {user.status === 'banned' ? (
                                <DropdownMenuItem className="gap-2 text-emerald-500 focus:text-emerald-500" onClick={() => handleUnbanUser(user)}>
                                  <UserCheck className="h-4 w-4" /> Remover Ban
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => { setSelectedUser(user); setShowBanModal(true); }}>
                                  <Ban className="h-4 w-4" /> Banir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-border/50">
                {paginatedUsers.map((user) => (
                  <div key={user.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img loading="lazy" decoding="async"
                          src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{user.username ? `@${user.username}` : user.name}</span>
                            {isUserOnline(user) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-semibold text-emerald-400 cursor-help">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Online
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Último acesso: {formatLastSeen(onlineLastSeen?.get(user.id))}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {getStatusBadge(user.status)}
                            <Badge variant="outline" className="capitalize whitespace-nowrap text-xs">{user.is_creator ? 'Criador' : 'Usuário'}</Badge>
                            {getGenderBadge(user)}
                            {getPlanBadge(user)}
                            {user.is_verified && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Último acesso: <span className={isUserOnline(user) ? 'text-emerald-400 font-medium' : ''}>
                              {formatLastSeen(onlineLastSeen?.get(user.id) ?? (user as any).last_seen ?? user.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>


                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Mais opções"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="gap-2" onClick={() => navigate(`/creator/${user.id}`)}>
                            <Eye className="h-4 w-4" /> Ver Perfil
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => setSignupDataUserId(user.id)}>
                            <FileUser className="h-4 w-4" /> Ver Cadastro
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleViewUserInfo(user)}>
                            <Mail className="h-4 w-4" /> Ver E-mail
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleResetPassword(user)} disabled={isSendingReset}>
                            <KeyRound className="h-4 w-4" /> Resetar Senha
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => { setSelectedUser(user); handleViewUserInfo(user); }}>
                            <Link2 className="h-4 w-4" /> Login Temporário
                          </DropdownMenuItem>
                          {user.status === 'frozen' ? (
                            <DropdownMenuItem className="gap-2 text-blue-500" onClick={() => handleUnfreezeUser(user)}>
                              <Snowflake className="h-4 w-4" /> Descongelar
                            </DropdownMenuItem>
                          ) : user.status !== 'banned' && (
                            <DropdownMenuItem className="gap-2 text-blue-500" onClick={() => { setSelectedUser(user); setShowFreezeModal(true); }}>
                              <Snowflake className="h-4 w-4" /> Congelar
                            </DropdownMenuItem>
                          )}
                          {user.status === 'banned' ? (
                            <DropdownMenuItem className="gap-2 text-emerald-500" onClick={() => handleUnbanUser(user)}>
                              <UserCheck className="h-4 w-4" /> Remover Ban
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="gap-2 text-destructive" onClick={() => { setSelectedUser(user); setShowBanModal(true); }}>
                              <Ban className="h-4 w-4" /> Banir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleToggleVip(user)}>
                        <Crown className="h-3.5 w-3.5 mr-1" /> {user.plan_type === 'vip' ? 'Remover VIP' : 'Tornar VIP'}
                      </Button>
                      {!user.is_verified && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleOpenVerifyModal(user)}>
                          <UserCheck className="h-3.5 w-3.5 mr-1" /> Verificar Perfil
                        </Button>
                      )}
                      {user.status !== 'banned' && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { setSelectedUser(user); setShowBanModal(true); }}>
                          <Ban className="h-3.5 w-3.5 mr-1" /> Banir
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, mergedUsers.length)} de {mergedUsers.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                      Anterior
                    </Button>
                    <span className="text-xs text-muted-foreground px-2">{currentPage}/{totalPages}</span>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                      Próximo
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de Verificação */}
      <Dialog open={showVerifyModal} onOpenChange={setShowVerifyModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Verificar Perfil
            </DialogTitle>
            <DialogDescription>
              Revise o documento e aprove com um clique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <p className="text-sm font-medium">
                {selectedUser?.username ? `@${selectedUser.username}` : selectedUser?.name}
              </p>
              {selectedUser?.email && (
                <p className="text-xs text-muted-foreground mt-1">{selectedUser.email}</p>
              )}
            </div>

            {selectedUser?.document_url ? (
              <div className="relative rounded-lg border border-border/50 overflow-hidden bg-muted/20 min-h-[220px]">
                {isDocumentImageLoading && (
                  <div className="absolute inset-0 p-4">
                    <Skeleton className="h-full w-full" />
                  </div>
                )}
                <img
                  src={selectedUser.document_url}
                  alt="Documento enviado"
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setIsDocumentImageLoading(false)}
                  className="w-full h-auto object-contain"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 p-4 text-sm text-muted-foreground">
                Este usuário ainda não enviou document_url.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyModal(false)}>
              Fechar
            </Button>
            <Button
              onClick={() => selectedUser && handleVerifyUser(selectedUser)}
              disabled={!selectedUser || isApprovingVerification}
            >
              {isApprovingVerification ? 'Aprovando...' : 'Aprovar Verificação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Modal */}
      <Dialog open={showBanModal} onOpenChange={setShowBanModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Banir Usuário
            </DialogTitle>
            <DialogDescription>
              Esta ação irá impedir {selectedUser?.username ? `@${selectedUser.username}` : selectedUser?.name} de acessar a plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <img loading="lazy" decoding="async"
                src={selectedUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser?.name || '')}&background=random`}
                alt={selectedUser?.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div>
                <p className="font-medium">
                  {selectedUser?.username ? `@${selectedUser.username}` : selectedUser?.name}
                </p>
                <p className="text-sm text-muted-foreground">{selectedUser?.name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo do Ban</label>
              <Select value={banReason} onValueChange={(v) => setBanReason(v as BanReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="violations">Violações dos Termos</SelectItem>
                  <SelectItem value="spam">Spam / Comportamento Abusivo</SelectItem>
                  <SelectItem value="harassment">Assédio</SelectItem>
                  <SelectItem value="fraud">Fraude / Golpe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBanModal(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBanUser}
              disabled={banUserMutation.isPending}
            >
              {banUserMutation.isPending ? 'Banindo...' : 'Confirmar Ban'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Freeze Modal */}
      <Dialog open={showFreezeModal} onOpenChange={setShowFreezeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-500">
              <Snowflake className="h-5 w-5" />
              Congelar Usuário
            </DialogTitle>
            <DialogDescription>
              O usuário ficará em modo somente leitura. Não poderá postar, curtir, comentar, usar chat, radar ou Perfect Pair.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <img loading="lazy" decoding="async"
                src={selectedUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser?.name || '')}&background=random`}
                alt={selectedUser?.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div>
                <p className="font-medium">
                  {selectedUser?.username ? `@${selectedUser.username}` : selectedUser?.name}
                </p>
                <p className="text-sm text-muted-foreground">{selectedUser?.name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo</label>
              <Select value={freezeReason} onValueChange={(v) => setFreezeReason(v as FreezeReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="violations">Violações dos Termos</SelectItem>
                  <SelectItem value="spam">Spam / Comportamento Abusivo</SelectItem>
                  <SelectItem value="harassment">Assédio</SelectItem>
                  <SelectItem value="inappropriate">Conteúdo Impróprio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Duração (dias)</label>
              <Select value={String(freezeDays)} onValueChange={(v) => setFreezeDays(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 dia</SelectItem>
                  <SelectItem value="3">3 dias</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="14">14 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Observação (opcional)</label>
              <Textarea
                placeholder="Detalhe o motivo do congelamento..."
                value={freezeCustomReason}
                onChange={(e) => setFreezeCustomReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFreezeModal(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleFreezeUser}
              disabled={freezeUserMutation.isPending}
            >
              <Snowflake className="h-4 w-4 mr-1" />
              {freezeUserMutation.isPending ? 'Congelando...' : 'Congelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Disciplina e Concessão de Plano */}
      <UserDisciplineModal
        open={showDisciplineModal}
        onOpenChange={setShowDisciplineModal}
        user={disciplineUser ? {
          id: disciplineUser.id,
          name: disciplineUser.name,
          username: disciplineUser.username,
          avatar_url: disciplineUser.avatar_url,
          warning_count: (disciplineUser as any).warning_count || 0,
          account_status: disciplineUser.status,
          plan_type: (disciplineUser as any).plan_type || 'free',
        } : null}
      />

      {/* Modal Informações do Usuário */}
      <Dialog open={showUserInfoModal} onOpenChange={(open) => { setShowUserInfoModal(open); if (!open) setMagicLink(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Dados de Acesso
            </DialogTitle>
            <DialogDescription>
              Informações de login do usuário selecionado
            </DialogDescription>
          </DialogHeader>

          {userInfoData && (
            <div className="space-y-4 py-2">
              {/* User info */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <img loading="lazy" decoding="async"
                  src={userInfoData.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfoData.name)}&background=random`}
                  alt={userInfoData.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <p className="font-medium">{selectedUser?.username ? `@${selectedUser.username}` : userInfoData.name}</p>
                  <p className="text-sm text-muted-foreground">{userInfoData.name}</p>
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">E-mail de Login</Label>
                <div className="flex items-center gap-2">
                  <Input value={userInfoData.email} readOnly className="bg-muted/30 font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(userInfoData.email)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={() => selectedUser && handleResetPassword(selectedUser)}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Enviar E-mail de Redefinição de Senha
                </Button>

                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={handleGenerateMagicLink}
                  disabled={isGeneratingLink}
                >
                  {isGeneratingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Enviar Magic Link (Login Temporário)
                </Button>

                {magicLink && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-500">
                    ✓ {magicLink}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                <strong className="text-primary">Nota de segurança:</strong> Senhas são criptografadas e não podem ser visualizadas. 
                Use "Redefinição de Senha" ou "Magic Link" para dar acesso ao usuário.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Perfis de Teste */}
      <TestProfilesModal
        open={showTestProfilesModal}
        onOpenChange={(open) => {
          setShowTestProfilesModal(open);
          if (!open) clearCredentials();
        }}
        profiles={credentials || []}
      />

      <UserSignupDataModal
        open={!!signupDataUserId}
        onOpenChange={(open) => { if (!open) setSignupDataUserId(null); }}
        userId={signupDataUserId}
      />
    </div>
  );
}
