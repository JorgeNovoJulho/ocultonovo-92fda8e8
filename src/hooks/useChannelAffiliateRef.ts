import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";

export interface ChannelAffiliateRef {
  affiliateId: string;
  username: string | null;
  code: string;
}

/**
 * Captura o parâmetro `?ref=<código>` quando o visitante entra no canal e
 * resolve para o perfil do afiliado (afilhada_id em creator_referrals).
 * Persiste por sessão (por canal), para que qualquer compra feita dentro do
 * canal mantenha a atribuição mesmo que o usuário navegue por outros posts.
 *
 * O backend (edge function create-paid-content-checkout) já credita 5% para
 * o afiliado quando recebe `affiliate_id_from_link`.
 */
export function useChannelAffiliateRef(
  creatorProfileId?: string | null
): ChannelAffiliateRef | null {
  const [searchParams] = useSearchParams();
  const refCode = (searchParams.get("ref") || "").trim() || null;
  const [info, setInfo] = useState<ChannelAffiliateRef | null>(null);

  useEffect(() => {
    if (!creatorProfileId) return;
    const storageKey = `oculto.channel_ref.${creatorProfileId}`;

    // 1) Hidrata do storage (mantém atribuição entre navegações no canal)
    try {
      const cached = sessionStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ChannelAffiliateRef;
        if (parsed?.affiliateId) setInfo(parsed);
      }
    } catch {}

    if (!refCode) return;

    // 2) Resolve o código → afilhada (afiliado que recebe a comissão)
    let cancelled = false;
    (async () => {
      try {
        const { data: ref } = await (supabase as any)
          .from("creator_referrals")
          .select("afilhada_id, referral_code, status, expires_at")
          .eq("madrinha_id", creatorProfileId)
          .eq("referral_code", refCode)
          .eq("status", "active")
          .maybeSingle();

        if (cancelled || !ref) return;
        if (ref.expires_at && new Date(ref.expires_at).getTime() < Date.now()) return;

        const { data: prof } = await supabase
          .from("profiles")
          .select("id, username")
          .eq("id", ref.afilhada_id)
          .maybeSingle();

        const next: ChannelAffiliateRef = {
          affiliateId: ref.afilhada_id as string,
          username: (prof as any)?.username ?? null,
          code: ref.referral_code as string,
        };
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        if (!cancelled) setInfo(next);
      } catch {
        /* silencioso — sem ref válido, segue sem atribuição */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creatorProfileId, refCode]);

  return info;
}
