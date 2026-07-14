import { lazy, Suspense } from "react";
import { useAffiliateApprovedNotifications } from "@/hooks/useAffiliateApprovedNotifications";

const AffiliateApprovedModal = lazy(() =>
  import("@/components/AffiliateApprovedModal").then((m) => ({
    default: m.AffiliateApprovedModal,
  }))
);

/**
 * Listener GLOBAL do modal "Aprovado como Afiliado".
 *
 * Mantido fora do DashboardLayout para que dispare em QUALQUER rota
 * (ex.: /canal/:creatorId, /messages, /checkout, mobile, desktop).
 */
export function GlobalAffiliateApprovedListener() {
  const { data, isOpen, closeModal } = useAffiliateApprovedNotifications();

  if (!data) return null;

  return (
    <Suspense fallback={null}>
      <AffiliateApprovedModal
        open={isOpen}
        onOpenChange={(open) => !open && closeModal()}
        data={data}
      />
    </Suspense>
  );
}
