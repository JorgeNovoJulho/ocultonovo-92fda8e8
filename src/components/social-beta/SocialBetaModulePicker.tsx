import { useState } from 'react';
import { Layers3, Loader2 } from 'lucide-react';
import { useSocialBetaModules, useSocialBetaConsent } from '@/hooks/useSocialBetaModules';
import { SocialBetaModuleRenderer } from './modules/registry';

interface Props { sessionId: string; }

/**
 * Picker dos módulos disponíveis dentro de uma sessão.
 * Nomes vêm do RPC `social_beta_list_modules` (com overrides do Admin Master).
 */
export function SocialBetaModulePicker({ sessionId }: Props) {
  const { data: modules, isLoading } = useSocialBetaModules();
  const { accept, accepting } = useSocialBetaConsent();
  const [active, setActive] = useState<{ code: string; name: string } | null>(null);
  const [needsConsent, setNeedsConsent] = useState<{ code: string; name: string; level: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando módulos…
      </div>
    );
  }

  if (!modules?.length) {
    return <p className="text-sm text-muted-foreground">Nenhum módulo disponível.</p>;
  }

  const handlePick = (code: string, name: string, level: string) => {
    if (level === 'avancado') {
      setNeedsConsent({ code, name, level });
      return;
    }
    setActive({ code, name });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Módulos da sessão</h3>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {modules.map((m) => {
          const isActive = active?.code === m.code;
          return (
            <button
              key={m.code}
              onClick={() => handlePick(m.code, m.label, m.max_level)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                isActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
              title={m.description ?? undefined}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {needsConsent && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="text-sm">
            O módulo <strong>{needsConsent.name}</strong> tem nível <em>{needsConsent.level}</em> e exige consentimento.
          </p>
          <div className="flex gap-2">
            <button
              disabled={accepting}
              onClick={async () => {
                await accept('avancado');
                setActive({ code: needsConsent.code, name: needsConsent.name });
                setNeedsConsent(null);
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              {accepting ? 'Salvando…' : 'Aceitar e abrir'}
            </button>
            <button onClick={() => setNeedsConsent(null)} className="rounded-md border border-border px-3 py-1.5 text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {active && (
        <SocialBetaModuleRenderer sessionId={sessionId} moduleCode={active.code} moduleName={active.name} />
      )}
    </div>
  );
}

export default SocialBetaModulePicker;
