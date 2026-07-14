import { useEffect, useState, useCallback } from "react";
import {
  mockChannelSubsStore,
  type MockChannelSubscription,
} from "@/lib/mockChannelSubscriptions";

/** Lista reativa de TODAS as assinaturas mock (ativas + expiradas) — histórico. */
export function useMockChannelSubscriptions() {
  const [list, setList] = useState<MockChannelSubscription[]>(() =>
    mockChannelSubsStore.list(),
  );

  useEffect(() => {
    const refresh = () => setList(mockChannelSubsStore.list());
    refresh();
    const unsub = mockChannelSubsStore.subscribe(refresh);
    // Tick a cada 30s para revalidar status (expirou enquanto a página está aberta)
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, []);

  const findByCreator = useCallback(
    (creatorProfileId?: string | null) =>
      creatorProfileId
        ? list.find((s) => s.creatorProfileId === creatorProfileId) ?? null
        : null,
    [list],
  );

  const activeList = list.filter(
    (s) => !s.endISO || new Date(s.endISO).getTime() > Date.now(),
  );

  return {
    all: list,
    active: activeList,
    findByCreator,
    activeCreatorProfileIds: new Set(activeList.map((s) => s.creatorProfileId)),
    activeCreatorUserIds: new Set(
      activeList.map((s) => s.creatorUserId).filter(Boolean) as string[],
    ),
  };
}
