/**
 * Toast destacado (amarelo com texto preto).
 *
 * Use para mensagens importantes que precisam capturar a atenção do usuário,
 * como boas-vindas de administrador, alertas críticos ou avisos que não podem
 * passar despercebidos.
 *
 * Mantém o mesmo contraste em modo claro e escuro (cores fixas, não dependem
 * do tema), garantindo legibilidade em qualquer tela.
 */

import { toast as sonnerToast } from "sonner";
import { toast as legacyToast } from "@/hooks/use-toast";

/**
 * Classe Tailwind padronizada para toasts destacados.
 * Forçamos cores fixas com `!` (important) para sobrescrever o tema escuro.
 */
export const HIGHLIGHT_TOAST_CLASS =
  "!bg-yellow-400 !text-black !border-yellow-500 [&_*]:!text-black shadow-lg";

/**
 * Wrapper para o toast legado (useToast / shadcn).
 * Aceita os mesmos parâmetros e injeta o className amarelo.
 */
export function showHighlightToast(opts: {
  title?: string;
  description?: string;
  duration?: number;
}) {
  return legacyToast({
    title: opts.title,
    description: opts.description,
    duration: opts.duration,
    className: HIGHLIGHT_TOAST_CLASS,
  });
}

/**
 * Wrapper para o sonner toast.
 */
export function showHighlightSonner(
  message: string,
  opts?: { description?: string; duration?: number }
) {
  return sonnerToast(message, {
    description: opts?.description,
    duration: opts?.duration,
    className: HIGHLIGHT_TOAST_CLASS,
    style: {
      background: "#facc15", // yellow-400
      color: "#000",
      border: "1px solid #eab308", // yellow-500
    },
  });
}
