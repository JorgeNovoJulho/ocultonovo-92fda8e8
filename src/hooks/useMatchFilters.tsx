import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Match } from './useMatches';
import type { MatchFilterState } from '@/components/matches/MatchFilters';

const STORAGE_KEY = 'oculto-match-filters';

const defaultFilters: MatchFilterState = {
  distance: 'all',
  profileType: 'all',
  verification: 'all',
  sortBy: 'recent',
};

export function useMatchFilters() {
  const [filters, setFilters] = useState<MatchFilterState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : defaultFilters;
    } catch {
      return defaultFilters;
    }
  });

  // Persistir mudanças no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (e) {
      console.error('Erro ao salvar filtros:', e);
    }
  }, [filters]);

  // Função de filtragem
  const filterMatches = useCallback((matches: Match[]) => {
    if (!matches) return [];

    return matches
      .filter((match) => {
        // Filtro de distância
        if (filters.distance !== 'all') {
          const maxKm = parseInt(filters.distance);
          if (match.distance_km > maxKm) return false;
        }

        // Filtro de tipo de perfil
        if (filters.profileType !== 'all') {
          const isCouple = match.other_user.profile_type === 'couple';
          if (filters.profileType === 'single' && isCouple) return false;
          if (filters.profileType === 'couple' && !isCouple) return false;
        }

        // Filtro de verificação
        if (filters.verification !== 'all') {
          if (filters.verification === 'verified' && !match.other_user.is_verified) {
            return false;
          }
          if (filters.verification === 'verified_couple' && !match.other_user.is_verified_couple) {
            return false;
          }
          if (filters.verification === 'vip' && match.other_user.plan_type !== 'vip') {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Ordenação
        switch (filters.sortBy) {
          case 'closest':
            return a.distance_km - b.distance_km;
          
          case 'super_first':
            // Super matches primeiro, depois por data
            if (a.is_super_match && !b.is_super_match) return -1;
            if (!a.is_super_match && b.is_super_match) return 1;
            return new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime();
          
          case 'recent':
          default:
            return new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime();
        }
      });
  }, [filters]);

  // Resetar filtros
  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  // Verificar se há filtros ativos
  const hasActiveFilters = useMemo(() => {
    return (
      filters.distance !== 'all' ||
      filters.profileType !== 'all' ||
      filters.verification !== 'all'
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    filterMatches,
    resetFilters,
    hasActiveFilters,
  };
}
