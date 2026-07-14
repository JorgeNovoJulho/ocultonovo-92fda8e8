import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Store,
  Package,
  DollarSign,
  TrendingUp,
  Users,
  Star,
  Search,
  Eye,
  Check,
  X,
  Trash2,
  Settings,
  Tag,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import {
  useMarketplaceAdminStats,
  useMarketplaceItemsAdmin,
  useMarketplaceCategories,
  useMarketplaceSettings,
  useUpdateItemStatus,
  useToggleFeatured,
  useDeleteItem,
  useUpdateSetting,
} from "@/hooks/useMarketplaceAdmin";
import { formatDistanceToNow } from "date-fns";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AdminMarketplacePage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useMarketplaceAdminStats();
  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = useMarketplaceItemsAdmin({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    search: searchQuery || undefined,
  });
  const { data: categories } = useMarketplaceCategories();
  const { data: settings } = useMarketplaceSettings();

  const updateStatus = useUpdateItemStatus();
  const toggleFeatured = useToggleFeatured();
  const deleteItem = useDeleteItem();
  const updateSetting = useUpdateSetting();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: "bg-green-500/20 text-green-500 border-green-500/30",
      pending: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
      rejected: "bg-red-500/20 text-red-500 border-red-500/30",
      draft: "bg-gray-500/20 text-gray-500 border-gray-500/30",
    };
    return <Badge className={styles[status] || styles.draft}>{status}</Badge>;
  };

  const handleRefresh = () => {
    refetchStats();
    refetchItems();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            Marketplace Admin
          </h1>
          <p className="text-muted-foreground">Gerencie itens, categorias e configurações do marketplace</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Itens</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{stats?.total_items || 0}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{stats?.total_sales || 0}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Total</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <span className="text-2xl font-bold">{formatCurrency(stats?.total_revenue || 0)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">{stats?.pending_items || 0}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Criadores Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">{stats?.total_creators || 0}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="items">Itens</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Métricas do Mês</CardTitle>
                <CardDescription>Performance do mês atual</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Novos Itens</span>
                  <span className="font-semibold">{stats?.items_this_month || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Vendas</span>
                  <span className="font-semibold">{stats?.sales_this_month || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Receita</span>
                  <span className="font-semibold text-green-500">
                    {formatCurrency(stats?.revenue_this_month || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ticket Médio</span>
                  <span className="font-semibold">{formatCurrency(stats?.avg_item_price || 0)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Top Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Categorias</CardTitle>
                <CardDescription>Por volume de vendas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.top_categories?.map((cat, index) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">#{index + 1}</span>
                        <Badge variant="outline">{cat.category}</Badge>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium">{cat.count} itens</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({cat.total_sales} vendas)
                        </span>
                      </div>
                    </div>
                  )) || (
                    <p className="text-muted-foreground text-sm">Nenhuma categoria encontrada</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar itens..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="rejected">Rejeitado</SelectItem>
                    <SelectItem value="draft">Rascunho</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.slug}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Criador</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vendas</TableHead>
                    <TableHead>Destaque</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsLoading ? (
                    Array(5)
                      .fill(0)
                      .map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={8}>
                            <Skeleton className="h-12 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                  ) : items?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhum item encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <img loading="lazy" decoding="async"
                              src={item.preview_url || item.media_url}
                              alt={item.title}
                              className="w-12 h-12 rounded object-cover bg-muted"
                            />
                            <div>
                              <p className="font-medium line-clamp-1">{item.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(item.created_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={item.creator_avatar} />
                              <AvatarFallback>{item.creator_name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{item.creator_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.price)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.category}</Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{item.view_count}</span>
                            <span className="mx-1">•</span>
                            <span className="text-sm font-medium">{item.sales_count} vendas</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={item.is_featured}
                            onCheckedChange={(checked) =>
                              toggleFeatured.mutate({ itemId: item.id, featured: checked })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {item.status === "pending" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-500 hover:text-green-600"
                                  onClick={() =>
                                    updateStatus.mutate({ itemId: item.id, status: "active" })
                                  }
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-500 hover:text-red-600"
                                  onClick={() =>
                                    updateStatus.mutate({ itemId: item.id, status: "rejected" })
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                 aria-label="Excluir">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover Item</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja remover "{item.title}"? Esta ação não pode ser
                                    desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteItem.mutate(item.id)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Remover
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Categorias
              </CardTitle>
              <CardDescription>Gerencie as categorias do marketplace</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories?.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{cat.slug}</code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{cat.description}</TableCell>
                      <TableCell>{cat.sort_order}</TableCell>
                      <TableCell>
                        <Badge variant={cat.is_active ? "default" : "secondary"}>
                          {cat.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurações do Marketplace
              </CardTitle>
              <CardDescription>Ajuste taxas, limites e comportamentos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {settings?.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between py-4 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium capitalize">
                        {setting.setting_key.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm text-muted-foreground">{setting.description}</p>
                    </div>
                    <div className="text-right">
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {JSON.stringify(setting.setting_value)}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
