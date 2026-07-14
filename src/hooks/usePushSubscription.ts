import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "vapid_public_key")
      .maybeSingle();
    return (data?.value as string) || null;
  } catch {
    return null;
  }
}

/**
 * Gerencia subscription de Web Push para o usuário logado.
 * - Persiste em public.push_subscriptions (Supabase externo).
 * - Limpa subscription quando o usuário desativa.
 */
export function usePushSubscription() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch { /* noop */ }
    })();
  }, []);

  const subscribe = useCallback(async () => {
    if (!user?.id) return { ok: false, error: "not_authenticated" };
    if (permission === "unsupported") return { ok: false, error: "unsupported" };
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== "granted") return { ok: false, error: "denied" };

      const vapid = await getVapidPublicKey();
      if (!vapid) return { ok: false, error: "no_vapid_key" };

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = urlBase64ToUint8Array(vapid);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer as ArrayBuffer,
        });
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, error: "invalid_subscription" };
      }

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent.slice(0, 200),
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        );
      if (error) throw error;
      setSubscribed(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "unknown" };
    } finally {
      setBusy(false);
    }
  }, [user?.id, permission]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        if (endpoint) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
        }
      }
      setSubscribed(false);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "unknown" };
    } finally {
      setBusy(false);
    }
  }, []);

  return { permission, subscribed, busy, subscribe, unsubscribe };
}
