import { Lock, Info, HelpCircle, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeRoomRequirements } from '@/lib/auraRoomRequirements';
import type { AuraRoomItem } from '@/hooks/useAuraRoomsList';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProfile } from '@/hooks/useProfile';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { useSocialScore } from '@/hooks/useSocialScore';
import { usePrestige } from '@/hooks/usePrestige';

export const GATE_REASON_LABELS: Record<string, string> = {
  no_auth: 'Faça login para participar',
  plan_vip_required: 'Exclusivo VIP',
  plan_premium_required: 'Premium ou VIP',
  vip_required: 'Exclusivo VIP',
  kyc_required: 'Verifique seu perfil (KYC)',
  couple_only: 'Apenas casais',
  gender_not_allowed: 'Tipo de perfil não permitido nesta sala',
  aura_level_low: 'Suba seu nível Aura',
  aura_level: 'Suba seu nível Aura',
  social_score_low: 'Score Social insuficiente',
  social_score: 'Score Social insuficiente',
  prestige_low: 'Prestígio insuficiente',
  prestige_xp: 'Prestígio insuficiente',
  secret_affinity_mismatch: 'A afinidade +18 desta sala não combina com a sua agora',
  room_not_found: 'Sala indisponível',
  room_full: 'Sala lotada — entrou na fila',
};

type GateProfile = {
  plan_type?: string | null;
  is_verified?: boolean | null;
  document_verified?: boolean | null;
  profile_type?: string | null;
  gender?: string | null;
  aura_level?: number | null;
  social_score?: number | null;
  prestige_xp?: number | null;
};

function normalizeGateGender(profile?: GateProfile | null) {
  const raw = `${profile?.gender ?? profile?.profile_type ?? ''}`.trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('casal') || raw === 'couple' || raw === 'couples') return 'casal';
  if (raw.includes('homem') || raw === 'male' || raw === 'man') return 'homem';
  if (raw.includes('mulher') || raw === 'female' || raw === 'woman') return 'mulher';
  if (raw.includes('trans') || raw.includes('travesti')) return 'trans';
  return raw;
}

interface Props {
  reason: string | null | undefined;
  /** opcional — quando passado, exibe a lista completa de requisitos */
  room?: Pick<AuraRoomItem,
    'vip_only' | 'required_plan' | 'requires_kyc' | 'couple_only' |
    'min_aura_level' | 'min_social_score' | 'min_prestige_xp' |
    'hour_from' | 'hour_to' | 'allowed_genders'
  > | null;
  profile?: GateProfile | null;
  /** lista completa de motivos do gate (multi) */
  reasons?: string[] | null;
}

export function AuraRoomGateBadge({ reason, room, profile, reasons }: Props) {
  if (!reason && !(reasons && reasons.length)) return null;
  const reqs = room ? describeRoomRequirements(room) : [];
  const list = (reasons && reasons.length ? reasons : (reason ? [reason] : []));
  const label = GATE_REASON_LABELS[list[0] ?? ''] ?? 'Modo observador';

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="truncate">{label}</span>
            {(reqs.length > 0 || list.length > 1) && <Info className="h-3 w-3 shrink-0 opacity-70" />}
          </span>
        </TooltipTrigger>
        {(reqs.length > 0 || list.length > 0) && (
          <TooltipContent side="bottom" className="max-w-[280px] text-[11px]">
            {list.length > 0 && (
              <>
                <div className="mb-1 font-semibold text-amber-300">Bloqueios detectados</div>
                <ul className="mb-2 space-y-0.5">
                  {list.map((r) => (
                    <li key={r}>• {GATE_REASON_LABELS[r] ?? r}</li>
                  ))}
                </ul>
              </>
            )}
            {reqs.length > 0 && (
              <>
                <div className="mb-1 font-semibold">Requisitos para participar</div>
                <ul className="space-y-0.5">
                  {reqs.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </>
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Guia "Como conseguir" — mapeia cada requisito a uma instrução prática + CTA.
 * `reasonKeys` lista os GATE_REASON usados para marcar este requisito como NÃO cumprido.
 */
type ReqGuide = {
  label: string;
  how: string;
  cta?: { to: string; label: string };
  reasonKeys: string[];
  isMet?: (profile?: GateProfile | null) => boolean | null;
  /** Mostra o valor atual do usuário (oficial) — ex: "Você: Aura Nv 2 (precisa 5)" */
  currentLabel?: (profile?: GateProfile | null) => string | null;
};

function buildRequirementGuides(
  room: Pick<AuraRoomItem,
    'slug' |
    'vip_only' | 'required_plan' | 'requires_kyc' | 'couple_only' |
    'min_aura_level' | 'min_social_score' | 'min_prestige_xp' |
    'hour_from' | 'hour_to' | 'allowed_genders'
  >,
): ReqGuide[] {
  const out: ReqGuide[] = [];
  if (room.vip_only) {
    out.push({
      label: 'Plano VIP ativo',
      how: 'Ative o plano VIP nas Assinaturas. Inclui acesso total às salas VIP, recursos exclusivos e perks sociais.',
      cta: { to: '/subscriptions', label: 'Ver planos' },
      reasonKeys: ['plan_vip_required', 'vip_required'],
      isMet: (profile) => ['vip', 'vip_plus'].includes(String(profile?.plan_type ?? '').toLowerCase()),
    });
  } else if (room.required_plan === 'premium') {
    out.push({
      label: 'Plano Premium ou VIP',
      how: 'Assine Premium (ou VIP) para entrar. No Beta, várias capacidades Premium estão liberadas — verifique seu status.',
      cta: { to: '/subscriptions', label: 'Ver planos' },
      reasonKeys: ['plan_premium_required', 'plan_vip_required'],
      isMet: (profile) => ['premium', 'vip', 'vip_plus'].includes(String(profile?.plan_type ?? '').toLowerCase()),
    });
  } else if (room.required_plan && room.required_plan !== 'free') {
    out.push({
      label: `Plano ${room.required_plan.toUpperCase()}`,
      how: 'Faça upgrade do seu plano para liberar esta sala.',
      cta: { to: '/subscriptions', label: 'Ver planos' },
      reasonKeys: ['plan_premium_required', 'plan_vip_required'],
      isMet: (profile) => String(profile?.plan_type ?? '').toLowerCase() === String(room.required_plan ?? '').toLowerCase(),
    });
  }
  if (room.requires_kyc) {
    out.push({
      label: 'Verificação KYC concluída',
      how: 'Envie o documento + selfie em Configurações → Verificação. Costuma sair em minutos.',
      cta: { to: '/account-settings?tab=verification', label: 'Verificar agora' },
      reasonKeys: ['kyc_required'],
      isMet: (profile) => Boolean(profile?.is_verified || profile?.document_verified),
    });
  }
  if (room.couple_only) {
    out.push({
      label: 'Conta de casal',
      how: 'No seu perfil, mude o tipo de conta para Casal e vincule o parceiro(a). Salas marcadas como "couple_only" só aceitam casais vinculados.',
      cta: { to: '/account-settings?tab=profile', label: 'Configurar casal' },
      reasonKeys: ['couple_only'],
      isMet: (profile) => normalizeGateGender(profile) === 'casal',
    });
  }
  {
    const genders = (room.allowed_genders ?? []).filter(Boolean);
    if (!room.couple_only && genders.length > 0) {
      const labelMap: Record<string, string> = { homem: 'Homem', mulher: 'Mulher', casal: 'Casal', trans: 'Trans' };
      const pretty = genders.map((g) => labelMap[g] ?? g).join(' · ');
      out.push({
        label: `Tipo permitido: ${pretty}`,
        how: `Esta sala aceita apenas perfis do tipo ${pretty}. Em Configurações → Perfil, ajuste seu tipo de conta (homem, mulher, casal, trans) e seu gênero para corresponder.`,
        cta: { to: '/account-settings?tab=profile', label: 'Ajustar tipo de perfil' },
        reasonKeys: ['gender_not_allowed'],
        isMet: (profile) => {
          const normalized = normalizeGateGender(profile);
          return normalized ? genders.includes(normalized) : false;
        },
      });
    }
  }
  if (room.slug === 'conexoes-secretas') {
    out.push({
      label: 'Afinidade +18 compatível com quem já está na sala',
      how: 'Quando a sala já tem pessoas, ela passa a usar as afinidades +18 predominantes dos presentes. Se estiver vazia, a entrada é livre e a referência passa a ser criada após as primeiras entradas.',
      cta: { to: '/account-settings?tab=profile', label: 'Ajustar afinidades +18' },
      reasonKeys: ['secret_affinity_mismatch'],
    });
  }
  if ((room.min_aura_level ?? 0) > 0) {
    out.push({
      label: `Aura nível ${room.min_aura_level}+`,
      how: `Suba sua Aura participando das missões diárias, presenteando XP e reagindo no campo. Cada nível pede ~100 XP.`,
      cta: { to: '/aura-match#aura-anchor-bubbles', label: 'Ir para o Aura Match' },
      reasonKeys: ['aura_level_low'],
      isMet: (profile) => Number(profile?.aura_level ?? 0) >= Number(room.min_aura_level ?? 0),
      currentLabel: (profile) =>
        `Você: Nv ${Number(profile?.aura_level ?? 0)} · precisa Nv ${room.min_aura_level}`,
    });
  }
  if ((room.min_social_score ?? 0) > 0) {
    out.push({
      label: `Score Social ${room.min_social_score}+`,
      how: 'Ganhe Score Social postando, recebendo curtidas, comentários genuínos e mantendo boa reputação (sem denúncias).',
      cta: { to: '/dashboard', label: 'Ver meu Score' },
      reasonKeys: ['social_score_low'],
      isMet: (profile) => Number(profile?.social_score ?? 0) >= Number(room.min_social_score ?? 0),
      currentLabel: (profile) =>
        `Você: ${Number(profile?.social_score ?? 0)} pts · precisa ${room.min_social_score}`,
    });
  }
  if ((room.min_prestige_xp ?? 0) > 0) {
    out.push({
      label: `Prestígio ${room.min_prestige_xp}+ XP`,
      how: 'Prestígio cresce com presença consistente, conquistas Aura, eventos VIP e contribuições à comunidade.',
      cta: { to: '/dashboard', label: 'Ver Prestígio' },
      reasonKeys: ['prestige_low'],
      isMet: (profile) => Number(profile?.prestige_xp ?? 0) >= Number(room.min_prestige_xp ?? 0),
      currentLabel: (profile) =>
        `Você: ${Number(profile?.prestige_xp ?? 0)} XP · precisa ${room.min_prestige_xp}`,
    });
  }
  if (room.hour_from != null && room.hour_to != null) {
    out.push({
      label: `Janela ${String(room.hour_from).padStart(2,'0')}h–${String(room.hour_to).padStart(2,'0')}h`,
      how: 'Esta sala só funciona nesse horário. Volte dentro da janela para entrar.',
      reasonKeys: ['out_of_window'],
    });
  }
  return out;
}

/**
 * Linha visível abaixo do header da sala — SEMPRE mostra requisitos com
 * guia "Como conseguir" expansível, mesmo quando a sala é aberta.
 */
export function AuraRoomRequirementsLine({
  room,
  allowed,
  extraReasons,
  profile,
}: {
  room: Pick<AuraRoomItem,
    'slug' |
    'vip_only' | 'required_plan' | 'requires_kyc' | 'couple_only' |
    'min_aura_level' | 'min_social_score' | 'min_prestige_xp' |
    'hour_from' | 'hour_to' | 'allowed_genders'
  >;
  allowed: boolean;
  /** Motivos extras vindos do gate em tempo real (joined.reasons) */
  extraReasons?: string[] | null;
  profile?: GateProfile | null;
}) {
  // Fonte oficial: hooks que alimentam também o AuraStatsTopBar.
  // Se o caller passar `profile` explícito, ele sobrescreve apenas onde tiver valor.
  const { profile: myProfile } = useProfile();
  const { progress: auraProgress } = useAuraProgress(false);
  const { data: socialScore } = useSocialScore(myProfile?.id);
  const { data: prestige } = usePrestige(myProfile?.id);

  const officialProfile: GateProfile = useMemo(() => ({
    plan_type: profile?.plan_type ?? (myProfile as any)?.plan_type ?? null,
    is_verified: profile?.is_verified ?? (myProfile as any)?.is_verified ?? null,
    document_verified: profile?.document_verified ?? (myProfile as any)?.document_verified ?? null,
    profile_type: profile?.profile_type ?? (myProfile as any)?.profile_type ?? null,
    gender: profile?.gender ?? (myProfile as any)?.gender ?? null,
    aura_level: profile?.aura_level ?? auraProgress?.level ?? 0,
    social_score: profile?.social_score ?? socialScore?.xp ?? 0,
    prestige_xp: profile?.prestige_xp ?? prestige?.xp ?? 0,
  }), [profile, myProfile, auraProgress?.level, socialScore?.xp, prestige?.xp]);

  const guides = buildRequirementGuides(room);
  const extras = (extraReasons ?? []).filter((r) => !!GATE_REASON_LABELS[r]);
  const reasonSet = new Set(extras);

  // Marcações por requisito: failed = não cumpre (algum reasonKey está no set de bloqueios)
  const checks = guides.map((g) => ({
    guide: g,
    failed: g.isMet?.(officialProfile) === false || g.reasonKeys.some((k) => reasonSet.has(k)),
    current: g.currentLabel?.(officialProfile) ?? null,
  }));
  const anyFailed = checks.some((c) => c.failed);
  const effectivelyAllowed = !anyFailed && extras.length === 0 && allowed;

  // Painel "Como conseguir" abre automaticamente quando o usuário está bloqueado
  // ou há motivos extras detectados; mantém controle manual também.
  const autoOpen = !allowed && (anyFailed || extras.length > 0);
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? autoOpen;

  // Sala 100% aberta — ainda assim mostramos algo claro
  if (guides.length === 0 && extras.length === 0) {
    return (
      <p className="mt-1 text-[11px] leading-snug text-emerald-300/80">
        ✓ Sala aberta a todos — sem requisitos mínimos.
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug">
          <span className={effectivelyAllowed ? 'text-emerald-300/90' : 'text-amber-300/90'}>
            {effectivelyAllowed ? '✓ Você cumpre os requisitos' : '⚠ Requisitos para entrar'}
          </span>
        </p>
        {guides.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenOverride(!open)}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200 hover:bg-amber-500/20"
            aria-expanded={open}
          >
            <HelpCircle className="h-3 w-3" />
            Como conseguir
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Checklist Cumpro / Não cumpro — sempre visível */}
      {checks.length > 0 && (
        <ul className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 space-y-1">
          {checks.map((c) => (
            <li
              key={c.guide.label}
              className={`flex flex-col gap-0.5 text-[11px] leading-snug ${
                c.failed
                  ? 'text-red-300/95'
                  : effectivelyAllowed
                    ? 'text-emerald-300/90'
                    : 'text-foreground/80'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    c.failed
                      ? 'bg-red-500/25 text-red-200'
                      : 'bg-emerald-500/25 text-emerald-200'
                  }`}
                  aria-hidden="true"
                >
                  {c.failed ? '✗' : '✓'}
                </span>
                <span className="flex-1">{c.guide.label}</span>
                <span className={`text-[9.5px] font-semibold uppercase tracking-wider ${c.failed ? 'text-red-300' : 'text-emerald-300/80'}`}>
                  {c.failed ? 'Não cumpro' : 'Cumpro'}
                </span>
              </div>
              {c.current && (
                <span className={`pl-5 text-[10px] tabular-nums ${c.failed ? 'text-red-200/80' : 'text-emerald-200/70'}`}>
                  {c.current}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {extras.length > 0 && !allowed && (
        <ul className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-200/90 space-y-0.5">
          {extras.map((r) => (
            <li key={r}>• {GATE_REASON_LABELS[r] ?? r}</li>
          ))}
        </ul>
      )}

      {open && guides.length > 0 && (
        <ul className="rounded-lg border border-white/10 bg-black/30 p-2 space-y-2">
          {checks.map((c, i) => (
            <li
              key={i}
              className={`text-[11px] leading-snug rounded-md p-1.5 ${
                c.failed ? 'bg-red-500/10 border border-red-400/30' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  c.failed ? 'bg-red-500/30 text-red-100' : 'bg-amber-500/20 text-amber-200'
                }`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${c.failed ? 'text-red-200' : 'text-foreground/95'}`}>
                    {c.guide.label}
                    {c.failed && <span className="ml-1 text-[9.5px] font-bold text-red-300">· FALTA</span>}
                  </p>
                  {c.current && (
                    <p className={`mt-0.5 text-[10.5px] font-medium tabular-nums ${c.failed ? 'text-red-300/90' : 'text-emerald-300/80'}`}>
                      {c.current}
                    </p>
                  )}
                  <p className="mt-0.5 text-foreground/70">{c.guide.how}</p>
                  {c.guide.cta && (
                    <Link
                      to={c.guide.cta.to}
                      className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                        c.failed
                          ? 'bg-red-500/20 text-red-100 hover:bg-red-500/30'
                          : 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                      }`}
                    >
                      {c.guide.cta.label} <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
