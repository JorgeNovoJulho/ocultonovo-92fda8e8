/**
 * AdminLaboratorioOcultoPage — /admin/laboratorio-oculto
 *
 * Painel master para ativar/desativar/testar recursos experimentais sem
 * deploy. Não consome flags em produção: apenas administra a tabela
 * `platform_feature_flags`. Cada recurso passa a respeitar a flag quando
 * a superfície decidir consumir `useFeatureFlag(key)`.
 */
import { useMemo, useState } from 'react';
import { FlaskConical, ShieldAlert, Save, UserPlus, X } from 'lucide-react';
import {
  KNOWN_EXPERIMENTAL_FEATURES,
  usePlatformFeatureFlags,
  useUpdateFeatureFlag,
  useToggleBetaUser,
  type FeatureRolloutMode,
  type PlatformFeatureFlag,
} from '@/hooks/usePlatformFeatureFlags';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { toast } from '@/hooks/use-toast';

const MODES: { value: FeatureRolloutMode; label: string; hint: string }[] = [
  { value: 'disabled',    label: 'Desligado',  hint: 'Ninguém vê.' },
  { value: 'admin_only',  label: 'Só Master',  hint: 'Apenas Admin Master.' },
  { value: 'beta_users',  label: 'Beta',       hint: 'Lista de IDs específicos.' },
  { value: 'percentage',  label: '% Rollout',  hint: 'Distribui por hash determinístico.' },
  { value: 'global',      label: 'Global',     hint: 'Todos os usuários.' },
];

const PERCENTS = [5, 10, 25, 50, 100];

function FlagCard({ flag }: { flag: PlatformFeatureFlag }) {
  const update = useUpdateFeatureFlag();
  const toggleBeta = useToggleBetaUser();
  const [newBetaId, setNewBetaId] = useState('');

  const meta = useMemo(
    () => KNOWN_EXPERIMENTAL_FEATURES.find((f) => f.key === flag.feature_key),
    [flag.feature_key],
  );

  const patch = (p: Partial<PlatformFeatureFlag>) => {
    update.mutate(
      { id: flag.id, ...p },
      {
        onSuccess: () => toast({ title: 'Atualizado', description: flag.feature_key }),
        onError: (e: any) => toast({ title: 'Erro', description: e?.message ?? 'Falhou', variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">
            {meta?.label ?? flag.feature_key}
          </h3>
          <p className="text-xs text-muted-foreground font-mono">{flag.feature_key}</p>
          {(meta?.description || flag.description) && (
            <p className="text-sm text-muted-foreground mt-1">
              {meta?.description ?? flag.description}
            </p>
          )}
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={flag.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-xs text-muted-foreground">Ativa</span>
        </label>
      </header>

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => patch({ rollout_mode: m.value })}
            className={`px-2.5 py-1 rounded-full text-xs border transition ${
              flag.rollout_mode === m.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      {flag.rollout_mode === 'percentage' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Rollout:</span>
          {PERCENTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => patch({ rollout_percentage: p })}
              className={`px-2 py-1 rounded text-xs border ${
                flag.rollout_percentage === p
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              }`}
            >
              {p}%
            </button>
          ))}
          <input
            type="number"
            min={0}
            max={100}
            value={flag.rollout_percentage}
            onChange={(e) => patch({ rollout_percentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="w-20 px-2 py-1 text-xs rounded border border-border bg-background"
          />
        </div>
      )}

      {flag.rollout_mode === 'beta_users' && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Beta users ({flag.beta_users.length}):
          </div>
          <div className="flex flex-wrap gap-1">
            {flag.beta_users.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-mono"
              >
                {id.slice(0, 8)}…
                <button
                  type="button"
                  onClick={() => toggleBeta.mutate({ flag, userId: id, add: false })}
                  className="hover:text-destructive"
                  aria-label="remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="UUID do usuário"
              value={newBetaId}
              onChange={(e) => setNewBetaId(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background font-mono"
            />
            <button
              type="button"
              disabled={!newBetaId.trim()}
              onClick={() => {
                toggleBeta.mutate(
                  { flag, userId: newBetaId.trim(), add: true },
                  { onSuccess: () => setNewBetaId('') },
                );
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary text-primary-foreground disabled:opacity-50"
            >
              <UserPlus className="h-3 w-3" /> Adicionar
            </button>
          </div>
        </div>
      )}

      <footer className="text-[10px] text-muted-foreground pt-2 border-t border-border/50">
        Atualizado em {new Date(flag.updated_at).toLocaleString('pt-BR')}
      </footer>
    </div>
  );
}

export default function AdminLaboratorioOcultoPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();
  const { data: flags, isLoading, error } = usePlatformFeatureFlags();

  if (roleLoading) return <div className="p-6 text-sm text-muted-foreground">Verificando acesso…</div>;
  if (!isMaster) {
    return (
      <div className="p-6 flex items-center gap-3 text-destructive">
        <ShieldAlert className="h-5 w-5" />
        Apenas o Admin Master tem acesso ao Laboratório Oculto.
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          Laboratório Oculto
        </h1>
        <p className="text-sm text-muted-foreground">
          Ative, desative e teste recursos experimentais sem deploy.
          Cada flag só age quando alguma superfície opta por consumi-la via
          <code className="px-1 mx-1 bg-muted rounded">useFeatureFlag()</code>.
        </p>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {error && (
        <div className="text-sm text-destructive">
          Erro ao carregar flags: {(error as any)?.message}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {(flags ?? []).map((f) => (
          <FlagCard key={f.id} flag={f} />
        ))}
      </section>

      <footer className="text-xs text-muted-foreground border-t border-border pt-4 flex items-center gap-2">
        <Save className="h-3 w-3" />
        Alterações são salvas automaticamente e propagadas a cada 30s nos clientes.
      </footer>
    </main>
  );
}
