/**
 * Modal de edição de comunidade — disponível para owner e master.
 * Permite alterar título, descrição, regras, visibilidade, +18, cor,
 * capa e avatar (reusa bucket privado community-media + signed URL).
 *
 * Layout: responsivo (sem barra cinza, scroll vertical interno),
 * espelha o CreateCommunityModal para qualquer resolução mobile.
 */
import { useRef, useState, useEffect } from 'react';
import { ImagePlus, Loader2, X, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useUpdateCommunity,
  useUploadCommunityMedia,
  useCommunityCategories,
  useCommunitySettings,
  useDeleteCommunity,
  type Community,
} from '@/hooks/useCommunities';
import { useNavigate } from 'react-router-dom';
import { COMMUNITY_ACCENT_PALETTE } from './communityPalette';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  community: Community;
}

export function EditCommunityModal({ open, onOpenChange, community }: Props) {
  const update = useUpdateCommunity(community.id);
  const remove = useDeleteCommunity(community.id);
  const upload = useUploadCommunityMedia();
  const { data: categories = [] } = useCommunityCategories();
  const { data: settings } = useCommunitySettings();
  const navigate = useNavigate();

  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(community.title);
  const [description, setDescription] = useState(community.description ?? '');
  const [rules, setRules] = useState((community as any).rules ?? '');
  const [categoryId, setCategoryId] = useState<string>((community as any).category_id ?? '');
  const [visibility, setVisibility] = useState<Community['visibility']>(community.visibility);
  const [isAdult, setIsAdult] = useState<boolean>(!!(community as any).is_adult);
  const [accentColor, setAccentColor] = useState<string>((community as any).accent_color ?? '#a855f7');
  const [coverUrl, setCoverUrl] = useState<string | null>(community.cover_url);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(community.avatar_url);
  const [uploadingKind, setUploadingKind] = useState<'cover' | 'avatar' | null>(null);

  // Sincroniza ao reabrir
  useEffect(() => {
    if (!open) return;
    setTitle(community.title);
    setDescription(community.description ?? '');
    setRules((community as any).rules ?? '');
    setCategoryId((community as any).category_id ?? '');
    setVisibility(community.visibility);
    setIsAdult(!!(community as any).is_adult);
    setAccentColor((community as any).accent_color ?? '#a855f7');
    setCoverUrl(community.cover_url);
    setAvatarUrl(community.avatar_url);
  }, [open, community]);

  const handlePickFile = async (kind: 'cover' | 'avatar', file?: File | null) => {
    if (!file) return;
    setUploadingKind(kind);
    try {
      const res = await upload.mutateAsync(file);
      if (kind === 'cover') setCoverUrl(res.url);
      else setAvatarUrl(res.url);
    } finally {
      setUploadingKind(null);
    }
  };

  const canSubmit = title.trim().length >= 3 && !update.isPending && !uploadingKind;

  const handleSubmit = async () => {
    try {
      await update.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        rules: rules.trim() || null,
        category_id: categoryId || null,
        visibility,
        is_adult: isAdult,
        accent_color: accentColor,
        cover_url: coverUrl,
        avatar_url: avatarUrl,
      });
      onOpenChange(false);
    } catch {/* toast no hook */}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:w-full max-w-md p-0 gap-0 max-h-[92svh] sm:max-h-[88vh] overflow-hidden flex flex-col"
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-base">Editar comunidade</DialogTitle>
        </DialogHeader>
        <div className="scrollbar-hide overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 flex-1 overscroll-contain">
          <div className="space-y-3 mt-2">
            {/* Capa + Avatar */}
            <div className="relative">
              <div
                className="h-24 rounded-lg overflow-hidden border border-border flex items-center justify-center cursor-pointer hover:opacity-90"
                style={{
                  background: coverUrl
                    ? `url(${coverUrl}) center/cover`
                    : `linear-gradient(135deg, ${accentColor}, ${accentColor}55)`,
                }}
                onClick={() => coverInputRef.current?.click()}
              >
                {!coverUrl && (
                  <div className="flex flex-col items-center gap-1 text-white/80 text-xs">
                    {uploadingKind === 'cover' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    <span>Trocar capa</span>
                  </div>
                )}
                {coverUrl && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCoverUrl(null); }}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={coverInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handlePickFile('cover', e.target.files?.[0])}
              />

              <div
                className="absolute -bottom-6 left-3 h-12 w-12 rounded-xl border-2 border-background overflow-hidden cursor-pointer flex items-center justify-center"
                style={{ backgroundColor: avatarUrl ? 'transparent' : accentColor }}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : uploadingKind === 'avatar' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-white" />
                )}
              </div>
              <input
                ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handlePickFile('avatar', e.target.files?.[0])}
              />
            </div>

            <div className="pt-6">
              <Label className="text-xs">Nome</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
            </div>

            <div>
              <Label className="text-xs">Categoria</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs">Visibilidade</Label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="public">Pública</option>
                {settings?.allow_private_communities && <option value="private">Privada (aprovação)</option>}
                {settings?.allow_premium_only_communities && <option value="premium_only">Somente Premium</option>}
                {settings?.allow_vip_only_communities && <option value="vip_only">Somente VIP</option>}
                {settings?.allow_creator_exclusive_communities && <option value="creator_exclusive">Exclusiva de criadores</option>}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-2">
              <Label className="text-xs">Conteúdo adulto (+18)</Label>
              <Switch checked={isAdult} onCheckedChange={setIsAdult} />
            </div>

            <div>
              <Label className="text-xs">Regras (opcional)</Label>
              <Textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={3} maxLength={1000} />
            </div>

            <div>
              <Label className="text-xs">Cor de destaque</Label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {COMMUNITY_ACCENT_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAccentColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      accentColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-7 w-10 rounded cursor-pointer bg-transparent border border-border"
                />
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
              {update.isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>

            <div className="pt-3 mt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 text-rose-500 border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                disabled={remove.isPending}
                onClick={() => {
                  const txt = window.prompt(
                    `Esta ação é IRREVERSÍVEL. Tópicos, respostas e mídias serão removidos.\n\nDigite EXCLUIR para confirmar a exclusão da comunidade "${community.title}":`,
                  );
                  if (txt?.trim().toUpperCase() === 'EXCLUIR') {
                    remove.mutate(undefined, {
                      onSuccess: () => {
                        onOpenChange(false);
                        setTimeout(() => navigate('/comunidades'), 50);
                      },
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                {remove.isPending ? 'Excluindo…' : 'Excluir comunidade'}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Apenas o dono pode excluir. A ação não pode ser desfeita.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
