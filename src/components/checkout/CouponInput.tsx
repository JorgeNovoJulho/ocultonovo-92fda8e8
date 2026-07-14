import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ticket, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCouponApplier, type AppliedCoupon } from "@/hooks/useCouponApplier";
import type { CouponTarget } from "@/lib/coupons";

interface Props {
  creatorId?: string | null;
  targetType: CouponTarget;
  targetId?: string | null;
  basePrice: number;
  onApplied?: (coupon: AppliedCoupon | null) => void;
  /** Notifica mudança de status (para mostrar skeleton no resumo durante validação). */
  onStatusChange?: (status: "idle" | "validating" | "applied" | "error") => void;
  /** Pré-aplica um código (ex.: vindo da URL). */
  initialCode?: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Razões de erro consideradas "definitivas" para o código atual:
// enquanto o usuário não editar o código, o botão Aplicar fica bloqueado.
const STICKY_ERROR_REASONS = new Set([
  "Cupom não se aplica a este conteúdo",
  "Cupom expirado",
  "Cupom esgotado",
  "Você já usou este cupom",
  "Cupom inativo",
  "Cupom não encontrado",
]);

// Sanitiza código vindo de qualquer fonte (URL, paste): trim + uppercase + remove espaços internos
const sanitizeCode = (raw: string | undefined | null) =>
  (raw || "").trim().replace(/\s+/g, "").toUpperCase();

export default function CouponInput(props: Props) {
  const { creatorId, targetType, targetId, basePrice, onApplied, onStatusChange } = props;
  const [code, setCode] = useState(sanitizeCode(props.initialCode));
  const { state, apply, clear } = useCouponApplier({ creatorId, targetType, targetId, basePrice });
  const lastNotifiedRef = useRef<string>("");
  const [blockedCode, setBlockedCode] = useState<string | null>(null);

  const handleApply = async () => {
    await apply(sanitizeCode(code));
  };
  const handleRemove = () => {
    setCode("");
    clear();
    onApplied?.(null);
    lastNotifiedRef.current = "";
    setBlockedCode(null);
  };

  // Side-effects: toasts + parent notify (após render, evitando setState durante render)
  useEffect(() => {
    if (state.status === "applied") {
      const key = `applied:${state.data.code}`;
      if (lastNotifiedRef.current !== key) {
        lastNotifiedRef.current = key;
        onApplied?.(state.data);
        setBlockedCode(null);
        toast.success(`Cupom ${state.data.code} aplicado!`, {
          description: `Desconto de ${state.data.discount_percent}% — você economiza R$ ${state.data.amount_discounted.toFixed(2)}.`,
        });
      }
    } else if (state.status === "error") {
      const key = `error:${code}:${state.reason}`;
      if (lastNotifiedRef.current !== key) {
        lastNotifiedRef.current = key;
        toast.error("Cupom não aplicado", { description: state.reason });
        if (STICKY_ERROR_REASONS.has(state.reason)) {
          setBlockedCode(sanitizeCode(code));
        }
      }
    } else {
      lastNotifiedRef.current = "";
    }
  }, [state, onApplied, code]);

  // Notifica status para o pai exibir skeleton no resumo durante validação
  useEffect(() => {
    onStatusChange?.(state.status as any);
  }, [state.status, onStatusChange]);

  // Pré-aplicar cupom vindo da URL (initialCode) automaticamente uma única vez.
  // Aguarda creatorId estar disponível para evitar erro "Criador inválido".
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    const initial = sanitizeCode(props.initialCode);
    if (!autoAppliedRef.current && initial && creatorId && state.status === "idle") {
      autoAppliedRef.current = true;
      apply(initial);
    }
  }, [props.initialCode, creatorId, state.status, apply]);

  // Revalida automaticamente quando o conteúdo (target) muda enquanto há um
  // cupom aplicado — garante que applies_to seja reavaliado para o novo target.
  const lastTargetRef = useRef<string>(`${targetType}:${targetId ?? ""}`);
  useEffect(() => {
    const key = `${targetType}:${targetId ?? ""}`;
    if (lastTargetRef.current !== key) {
      lastTargetRef.current = key;
      if (state.status === "applied") {
        // Reaplica o mesmo código contra o novo target — pode aprovar ou bloquear
        const current = state.data.code;
        // Limpa primeiro para que o resumo mostre validating
        clear();
        onApplied?.(null);
        // Dispara nova validação (assíncrono, mas useCouponApplier troca o estado)
        void apply(current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  if (state.status === "applied") {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <code className="text-xs font-bold text-green-300">{state.data.code}</code>
          <Badge className="bg-green-500/30 text-green-100 text-[10px] ml-auto">
            -{state.data.discount_percent}%
          </Badge>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleRemove} aria-label="Fechar">
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground line-through">{fmt(basePrice)}</span>
          <span className="font-semibold text-green-400">{fmt(state.data.final_price)}</span>
        </div>
      </div>
    );
  }

  const trimmed = sanitizeCode(code);
  const isBlockedByPriorError =
    blockedCode !== null && trimmed === blockedCode;
  const applyDisabled =
    !trimmed || state.status === "validating" || isBlockedByPriorError;

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Ticket className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={code}
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              setCode(next);
              // Ao editar, libera o bloqueio para tentar de novo
              if (blockedCode && sanitizeCode(next) !== blockedCode) {
                setBlockedCode(null);
                if (state.status === "error") clear();
              }
            }}
            onPaste={(e) => {
              // Sanitiza ao colar (remove espaços e força uppercase)
              const txt = e.clipboardData.getData("text");
              if (txt) {
                e.preventDefault();
                const next = sanitizeCode(txt);
                setCode(next);
                if (blockedCode && next !== blockedCode) {
                  setBlockedCode(null);
                  if (state.status === "error") clear();
                }
              }
            }}
            placeholder="Tem um cupom? Digite aqui"
            className="pl-7 text-xs h-9"
            maxLength={32}
            disabled={state.status === "validating"}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleApply}
          disabled={applyDisabled}
          title={isBlockedByPriorError ? "Edite o código para tentar outro cupom" : undefined}
        >
          {state.status === "validating" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Aplicar"
          )}
        </Button>
      </div>
      {state.status === "error" && (
        <p className="text-[11px] text-destructive flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            {state.reason}
            {isBlockedByPriorError && (
              <span className="block text-muted-foreground/80">
                Edite o código para tentar outro cupom.
              </span>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
