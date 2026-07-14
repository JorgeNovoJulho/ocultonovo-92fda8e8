import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { progressAuraQuest } from "@/lib/auraQuests";

const VitrinePlansModal = lazy(() =>
  import("@/components/VitrinePlansModal").then((m) => ({ default: m.VitrinePlansModal })),
);

export default function VitrineVipPage() {
  const navigate = useNavigate();
  useEffect(() => {
    void progressAuraQuest('visit_vitrine_vip', 1, { reason: 'vitrine VIP aberta' });
  }, []);
  return (
    <Suspense fallback={null}>
      <VitrinePlansModal
        open
        onOpenChange={(v) => {
          if (!v) navigate("/feed");
        }}
      />
    </Suspense>
  );
}
