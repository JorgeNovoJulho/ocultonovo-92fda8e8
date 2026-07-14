import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuraRoomsList, type AuraRoomItem } from "@/hooks/useAuraRoomsList";
import { AuraRoomLive } from "@/components/aura-match/AuraRoomLive";
import { useProfile } from "@/hooks/useProfile";
import { useAuraProgress } from "@/hooks/useAuraProgress";
import { useSocialScore } from "@/hooks/useSocialScore";
import { usePrestige } from "@/hooks/usePrestige";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import {
  ArrowRight,
  Flame,
  Info,
  Lock,
  MessageCircle,
  Sparkles,
  Star,
  Users,
  Crown,
  ShieldCheck,
  Zap,
  Trophy,
  LayoutGrid,
} from "lucide-react";
import { Card } from "@/components/ui/card";

/* ──────────────────────────────────────────────────────────────────────────
 * SALAS OCULTAS — carrossel horizontal abaixo de "Explorar Criadores VIP".
 * - Ordem: ciclo especial → Tema Livre → demais.
 * - Cards mostram descrição, "Entrar agora" e "Saiba mais" (requisitos).
 * - Mobile: scroll horizontal invisível, sem setas.
 * - Desktop: setas laterais que rolam o carrossel.
 * ──────────────────────────────────────────────────────────────────────── */

// Anti-spam local por ação: janela de 1500ms + lock de requisição em voo
// para impedir que múltiplos cliques rápidos dobrem o crédito de XP.
const lastAwardAt: Record<string, number> = {};
const inFlight: Record<string, boolean> = {};

async function awardRoomActionXp(action: "enter" | "info") {
  const now = Date.now();
  if (inFlight[action]) return;
  if (now - (lastAwardAt[action] ?? 0) < 1500) return;
  lastAwardAt[action] = now;
  inFlight[action] = true;
  try {
    const { data, error } = await (supabase as any).rpc("aura_room_action_award_xp", {
      p_action: action,
      p_amount: 10,
    });
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.ok && row?.awarded > 0) {
      toast.success(`+${row.awarded} XP de Aura`, {
        description: `${row.total_today}/${row.daily_cap} hoje`,
        duration: 1800,
      });
    }
  } catch {
    /* XP é bônus — falha silenciosa */
  } finally {
    inFlight[action] = false;
  }
}


/* ──────────────────────────────────────────────────────────────────────────
 * SALAS OCULTAS — carrossel horizontal abaixo de "Explorar Criadores VIP".
 * - Ordem: ciclo especial → Tema Livre → demais.
 * - Cards mostram descrição, "Entrar agora" e "Saiba mais" (requisitos).
 * - Mobile: scroll horizontal invisível, sem setas.
 * - Desktop: setas laterais que rolam o carrossel.
 * ──────────────────────────────────────────────────────────────────────── */

const FALLBACK_DESC: Record<string, string> = {
  tema_livre: "Bate-papo aberto sem tema definido — entre, observe ou puxe assunto.",
  default: "Sala temática ao vivo do Aura Match para conversar com pessoas afins.",
};

function getRoomDescription(room: AuraRoomItem): string {
  if (room.description && room.description.trim().length > 0) return room.description.trim();
  const slug = (room.slug || "").toLowerCase();
  return FALLBACK_DESC[slug] ?? FALLBACK_DESC.default;
}

type Requirement = { icon: typeof Crown; label: string; how: string; met: boolean };

type ViewerGateProfile = {
  plan_type?: string | null;
  is_verified?: boolean | null;
  document_verified?: boolean | null;
  profile_type?: string | null;
  gender?: string | null;
  aura_level?: number | null;
  social_score?: number | null;
  prestige_xp?: number | null;
};

function normalizeGateGender(profile?: ViewerGateProfile | null) {
  const raw = `${profile?.gender ?? profile?.profile_type ?? ""}`.trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("casal") || raw === "couple" || raw === "couples") return "casal";
  if (raw.includes("homem") || raw === "male" || raw === "man") return "homem";
  if (raw.includes("mulher") || raw === "female" || raw === "woman") return "mulher";
  if (raw.includes("trans") || raw.includes("travesti")) return "trans";
  return raw;
}

function buildRequirements(room: AuraRoomItem, viewer?: ViewerGateProfile | null, isMaster = false): Requirement[] {
  const reqs: Requirement[] = [];
  const planType = String(viewer?.plan_type ?? "").toLowerCase();
  if (room.vip_only || (room.required_plan && room.required_plan.toLowerCase() === "vip")) {
    reqs.push({
      icon: Crown,
      label: "Plano VIP ativo",
      how: "Assine o plano VIP em Planos para liberar salas exclusivas.",
      met: isMaster || ["vip", "vip_plus"].includes(planType),
    });
  } else if (room.required_plan && room.required_plan.toLowerCase() === "premium") {
    reqs.push({
      icon: Crown,
      label: "Plano Premium ou superior",
      how: "Faça upgrade para Premium em Planos.",
      met: isMaster || ["premium", "vip", "vip_plus"].includes(planType),
    });
  }
  if (room.requires_kyc) {
    reqs.push({
      icon: ShieldCheck,
      label: "Verificação KYC concluída",
      how: "Envie seus documentos em Configurações → Verificação.",
      met: isMaster || Boolean(viewer?.is_verified || viewer?.document_verified),
    });
  }
  if ((room.min_aura_level ?? 0) > 0) {
    reqs.push({
      icon: Zap,
      label: `Aura nível ${room.min_aura_level}+`,
      how: "Suba de nível completando missões diárias e interagindo no app.",
      met: isMaster || Number(viewer?.aura_level ?? 0) >= Number(room.min_aura_level ?? 0),
    });
  }
  if ((room.min_social_score ?? 0) > 0) {
    reqs.push({
      icon: Trophy,
      label: `Score social ${room.min_social_score}+`,
      how: "Receba interações reais (curtidas, comentários, presentes) para evoluir seu score.",
      met: isMaster || Number(viewer?.social_score ?? 0) >= Number(room.min_social_score ?? 0),
    });
  }
  if ((room.min_prestige_xp ?? 0) > 0) {
    reqs.push({
      icon: Star,
      label: `Prestígio ${room.min_prestige_xp} XP+`,
      how: "Acumule XP em conquistas e participações ativas na comunidade.",
      met: isMaster || Number(viewer?.prestige_xp ?? 0) >= Number(room.min_prestige_xp ?? 0),
    });
  }
  if (room.couple_only) {
    reqs.push({
      icon: Users,
      label: "Perfil de casal verificado",
      how: "Ative o modo casal no seu perfil para acessar salas exclusivas.",
      met: isMaster || normalizeGateGender(viewer) === "casal",
    });
  }
  return reqs;
}

function RoomTile({ room, viewer, isMaster = false, highlight = false, large = false }: { room: AuraRoomItem; viewer?: ViewerGateProfile | null; isMaster?: boolean; highlight?: boolean; large?: boolean }) {
  const [open, setOpen] = useState(false);
  const [autoJoin, setAutoJoin] = useState(false);

  const bg = `linear-gradient(135deg,
    hsl(${room.hue} 75% 22% / 0.95) 0%,
    hsl(${(room.hue + 30) % 360} 60% 14% / 0.85) 55%,
    hsl(${(room.hue + 60) % 360} 55% 10% / 0.7) 100%)`;
  const glow = highlight
    ? `0 0 0 2px hsl(${room.hue} 95% 70% / 0.85), 0 0 24px -2px hsl(${room.hue} 95% 65% / 0.8), 0 14px 36px -14px hsl(${room.hue} 95% 60% / 0.9), inset 0 0 0 1px hsl(${room.hue} 95% 80% / 0.4)`
    : `0 10px 30px -16px hsl(${room.hue} 90% 55% / 0.55), inset 0 0 0 1px hsl(${room.hue} 90% 70% / 0.18)`;

  const description = getRoomDescription(room);
  const requirements = buildRequirements(room, viewer, isMaster);
  const locked = !isMaster && !room.allowed && requirements.length > 0;
  const meetsRequirements = requirements.every((req) => req.met);
  const statusLabel = meetsRequirements ? "Cumpri" : "Não cumpri";
  const statusHint = meetsRequirements
    ? "Você cumpre os requisitos mínimos desta sala."
    : "Você ainda não cumpre os requisitos mínimos desta sala.";

  const handleEnter = () => {
    void awardRoomActionXp("enter");
    setAutoJoin(true);
    setOpen(true);
  };

  return (
    <>
      <article
        className={`group relative overflow-hidden rounded-2xl text-left ${large ? "w-full" : "snap-start shrink-0 w-[240px] sm:w-[260px]"}`}
        style={{ background: bg, boxShadow: glow, contain: "layout paint", transform: "translateZ(0)" }}
      >
        {highlight && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-fuchsia-300/70"
            style={{ boxShadow: `0 0 28px 2px hsl(${room.hue} 100% 70% / 0.35)` }}
          />
        )}
        {room.rising && !room.isSpecialCycle && (
          <span className="absolute right-2 top-2 z-[2] inline-flex items-center gap-0.5 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-950 shadow">
            <Flame className="h-2.5 w-2.5" /> Em alta
          </span>
        )}


        <div className="relative z-[1] flex flex-col gap-2 p-3">
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl"
              style={{
                background: `linear-gradient(135deg, hsl(${room.hue} 90% 70% / 0.25), hsl(${room.hue} 80% 40% / 0.15))`,
                boxShadow: `inset 0 0 0 1px hsl(${room.hue} 90% 75% / 0.35)`,
              }}
            >
              {room.emoji ?? "✨"}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start gap-1.5">
                <h4 className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-white drop-shadow-sm line-clamp-2 [overflow-wrap:anywhere]">
                  {room.name}
                </h4>
                {locked && (
                  <Lock className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" aria-label="requisitos" />
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {(room.isSpecialCycle
                  || (room.mood ?? '').trim().toLowerCase() === 'especial'
                  || (Array.isArray(room.tags) && room.tags.some((t) => String(t).trim().toLowerCase() === 'especial'))
                ) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/95 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
                    <Star className="h-2.5 w-2.5" /> Especial
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  AO VIVO
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white/95 ring-1 ring-white/15"
                  title={`${room.active_count} pessoa(s) na sala agora`}
                >
                  <Users className="h-2.5 w-2.5" />
                  {room.active_count ?? 0}
                </span>
                {(room.message_count ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-1 ring-amber-200"
                    title={`${room.message_count} mensagens no total`}
                  >
                    <MessageCircle className="h-3 w-3" strokeWidth={3} />
                    <span>
                      {room.message_count > 999 ? `${Math.floor(room.message_count / 100) / 10}k` : room.message_count} msgs
                    </span>
                  </span>
                )}

              </div>

            </div>
          </div>


          <p className="text-[11px] leading-snug text-white/85 line-clamp-3 min-h-[2.6rem]">
            {description}
          </p>

          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnter}
              aria-label={`Entrar agora na sala ${room.name}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-black shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Entrar agora
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <Popover onOpenChange={(o) => { if (o) void awardRoomActionXp("info"); }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Ver requisitos da sala ${room.name}`}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-white/30 bg-black/30 px-2.5 py-1.5 text-[11px] font-semibold text-white/95 transition-colors hover:bg-black/50"
                >
                  <Info className="h-3.5 w-3.5" />
                  Saiba mais
                </button>
              </PopoverTrigger>

              <PopoverContent
                side="top"
                align="end"
                className="w-72 border-fuchsia-400/30 bg-background/95 p-3 text-foreground shadow-xl backdrop-blur"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg" style={{
                      background: `linear-gradient(135deg, hsl(${room.hue} 90% 70% / 0.35), hsl(${room.hue} 80% 40% / 0.2))`,
                    }}>
                      {room.emoji ?? "✨"}
                    </span>
                    <div className="min-w-0">
                      <h5 className="text-sm font-bold leading-tight">{room.name}</h5>
                      <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                        {description}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Requisitos mínimos
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${meetsRequirements ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p className={`mb-2 text-[10.5px] leading-snug ${meetsRequirements ? "text-emerald-600 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {statusHint}
                    </p>
                    {requirements.length === 0 ? (
                      <p className={`rounded-md px-2 py-1.5 text-[11px] font-medium ${meetsRequirements ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                        {meetsRequirements
                          ? "✓ Sala aberta — você pode entrar agora."
                          : "⚠ Acesso indisponível no momento para o seu perfil atual."}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {requirements.map((req, idx) => {
                          const Icon = req.icon;
                          return (
                            <li key={idx} className="rounded-md border border-border/50 bg-muted/40 p-2">
                              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                                <div className="flex min-w-0 items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-amber-500" />
                                  <span>{req.label}</span>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${req.met ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
                                >
                                  {req.met ? "Cumpri" : "Não cumpri"}
                                </span>
                              </div>
                              <p className="mt-0.5 pl-5 text-[10.5px] leading-snug text-muted-foreground">
                                {req.how}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleEnter}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow hover:opacity-90"
                  >
                    {locked ? "Tentar entrar mesmo assim" : "Entrar agora"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </article>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="hidden" aria-hidden />
        {open && (
          <AuraRoomLive
            room={room}
            open={open}
            onOpenChange={setOpen}
            autoJoinOnOpen={autoJoin}
            onAutoJoinConsumed={() => setAutoJoin(false)}
          />
        )}
      </Sheet>
    </>
  );
}

const isTemaLivre = (r: AuraRoomItem) =>
  r.slug === "tema_livre" ||
  r.slug === "tema-livre" ||
  (r.name || "").toLowerCase().trim() === "tema livre";

function HiddenRoomsCarouselImpl() {
  const { data, loading } = useAuraRoomsList();
  const { profile } = useProfile();
  const { progress } = useAuraProgress(false);
  const { data: socialScore } = useSocialScore(profile?.id);
  const { data: prestige } = usePrestige(profile?.id);
  const { data: isMaster = false } = useIsMasterAdmin();

  const viewer = useMemo<ViewerGateProfile | null>(() => ({
    plan_type: (profile as any)?.plan_type ?? null,
    is_verified: (profile as any)?.is_verified ?? null,
    document_verified: (profile as any)?.document_verified ?? null,
    profile_type: (profile as any)?.profile_type ?? null,
    gender: (profile as any)?.gender ?? null,
    aura_level: progress?.level ?? 0,
    social_score: socialScore?.xp ?? 0,
    prestige_xp: prestige?.xp ?? 0,
  }), [profile, progress?.level, socialScore?.xp, prestige?.xp]);

  // Mostra apenas dois cards grandes: a sala temática especial ativa
  // e a sala "Tema Livre". As demais ficam acessíveis via botão.
  const { specialRoom, temaLivreRoom, totalCount } = useMemo(() => {
    const hasSpecialTag = (room: AuraRoomItem) =>
      Array.isArray(room.tags) && room.tags.some((tag) => String(tag).trim().toLowerCase() === "especial");
    const isSpecial = (room: AuraRoomItem) =>
      room.isSpecialCycle === true ||
      (room.mood ?? "").trim().toLowerCase() === "especial" ||
      hasSpecialTag(room);

    // 1) Prioridade absoluta: sala com ciclo especial ativo agora.
    // 2) Senão: rotaciona entre as salas tagueadas "especial" (não Tema Livre)
    //    a cada 30 minutos, para que nenhuma fique travada (ex.: Madrugada Quente).
    const cycleActive = data.find((r) => r.isSpecialCycle === true) ?? null;
    const taggedSpecials = data.filter((r) => !isTemaLivre(r) && isSpecial(r));
    const rotateIdx = taggedSpecials.length > 0
      ? Math.floor(Date.now() / (30 * 60 * 1000)) % taggedSpecials.length
      : 0;
    const rotated = taggedSpecials[rotateIdx] ?? null;

    return {
      specialRoom: cycleActive ?? rotated,
      temaLivreRoom: data.find(isTemaLivre) ?? null,
      totalCount: data.length,
    };
  }, [data]);

  const cards = [specialRoom, temaLivreRoom].filter(Boolean) as AuraRoomItem[];

  return (
    <Card className="my-4 mx-3 overflow-hidden border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-background">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/70 via-purple-600/60 to-amber-500/50 ring-1 ring-fuchsia-200/40"
            aria-hidden
          >
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.2em] bg-gradient-to-r from-fuchsia-100 via-pink-100 to-amber-200 bg-clip-text text-transparent">
            Salas Ocultas
          </h3>
        </div>
        {!loading && totalCount > 0 && (
          <span className="rounded-full border border-fuchsia-300/25 bg-black/40 px-2 py-1 text-[10px] font-bold text-fuchsia-100/90">
            {totalCount} {totalCount === 1 ? "sala" : "salas"}
          </span>
        )}
      </div>

      <div className="mt-3 px-3 pb-3">
        {loading && cards.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-[200px] w-full animate-pulse rounded-2xl bg-white/[0.05]" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex h-[140px] w-full items-center justify-center px-4 text-center rounded-2xl bg-white/[0.03] border border-fuchsia-300/15">
            <p className="text-xs text-fuchsia-100/70 leading-snug">
              Nenhuma sala aberta no momento.<br />
              Assim que uma sala ficar ativa, ela aparece aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cards.map((room) => (
              <RoomTile
                key={room.slug}
                room={room}
                viewer={viewer}
                isMaster={isMaster}
                highlight={room === specialRoom}
                large
              />
            ))}
          </div>
        )}

        <Link
          to="/aura-match#aura-anchor-rooms"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-fuchsia-300/30 bg-gradient-to-r from-fuchsia-500/20 via-purple-500/15 to-amber-500/15 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-fuchsia-50 transition-colors hover:from-fuchsia-500/30 hover:via-purple-500/25 hover:to-amber-500/25"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Ver outras salas
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}


export const HiddenRoomsCarousel = memo(HiddenRoomsCarouselImpl);

