/**
 * ViewModeMigrationGate — monta o ViewModeMigrationModal somente em rotas
 * seguras (não admin, não checkout, não login, não manutenção pública)
 * quando o usuário ainda não viu o modal e não está em snooze.
 *
 * Respeita oculto_experience_mode_settings.enabled e .force_migration_modal
 * (com leitura pública e fallback resiliente).
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useViewModePreferences } from '@/hooks/useViewModePreferences';

const ViewModeMigrationModal = lazy(() =>
  import('./ViewModeMigrationModal').then((m) => ({ default: m.ViewModeMigrationModal })),
);

const BLOCKED_PREFIXES = [
  '/admin',
  '/checkout',
  '/pagamento',
  '/payment',
  '/login',
  '/cadastro',
  '/signup',
  '/onboarding',
  '/manutencao',
  '/maintenance',
  '/kyc',
  '/legal',
];

function useExperienceSettings() {
  return useQuery({
    queryKey: ['oculto-experience-settings-public'],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc('oculto_experience_settings_get');
        if (error || !data) return null;
        return data as {
          enabled: boolean;
          force_migration_modal: boolean;
          modal_title?: string | null;
          modal_description?: string | null;
        };
      } catch {
        return null;
      }
    },
  });
}

export function ViewModeMigrationGate() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const { shouldShowMigrationModal } = useViewModePreferences();
  const { data: settings } = useExperienceSettings();
  const [open, setOpen] = useState(false);

  const routeAllowed = useMemo(() => {
    const p = (pathname || '/').toLowerCase();
    return !BLOCKED_PREFIXES.some((pref) => p === pref || p.startsWith(pref + '/'));
  }, [pathname]);

  const enabled =
    !loading &&
    !!user &&
    routeAllowed &&
    shouldShowMigrationModal &&
    (settings ? settings.enabled && settings.force_migration_modal : true);

  useEffect(() => {
    if (!enabled) return;
    // pequeno delay para não competir com boot pesado
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [enabled]);

  if (!enabled && !open) return null;

  return (
    <Suspense fallback={null}>
      <ViewModeMigrationModal
        open={open}
        onOpenChange={setOpen}
        title={settings?.modal_title || undefined}
        description={settings?.modal_description || undefined}
      />
    </Suspense>
  );
}

export default ViewModeMigrationGate;
