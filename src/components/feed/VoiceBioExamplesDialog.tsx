/**
 * VoiceBioExamplesDialog
 * Modal com 3 perfis reais que já configuraram bio de áudio.
 * Player nativo embutido para o usuário entender como funciona.
 * Fonte: profiles do Supabase externo onde voice_bio_url IS NOT NULL.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Headphones, Sparkles, ExternalLink, Play } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { VoiceBioReactionButtons } from '@/components/profile/VoiceBioReactionButtons';

interface VoiceBioExample {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  voice_bio_url: string;
  voice_bio_duration: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoiceBioExamplesDialog({ open, onOpenChange }: Props) {
  const [examples, setExamples] = useState<VoiceBioExample[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Refs de cada <audio> renderizado, para garantir que apenas 1 toque por vez
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    if (!open || examples) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) Sempre inclui ocultomaster (perfil oficial fixo).
        const { data: masterRow } = await (supabase as any)
          .from('profiles')
          .select('user_id, username, name, avatar_url, voice_bio_url, voice_bio_duration')
          .eq('username', 'ocultomaster')
          .not('voice_bio_url', 'is', null)
          .limit(1)
          .maybeSingle();

        // 2) Demais candidatos com bio de áudio (exceto o master).
        const { data: othersData } = await (supabase as any)
          .from('profiles')
          .select('user_id, username, name, avatar_url, voice_bio_url, voice_bio_duration, plan_type, is_seed, is_invisible')
          .not('voice_bio_url', 'is', null)
          .neq('is_seed', true)
          .neq('is_invisible', true)
          .neq('username', 'ocultomaster')
          .limit(40);
        if (cancelled) return;

        const others = (Array.isArray(othersData) ? (othersData as any[]) : []);
        // Embaralha (Fisher–Yates) — variedade a cada abertura.
        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }

        const list: VoiceBioExample[] = [];
        if (masterRow) list.push(masterRow as VoiceBioExample);
        for (const o of others) {
          if (list.length >= 3) break;
          if (!list.find((x) => x.user_id === o.user_id)) list.push(o as VoiceBioExample);
        }
        setExamples(list);
      } catch {
        if (!cancelled) setExamples([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, examples]);


  // Quando o modal fecha, pausa tudo
  useEffect(() => {
    if (!open) {
      audioRefs.current.forEach((el) => { try { el.pause(); } catch { /* noop */ } });
    }
  }, [open]);

  const handlePlay = (currentId: string) => {
    audioRefs.current.forEach((el, id) => {
      if (id !== currentId && !el.paused) {
        try { el.pause(); } catch { /* noop */ }
      }
    });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          p-0 gap-0 overflow-hidden rounded-2xl
          w-[calc(100vw-1rem)] sm:w-full sm:max-w-md
          h-auto
          max-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)]
          sm:max-h-[calc(100dvh-3rem)]
          grid grid-rows-[auto_minmax(0,1fr)_auto]
        "
      >
        <DialogHeader className="space-y-1.5 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border/50 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
            <span className="inline-flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shrink-0">
              <Headphones className="h-4 w-4" />
            </span>
            <span className="truncate">Exemplos de bio de áudio</span>
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Ouça como outros membros do Oculto usam a bio de áudio para se apresentar.
            Toque no play de cada um para escutar.
          </DialogDescription>
        </DialogHeader>

        <div
          className="
            min-h-0 overflow-y-auto overscroll-contain
            px-4 sm:px-6 py-4 space-y-3
            [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          "
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {loading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && examples && examples.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-6 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary/70" />
              <p className="text-sm text-muted-foreground">
                Ainda não há exemplos públicos de bio de áudio.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/80">
                Seja o primeiro a gravar a sua e inspire a comunidade.
              </p>
            </div>
          )}

          {!loading && examples && examples.map((ex) => {
            const handle = ex.username || 'membro';
            return (
            <div
              key={ex.user_id}
              className="rounded-xl border border-border/50 bg-card/60 p-2.5 sm:p-3"
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Avatar className="h-10 w-10 sm:h-11 sm:w-11 shrink-0">
                  <AvatarImage src={ex.avatar_url || ''} alt={`@${handle}`} />
                  <AvatarFallback className="bg-primary/15 text-primary text-sm">
                    {handle[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] sm:text-sm font-semibold text-foreground">
                    @{handle}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Bio de áudio{ex.voice_bio_duration ? ` · ${Math.round(ex.voice_bio_duration)}s` : ''}
                  </p>
                </div>
                <Link
                  to={`/u/${encodeURIComponent(handle)}`}
                  onClick={() => onOpenChange(false)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-background"
                  aria-label="Abrir perfil"
                >
                  Perfil <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-2.5 w-full max-w-full overflow-hidden">
                <audio
                  ref={(el) => {
                    if (el) audioRefs.current.set(ex.user_id, el);
                    else audioRefs.current.delete(ex.user_id);
                  }}
                  controls
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  {...({ disablePictureInPicture: true } as any)}
                  preload="none"
                  src={ex.voice_bio_url}
                  onPlay={() => handlePlay(ex.user_id)}
                  onContextMenu={(e) => e.preventDefault()}
                  className="block w-full max-w-full"
                  style={{ height: 36 }}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <VoiceBioReactionButtons ownerId={ex.user_id} />
              </div>
            </div>
            );
          })}
        </div>

        <div className="border-t border-border/50 bg-background px-4 sm:px-6 py-3 space-y-2">
          <Button
            asChild
            variant="secondary"
            className="w-full h-10 bg-gradient-to-r from-fuchsia-500/15 via-pink-500/10 to-rose-500/15 border border-fuchsia-500/30 text-fuchsia-100 hover:text-white"
          >
            <Link to="/oculto-play" onClick={() => onOpenChange(false)}>
              <Play className="mr-1.5 h-4 w-4 fill-current" />
              Ouvir mais áudios no OCULTO PLAY
            </Link>
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 sm:w-auto">
              Fechar
            </Button>
            <Button asChild className="h-10 sm:w-auto font-semibold">
              <Link to="/profile#voice-bio" onClick={() => onOpenChange(false)}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Gravar a minha
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
