import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    // `duration` aqui é o fallback do Radix para qualquer toast que não envie
    // duration explícita. Mantemos em 5s alinhado com `use-toast.ts`.
    <ToastProvider duration={5000} swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isError = variant === "destructive";
        return (
          <Toast
            key={id}
            {...props}
            variant={variant}
            // role/aria-live: erros são assertivos (interrompem leitor);
            // demais são polite (anunciam sem interromper).
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            aria-atomic="true"
            className="!bg-yellow-400 !text-black !border-yellow-500 shadow-lg"
          >
            <div className="grid gap-1">
              {title && <ToastTitle className="!text-black font-semibold">{title}</ToastTitle>}
              {description && (
                <ToastDescription className="!text-black/80">{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose
              aria-label="Fechar notificação"
              className="!text-black !opacity-100 hover:!bg-black/10 focus:!ring-2 focus:!ring-black/40 focus:!outline-none"
            />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
