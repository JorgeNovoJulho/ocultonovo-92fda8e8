import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ImagePlus,
  X,
  ShoppingBag,
  Star,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import {
  useAllMarketplaceAds,
  useUpsertMarketplaceAd,
  useDeleteMarketplaceAd,
  useMarketplaceAdsEnabled,
  useToggleMarketplaceAdsEnabled,
  useUpsertReputation,
  type MarketplaceAd,
} from "@/hooks/useMarketplaceAds";
import { ReputationBadge } from "@/components/marketplace-ads/ReputationBadge";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const emptyForm = {
  id: undefined as string | undefined,
  title: "",
  short_description: "",
  full_description: "",
  price: 0,
  main_image_url: "",
  gallery_images: [] as string[],
  video_url: "",
  advertiser_profile_id: "",
  external_url: "",
  is_active: true,
  display_order: 0,
};

export default function AdminMarketplaceAdsPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();
  const { data: ads, isLoading } = useAllMarketplaceAds();
  const { data: featureEnabled } = useMarketplaceAdsEnabled();
  const upsertAd = useUpsertMarketplaceAd();
  const deleteAd = useDeleteMarketplaceAd();
  const toggleFeature = useToggleMarketplaceAdsEnabled();
  const upsertRep = useUpsertReputation();

  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [galleryDraft, setGalleryDraft] = useState("");

  // Reputation modal
  const [repAd, setRepAd] = useState<MarketplaceAd | null>(null);
  const [repRating, setRepRating] = useState(0);
  const [repReviews, setRepReviews] = useState(0);

  const resetForm = () => {
    setForm(emptyForm);
    setGalleryDraft("");
  };

  const openEdit = (ad: MarketplaceAd) => {
    setForm({
      id: ad.id,
      title: ad.title,
      short_description: ad.short_description,
      full_description: ad.full_description || "",
      price: ad.price,
      main_image_url: ad.main_image_url,
      gallery_images: ad.gallery_images || [],
      video_url: ad.video_url || "",
      advertiser_profile_id: ad.advertiser_profile_id || "",
      external_url: ad.external_url || "",
      is_active: ad.is_active,
      display_order: ad.display_order,
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.short_description || !form.main_image_url) {
      toast.error("Título, descrição curta e imagem principal são obrigatórios");
      return;
    }
    try {
      await upsertAd.mutateAsync({
        ...form,
        full_description: form.full_description || null,
        video_url: form.video_url || null,
        external_url: form.external_url || null,
        advertiser_profile_id: form.advertiser_profile_id || null,
      });
      toast.success(form.id ? "Anúncio atualizado" : "Anúncio criado");
      setShowModal(false);
      resetForm();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e?.message });
    }
  };

  const handleToggleAd = async (ad: MarketplaceAd) => {
    try {
      await upsertAd.mutateAsync({
        id: ad.id,
        title: ad.title,
        short_description: ad.short_description,
        full_description: ad.full_description,
        price: ad.price,
        main_image_url: ad.main_image_url,
        gallery_images: ad.gallery_images,
        video_url: ad.video_url,
        advertiser_profile_id: ad.advertiser_profile_id,
        external_url: ad.external_url,
        is_active: !ad.is_active,
        display_order: ad.display_order,
      });
      toast.success(ad.is_active ? "Anúncio pausado" : "Anúncio ativo");
    } catch {
      toast.error("Erro ao alternar status");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAd.mutateAsync(deleteId);
      toast.success("Anúncio excluído");
      setDeleteId(null);
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const addGalleryImage = () => {
    const url = galleryDraft.trim();
    if (!url) return;
    if (form.gallery_images.length >= 10) {
      toast.error("Máximo de 10 imagens na galeria");
      return;
    }
    setForm((f) => ({ ...f, gallery_images: [...f.gallery_images, url] }));
    setGalleryDraft("");
  };

  const removeGalleryImage = (idx: number) => {
    setForm((f) => ({
      ...f,
      gallery_images: f.gallery_images.filter((_, i) => i !== idx),
    }));
  };

  const openReputation = (ad: MarketplaceAd) => {
    if (!ad.advertiser_profile_id) {
      toast.error("Vincule um anunciante a este anúncio para gerenciar a reputação.");
      return;
    }
    setRepAd(ad);
    setRepRating(ad.reputation?.rating || 0);
    setRepReviews(ad.reputation?.total_reviews || 0);
  };

  const saveReputation = async () => {
    if (!repAd?.advertiser_profile_id) return;
    try {
      await upsertRep.mutateAsync({
        profile_id: repAd.advertiser_profile_id,
        rating: repRating,
        total_reviews: repReviews,
      });
      toast.success("Reputação atualizada");
      setRepAd(null);
    } catch {
      toast.error("Erro ao salvar reputação");
    }
  };

  if (roleLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <Lock className="h-12 w-12 mx-auto mb-3 text-destructive" />
            <h2 className="text-lg font-bold mb-1">Acesso Restrito</h2>
            <p className="text-sm text-muted-foreground">
              Apenas o Admin Master pode gerenciar os Anúncios Marketplace.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Anúncios Marketplace
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os anúncios estilo marketplace exibidos no feed.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Anúncio
        </Button>
      </div>

      {/* Master switch */}
      <Card className={cn("border-2", featureEnabled ? "border-green-500/40" : "border-amber-500/40")}>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-12 w-12 rounded-full flex items-center justify-center",
              featureEnabled ? "bg-green-500/15 text-green-500" : "bg-amber-500/15 text-amber-500"
            )}>
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Exibir anúncios no feed principal</p>
              <p className="text-xs text-muted-foreground">
                {featureEnabled
                  ? "A seção de anúncios está visível no feed para todos os usuários."
                  : "A seção está oculta. Ative para começar a exibir os anúncios."}
              </p>
            </div>
          </div>
          <Switch
            checked={!!featureEnabled}
            onCheckedChange={async (v) => {
              try {
                await toggleFeature.mutateAsync(v);
                toast.success(v ? "Anúncios ativados no feed" : "Anúncios ocultados do feed");
              } catch {
                toast.error("Erro ao alterar configuração");
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Anúncios cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : ads && ads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Anunciante</TableHead>
                  <TableHead>Reputação</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img loading="lazy" decoding="async"
                          src={ad.main_image_url}
                          alt={ad.title}
                          className="w-12 h-12 rounded object-cover bg-muted"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium line-clamp-1">{ad.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{ad.short_description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{formatBRL(ad.price)}</TableCell>
                    <TableCell>
                      {ad.advertiser ? (
                        <div className="flex items-center gap-2">
                          {ad.advertiser.avatar_url && (
                            <img loading="lazy" decoding="async" src={ad.advertiser.avatar_url} className="w-6 h-6 rounded-full object-cover" />
                          )}
                          <span className="text-sm">{ad.advertiser.name || ad.advertiser.username || "—"}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ad.advertiser_profile_id ? (
                        <button onClick={() => openReputation(ad)} className="hover:opacity-80">
                          <ReputationBadge
                            rating={ad.reputation?.rating || 0}
                            totalReviews={ad.reputation?.total_reviews || 0}
                            size="sm"
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={ad.is_active ? "default" : "secondary"}
                        className={cn(ad.is_active && "bg-green-500/15 text-green-500 hover:bg-green-500/25")}
                      >
                        {ad.is_active ? "Ativo" : "Pausado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleToggleAd(ad)}>
                          {ad.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ad)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(ad.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum anúncio cadastrado.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { setShowModal(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Anúncio" : "Novo Anúncio"}</DialogTitle>
            <DialogDescription>
              Preencha os dados do anúncio. Todos os campos com * são obrigatórios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Título do anúncio *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Preço (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Ordem de exibição</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label>Resumo (aparece no feed) *</Label>
              <Textarea
                rows={2}
                maxLength={140}
                value={form.short_description}
                onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                placeholder="Resumo curto exibido abaixo da imagem no feed (até 140 caracteres)"
              />
            </div>

            <div>
              <Label>Descrição completa</Label>
              <Textarea
                rows={4}
                value={form.full_description}
                onChange={(e) => setForm({ ...form, full_description: e.target.value })}
                placeholder="Descrição detalhada exibida no modal expandido"
              />
            </div>

            <div>
              <Label>URL da Imagem Principal *</Label>
              <Input
                value={form.main_image_url}
                onChange={(e) => setForm({ ...form, main_image_url: e.target.value })}
                placeholder="https://..."
              />
              {form.main_image_url && (
                <img loading="lazy" decoding="async" src={form.main_image_url} className="mt-2 w-32 h-32 rounded object-cover" />
              )}
            </div>

            <div>
              <Label>Galeria (até 10 imagens — atualmente {form.gallery_images.length}/10)</Label>
              <div className="flex gap-2">
                <Input
                  value={galleryDraft}
                  onChange={(e) => setGalleryDraft(e.target.value)}
                  placeholder="https://..."
                />
                <Button type="button" variant="secondary" onClick={addGalleryImage} disabled={form.gallery_images.length >= 10}>
                  <ImagePlus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
              {form.gallery_images.length > 0 && (
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {form.gallery_images.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative group">
                      <img loading="lazy" decoding="async" src={url} className="w-full aspect-square object-cover rounded" />
                      <button
                        type="button"
                        onClick={() => removeGalleryImage(i)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>URL do Vídeo (1 vídeo opcional)</Label>
              <Input
                value={form.video_url}
                onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                placeholder="https://.../video.mp4"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>ID do Anunciante (profiles.id)</Label>
                <Input
                  value={form.advertiser_profile_id}
                  onChange={(e) => setForm({ ...form, advertiser_profile_id: e.target.value })}
                  placeholder="uuid do perfil"
                />
              </div>
              <div>
                <Label>URL externa (opcional)</Label>
                <Input
                  value={form.external_url}
                  onChange={(e) => setForm({ ...form, external_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <span className="text-sm">{form.is_active ? "Anúncio ativo" : "Anúncio pausado"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={upsertAd.isPending}>
              {upsertAd.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anúncio?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reputation editor */}
      <Dialog open={!!repAd} onOpenChange={(o) => !o && setRepAd(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              Reputação do Anunciante
            </DialogTitle>
            <DialogDescription>
              Defina a nota (0–5) e total de avaliações deste anunciante.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nota (0 a 5)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={repRating}
                onChange={(e) => setRepRating(Math.max(0, Math.min(5, parseFloat(e.target.value) || 0)))}
              />
            </div>
            <div>
              <Label>Total de avaliações</Label>
              <Input
                type="number"
                min="0"
                value={repReviews}
                onChange={(e) => setRepReviews(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-2">Pré-visualização</p>
              <ReputationBadge rating={repRating} totalReviews={repReviews} size="lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRepAd(null)}>Cancelar</Button>
            <Button onClick={saveReputation} disabled={upsertRep.isPending}>
              {upsertRep.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
