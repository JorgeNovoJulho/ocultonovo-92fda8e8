import { useState } from "react";
import { 
  Skull, 
  Eye, 
  Trash2, 
  RotateCcw, 
  Search,
  AlertTriangle,
  MessageSquare,
  Image,
  Calendar,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  useBannedUsers, 
  useRestoreUser, 
  useDeleteUserData,
  useDisciplineHistory,
} from "@/hooks/useDiscipline";
import { supabase } from "@/lib/supabaseExternal";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGraveyardList, useGraveyardEntry } from "@/hooks/useGraveyard";
import { Archive } from "lucide-react";
import { GraveyardTab } from "@/components/admin/GraveyardTab";

export default function AdminBannedUsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showContentModal, setShowContentModal] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [restoreReason, setRestoreReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const { data: bannedUsers, isLoading } = useBannedUsers();
  const restoreUser = useRestoreUser();
  const deleteUserData = useDeleteUserData();
  const { data: disciplineHistory } = useDisciplineHistory(selectedUser || undefined);

  // Buscar conteúdo do usuário selecionado
  const { data: userContent } = useQuery({
    queryKey: ['banned-user-content', selectedUser],
    queryFn: async () => {
      if (!selectedUser) return null;

      const [postsRes, messagesRes] = await Promise.all([
        supabase
          .from('posts')
          .select('*')
          .eq('user_id', selectedUser)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('messages')
          .select('*')
          .eq('sender_id', selectedUser)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      return {
        posts: postsRes.data || [],
        messages: messagesRes.data || [],
      };
    },
    enabled: !!selectedUser && showContentModal,
  });

  const filteredUsers = bannedUsers?.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleRestore = async () => {
    if (!selectedUser) return;
    await restoreUser.mutateAsync({ profileId: selectedUser, reason: restoreReason });
    setShowRestoreDialog(false);
    setRestoreReason("");
    setSelectedUser(null);
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    await deleteUserData.mutateAsync({ profileId: selectedUser, reason: deleteReason });
    setShowDeleteDialog(false);
    setDeleteReason("");
    setSelectedUser(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Skull className="h-6 w-6 text-destructive" />
            Cemitério de Perfis
          </h1>
          <p className="text-muted-foreground">
            Usuários banidos e excluídos — Auditoria jurídica (LGPD)
          </p>
        </div>
        <Badge variant="destructive" className="text-lg px-4 py-2">
          {bannedUsers?.length || 0} banidos
        </Badge>
      </div>

      {/* Aviso Legal */}
      <Card className="border-yellow-500/50 bg-yellow-500/10">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-600">Área de Auditoria Jurídica</p>
            <p className="text-muted-foreground">
              Os dados aqui são preservados por 5 anos (LGPD/Marco Civil) para fins de auditoria legal.
              E-mails de contas excluídas são reservados permanentemente para impedir burlas.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="banned" className="w-full">
        <TabsList>
          <TabsTrigger value="banned">
            <Skull className="h-4 w-4 mr-1" /> Banidos ({bannedUsers?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="graveyard">
            <Archive className="h-4 w-4 mr-1" /> Excluídos (Cemitério)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="banned" className="space-y-6 mt-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

      {/* Lista de Banidos */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários Banidos</CardTitle>
          <CardDescription>
            Clique em "Ver Conteúdo" para auditoria completa
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Skull className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum usuário banido encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Strikes</TableHead>
                  <TableHead>Motivo do Ban</TableHead>
                  <TableHead>Data do Ban</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-destructive/50">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-destructive/20 text-destructive">
                            {user.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground">
                            @{user.username || 'sem-username'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {user.warning_count} strikes
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm max-w-[200px] truncate block">
                        {user.ban_reason || 'Não especificado'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.banned_at ? (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(user.banned_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user.id);
                            setShowContentModal(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Conteúdo
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => {
                            setSelectedUser(user.id);
                            setShowRestoreDialog(true);
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restaurar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user.id);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Apagar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="graveyard" className="mt-4">
          <GraveyardTab />
        </TabsContent>
      </Tabs>

      {/* Modal de Conteúdo */}
      <Dialog open={showContentModal} onOpenChange={setShowContentModal}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Auditoria de Conteúdo
            </DialogTitle>
            <DialogDescription>
              Visualize todo o conteúdo do usuário para fins de auditoria
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Histórico Disciplinar */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Histórico Disciplinar ({disciplineHistory?.length || 0})
                </h3>
                <div className="space-y-2">
                  {disciplineHistory?.map((entry) => (
                    <div key={entry.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant={entry.action_type === 'ban' ? 'destructive' : 'secondary'}>
                          {entry.action_type}
                        </Badge>
                        <span className="text-muted-foreground">
                          {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {entry.reason && (
                        <p className="mt-1 text-muted-foreground">{entry.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Posts */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Posts ({userContent?.posts.length || 0})
                </h3>
                <div className="space-y-2">
                  {userContent?.posts.map((post: any) => (
                    <div key={post.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{post.privacy_level}</Badge>
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(post.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                      </div>
                      {post.content_text && <p>{post.content_text}</p>}
                      {post.media_url && (
                        <img loading="lazy" decoding="async" 
                          src={post.media_url} 
                          alt="Post media" 
                          className="mt-2 max-h-40 rounded-lg object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mensagens */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Mensagens ({userContent?.messages.length || 0})
                </h3>
                <div className="space-y-2">
                  {userContent?.messages.map((msg: any) => (
                    <div key={msg.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(msg.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                      </div>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Dialog de Restauração */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-600" />
              Restaurar Acesso do Usuário
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá restaurar o acesso completo do usuário, zerando seus strikes. 
              Forneça um motivo para a restauração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo da restauração..."
            value={restoreReason}
            onChange={(e) => setRestoreReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoreUser.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {restoreUser.isPending ? 'Restaurando...' : 'Restaurar Acesso'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Apagar Dados Definitivamente
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-destructive font-medium">ATENÇÃO: Esta ação é IRREVERSÍVEL!</span>
              <br />
              Todos os dados do usuário (posts, mensagens, comentários) serão apagados permanentemente.
              Forneça um motivo para a exclusão definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo da exclusão definitiva..."
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            className="min-h-[80px] border-destructive/50"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteUserData.isPending || !deleteReason}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteUserData.isPending ? 'Apagando...' : 'Apagar Definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
