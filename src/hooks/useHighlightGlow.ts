import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseExternal";

export type HighlightGlowStyle = "gold" | "rgb";
const BASE_KEY = "app.highlight.glow.style";
const EVT = "app:highlight-glow-changed";

/** Cached user id (per-user persistence). */
let _uid: string | null = null;
let _uidLoaded = false;
async function ensureUid(): Promise<string | null> {
  if (_uidLoaded) return _uid;
  try {
    const { data } = await supabase.auth.getUser();
    _uid = data.user?.id ?? null;
  } catch { _uid = null; }
  _uidLoaded = true;
  return _uid;
}
function keyFor(uid: string | null) {
  return uid ? `${BASE_KEY}:${uid}` : BASE_KEY;
}

export function getHighlightGlowStyle(): HighlightGlowStyle {
  try {
    const k = keyFor(_uid);
    const v = localStorage.getItem(k) ?? localStorage.getItem(BASE_KEY);
    // Default = RGB quando o destaque é ativado (preferência do produto).
    return v === "gold" ? "gold" : "rgb";
  } catch {
    return "rgb";
  }
}

export function setHighlightGlowStyle(style: HighlightGlowStyle) {
  try {
    const k = keyFor(_uid);
    localStorage.setItem(k, style);
    localStorage.setItem(BASE_KEY, style);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: style }));
  } catch {}
}

/** Persiste no servidor (best-effort). */
async function persistRemote(style: HighlightGlowStyle) {
  try {
    await (supabase as any).rpc("set_highlight_glow_style", { p_style: style });
  } catch {}
}

/** Hidrata do servidor (sobrescreve cache local se diferente). */
async function hydrateFromRemote(): Promise<HighlightGlowStyle | null> {
  try {
    const { data, error } = await (supabase as any).rpc("get_highlight_glow_style");
    if (error) return null;
    // Default remoto também = RGB.
    const v = (data === "gold" ? "gold" : "rgb") as HighlightGlowStyle;
    return v;
  } catch {
    return null;
  }
}

/** Hook reativo: re-renderiza quando o usuário troca o estilo. */
export function useHighlightGlow() {
  const [style, setStyleState] = useState<HighlightGlowStyle>(() => getHighlightGlowStyle());
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureUid();
      if (cancelled) return;
      // 1) leitura local imediata
      setStyleState(getHighlightGlowStyle());
      // 2) hidratação remota
      const remote = await hydrateFromRemote();
      if (cancelled || !remote) return;
      if (remote !== getHighlightGlowStyle()) {
        setHighlightGlowStyle(remote); // dispara evento → re-render
      }
    })();

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<HighlightGlowStyle>).detail;
      setStyleState(detail || getHighlightGlowStyle());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && (e.key === BASE_KEY || e.key.startsWith(`${BASE_KEY}:`))) {
        setStyleState(getHighlightGlowStyle());
      }
    };
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onStorage);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const set = useCallback((s: HighlightGlowStyle) => {
    if (s === style) return;
    setHighlightGlowStyle(s);
    toast.success(s === "rgb" ? "✨ Brilho RGB ativado" : "🌟 Brilho dourado ativado", {
      description: "Preferência salva no seu perfil.",
    });
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void persistRemote(s); }, 400);
  }, [style]);

  return { style, setStyle: set };
}

/** Classe CSS pronta a aplicar à moldura/Card destacado. */
export function highlightGlowClass(style: HighlightGlowStyle): string {
  return style === "rgb" ? "highlight-glow-rgb" : "highlight-glow-gold";
}
