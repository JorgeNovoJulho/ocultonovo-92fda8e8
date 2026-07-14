import { lazy, Suspense, type ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

interface ModuleProps {
  sessionId: string;
  moduleCode: string;
  moduleName: string;
}

const Generic         = lazy(() => import('./GenericCardModule'));
const Conexao         = lazy(() => import('./ConexaoModule'));
const VerdadeEscolha  = lazy(() => import('./VerdadeOuEscolhaModule'));
const Roda            = lazy(() => import('./RodaInteracaoModule'));
const Compatibilidade = lazy(() => import('./CompatibilidadeModule'));
const Misterio        = lazy(() => import('./MisterioGrupoModule'));
const Energia         = lazy(() => import('./EnergiaAnonimaModule'));

/**
 * Registry lazy por `code`. 6 módulos com UI dedicada; 3 ainda no Generic
 * (fallback intencional para evolução futura).
 */
const REGISTRY: Record<string, ComponentType<ModuleProps>> = {
  conexao:         Conexao,
  verdade_escolha: VerdadeEscolha,
  roda:            Roda,
  compatibilidade: Compatibilidade,
  misterio:        Misterio,
  energia:         Energia,
  quem_combina:    Generic,
  duas_verdades:   Generic,
  duo:             Generic,
};

export function SocialBetaModuleRenderer(props: ModuleProps) {
  const Comp = REGISTRY[props.moduleCode] ?? Generic;
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando módulo…
        </div>
      }
    >
      <Comp {...props} />
    </Suspense>
  );
}
