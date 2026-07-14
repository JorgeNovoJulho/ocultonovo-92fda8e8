import { toast } from "@/hooks/use-toast";
import { createElement } from "react";
import { ToastAction } from "@/components/ui/toast";

/**
 * Dispara o modal global de planos (ouvido pelo Navbar).
 */
export function openPlansModal() {
  window.dispatchEvent(new Event("open-plans-modal"));
}

interface UpgradeToastOpts {
  title?: string;
  description: string;
  /** Texto do botão. Default: "Fazer upgrade". */
  cta?: string;
}

/**
 * Toast padrão para recursos bloqueados por plano, com botão que abre o modal de planos.
 */
export function showUpgradeToast({
  title = "Recurso indisponível no seu plano",
  description,
  cta = "Fazer upgrade",
}: UpgradeToastOpts) {
  toast({
    title,
    description,
    variant: "destructive",
    action: createElement(
      ToastAction,
      { altText: cta, onClick: () => openPlansModal() },
      cta
    ) as any,
  });
}
