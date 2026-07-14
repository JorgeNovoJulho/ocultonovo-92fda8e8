import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export interface PostFilterState {
  privacyFilter: 'all' | 'public' | 'friends' | 'vip';
  statusFilter: 'all' | 'active' | 'hidden';
  sortBy: 'recent' | 'popular' | 'comments';
}

interface AdminPostFiltersProps {
  filters: PostFilterState;
  onFiltersChange: (filters: PostFilterState) => void;
}

export function AdminPostFilters({ filters, onFiltersChange }: AdminPostFiltersProps) {
  const hasActiveFilters = 
    filters.privacyFilter !== 'all' || 
    filters.statusFilter !== 'all' ||
    filters.sortBy !== 'recent';

  const activeFilterCount = [
    filters.privacyFilter !== 'all',
    filters.statusFilter !== 'all',
    filters.sortBy !== 'recent'
  ].filter(Boolean).length;

  const resetFilters = () => {
    onFiltersChange({
      privacyFilter: 'all',
      statusFilter: 'all',
      sortBy: 'recent'
    });
  };

  const getPrivacyLabel = (value: string) => {
    const labels: Record<string, string> = {
      'all': 'Todas',
      'public': 'Público',
      'friends': 'Amigos',
      'vip': 'VIP'
    };
    return labels[value] || value;
  };

  const getStatusLabel = (value: string) => {
    const labels: Record<string, string> = {
      'all': 'Todos',
      'active': 'Ativos',
      'hidden': 'Ocultos'
    };
    return labels[value] || value;
  };

  const getSortLabel = (value: string) => {
    const labels: Record<string, string> = {
      'recent': 'Mais recentes',
      'popular': 'Mais curtidos',
      'comments': 'Mais comentados'
    };
    return labels[value] || value;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {/* Privacy Filter */}
        <Select
          value={filters.privacyFilter}
          onValueChange={(value: 'all' | 'public' | 'friends' | 'vip') =>
            onFiltersChange({ ...filters, privacyFilter: value })
          }
        >
          <SelectTrigger className="w-[140px] bg-background border-border/50">
            <SelectValue placeholder="Privacidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="public">Público</SelectItem>
            <SelectItem value="friends">Amigos</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={filters.statusFilter}
          onValueChange={(value: 'all' | 'active' | 'hidden') =>
            onFiltersChange({ ...filters, statusFilter: value })
          }
        >
          <SelectTrigger className="w-[130px] bg-background border-border/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="hidden">Ocultos</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort By */}
        <Select
          value={filters.sortBy}
          onValueChange={(value: 'recent' | 'popular' | 'comments') =>
            onFiltersChange({ ...filters, sortBy: value })
          }
        >
          <SelectTrigger className="w-[160px] bg-background border-border/50">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="popular">Mais curtidos</SelectItem>
            <SelectItem value="comments">Mais comentados</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            Limpar filtros
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.privacyFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Privacidade: {getPrivacyLabel(filters.privacyFilter)}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, privacyFilter: 'all' })}
              />
            </Badge>
          )}
          {filters.statusFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Status: {getStatusLabel(filters.statusFilter)}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, statusFilter: 'all' })}
              />
            </Badge>
          )}
          {filters.sortBy !== 'recent' && (
            <Badge variant="secondary" className="gap-1">
              Ordenação: {getSortLabel(filters.sortBy)}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, sortBy: 'recent' })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
