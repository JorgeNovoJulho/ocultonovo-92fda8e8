/**
 * LazyAdminModal — Wrapper para code-splitting de modais pesados do admin.
 *
 * Por quê: modais do admin (UserSignupDataModal ~822 linhas, TestProfilesModal,
 * UserDisciplineModal, etc.) trazem componentes filhos pesados (Accordion, Map,
 * Editores). Importá-los sincronamente infla o bundle inicial e trava celulares
 * fracos (Realme C55 e inferiores).
 *
 * Como usar:
 *   const UserSignupDataModal = lazyAdminModal(
 *     () => import("@/components/admin/UserSignupDataModal")
 *       .then(m => ({ default: m.UserSignupDataModal }))
 *   );
 *
 *   <UserSignupDataModal open={...} onOpenChange={...} userId={...} />
 *
 * O Suspense fallback exibe um skeleton apenas quando `open === true` — modais
 * fechados não fazem download do chunk.
 */
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

type ModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  [key: string]: any;
};

function ModalSkeleton() {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="w-[calc(100vw-0.5rem)] sm:w-full max-w-2xl p-0 gap-0 max-h-[100dvh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-none sm:rounded-lg admin-modal">
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        <div className="p-4 sm:p-6 space-y-3 border-b border-border/50">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="flex items-center gap-3 pt-2">
            <Skeleton className="h-12 w-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44 max-w-full" />
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6 space-y-3 flex-1">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground border-t border-border/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Carregando módulo…</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Empacota um modal com lazy + Suspense. O chunk só é baixado quando
 * `open` vira `true` pela primeira vez — depois fica em memória.
 */
export function lazyAdminModal<P extends ModalProps>(
  factory: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> {
  const Lazy = lazy(factory);

  return function LazyAdminModalWrapper(props: P) {
    const [primed, setPrimed] = useState(false);

    // Trigger import na primeira vez que `open === true`.
    useEffect(() => {
      if (props.open && !primed) setPrimed(true);
    }, [props.open, primed]);

    // Modal fechado e nunca aberto: não renderiza nada (zero custo).
    if (!props.open && !primed) return null;

    return (
      <Suspense fallback={props.open ? <ModalSkeleton /> : null}>
        {/* @ts-expect-error — lazy<P> com generics customizados */}
        <Lazy {...props} />
      </Suspense>
    );
  };
}
