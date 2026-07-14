/**
 * AdminExperienciaUsuarioPage — /admin/experiencia-do-usuario
 *
 * Painel SIMPLES para o Admin Master ligar/desligar as novas experiências
 * (Nova Aura IA, Central, Oportunidades, Mapa, Onboarding) e, opcionalmente,
 * liberar para todos os usuários.
 *
 * Internamente atua sobre `platform_feature_flags`:
 *   - Toggle OFF       → enabled=false, rollout_mode='disabled' (sistema antigo)
 *   - Toggle ON        → enabled=true,  rollout_mode='admin_only' (somente @oculto_master)
 *   - "Liberar p/ todos" → enabled=true, rollout_mode='global'  (todos os usuários)
 *
 * Zero impacto em produção: quando uma flag está OFF, a superfície correspondente
 * retorna ao comportamento anterior (gates já implementados nos componentes).
 */
import { memo } from 'react';
import { Sparkles, Bot, Compass, Map as MapIcon, GraduationCap, Globe2, ShieldCheck, Loader2 } from 'lucide-react';
import {
  usePlatformFeatureFlags,
  useUpdateFeatureFlag,
  MASTER_UX_FLAG_KEYS,
  type MasterUxFlagKey,
  type PlatformFeatureFlag,
} from '@/hooks/usePlatformFeatureFlags';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { toast } from '@/hooks/use-toast';

interface UxFeatureMeta {
  key: MasterUxFlagKey;
  title: string;
  description: string;
  icon: typeof Sparkles;
  tone: string;
}

const FEATURES: UxFeatureMeta[] = [
  { key: 'nova_aura_ai',               title: 'Nova Aura IA',              description: 'Painel premium da nova Aura IA na Home (substitui o concierge antigo).', icon: Bot,           tone: 'from-cyan-500/20 to-fuchsia-500/10 ring-cyan-400/30' },
  { key: 'central_aura_ia',            title: 'Central Aura IA',           description: 'Modal centralizado com Jornada, História, Oportunidades, Missões e Explorar.', icon: Sparkles,      tone: 'from-fuchsia-500/20 to-pink-500/10 ring-fuchsia-400/30' },
  { key: 'oportunidades_inteligentes', title: 'Oportunidades Inteligentes',description: 'Aba Oportunidades usa sinais reais (mensagens não respondidas, likes, alcance).', icon: Compass,       tone: 'from-amber-500/20 to-orange-500/10 ring-amber-400/30' },
  { key: 'mapa_do_oculto',             title: 'Mapa do Oculto',            description: 'Aba Explorar inteligente — recursos que você já usa vs. ainda não explorou.', icon: MapIcon,       tone: 'from-emerald-500/20 to-teal-500/10 ring-emerald-400/30' },
  { key: 'onboarding_inteligente',     title: 'Onboarding Inteligente',    description: 'Onboarding adaptativo guiado pela Aura IA (em preparação).',                  icon: GraduationCap, tone: 'from-violet-500/20 to-indigo-500/10 ring-violet-400/30' },
];

function flagState(f?: PlatformFeatureFlag): 'off' | 'master' | 'global' {
  if (!f || !f.enabled || f.rollout_mode === 'disabled') return 'off';
  if (f.rollout_mode === 'global') return 'global';
  return 'master';
}

function FeatureToggle({ meta, flag }: { meta: UxFeatureMeta; flag?: PlatformFeatureFlag }) {
  const update = useUpdateFeatureFlag();
  const state = flagState(flag);
  const busy = update.isPending;

  const setState = (next: 'off' | 'master' | 'global') => {
    if (!flag) {
      toast({ title: 'Flag ausente', description: `Execute o SQL "2026_06_13_master_ux_experiments.sql" para criar "${meta.key}".`, variant: 'destructive' });
      return;
    }
    const patch =
      next === 'off'
        ? { enabled: false, rollout_mode: 'disabled' as const }
        : next === 'master'
        ? { enabled: true,  rollout_mode: 'admin_only' as const, admin_only: true }
        : { enabled: true,  rollout_mode: 'global' as const };

    update.mutate(
      { id: flag.id, ...patch },
      {
        onSuccess: () => toast({ title: '✓ Atualizado', description: meta.title }),
        onError:   (e: any) => toast({ title: 'Erro', description: e?.message ?? 'Falhou', variant: 'destructive' }),
      },
    );
  };

  const Icon = meta.icon;

  return (
    <article className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${meta.tone} ring-1 p-4`}>
      <header className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-background/60 ring-1 ring-border/50">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">{meta.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{meta.description}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{meta.key}</p>
        </div>
        <StatusBadge state={state} />
      </header>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <ModeButton active={state === 'off'}    disabled={busy} onClick={() => setState('off')}    label="Desligado"     tone="muted" />
        <ModeButton active={state === 'master'} disabled={busy} onClick={() => setState('master')} label="Só @oculto_master" tone="cyan"  icon={<ShieldCheck className="h-3 w-3" />} />
        <ModeButton active={state === 'global'} disabled={busy} onClick={() => setState('global')} label="Liberar p/ todos"  tone="emerald" icon={<Globe2 className="h-3 w-3" />} />
      </div>
    </article>
  );
}

function StatusBadge({ state }: { state: 'off' | 'master' | 'global' }) {
  const map = {
    off:    { label: 'OFF',    cls: 'bg-white/5 text-white/50 ring-white/10' },
    master: { label: 'MASTER', cls: 'bg-cyan-500/15 text-cyan-200 ring-cyan-300/30' },
    global: { label: 'GLOBAL', cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-300/30' },
  } as const;
  const s = map[state];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ${s.cls}`}>
      {s.label}
    </span>
  );
}

function ModeButton({
  active, disabled, onClick, label, tone, icon,
}: {
  active: boolean; disabled?: boolean; onClick: () => void; label: string;
  tone: 'muted' | 'cyan' | 'emerald'; icon?: React.ReactNode;
}) {
  const palette = {
    muted:   active ? 'bg-white/15 text-white ring-white/20' : 'bg-white/5 text-white/60 hover:bg-white/10 ring-white/10',
    cyan:    active ? 'bg-cyan-500/30 text-cyan-100 ring-cyan-300/50 shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]' : 'bg-white/5 text-cyan-200/70 hover:bg-cyan-500/10 ring-cyan-300/20',
    emerald: active ? 'bg-emerald-500/30 text-emerald-100 ring-emerald-300/50 shadow-[0_0_18px_-4px_rgba(16,185,129,0.55)]' : 'bg-white/5 text-emerald-200/70 hover:bg-emerald-500/10 ring-emerald-300/20',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ring-1 transition-all disabled:opacity-50 ${palette[tone]}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export const AdminExperienciaUsuarioPage = memo(function AdminExperienciaUsuarioPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();
  const { data: flags, isLoading } = usePlatformFeatureFlags();

  if (roleLoading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  }

  if (!isMaster) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-semibold">Acesso restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">Esta página é exclusiva do Admin Master.</p>
      </div>
    );
  }

  const byKey = new Map<string, PlatformFeatureFlag>();
  (flags ?? []).forEach((f) => byKey.set(f.feature_key, f));
  const missing = MASTER_UX_FLAG_KEYS.filter((k) => !byKey.has(k));

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
          <Sparkles className="h-3 w-3" /> Admin Master
        </div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Experiência do Usuário</h1>
        <p className="text-sm text-muted-foreground">
          Ative ou desative as novas experiências individualmente. Por padrão, ficam visíveis
          apenas para <strong className="text-foreground">@oculto_master</strong> — os demais
          usuários continuam no sistema atual, sem qualquer impacto.
        </p>
      </header>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          ⚠ Flags ausentes: <strong className="font-mono">{missing.join(', ')}</strong>.
          Execute <code className="rounded bg-black/30 px-1 py-0.5">supabase/external_sql/2026_06_13_master_ux_experiments.sql</code> no SQL Editor.
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {FEATURES.map((f) => (
            <FeatureToggle key={f.key} meta={f} flag={byKey.get(f.key)} />
          ))}
        </div>
      )}

      <footer className="rounded-xl bg-white/[0.03] p-3 text-[11px] text-muted-foreground ring-1 ring-white/5">
        <strong className="text-foreground">Como funciona:</strong> as flags são lidas via
        <code className="mx-1 rounded bg-black/30 px-1">feature_flag_is_enabled</code>
        no Supabase. Mudanças refletem em até 60s (cache do hook); recarregue a Home para validar.
      </footer>
    </div>
  );
});

export default AdminExperienciaUsuarioPage;
