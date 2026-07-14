import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';

export interface SocialBetaPublicConfig {
  moduleName: string;
  loungeLabel: string;
  connectionsLabel: string;
  gamesLabel: string;
  dynamicsLabel: string;
  updatedAt?: string;
}

export interface SocialBetaAdminConfig extends SocialBetaPublicConfig {
  enabled: boolean;
  betaMode: boolean;
  allowedPlans: string[];
  selectedUsers: string[];
  notes: string | null;
}

const DEFAULT_PUBLIC_CONFIG: SocialBetaPublicConfig = {
  moduleName: 'Módulo Social Beta',
  loungeLabel: 'Lounge',
  connectionsLabel: 'Conexões',
  gamesLabel: 'Jogos',
  dynamicsLabel: 'Dinâmicas',
};

const DEFAULT_ADMIN_CONFIG: SocialBetaAdminConfig = {
  ...DEFAULT_PUBLIC_CONFIG,
  enabled: false,
  betaMode: true,
  allowedPlans: [],
  selectedUsers: [],
  notes: null,
};

const PUBLIC_QUERY_KEY = ['social-beta-public-config'];

function mapPublicConfig(row: any): SocialBetaPublicConfig {
  return {
    moduleName: row?.module_name ?? DEFAULT_PUBLIC_CONFIG.moduleName,
    loungeLabel: row?.lounge_label ?? DEFAULT_PUBLIC_CONFIG.loungeLabel,
    connectionsLabel: row?.connections_label ?? DEFAULT_PUBLIC_CONFIG.connectionsLabel,
    gamesLabel: row?.games_label ?? DEFAULT_PUBLIC_CONFIG.gamesLabel,
    dynamicsLabel: row?.dynamics_label ?? DEFAULT_PUBLIC_CONFIG.dynamicsLabel,
    updatedAt: row?.updated_at,
  };
}

function normalizeRpcRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

export function mapAdminConfig(row: any): SocialBetaAdminConfig {
  return {
    ...mapPublicConfig(row),
    enabled: Boolean(row?.enabled),
    betaMode: row?.beta_mode ?? true,
    allowedPlans: Array.isArray(row?.allowed_plans) ? row.allowed_plans : [],
    selectedUsers: Array.isArray(row?.selected_users) ? row.selected_users : [],
    notes: row?.notes ?? null,
  };
}

export function getDefaultSocialBetaAdminConfig(): SocialBetaAdminConfig {
  return DEFAULT_ADMIN_CONFIG;
}

export function useSocialBetaPublicConfig() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const unsub = subscribeTable('oculto_social_beta_public_config', () => {
      qc.invalidateQueries({ queryKey: PUBLIC_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['social-beta-access', user.id] });
    });
    return () => unsub();
  }, [qc, user]);

  return useQuery<SocialBetaPublicConfig>({
    queryKey: PUBLIC_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_social_beta_public_config')
        .select('module_name,lounge_label,connections_label,games_label,dynamics_label,updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return DEFAULT_PUBLIC_CONFIG;
      return mapPublicConfig(data);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useSocialBetaModule() {
  const { user } = useAuth();
  const publicConfig = useSocialBetaPublicConfig();
  const accessQuery = useQuery<boolean>({
    queryKey: ['social-beta-access', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const nextRpc = await (supabase as any).rpc('social_beta_can_access', { _user_id: user!.id });
      if (!nextRpc.error) return Boolean(nextRpc.data);

      const legacyRpc = await (supabase as any).rpc('can_access_hidden_experiences', { _user_id: user!.id });
      if (!legacyRpc.error) return Boolean(legacyRpc.data);

      return false;
    },
  });

  return {
    allowed: Boolean(accessQuery.data),
    isLoading: publicConfig.isLoading || accessQuery.isLoading,
    config: publicConfig.data ?? DEFAULT_PUBLIC_CONFIG,
    refetchAccess: accessQuery.refetch,
  };
}

export { normalizeRpcRow };