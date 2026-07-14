import { useEffect, useState } from "react";
import { paidCheckoutStore, type PaidAttempt } from "@/lib/paidContentCheckoutStorage";

/** Hook reativo: estado persistido do checkout para um post (mock localStorage). */
export function usePaidCheckoutState(postId: string | undefined | null) {
  const [latest, setLatest] = useState<PaidAttempt | null>(() =>
    postId ? paidCheckoutStore.latest(postId) : null,
  );
  const [history, setHistory] = useState<PaidAttempt[]>(() =>
    postId ? paidCheckoutStore.list(postId) : [],
  );

  useEffect(() => {
    if (!postId) {
      setLatest(null);
      setHistory([]);
      return;
    }
    const refresh = () => {
      setLatest(paidCheckoutStore.latest(postId));
      setHistory(paidCheckoutStore.list(postId));
    };
    refresh();
    return paidCheckoutStore.subscribe(refresh);
  }, [postId]);

  return { latest, history };
}
