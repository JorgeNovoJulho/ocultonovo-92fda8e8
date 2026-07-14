import { ShieldAlert } from "lucide-react";

interface DrmViolationScreenProps {
  onReset?: () => void;
}

export function DrmViolationScreen({ onReset }: DrmViolationScreenProps) {
  return (
    <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center text-center p-6">
      <ShieldAlert className="h-16 w-16 text-destructive mb-4 animate-pulse" />
      <h3 className="text-xl font-bold text-white mb-2">
        Violação de DRM Detectada
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        A reprodução foi interrompida por tentativa de manipulação do conteúdo protegido.
      </p>
      {onReset && (
        <button
          onClick={onReset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Recarregar Conteúdo
        </button>
      )}
    </div>
  );
}
