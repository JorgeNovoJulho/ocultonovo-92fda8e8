import { useEffect, useState } from "react";
import { useProfile } from "./useProfile";
import { isPlaceholderUrl } from "@/lib/placeholderMedia";

const SESSION_KEY = "placeholder_modal_seen";

/**
 * Detecta se o usuário possui avatar/banner placeholder.
 * Mostra modal uma vez por sessão (reabre a cada novo login).
 */
export function usePlaceholderMediaCheck() {
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);

  const p = profile as any;
  const needsAvatar = !!(p?.avatar_is_placeholder ?? isPlaceholderUrl(p?.avatar_url));
  const needsCover = !!(
    p?.cover_is_placeholder ??
    isPlaceholderUrl(p?.cover_image_url ?? p?.banner_url)
  );

  useEffect(() => {
    if (!profile) return;
    if (!needsAvatar && !needsCover) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    // pequena espera para não competir com onboarding/outros modais
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [profile, needsAvatar, needsCover]);

  const close = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return { open, close, needsAvatar, needsCover };
}
