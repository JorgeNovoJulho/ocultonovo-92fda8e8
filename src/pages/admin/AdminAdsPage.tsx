import { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Megaphone,
  Plus,
  Eye,
  MousePointerClick,
  Calendar,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  useAllAds,
  useUpdateAd,
  useDeleteAd,
  AdCampaign,
} from '@/hooks/useAdCampaigns';
import { cn } from '@/lib/utils';
const AdCreatorModal = lazy(() => import('@/components/admin/ads/AdCreatorModal').then(m => ({ default: m.AdCreatorModal })));

const placementLabels: Record<AdCampaign['placement'], string> = {
  feed: 'Feed',
  sidebar: 'Sidebar',
  banner: 'Banner',
  modal: 'Modal',
};

export default function AdminAdsPage() {
  const { data: ads, isLoading } = useAllAds();
  const updateAd = useUpdateAd();
  const deleteAd = useDeleteAd();

  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState<AdCampaign | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingAd(null);
  };

  const openEdit = (ad: AdCampaign) => {
    setEditingAd(ad);
    setShowModal(true);
  };

  const handleToggle = async (ad: AdCampaign) => {
    try {
      await updateAd.mutateAsync({ id: ad.id, is_active: !ad.is_active });
      toast.success(ad.is_active ? 'Anúncio pausado' : 'Anúncio ativado');
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAd.mutateAsync(deleteId);
      toast.success('Anúncio excluído');
      setDeleteId(null);
    } catch {
      toast.error('Erro ao excluir anúncio');
    }
  };


  // Stats
  const totalImpressions = ads?.reduce((sum, ad) => sum + ad.impressions_count, 0) || 0;
  const totalClicks = ads?.reduce((sum, ad) => sum + ad.clicks_count, 0) || 0;
  const activeAds = ads?.filter((ad) => ad.is_active).length || 0;
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Gerenciar Anúncios
          </h1>
          <p className="text-muted-foreground">
            Anúncios exibidos apenas para usuários do plano gratuito
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Anúncio
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeAds}</p>
                <p className="text-xs text-muted-foreground">Anúncios Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Impressões</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <MousePointerClick className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Cliques</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MousePointerClick className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{ctr}%</p>
                <p className="text-xs text-muted-foreground">CTR</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ads Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campanhas de Anúncios</CardTitle>
        </CardHeader>
        <CardContent>
          {ads && ads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Posição</TableHead>
                  <TableHead className="text-center">Impressões</TableHead>
                  <TableHead className="text-center">Cliques</TableHead>
                  <TableHead className="text-center">CTR</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.map((ad) => {
                  const adCtr =
                    ad.impressions_count > 0
                      ? ((ad.clicks_count / ad.impressions_count) * 100).toFixed(2)
                      : '0.00';

                  return (
                    <TableRow key={ad.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img loading="lazy" decoding="async"
                            src={ad.image_url}
                            alt={ad.title}
                            className="w-12 h-12 rounded object-cover"
                          />
                          <div>
                            <p className="font-medium">{ad.title}</p>
                            {ad.target_url && (
                              <a
                                href={ad.target_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                              >
                                {new URL(ad.target_url).hostname}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{placementLabels[ad.placement]}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {ad.impressions_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {ad.clicks_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">{adCtr}%</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p>{format(new Date(ad.starts_at), 'dd/MM/yy', { locale: ptBR })}</p>
                          {ad.ends_at && (
                            <p className="text-muted-foreground">
                              até {format(new Date(ad.ends_at), 'dd/MM/yy', { locale: ptBR })}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={ad.is_active ? 'default' : 'secondary'}
                          className={cn(
                            ad.is_active && 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                          )}
                        >
                          {ad.is_active ? 'Ativo' : 'Pausado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggle(ad)}
                            title={ad.is_active ? 'Pausar' : 'Ativar'}
                          >
                            {ad.is_active ? (
                              <ToggleRight className="h-4 w-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(ad)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(ad.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum anúncio cadastrado</p>
              <p className="text-sm">Crie seu primeiro anúncio!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal — novo wizard profissional */}
      {showModal && (
        <Suspense fallback={null}>
          <AdCreatorModal
            open={showModal}
            onOpenChange={(o) => { setShowModal(o); if (!o) resetForm(); }}
            editing={editingAd}
          />
        </Suspense>
      )}


      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Anúncio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O anúncio será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
