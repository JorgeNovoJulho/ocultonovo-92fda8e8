import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { buildCreatorInviteUrl, getCreatorInviteCodeVariants, normalizeCreatorInviteCode } from '@/lib/inviteLinks';

export interface CreatorReferral {
  id: string;
  madrinha_id: string;
  afilhada_id: string;
  referral_code: string;
  started_at: string;
  expires_at: string;
  is_active: boolean;
  total_commission_earned: number;
  last_commission_at: string | null;
  // Joined data
  afilhada_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
    is_verified: boolean;
  };
  madrinha_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
  };
}

export interface CreatorReferralCommission {
  id: string;
  referral_id: string;
  transaction_id: string | null;
  gross_amount: number;
  platform_fee_original: number;
  commission_amount: number;
  platform_fee_net: number;
  creator_amount: number;
  description: string | null;
  created_at: string;
}

export interface MadrinhaStats {
  totalAfilhadas: number;
  activeAfilhadas: number;
  totalCommissionEarned: number;
  monthlyCommission: number;
  avgCommissionPerAfilhada: number;
}

export interface CreatorInviteProfile {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  bio: string | null;
  creator_referral_code: string | null;
  is_creator: boolean;
}

const COMMISSION_PERIOD_MONTHS = 12;

const normalizeInviteCode = normalizeCreatorInviteCode;

// Get profile ID from auth user
async function getProfileId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id || null;
}

// Calculate remaining commission days
export function getRemainingCommissionDays(expiresAt: string): number {
  const expires = new Date(expiresAt);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// Check if referral is still active
export function isReferralActive(expiresAt: string, isActive: boolean): boolean {
  if (!isActive) return false;
  return getRemainingCommissionDays(expiresAt) > 0;
}

// Calculate commission amount (5% of sale)
export function calculateMadrinhaCommission(saleAmount: number): number {
  return saleAmount * 0.05;
}

/**
 * Hook to get all afilhadas for a madrinha
 */
export function useMyAfilhadas() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-afilhadas', user?.id],
    queryFn: async (): Promise<CreatorReferral[]> => {
      if (!user) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      // Fetch referrals where user is madrinha
      const { data: referrals, error } = await supabase
        .from('creator_referrals')
        .select('*')
        .eq('madrinha_id', profileId)
        .order('started_at', { ascending: false });

      if (error) throw error;
      if (!referrals || referrals.length === 0) return [];

      // Fetch afilhada profiles
      const afilhadaIds = referrals.map(r => r.afilhada_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, username, is_verified')
        .in('id', afilhadaIds);

      // Merge data
      return referrals.map(referral => ({
        ...referral,
        afilhada_profile: profiles?.find(p => p.id === referral.afilhada_id),
      })) as CreatorReferral[];
    },
    enabled: !!user,
  });
}

/**
 * Hook to get the madrinha for current user (if any)
 */
export function useMyMadrinha() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-madrinha', user?.id],
    queryFn: async (): Promise<CreatorReferral | null> => {
      if (!user) return null;

      const profileId = await getProfileId(user.id);
      if (!profileId) return null;

      // Fetch referral where user is afilhada
      const { data: referral, error } = await supabase
        .from('creator_referrals')
        .select('*')
        .eq('afilhada_id', profileId)
        .single();

      if (error || !referral) return null;

      // Fetch madrinha profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, username')
        .eq('id', referral.madrinha_id)
        .single();

      return {
        ...referral,
        madrinha_profile: profile || undefined,
      } as CreatorReferral;
    },
    enabled: !!user,
  });
}

/**
 * Hook to get commission history
 */
export function useMyCommissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-commissions', user?.id],
    queryFn: async (): Promise<CreatorReferralCommission[]> => {
      if (!user) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      // Get referral IDs where user is madrinha
      const { data: referrals } = await supabase
        .from('creator_referrals')
        .select('id')
        .eq('madrinha_id', profileId);

      if (!referrals || referrals.length === 0) return [];

      const referralIds = referrals.map(r => r.id);

      // Fetch commissions
      const { data: commissions, error } = await supabase
        .from('creator_referral_commissions')
        .select('*')
        .in('referral_id', referralIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (commissions || []) as CreatorReferralCommission[];
    },
    enabled: !!user,
  });
}

/**
 * Hook to get madrinha statistics
 */
export function useMadrinhaStats() {
  const { data: afilhadas, isLoading: loadingAfilhadas } = useMyAfilhadas();
  const { data: commissions, isLoading: loadingCommissions } = useMyCommissions();

  const stats: MadrinhaStats = {
    totalAfilhadas: 0,
    activeAfilhadas: 0,
    totalCommissionEarned: 0,
    monthlyCommission: 0,
    avgCommissionPerAfilhada: 0,
  };

  if (afilhadas) {
    stats.totalAfilhadas = afilhadas.length;
    stats.activeAfilhadas = afilhadas.filter(a => 
      isReferralActive(a.expires_at, a.is_active)
    ).length;
    stats.totalCommissionEarned = afilhadas.reduce(
      (sum, a) => sum + (a.total_commission_earned || 0), 0
    );
  }

  if (commissions) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    stats.monthlyCommission = commissions
      .filter(c => new Date(c.created_at) >= startOfMonth)
      .reduce((sum, c) => sum + c.commission_amount, 0);
  }

  if (stats.activeAfilhadas > 0) {
    stats.avgCommissionPerAfilhada = stats.totalCommissionEarned / stats.activeAfilhadas;
  }

  return { 
    stats, 
    isLoading: loadingAfilhadas || loadingCommissions 
  };
}

/**
 * Hook to generate/get creator referral code
 */
export function useCreatorReferralCode() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const buildInviteCode = (profile: {
    id?: string | null;
    user_id?: string | null;
    username?: string | null;
    creator_referral_code?: string | null;
  }): string | null => {
    // FONTE CANÔNICA: `username`. O link de convite SEMPRE deve refletir o
    // @username público do criador (ex.: /creator-invite/MULATACURIOSA_OFC).
    // `creator_referral_code` só é usado como fallback se o username ainda
    // não foi definido (situação que o RequireUsernameGate força a resolver).
    const username = normalizeInviteCode(profile.username);
    if (username) return username;

    const creatorReferralCode = normalizeInviteCode(profile.creator_referral_code);
    if (creatorReferralCode) return creatorReferralCode;

    const stableFallback = (profile.user_id || profile.id || '').trim();
    return stableFallback ? stableFallback.toUpperCase() : null;
  };

  const buildInviteCodeFromAuth = (authUser: typeof user): string | null => {
    if (!authUser) return null;

    const metadata = (authUser.user_metadata || {}) as Record<string, any>;
    const metadataUsername = normalizeInviteCode(metadata.username);
    if (metadataUsername) return metadataUsername;

    const emailPrefix = normalizeInviteCode(authUser.email?.split('@')[0] || null);
    if (emailPrefix) return emailPrefix;

    return authUser.id ? authUser.id.toUpperCase() : null;
  };

  const loadProfileInviteCode = async (authUser: NonNullable<typeof user>): Promise<string | null> => {
    // Após 2026_06_07_referral_link_regenerate.sql, profiles.creator_referral_code
    // armazena o código ATIVO (pós-regeneração). Fallback gracioso caso a coluna
    // ainda não exista (42703).
    const SEL_FULL = 'id, user_id, username, creator_referral_code';
    const SEL_MIN  = 'id, user_id, username';

    const fetchBy = async (column: 'user_id' | 'id') => {
      const { data, error } = await supabase
        .from('profiles' as any)
        .select(SEL_FULL)
        .eq(column, authUser.id)
        .maybeSingle();
      if (!error) return { data, error: null as any };
      return await supabase
        .from('profiles')
        .select(SEL_MIN)
        .eq(column, authUser.id)
        .maybeSingle();
    };

    const byUserId = await fetchBy('user_id');
    if (byUserId.error) return buildInviteCodeFromAuth(authUser);
    if (byUserId.data) return buildInviteCode(byUserId.data as any);

    const byId = await fetchBy('id');
    if (byId.error) return buildInviteCodeFromAuth(authUser);
    return byId.data ? buildInviteCode(byId.data as any) : buildInviteCodeFromAuth(authUser);
  };

  /**
   * Regenera o código de indicação. O código antigo vira alias permanente:
   * links já enviados continuam vinculando à mesma lista de indicados.
   */
  const regenerateCode = useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('regenerate_creator_referral_code');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Resposta vazia do servidor');
      return String(data);
    },
    onSuccess: (newCode) => {
      queryClient.invalidateQueries({ queryKey: ['creator-referral-code'] });
      toast({
        title: 'Novo link gerado',
        description: `Seu código agora é ${newCode}. Os links antigos continuam funcionando.`,
      });
    },
    onError: (e: Error) => {
      toast({
        title: 'Não foi possível gerar novo link',
        description: e.message,
        variant: 'destructive',
      });
    },
  });


  const { data: code, isLoading } = useQuery({
    queryKey: ['creator-referral-code', user?.id],
    queryFn: async (): Promise<string | null> => {
      if (!user) return null;
      return loadProfileInviteCode(user);
    },
    enabled: !!user,
  });

  const generateCode = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');

      const generatedCode = await loadProfileInviteCode(user);
      if (!generatedCode) {
        throw new Error('Não foi possível preparar o link de convite agora. Tente novamente em instantes.');
      }

      return generatedCode;
    },
    onSuccess: (newCode) => {
      queryClient.invalidateQueries({ queryKey: ['creator-referral-code'] });
      toast({
        title: 'Link de convite pronto!',
        description: `Seu código de convite é: ${newCode}`,
      });
    },
    onError: (error: Error) => {
      // Debounce: evita spam de toast em falhas consecutivas (mín 5s entre toasts)
      const w = window as unknown as { __lastReferralCodeToast?: number };
      const now = Date.now();
      if (!w.__lastReferralCodeToast || now - w.__lastReferralCodeToast > 5000) {
        w.__lastReferralCodeToast = now;
        toast({
          title: 'Erro ao gerar código',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
  });

  const getInviteLink = (): string | null => {
    return buildCreatorInviteUrl(code);
  };

  return {
    code,
    isLoading,
    generateCode: generateCode.mutate,
    isGenerating: generateCode.isPending,
    isError: generateCode.isError,
    reset: generateCode.reset,
    getInviteLink,
    regenerateCode: regenerateCode.mutateAsync,
    isRegenerating: regenerateCode.isPending,
  };
}

/**
 * Hook to validate a referral code
 */
export function useValidateCreatorCode(code: string | undefined) {
  return useQuery<CreatorInviteProfile | null>({
    queryKey: ['validate-creator-code', code],
    queryFn: async () => {
      if (!code) return null;
      // Defensivo: decodifica %xx caso ainda venha encodado.
      let raw = code;
      try { raw = decodeURIComponent(code); } catch { /* mantém */ }
      const trimmed = raw.trim().replace(/^@+/, '');
      if (!trimmed) return null;

      const normalized = normalizeInviteCode(trimmed);
      // Variantes para tolerar links digitados/colados com espaço, hífen ou ponto.
      const variants = getCreatorInviteCodeVariants(trimmed);

      const baseSelect =
        'id, name, avatar_url, username, is_verified, bio, is_creator, user_id';

      const mapInviteProfile = (profile: Record<string, any>): CreatorInviteProfile => ({
        id: String(profile.id),
        user_id: profile.user_id ?? null,
        username: profile.username ?? null,
        name: profile.name ?? null,
        avatar_url: profile.avatar_url ?? null,
        is_verified: !!profile.is_verified,
        bio: profile.bio ?? null,
        creator_referral_code: profile.creator_referral_code ?? normalized ?? trimmed,
        is_creator: profile.is_creator ?? true,
      });

      // 1) RPC público — fonte canônica.
      const tryRpc = async (value: string) => {
        try {
          const { data } = await supabase.rpc('lookup_referral_code', { p_code: value });
          const r: any = Array.isArray(data) ? data[0] : data;
          if (r && typeof r === 'object' && r.id) return mapInviteProfile(r);
        } catch { /* segue */ }
        return null;
      };
      for (const v of variants) {
        const hit = await tryRpc(v);
        if (hit) return hit;
      }

      // 2) Username case-insensitive — fallback direto à tabela.
      for (const v of variants) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select(baseSelect)
            .ilike('username', v)
            .limit(1)
            .maybeSingle();
          if (data) return mapInviteProfile(data as Record<string, any>);
        } catch { /* segue */ }
      }

      // 3) UUID (id ou user_id)
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(trimmed);
      if (isUuid) {
        const { data: byId } = await supabase
          .from('profiles')
          .select(baseSelect)
          .eq('id', trimmed)
          .maybeSingle();
        if (byId) return mapInviteProfile(byId as Record<string, any>);

        const { data: byUserId } = await supabase
          .from('profiles')
          .select(baseSelect)
          .eq('user_id', trimmed)
          .maybeSingle();
        if (byUserId) return mapInviteProfile(byUserId as Record<string, any>);
      }

      return null;
    },
    enabled: !!code && code.trim().length >= 2,
    retry: 1,
  });
}



/**
 * Hook to link an afilhada to a madrinha
 */
export function useLinkCreatorReferral() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ afilhadaProfileId, referralCode }: { 
      afilhadaProfileId: string; 
      referralCode: string 
    }) => {
      const { data, error } = await supabase
        .rpc('link_creator_referral', {
          p_afilhada_profile_id: afilhadaProfileId,
          p_referral_code: referralCode,
        });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-madrinha'] });
      toast({
        title: 'Madrinha vinculada!',
        description: 'Você foi vinculada à sua madrinha com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao vincular',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
