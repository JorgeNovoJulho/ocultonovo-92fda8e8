import { useCallback, useRef, useEffect } from "react";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';
import { supabase } from "@/lib/supabaseExternal";

type EventType = "impression" | "click" | "close" | "conversion";

interface QueuedEvent {
  promotion_id: string;
  event_type: EventType;
  session_hash: string;
  time_period: string;
}

function getTimePeriod(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

// Simple anonymous session hash (no personal data)
function getSessionHash(): string {
  let hash = sessionStorage.getItem("promo_session");
  if (!hash) {
    hash = Math.random().toString(36).slice(2, 14);
    sessionStorage.setItem("promo_session", hash);
  }
  return hash;
}

const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 15_000; // 15s

// Singleton queue shared across hook instances
let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

async function flushQueue() {
  if (isFlushing || eventQueue.length === 0) return;
  isFlushing = true;

  const batch = eventQueue.splice(0, BATCH_SIZE);
  try {
    await (supabase as any)
      .from("promotion_events")
      .insert(batch);
  } catch (e) {
    // Silently fail – tracking should never break the app
    console.warn("[promo-tracking] flush error", e);
  } finally {
    isFlushing = false;
    // If more events remain, schedule another flush
    if (eventQueue.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, FLUSH_INTERVAL);
}

// Dedupe impressions: max once per promotion per session
const impressionsSent = new Set<string>();

/**
 * Lightweight promotion event tracker.
 * Batches events silently – zero impact on scroll/UI performance.
 */
export function usePromotionTracking() {
  const sessionHash = useRef(getSessionHash());

  // Flush on unmount / page close
  useEffect(() => {
    const handleUnload = () => {
      if (eventQueue.length > 0) {
        // Use sendBeacon for reliability on page close
        const url = `${EXTERNAL_SUPABASE_URL}/rest/v1/promotion_events`;
        const body = JSON.stringify(eventQueue);
        navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }));
        eventQueue = [];
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const track = useCallback((promotionId: string, eventType: EventType) => {
    // Dedupe impressions per session
    if (eventType === "impression") {
      const key = `${sessionHash.current}:${promotionId}`;
      if (impressionsSent.has(key)) return;
      impressionsSent.add(key);
    }

    eventQueue.push({
      promotion_id: promotionId,
      event_type: eventType,
      session_hash: sessionHash.current,
      time_period: getTimePeriod(),
    });

    if (eventQueue.length >= BATCH_SIZE) {
      flushQueue();
    } else {
      scheduleFlush();
    }
  }, []);

  return { track };
}
