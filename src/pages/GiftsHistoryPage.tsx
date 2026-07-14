import { useState } from "react";
import { Gift, Search, Calendar, Filter, User, MessageCircle, Repeat, Trash2, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useGiftHistory, useGiftsReceived, useRepeatGift, useDeleteGiftHistory, useGiftStats } from "@/hooks/useGifts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

export default function GiftsHistoryPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('sent');
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [deleteGiftId, setDeleteGiftId] = useState<string | null>(null);

  const { data: sentGifts, isLoading: isLoadingSent } = useGiftHistory();
  const { data: receivedGifts, isLoading: isLoadingReceived } = useGiftsReceived();
  const { data: stats } = useGiftStats();
  const repeatGift = useRepeatGift();
  const deleteGift = useDeleteGiftHistory();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const filterGifts = (gifts: typeof sentGifts) => {
    if (!gifts) return [];
    
    let filtered = gifts;

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(0);
      }
      
      filtered = filtered.filter(g => new Date(g.created_at) >= startDate);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => {
        const targetUser = activeTab === 'sent' ? g.receiver : g.sender;
        return targetUser?.name?.toLowerCase().includes(query) ||
               targetUser?.username?.toLowerCase().includes(query);
      });
    }

    return filtered;
  };

  const handleRepeatGift = (giftId: string) => {
    repeatGift.mutate(giftId);
  };

  const handleDeleteGift = () => {
    if (deleteGiftId) {
      deleteGift.mutate(deleteGiftId);
      setDeleteGiftId(null);
    }
  };

  const handleViewChat = (conversationId: string | null) => {
    if (conversationId) {
      navigate(`/feed?chat=${conversationId}`);
    }
  };

  const handleViewProfile = (profileId: string) => {
    navigate(`/creator/${profileId}`);
  };

  const currentGifts = activeTab === 'sent' ? sentGifts : receivedGifts;
  const filteredGifts = filterGifts(currentGifts);
  const isLoading = activeTab === 'sent' ? isLoadingSent : isLoadingReceived;

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6 text-[hsl(45,93%,47%)]" />
            Histórico de Presentes
          </h1>
          <p className="text-muted-foreground">
            Gerencie seus presentes enviados e recebidos
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-background">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Total Enviado</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(stats?.totalSent || 0)}</p>
            <p className="text-xs text-muted-foreground">{stats?.sentCount || 0} presentes</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-[hsl(330,80%,60%)]/10 to-background">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4" />
              <span className="text-xs">Total Recebido</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(stats?.totalReceived || 0)}</p>
            <p className="text-xs text-muted-foreground">{stats?.receivedCount || 0} presentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'sent' | 'received')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sent">Enviados</TabsTrigger>
          <TabsTrigger value="received">Recebidos</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Última semana</SelectItem>
              <SelectItem value="month">Último mês</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="sent" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredGifts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Gift className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {searchQuery || dateFilter !== 'all' 
                    ? 'Nenhum presente encontrado com esses filtros'
                    : 'Você ainda não enviou nenhum presente'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredGifts.map((gift) => (
                <Card key={gift.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={gift.receiver?.avatar_url || undefined} />
                        <AvatarFallback>
                          {gift.receiver?.name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{gift.receiver?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(gift.created_at)}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-lg font-bold text-[hsl(45,93%,47%)]">
                          {formatCurrency(gift.amount)}
                        </p>
                        {gift.thank_you_type && (
                          <span className="text-xs text-primary">
                            Agradecido ✓
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      {gift.conversation_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewChat(gift.conversation_id)}
                          className="text-xs"
                        >
                          <MessageCircle className="h-3 w-3 mr-1" />
                          Ver Chat
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => gift.receiver && handleViewProfile(gift.receiver.id)}
                        className="text-xs"
                      >
                        <User className="h-3 w-3 mr-1" />
                        Perfil
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRepeatGift(gift.id)}
                        disabled={repeatGift.isPending}
                        className="text-xs text-primary"
                      >
                        <Repeat className="h-3 w-3 mr-1" />
                        Repetir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteGiftId(gift.id)}
                        className="text-xs text-destructive ml-auto"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remover
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="received" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredGifts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Gift className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {searchQuery || dateFilter !== 'all' 
                    ? 'Nenhum presente encontrado com esses filtros'
                    : 'Você ainda não recebeu nenhum presente'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredGifts.map((gift) => (
                <Card key={gift.id} className="hover:shadow-md transition-shadow border-[hsl(330,80%,60%)]/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={gift.sender?.avatar_url || undefined} />
                        <AvatarFallback>
                          {gift.sender?.name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{gift.sender?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(gift.created_at)}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-lg font-bold text-[hsl(330,80%,60%)]">
                          +{formatCurrency(gift.amount)}
                        </p>
                        {!gift.thank_you_type && (
                          <span className="text-xs text-muted-foreground">
                            Envie um agradecimento
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      {gift.conversation_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewChat(gift.conversation_id)}
                          className="text-xs"
                        >
                          <MessageCircle className="h-3 w-3 mr-1" />
                          Ver Chat
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => gift.sender && handleViewProfile(gift.sender.id)}
                        className="text-xs"
                      >
                        <User className="h-3 w-3 mr-1" />
                        Perfil
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGiftId} onOpenChange={() => setDeleteGiftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Este presente será removido do seu histórico. 
              O destinatário ainda terá acesso ao registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGift}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
