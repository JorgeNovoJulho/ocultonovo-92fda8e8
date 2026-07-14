import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Sparkles } from 'lucide-react';

interface Props {
  userId?: string | null;
  kind: 'discount_sub' | 'discount_vip' | 'discount_fee';
  amount: number;
  label?: string;
  className?: string;
}

interface Result { applied_pct: number; discount_amount: number; final_amount: number; level: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Mostra a prévia (mock) do desconto que o nível Aura Social aplica nesse checkout.
 * Não modifica o valor real cobrado — apenas exibe o "valor final estimado" antes
 * do pagamento, ajudando o usuário a entender o benefício.
 */
export function SocialDiscountPreview({ userId, kind, amount, label = 'Aura Social', className }: Props) {
  const [r, setR] = useState<Result | null>(null);

  useEffect(() => {
    if (!userId || !amount || amount <= 0) { setR(null); return; }
    let alive = true;
    (async () => {
      const { data, error } = await (supabase as any).rpc('social_apply_discount', {
        p_user: userId, p_kind: kind, p_amount: amount,
      });
      if (!alive || error || !data) return;
      setR(data as Result);
    })();
    return () => { alive = false; };
  }, [userId, kind, amount]);

  if (!r || !r.applied_pct || r.applied_pct <= 0) return null;

  return (
    <div
      className={`rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1 ${className ?? ''}`}
      data-testid="social-discount-preview"
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        Desconto {label} (Nv {r.level}) — {r.applied_pct}% OFF
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Desconto aplicado</span>
        <span>-{fmt(r.discount_amount)}</span>
      </div>
      <div className="flex justify-between font-semibold text-foreground">
        <span>Valor final estimado</span>
        <span>{fmt(r.final_amount)}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Prévia da sua Aura Social — o valor cobrado pode considerar outros descontos.
      </p>
    </div>
  );
}
