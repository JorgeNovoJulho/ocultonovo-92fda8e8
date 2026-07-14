import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FileText, GraduationCap, Image as ImageIcon, Link2, Loader2, Music, Search, Video, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TUTORIAL_CATEGORIES, getTutorialCategory } from '@/config/tutorialCategories';
import { useTutorials, type Tutorial } from '@/hooks/useTutorials';
import { TutorialCard } from '@/components/tutoriais/TutorialCard';
import { TutorialEditor } from '@/components/tutoriais/TutorialEditor';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';

type MediaTypeFilter = 'all' | Tutorial['media_type'];

const MEDIA_FILTERS: { value: MediaTypeFilter; label: string; icon: typeof FileText }[] = [
  { value: 'all',   label: 'Todos os tipos', icon: FileText },
  { value: 'text',  label: 'Texto',          icon: FileText },
  { value: 'image', label: 'Imagem',         icon: ImageIcon },
  { value: 'video', label: 'Vídeo',          icon: Video },
  { value: 'audio', label: 'Áudio',          icon: Music },
  { value: 'link',  label: 'Link',           icon: Link2 },
];

export default function TutoriaisPage() {
  const { data: isMaster, isLoading: loadingRole } = useIsMasterAdmin();
  const { data, isLoading } = useTutorials();
  const [tab, setTab] = useState('geral');
  const [search, setSearch] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaTypeFilter>('all');

  // Ordena por categoria → título → criação ↓ → atualização ↓ (mantém ordenação solicitada).
  const sorted = useMemo(() => {
    const list = (data ?? []).slice();
    list.sort((a, b) => {
      const c = a.category.localeCompare(b.category);
      if (c !== 0) return c;
      const t = a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
      if (t !== 0) return t;
      const d = +new Date(b.created_at) - +new Date(a.created_at);
      if (d !== 0) return d;
      return +new Date(b.updated_at) - +new Date(a.updated_at);
    });
    return list;
  }, [data]);

  // Aplica busca textual + filtro por tipo de mídia.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((t) => {
      if (mediaFilter !== 'all' && t.media_type !== mediaFilter) return false;
      if (!q) return true;
      const hay = `${t.title} ${t.description ?? ''} ${getTutorialCategory(t.category).label}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, search, mediaFilter]);

  const byCategory = useMemo(() => {
    const map: Record<string, Tutorial[]> = { geral: filtered };
    for (const c of TUTORIAL_CATEGORIES) {
      if (c.key === 'geral') continue;
      map[c.key] = filtered.filter((t) => t.category === c.key);
    }
    return map;
  }, [filtered]);

  // Gating após hooks para não violar a ordem dos hooks do React.
  if (loadingRole) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
      </div>
    );
  }
  if (!isMaster) return <Navigate to="/feed" replace />;

  const hasFilters = !!search.trim() || mediaFilter !== 'all';

  return (
    <div className="container max-w-4xl mx-auto px-3 sm:px-4 py-4 pb-24 md:pb-8 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-teal-400" />
          <h1 className="text-xl sm:text-2xl font-bold">Tutoriais</h1>
        </div>
        <TutorialEditor defaultCategory={tab === 'geral' ? 'feed' : tab} />
      </header>

      <p className="text-sm text-muted-foreground">
        Aprenda a usar cada recurso da plataforma. Selecione uma categoria ou veja todos em <strong>Geral</strong>.
        Em qualquer tutorial você pode tirar dúvidas direto com o administrador.
      </p>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, descrição ou categoria..."
            className="pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-full hover:bg-muted/60 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={mediaFilter} onValueChange={(v) => setMediaFilter(v as MediaTypeFilter)}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MEDIA_FILTERS.map((opt) => {
              const Icon = opt.icon;
              return (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {opt.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" onClick={() => { setSearch(''); setMediaFilter('all'); }} className="sm:w-auto">
            Limpar filtros
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto -mx-3 px-3 pb-1" style={{ scrollbarWidth: 'thin' } as React.CSSProperties}>
          <TabsList className="inline-flex h-auto flex-nowrap gap-1 bg-transparent p-0">
            {TUTORIAL_CATEGORIES.map((c) => {
              const count = (byCategory[c.key] ?? []).length;
              return (
                <TabsTrigger
                  key={c.key}
                  value={c.key}
                  className={cn(
                    'rounded-full border border-border/50 px-3 py-1.5 text-xs whitespace-nowrap data-[state=active]:border-transparent',
                  )}
                >
                  <span className={cn('font-medium', c.text)}>{c.label}</span>
                  {hasFilters && <span className="ml-1.5 text-[10px] text-muted-foreground">({count})</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {TUTORIAL_CATEGORIES.map((c) => {
          const list = byCategory[c.key] ?? [];
          return (
            <TabsContent key={c.key} value={c.key} className="mt-4 space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando tutoriais...
                </div>
              ) : list.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-lg">
                  {hasFilters ? (
                    <>Nenhum tutorial encontrado com os filtros atuais.</>
                  ) : (
                    <>Nenhum tutorial publicado em <strong className={getTutorialCategory(c.key).text}>{c.label}</strong> ainda.</>
                  )}
                </div>
              ) : (
                list.map((t) => <TutorialCard key={t.id} tutorial={t} />)
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
