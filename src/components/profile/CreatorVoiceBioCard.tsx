import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Play, Pause, MicOff, Send, Lightbulb, Loader2, Headphones, Sparkles, ExternalLink, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceBioReactionButtons } from "./VoiceBioReactionButtons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";

interface CreatorVoiceBioCardProps {
  url?: string | null;
  duration?: number | null;
  displayName?: string;
  ownerId?: string | null;
}

const VOICE_BIO_EXAMPLES = [
  "Oi! Sou aquele tipo de pessoa que adora um bom papo regado a café… ou a um drink no fim do dia. Bora trocar uma ideia?",
  "Olá, prazer! Aqui é um espaço pra trocar boas energias, conhecer gente nova e viver experiências leves e verdadeiras.",
  "Curto música, viagens curtas e conversas longas. Se quiser saber mais, manda mensagem que eu respondo de coração.",
  "Sou discreta, carinhosa e gosto de quem sabe levar a vida sem pressa. Vamos nos conhecer com calma?",
  "Casal aberto, sem julgamentos e cheio de respeito. Aqui é zona livre de pressa e cheia de cumplicidade.",
];

interface VoiceBioAudioExample {
  user_id: string;
  username: string | null;
  name?: string | null;
  avatar_url: string | null;
  voice_bio_url: string;
  voice_bio_duration: number | null;
}

export function CreatorVoiceBioCard({ url, duration, displayName, ownerId }: CreatorVoiceBioCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [alreadyRequested, setAlreadyRequested] = useState(false);
  const [requestCount, setRequestCount] = useState<number>(0);
  const [audioExamples, setAudioExamples] = useState<VoiceBioAudioExample[] | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const { user } = useAuth();

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (el.duration > 0) setProgress((el.currentTime / el.duration) * 100);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [url]);

  // Busca exemplos de áudio quando o modal abre
  useEffect(() => {
    if (!examplesOpen || audioExamples) return;
    let cancelled = false;
    (async () => {
      setLoadingAudio(true);
      try {
        const { data: masterRow } = await (supabase as any)
          .from("profiles")
          .select("user_id, username, name, avatar_url, voice_bio_url, voice_bio_duration")
          .eq("username", "ocultomaster")
          .not("voice_bio_url", "is", null)
          .limit(1)
          .maybeSingle();

        const { data: othersData } = await (supabase as any)
          .from("profiles")
          .select("user_id, username, name, avatar_url, voice_bio_url, voice_bio_duration, is_seed, is_invisible")
          .not("voice_bio_url", "is", null)
          .neq("username", "ocultomaster")
          .limit(60);

        if (cancelled) return;

        const others = (Array.isArray(othersData) ? (othersData as any[]) : [])
          .filter((p) => p?.is_seed !== true && p?.is_invisible !== true);

        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }

        const list: VoiceBioAudioExample[] = [];
        if (masterRow) list.push(masterRow as VoiceBioAudioExample);
        for (const o of others) {
          if (list.length >= 5) break;
          if (!list.find((x) => x.user_id === o.user_id)) list.push(o as VoiceBioAudioExample);
        }
        setAudioExamples(list);
      } catch {
        if (!cancelled) setAudioExamples([]);
      } finally {
        if (!cancelled) setLoadingAudio(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examplesOpen, audioExamples]);

  // Pausa todos os áudios ao fechar
  useEffect(() => {
    if (!examplesOpen) {
      audioRefs.current.forEach((el) => { try { el.pause(); } catch { /* noop */ } });
    }
  }, [examplesOpen]);

  // Carrega contagem total de pedidos e se o usuário atual já pediu
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { count } = await (supabase as any)
          .from("oculto_voice_bio_requests")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", ownerId);
        if (!cancelled && typeof count === "number") setRequestCount(count);

        if (user?.id && user.id !== ownerId) {
          const { data: mine } = await (supabase as any)
            .from("oculto_voice_bio_requests")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("requester_id", user.id)
            .maybeSingle();
          if (!cancelled && mine) setAlreadyRequested(true);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [ownerId, user?.id]);

  const handleAudioPlay = (currentId: string) => {
    audioRefs.current.forEach((el, id) => {
      if (id !== currentId && !el.paused) {
        try { el.pause(); } catch { /* noop */ }
      }
    });
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };

  const handleRequestAudio = async () => {
    if (!user) { toast.error("Faça login para pedir um áudio."); return; }
    if (!ownerId) return;
    if (user.id === ownerId) return;
    if (alreadyRequested) return;
    setRequesting(true);
    try {
      const { data: meProfile } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const requesterName = (meProfile as any)?.username ? `@${(meProfile as any).username}` : "Alguém";

      // Registra o pedido (1 por par requester+owner). Se já existir, marcamos como enviado.
      const { error: reqErr } = await (supabase as any)
        .from("oculto_voice_bio_requests")
        .insert({ owner_id: ownerId, requester_id: user.id });

      if (reqErr) {
        const msg = (reqErr.message || "").toLowerCase();
        const isDup = msg.includes("duplicate") || msg.includes("unique") || (reqErr as any).code === "23505";
        if (isDup) {
          setAlreadyRequested(true);
          toast.info("Você já pediu um áudio para este perfil.");
          return;
        }
        throw reqErr;
      }

      // Notificação (best-effort, não bloqueia o sucesso)
      const messageText = `${requesterName} quer ouvir sua bio em áudio. Grave a sua agora!`;
      const basePayload: any = {
        user_id: ownerId,
        type: "audio_bio_request",
        title: "🎙️ Pediram sua bio em áudio",
        message: messageText,
        body: messageText,
      };
      const fullPayload: any = {
        ...basePayload,
        data: { kind: "audio_bio_request", actor_id: user.id, cta_url: "/profile#voice-bio" },
      };
      let { error: notifErr } = await supabase.from("notifications").insert(fullPayload as any);
      if (notifErr && /data/i.test(notifErr.message || "") && /schema cache|column/i.test(notifErr.message || "")) {
        const retry = await supabase.from("notifications").insert(basePayload as any);
        notifErr = retry.error;
      }

      setAlreadyRequested(true);
      setRequestCount((c) => c + 1);
      toast.success("Pedido enviado! O usuário foi notificado.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar o pedido.");
    } finally {
      setRequesting(false);
    }
  };

  if (!url) {
    const isOwner = !!user && user.id === ownerId;
    return (
      <>
        <div className="max-w-sm mx-auto w-full rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
              <MicOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Bio em áudio</p>
                {requestCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
                    <Users className="h-3 w-3" />
                    {requestCount} {requestCount === 1 ? "pedido" : "pedidos"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {displayName || "Este usuário"} ainda não gravou uma bio em áudio.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestAudio}
              disabled={requesting || alreadyRequested || isOwner}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition",
                alreadyRequested
                  ? "bg-emerald-500 text-white hover:bg-emerald-500 cursor-default"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              )}
            >
              {alreadyRequested ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Pedido enviado
                </>
              ) : requesting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pedir áudio
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Pedir áudio
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setExamplesOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold border border-border bg-background hover:bg-muted transition"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Exemplos
            </button>
          </div>
        </div>

        <Dialog open={examplesOpen} onOpenChange={setExamplesOpen}>
          <DialogContent
            className="
              p-0 gap-0 overflow-hidden rounded-2xl
              w-[calc(100vw-1rem)] sm:w-full sm:max-w-md
              h-auto
              max-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-7rem)]
              sm:max-h-[calc(100dvh-3rem)]
              grid grid-rows-[auto_minmax(0,1fr)_auto]
            "
          >
            <DialogHeader className="space-y-1.5 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border/50 text-left">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
                <span className="inline-flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shrink-0">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <span className="truncate">Exemplos de bio em áudio</span>
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                Inspire-se com textos prontos e ouça como outros membros se apresentam.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="audios" className="min-h-0 flex flex-col">
              <div className="px-4 sm:px-6 pt-3">
                <TabsList className="grid w-full grid-cols-2 bg-muted/40">
                  <TabsTrigger
                    value="textos"
                    className="gap-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=inactive]:text-amber-600 dark:data-[state=inactive]:text-amber-400 font-semibold"
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> Textos
                  </TabsTrigger>
                  <TabsTrigger
                    value="audios"
                    className="gap-1.5 data-[state=active]:bg-fuchsia-600 data-[state=active]:text-white data-[state=inactive]:text-fuchsia-600 dark:data-[state=inactive]:text-fuchsia-400 font-semibold"
                  >
                    <Headphones className="h-3.5 w-3.5" /> Áudios
                  </TabsTrigger>
                </TabsList>
              </div>


              <TabsContent
                value="textos"
                className="min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-2 mt-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >

                {VOICE_BIO_EXAMPLES.map((ex, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed text-foreground">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider block mb-1">Exemplo {i + 1}</span>
                    "{ex}"
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  Dica: fale com naturalidade, sorria enquanto grava e mantenha entre 10 e 30 segundos.
                </p>
              </TabsContent>

              <TabsContent
                value="audios"
                className="min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-3 mt-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >

                {loadingAudio && (
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

                {!loadingAudio && audioExamples && audioExamples.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-6 text-center">
                    <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary/70" />
                    <p className="text-sm text-muted-foreground">
                      Ainda não há exemplos públicos de bio em áudio.
                    </p>
                  </div>
                )}

                {!loadingAudio && audioExamples && audioExamples.map((ex) => {
                  const handle = ex.username || "membro";
                  return (
                    <div key={ex.user_id} className="rounded-xl border border-border/50 bg-card/60 p-2.5 sm:p-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Avatar className="h-10 w-10 sm:h-11 sm:w-11 shrink-0">
                          <AvatarImage src={ex.avatar_url || ""} alt={`@${handle}`} />
                          <AvatarFallback className="bg-primary/15 text-primary text-sm">
                            {handle[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] sm:text-sm font-semibold text-foreground">
                            @{handle}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            Bio de áudio{ex.voice_bio_duration ? ` · ${Math.round(ex.voice_bio_duration)}s` : ""}
                          </p>
                        </div>
                        <Link
                          to={`/u/${encodeURIComponent(handle)}`}
                          onClick={() => setExamplesOpen(false)}
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
                          onPlay={() => handleAudioPlay(ex.user_id)}
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
              </TabsContent>
            </Tabs>

            <div className="border-t border-border/50 bg-background px-4 sm:px-6 py-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setExamplesOpen(false)} className="h-10 sm:w-auto">
                Fechar
              </Button>
              <Button asChild className="h-10 sm:w-auto font-semibold">
                <Link to="/profile#voice-bio" onClick={() => setExamplesOpen(false)}>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Gravar a minha
                </Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="max-w-sm mx-auto w-full rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-secondary/10 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-primary font-semibold uppercase tracking-wider">
            <Mic className="h-3 w-3" /> Bio em áudio
            {duration ? <span className="text-muted-foreground font-normal">· {duration}s</span> : null}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <audio ref={audioRef} src={url} preload="metadata" />
      </div>
      {ownerId && (
        <div className="flex justify-end">
          <VoiceBioReactionButtons ownerId={ownerId} />
        </div>
      )}
    </div>
  );
}
