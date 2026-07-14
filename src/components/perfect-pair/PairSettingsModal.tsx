/**
 * PairSettingsModal — Perfect Pair filters & photo selection
 * Banco externo (rvybbrkzmboqbhcemqar) — tabela pair_settings
 * Colunas reais: user_id, min_age, max_age, interested_in[], max_distance_km, show_only_verified, match_photos[]
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, X, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GENDER_OPTIONS = [
  { value: 'female', label: 'Mulheres' },
  { value: 'male', label: 'Homens' },
  { value: 'couple', label: 'Casais' },
  { value: 'trans', label: 'Trans' },
];

const MAX_PHOTOS = 10;
const STORAGE_BUCKET = 'avatars';
const STORAGE_PUBLIC_BASE = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/avatars`;

export const PairSettingsModal = memo(function PairSettingsModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Settings state
  const [ageRange, setAgeRange] = useState<number[]>([18, 99]);
  const [maxDistance, setMaxDistance] = useState(100);
  const [interestedIn, setInterestedIn] = useState<string[]>(['female', 'male', 'couple', 'trans']);
  const [matchPhotos, setMatchPhotos] = useState<string[]>([]);
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (!open || !user?.id || !profile?.id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: settings, error } = await (supabase as any)
          .from('pair_settings')
          .select('min_age, max_age, max_distance_km, interested_in, match_photos, show_only_verified')
          .eq('user_id', profile.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn('[PairSettings] load error:', error.message);
        }

        if (settings) {
          setAgeRange([settings.min_age ?? 18, settings.max_age ?? 99]);
          setMaxDistance(settings.max_distance_km ?? 100);
          setInterestedIn(
            Array.isArray(settings.interested_in) && settings.interested_in.length > 0
              ? settings.interested_in
              : ['female', 'male', 'couple', 'trans']
          );
          setMatchPhotos(Array.isArray(settings.match_photos) ? settings.match_photos : []);
          setShowOnlyVerified(!!settings.show_only_verified);
        } else {
          // Defaults para primeira vez
          setAgeRange([18, 99]);
          setMaxDistance(100);
          setInterestedIn(['female', 'male', 'couple', 'trans']);
          setMatchPhotos([]);
          setShowOnlyVerified(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, user?.id, profile?.id]);

  const toggleGender = useCallback((gender: string) => {
    setInterestedIn(prev =>
      prev.includes(gender)
        ? prev.filter(g => g !== gender)
        : [...prev, gender]
    );
  }, []);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.id || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    setUploading(true);

    try {
      for (const file of files) {
        // Verifica limite usando state atual
        let currentCount = 0;
        setMatchPhotos(prev => { currentCount = prev.length; return prev; });
        if (currentCount >= MAX_PHOTOS) break;

        // Comprime via canvas para WebP
        const url = URL.createObjectURL(file);
        const blob: Blob | null = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const maxSize = 1280;
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
              const ratio = Math.min(maxSize / w, maxSize / h);
              w *= ratio; h *= ratio;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
            canvas.toBlob((b) => {
              URL.revokeObjectURL(url);
              resolve(b);
            }, 'image/webp', 0.75);
          };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
          img.src = url;
        });

        if (!blob) {
          toast({ title: 'Erro ao processar imagem', variant: 'destructive' });
          continue;
        }

        const path = `${user.id}/pair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, blob, { contentType: 'image/webp', upsert: false });

        if (upErr) {
          console.error('[PairSettings] upload error:', upErr.message);
          toast({ title: 'Erro ao enviar foto', description: upErr.message, variant: 'destructive' });
          continue;
        }

        const publicUrl = `${STORAGE_PUBLIC_BASE}/${path}`;
        setMatchPhotos(prev => (prev.length >= MAX_PHOTOS ? prev : [...prev, publicUrl]));
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [user?.id]);

  const removePhoto = useCallback((idx: number) => {
    setMatchPhotos(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = useCallback(async () => {
    if (!user?.id || !profile?.id) return;
    setSaving(true);

    try {
      const { error } = await (supabase as any)
        .from('pair_settings')
        .upsert({
          user_id: profile.id,
          min_age: ageRange[0],
          max_age: ageRange[1],
          max_distance_km: maxDistance,
          interested_in: interestedIn,
          match_photos: matchPhotos,
          show_only_verified: showOnlyVerified,
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast({ title: 'Configurações salvas!' });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[PairSettings] save error:', err?.message);
      toast({ title: 'Erro ao salvar', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [user?.id, profile?.id, ageRange, maxDistance, interestedIn, matchPhotos, showOnlyVerified, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto scrollbar-hide p-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Configurações do Pair</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha suas fotos e filtros de busca
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 mt-2">
            {/* Photo Grid */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">
                Suas Fotos ({matchPhotos.length}/{MAX_PHOTOS})
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {matchPhotos.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border/50">
                    <img loading="lazy" decoding="async"
                      src={url}
                      alt=""
                      className="w-full h-full object-cover select-none"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
                {matchPhotos.length < MAX_PHOTOS && (
                  <label className={cn(
                    "aspect-square rounded-lg border-2 border-dashed border-primary/30 flex items-center justify-center cursor-pointer hover:bg-primary/5 transition-colors",
                    uploading && "opacity-50 pointer-events-none"
                  )}>
                    {uploading ? (
                      <Loader2 className="h-5 w-5 text-primary/50 animate-spin" />
                    ) : (
                      <Plus className="h-5 w-5 text-primary/50" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Age Range */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">
                Idade: {ageRange[0]} – {ageRange[1]} anos
              </Label>
              <Slider
                min={18}
                max={99}
                step={1}
                value={ageRange}
                onValueChange={setAgeRange}
                className="w-full"
              />
            </div>

            {/* Distance */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">
                Distância máxima: {maxDistance} km
              </Label>
              <Slider
                min={5}
                max={500}
                step={5}
                value={[maxDistance]}
                onValueChange={([v]) => setMaxDistance(v)}
                className="w-full"
              />
            </div>

            {/* Gender Interest */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">Interesse em</Label>
              <div className="flex flex-wrap gap-3">
                {GENDER_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm",
                      interestedIn.includes(opt.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground"
                    )}
                  >
                    <Checkbox
                      checked={interestedIn.includes(opt.value)}
                      onCheckedChange={() => toggleGender(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Show only verified */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showOnlyVerified}
                onCheckedChange={(c) => setShowOnlyVerified(c === true)}
              />
              <span className="text-sm">Mostrar apenas perfis verificados</span>
            </label>

            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={saving || uploading}
              className="w-full h-12 bg-gradient-to-r from-[#FF2D55] via-[#FF3B30] to-[#AF52DE] text-white font-bold"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Configurações
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
