import { useCallback, useState } from "react";
import { redeemCoupon, COUPON_REASON_LABEL, type CouponTarget } from "@/lib/coupons";

export type AppliedCoupon = {
  code: string;
  discount_percent: number;
  amount_discounted: number;
  final_price: number;
  coupon_id?: string;
};

export type ApplyState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "applied"; data: AppliedCoupon }
  | { status: "error"; reason: string };

interface Params {
  creatorId?: string | null;
  targetType: CouponTarget;
  targetId?: string | null;
  basePrice: number;
}

/**
 * Aplica um cupom localmente no checkout (usa o mock RPC `redeem_coupon` para
 * VALIDAÇÃO, mas não consome o cupom — o consumo acontece no fluxo real de
 * pagamento. Aqui apenas calculamos o desconto a exibir/cobrar).
 *
 * Trata applies_to, datas de validade e uso por usuário, exibindo motivo.
 */
export function useCouponApplier(params: Params) {
  const [state, setState] = useState<ApplyState>({ status: "idle" });

  const apply = useCallback(
    async (rawCode: string) => {
      const code = (rawCode || "").trim().toUpperCase();
      if (!code) return;
      if (!params.creatorId) {
        setState({ status: "error", reason: "Criador inválido" });
        return;
      }
      setState({ status: "validating" });
      try {
        const r = await redeemCoupon({
          code,
          creatorId: params.creatorId,
          targetType: params.targetType,
          targetId: params.targetId ?? null,
          basePrice: params.basePrice,
        });
        if (!r.ok) {
          const reason =
            (r.reason && COUPON_REASON_LABEL[r.reason]) ||
            r.reason ||
            "Cupom inválido";
          setState({ status: "error", reason });
          return;
        }
        const pct = r.discount_percent ?? 0;
        const discount = r.amount_discounted ?? +(params.basePrice * pct / 100).toFixed(2);
        const final = Math.max(0, +(params.basePrice - discount).toFixed(2));
        setState({
          status: "applied",
          data: {
            code,
            discount_percent: pct,
            amount_discounted: discount,
            final_price: final,
            coupon_id: r.coupon_id,
          },
        });
      } catch (e: any) {
        setState({ status: "error", reason: e?.message || "Falha ao validar cupom" });
      }
    },
    [params.creatorId, params.targetType, params.targetId, params.basePrice]
  );

  const clear = useCallback(() => setState({ status: "idle" }), []);

  return { state, apply, clear };
}
