import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useCommunityCategories,
  useCreateCommunity,
  useCommunitySettings,
  useUploadCommunityMedia,
  slugify,
} from '@/hooks/useCommunities';
import { useNavigate } from 'react-router-dom';
import { COMMUNITY_ACCENT_PALETTE } from './communityPalette';


export function CreateCommunityModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { data: categories = [] } = useCommunityCategories();
  const { data: settings } = useCommunitySettings();
  const create = useCreateCommunity();
  const upload = useUploadCommunityMedia();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'premium_only' | 'vip_only' | 'creator_exclusive'>('public');
  const [isAdult, setIsAdult] = useState(false);
  const [rules, setRules] = useState('');
  const [accentColor, setAccentColor] = useState<string>('#a855f7');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<'cover' | 'avatar' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); }, []);

  const slug = slugify(title);
  const canSubmit = title.trim().length >= 3 && slug.length >= 3 && !create.isPending && !uploadingKind;

  const handlePickFile = async (kind: 'cover' | 'avatar', file?: File | null) => {
    if (!file) return;
    setUploadingKind(kind);
    setUploadProgress(4);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      setUploadProgress((p) => (p >= 92 ? p : p + Math.max(1, Math.round((95 - p) * 0.12))));
    }, 120);
    try {
      const res = await upload.mutateAsync(file);
      if (kind === 'cover') setCoverUrl(res.url);
      else setAvatarUrl(res.url);
      setUploadProgress(100);
    } finally {
      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
      setTimeout(() => { setUploadingKind(null); setUploadProgress(0); }, 350);
    }
  };

  const handleSubmit = async () => {
    try {
      const id = await create.mutateAsync({
        title: title.trim(),
        slug,
        description: description.trim() || undefined,
        category_id: categoryId || null,
        visibility,
        is_adult: isAdult,
        rules: rules.trim() || null,
        accent_color: accentColor,
        cover_url: coverUrl,
        avatar_url: avatarUrl,
      });

      onOpenChange(false);
      setTitle(''); setDescription(''); setRules('');
      // Navega para a comunidade recém-criada
      const finalSlug = slug;
      setTimeout(() => navigate(`/comunidades/${finalSlug}`), 50);
      void id;
    } catch {/* toast tratado no hook */}
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:w-full max-w-md p-0 gap-0 max-h-[92svh] sm:max-h-[88vh] overflow-hidden flex flex-col"
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-base">Criar comunidade</DialogTitle>
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
                  <span>Adicionar capa</span>
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
              {uploadingKind === 'cover' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                  <span className="text-[11px] font-medium text-white">Enviando capa… {uploadProgress}%</span>
                  <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-purple-500 transition-[width] duration-200 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePickFile('cover', e.target.files?.[0])}
            />

            <div
              className="absolute -bottom-6 left-3 h-12 w-12 rounded-xl border-2 border-background overflow-hidden cursor-pointer flex items-center justify-center"
              style={{ backgroundColor: avatarUrl ? 'transparent' : accentColor }}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : uploadingKind === 'avatar' ? null : (
                <ImagePlus className="h-4 w-4 text-white" />
              )}
              {uploadingKind === 'avatar' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/65 backdrop-blur-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                  <span className="text-[9px] font-semibold text-white leading-none">{uploadProgress}%</span>
                  <div className="absolute bottom-1 left-1 right-1 h-1 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-purple-500 transition-[width] duration-200 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePickFile('avatar', e.target.files?.[0])}
            />
          </div>

          <div className="pt-6">

            <Label className="text-xs">Nome</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Alienígenas e Mistérios" maxLength={60} />
            {slug && <p className="text-[10px] text-muted-foreground mt-1">URL: /comunidades/<b>{slug}</b></p>}
          </div>

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} placeholder="Sobre o que é a comunidade?" />
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
              {settings?.allow_private_communities && <option value="private">Privada (entrada por aprovação)</option>}
              {settings?.allow_premium_only_communities && <option value="premium_only">Somente Premium</option>}
              {settings?.allow_vip_only_communities && <option value="vip_only">Somente VIP</option>}
              {settings?.allow_creator_exclusive_communities && <option value="creator_exclusive">Exclusiva de criadores</option>}
            </select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-2">
            <div>
              <Label className="text-xs">Conteúdo adulto (+18)</Label>
              <p className="text-[10px] text-muted-foreground">Marque se a comunidade tratar de temas adultos.</p>
            </div>
            <Switch checked={isAdult} onCheckedChange={setIsAdult} />
          </div>

          <div>
            <Label className="text-xs">Regras (opcional)</Label>
            <Textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={3} maxLength={1000} placeholder="Regras da comunidade…" />
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
            {create.isPending ? 'Criando…' : 'Criar comunidade'}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
