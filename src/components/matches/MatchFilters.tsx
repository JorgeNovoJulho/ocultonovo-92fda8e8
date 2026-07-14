import { Filter, ArrowUpDown, MapPin, Users, CheckCircle2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface MatchFilterState {
  distance: 'all' | '1' | '5' | '10';
  profileType: 'all' | 'single' | 'couple';
  verification: 'all' | 'verified' | 'verified_couple' | 'vip';
  sortBy: 'recent' | 'closest' | 'super_first';
}

interface MatchFiltersProps {
  filters: MatchFilterState;
  onFiltersChange: (filters: MatchFilterState) => void;
  totalCount?: number;
  filteredCount?: number;
}

export function MatchFilters({ 
  filters, 
  onFiltersChange,
  totalCount = 0,
  filteredCount = 0,
}: MatchFiltersProps) {
  const hasActiveFilters = 
    filters.distance !== 'all' || 
    filters.profileType !== 'all' || 
    filters.verification !== 'all';

  const handleReset = () => {
    onFiltersChange({
      distance: 'all',
      profileType: 'all',
      verification: 'all',
      sortBy: 'recent',
    });
  };

  return (
    <div className="space-y-3 p-4 bg-card/30 rounded-xl border border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="bg-primary/20 text-primary text-xs">
              {filteredCount} de {totalCount}
            </Badge>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground h-7"
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Filters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Distance Filter */}
        <Select
          value={filters.distance}
          onValueChange={(value) => 
            onFiltersChange({ ...filters, distance: value as MatchFilterState['distance'] })
          }
        >
          <SelectTrigger className="h-9 text-sm bg-background/50">
            <MapPin className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Distância" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas distâncias</SelectItem>
            <SelectItem value="1">Até 1km</SelectItem>
            <SelectItem value="5">Até 5km</SelectItem>
            <SelectItem value="10">Até 10km</SelectItem>
          </SelectContent>
        </Select>

        {/* Profile Type Filter */}
        <Select
          value={filters.profileType}
          onValueChange={(value) => 
            onFiltersChange({ ...filters, profileType: value as MatchFilterState['profileType'] })
          }
        >
          <SelectTrigger className="h-9 text-sm bg-background/50">
            <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="single">Single</SelectItem>
            <SelectItem value="couple">Casal</SelectItem>
          </SelectContent>
        </Select>

        {/* Verification Filter */}
        <Select
          value={filters.verification}
          onValueChange={(value) => 
            onFiltersChange({ ...filters, verification: value as MatchFilterState['verification'] })
          }
        >
          <SelectTrigger className="h-9 text-sm bg-background/50">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Verificação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="verified">Verificados</SelectItem>
            <SelectItem value="verified_couple">Casais Verificados</SelectItem>
            <SelectItem value="vip">
              <div className="flex items-center gap-1">
                <Crown className="h-3 w-3 text-yellow-500" />
                VIP
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Sort By */}
        <Select
          value={filters.sortBy}
          onValueChange={(value) => 
            onFiltersChange({ ...filters, sortBy: value as MatchFilterState['sortBy'] })
          }
        >
          <SelectTrigger className="h-9 text-sm bg-background/50">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="closest">Mais próximos</SelectItem>
            <SelectItem value="super_first">
              <div className="flex items-center gap-1">
                <Crown className="h-3 w-3 text-yellow-500" />
                Super Matches
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2">
          {filters.distance !== 'all' && (
            <Badge 
              variant="outline" 
              className="text-xs cursor-pointer hover:bg-destructive/10"
              onClick={() => onFiltersChange({ ...filters, distance: 'all' })}
            >
              Até {filters.distance}km ×
            </Badge>
          )}
          {filters.profileType !== 'all' && (
            <Badge 
              variant="outline" 
              className="text-xs cursor-pointer hover:bg-destructive/10"
              onClick={() => onFiltersChange({ ...filters, profileType: 'all' })}
            >
              {filters.profileType === 'single' ? 'Single' : 'Casal'} ×
            </Badge>
          )}
          {filters.verification !== 'all' && (
            <Badge 
              variant="outline" 
              className="text-xs cursor-pointer hover:bg-destructive/10"
              onClick={() => onFiltersChange({ ...filters, verification: 'all' })}
            >
              {filters.verification === 'verified' ? 'Verificados' : 
               filters.verification === 'verified_couple' ? 'Casais Verificados' : 'VIP'} ×
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
