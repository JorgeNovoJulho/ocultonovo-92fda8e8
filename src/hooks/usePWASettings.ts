import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";

export interface PWASettings {
  pwa_install_banner_enabled: boolean;
  pwa_install_page_enabled: boolean;
  pwa_min_version: string | null;
  pwa_update_message: string;
  pwa_force_update: boolean;
  pwa_offline_fallback_enabled: boolean;
  pwa_push_enabled: boolean;
}

const DEFAULTS: PWASettings = {
  pwa_install_banner_enabled: true,
  pwa_install_page_enabled: true,
  pwa_min_version: null,
  pwa_update_message: "Uma nova versão do OCULTO está disponível.",
  pwa_force_update: false,
  pwa_offline_fallback_enabled: true,
  pwa_push_enabled: false,
};

let CACHE: { at: number; data: PWASettings } | null = null;
const TTL_MS = 60_000;

/**
 * Lê colunas pwa_* de platform_runtime_settings (singleton row).
 * Cache em memória 60s para reduzir requests.
 */
export function usePWASettings() {
  const [settings, setSettings] = useState<PWASettings | null>(
    CACHE && Date.now() - CACHE.at < TTL_MS ? CACHE.data : null,
  );
  const [loading, setLoading] = useState(!settings);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("platform_runtime_settings")
        .select(
          "pwa_install_banner_enabled, pwa_install_page_enabled, pwa_min_version, pwa_update_message, pwa_force_update, pwa_offline_fallback_enabled, pwa_push_enabled",
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const merged: PWASettings = { ...DEFAULTS, ...(data as Partial<PWASettings> | null) };
      CACHE = { at: Date.now(), data: merged };
      setSettings(merged);
    } catch {
      setSettings(DEFAULTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (CACHE && Date.now() - CACHE.at < TTL_MS) {
      setSettings(CACHE.data);
      setLoading(false);
      return;
    }
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { settings, loading, refresh: fetchSettings };
}

export function clearPWASettingsCache() {
  CACHE = null;
}
