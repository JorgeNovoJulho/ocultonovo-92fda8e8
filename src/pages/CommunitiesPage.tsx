/**
 * Comunidades Ocultas — página principal.
 * Mobile-first, otimizado para Realme C55 (flat, sem shadows pesados).
 * Cards grandes, abas (Descobrir / Em Alta / Minhas / Novas / Oficiais),
 * busca com debounce, filtros por categoria, visibilidade e +18,
 * grid 1/2/3/4 cols, infinite scroll, avatares de membros recentes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Plus, Search, Lock, Crown, Star, Globe, Sparkles, Flame, Calendar, Shield, Loader2, Flame as FlameIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCommunitiesInfinite,
  useCommunityCategories,
  useCanCreateCommunity,
  useCommunitySettings,
  useMyCommunities,
  useCommunityMemberPreviews,
  type Community,
} from '@/hooks/useCommunities';
import { CreateCommunityModal } from '@/components/communities/CreateCommunityModal';
import { CommunityCreateGateModal } from '@/components/communities/CommunityCreateGateModal';
import { CommunityTrendingWidget } from '@/components/communities/CommunityTrendingWidget';
import { CommunityNotificationsBell } from '@/components/communities/CommunityNotificationsBell';
import { CommunityCard } from '@/components/communities/CommunityCard';

type TabKey = 'discover' | 'hot' | 'mine' | 'new' | 'official';
type VisibilityFilter = 'all' | 'public' | 'private' | 'premium_only' | 'vip_only' | 'official';
type SortKey = 'hot' | 'members' | 'recent' | 'activity';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'discover', label: 'Descobrir',  icon: Globe },
  { key: 'hot',      label: 'Em Alta',    icon: Flame },
  { key: 'mine',     label: 'Minhas',     icon: Users },
  { key: 'new',      label: 'Novas',      icon: Calendar },
  { key: 'official', label: 'Oficiais',   icon: Shield },
];

const VIS_FILTERS: { key: VisibilityFilter; label: string; icon: any }[] = [
  { key: 'all',          label: 'Todas',    icon: Globe },
  { key: 'public',       label: 'Pública',  icon: Globe },
  { key: 'private',      label: 'Privada',  icon: Lock },
  { key: 'premium_only', label: 'Premium',  icon: Star },
  { key: 'vip_only',     label: 'VIP',      icon: Crown },
  { key: 'official',     label: 'Oficial',  icon: Sparkles },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'hot',      label: 'Em alta' },
  { key: 'activity', label: 'Última atividade' },
  { key: 'members',  label: 'Mais membros' },
  { key: 'recent',   label: 'Mais recentes' },
];

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function CommunitiesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('discover');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [visFilter, setVisFilter] = useState<VisibilityFilter>('all');
  const [adultOnly, setAdultOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('hot');
  const [showCreate, setShowCreate] = useState(false);
  const [showGate, setShowGate] = useState(false);

  const { data: settings } = useCommunitySettings();
  const { data: categories = [] } = useCommunityCategories();
  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCommunitiesInfinite({ search, categoryId, adultOnly });
  const { data: myCommunities = [], isLoading: loadingMine } = useMyCommunities();
  const { data: canCreate } = useCanCreateCommunity();

  // Suporta deep link ?create=1 vindo da sessão "Comunidades Ocultas" do feed.
  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    if (!canCreate) return; // aguarda hook resolver para decidir gate
    if (canCreate.allowed) setShowCreate(true);
    else setShowGate(true);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, searchParams]);


  // Flatten paginated results
  const flatCommunities = useMemo<Community[]>(
    () => (pages?.pages ?? []).flatMap((p) => p.items),
    [pages],
  );

  // Filtra/ordena conforme aba e filtros
  const list = useMemo<Community[]>(() => {
    const source = tab === 'mine' ? myCommunities : flatCommunities;
    let arr = [...source];

    if (tab === 'mine' && adultOnly) arr = arr.filter((c) => c.is_adult);

    if (visFilter !== 'all') {
      if (visFilter === 'official') arr = arr.filter((c) => c.is_official);
      else arr = arr.filter((c) => c.visibility === visFilter);
    }

    if (tab === 'hot') {
      arr.sort((a, b) => {
        const aHot = (a.members_count || 0) + (a.replies_count || 0) * 2;
        const bHot = (b.members_count || 0) + (b.replies_count || 0) * 2;
        return bHot - aHot;
      });
    } else if (tab === 'new') {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (tab === 'official') {
      arr = arr.filter((c) => c.is_official);
    } else {
      if (sort === 'members') {
        arr.sort((a, b) => (b.members_count || 0) - (a.members_count || 0));
      } else if (sort === 'recent') {
        arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (sort === 'activity') {
        arr.sort((a, b) => {
          const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return tb - ta;
        });
      } else {
        arr.sort((a, b) => {
          if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
          const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return tb - ta;
        });
      }
    }

    return arr;
  }, [tab, flatCommunities, myCommunities, visFilter, sort, adultOnly]);

  // Batch de previews de membros para as comunidades visíveis
  const visibleIds = useMemo(() => list.map((c) => c.id), [list]);
  const { data: previews } = useCommunityMemberPreviews(visibleIds);

  // Infinite scroll sentinel (apenas em abas baseadas em pages — não em "mine")
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab === 'mine') return;
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (settings && !settings.enabled) {
    return (
      <div className="px-4 py-12 text-center text-muted-foreground">
        Comunidades Ocultas estão temporariamente desativadas.
      </div>
    );
  }

  const loading = tab === 'mine' ? loadingMine : isLoading;

  return (
    <div className="px-3 sm:px-4 py-3 max-w-6xl mx-auto pb-24">
      {/* Cabeçalho */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            <span className="inline-flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-purple-600/20 border border-fuchsia-500/30">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-fuchsia-300" />
            </span>
            Comunidades Ocultas
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xl">
            Entre em comunidades por interesse, crie tópicos, compartilhe ideias e converse sobre o que desperta sua curiosidade.
          </p>
        </div>
        <CommunityNotificationsBell />
      </div>

      <CommunityTrendingWidget />

      {/* Busca + criar */}
      <div className="flex gap-2 mb-3 mt-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar comunidades…"
            className="pl-8 h-10"
          />
        </div>
        <Button
          size="sm"
          className="h-10 px-3 gap-1"
          onClick={() => {
            if (canCreate?.allowed) setShowCreate(true);
            else setShowGate(true);
          }}
          title={canCreate?.allowed ? 'Criar comunidade' : 'Saiba como criar'}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Criar</span>
        </Button>
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-3 px-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-fuchsia-600 border-fuchsia-600 text-white'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="mt-2 mb-3 space-y-2">
        {/* Visibilidade + +18 */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
          {VIS_FILTERS.map((f) => {
            const Icon = f.icon;
            const active = visFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setVisFilter(f.key)}
                className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border ${
                  active ? 'bg-foreground/10 border-foreground/30 text-foreground' : 'border-border text-muted-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {f.label}
              </button>
            );
          })}
          <button
            onClick={() => setAdultOnly((v) => !v)}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border ${
              adultOnly
                ? 'bg-red-600/30 border-red-500/60 text-red-100'
                : 'border-border text-muted-foreground'
            }`}
            title="Mostrar apenas comunidades +18"
          >
            <FlameIcon className="h-3 w-3" />
            +18
          </button>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
            <button
              onClick={() => setCategoryId(null)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${
                !categoryId ? 'bg-foreground/10 border-foreground/30 text-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              Todas as categorias
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${
                  categoryId === c.id ? 'bg-foreground/10 border-foreground/30 text-foreground' : 'border-border text-muted-foreground'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {tab === 'discover' && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
            <span className="shrink-0 self-center text-[10px] uppercase tracking-wide text-muted-foreground pr-1">Ordenar:</span>
            {SORTS.map((s) => {
              const active = sort === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${
                    active ? 'bg-fuchsia-600/20 border-fuchsia-500/40 text-fuchsia-100' : 'border-border text-muted-foreground'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando comunidades…
        </div>
      ) : list.length === 0 ? (
        <EmptyState tab={tab} search={search} onCreate={() => setShowCreate(true)} canCreate={!!canCreate?.allowed} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {list.map((c) => (
              <CommunityCard
                key={c.id}
                community={c}
                onOpen={() => navigate(`/comunidades/${c.slug}`)}
                memberPreviews={previews?.[c.id]}
              />
            ))}
          </div>

          {tab !== 'mine' && (
            <div ref={sentinelRef} className="py-6 flex justify-center">
              {isFetchingNextPage ? (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando mais…
                </span>
              ) : !hasNextPage && list.length > 12 ? (
                <span className="text-[11px] text-muted-foreground">Você chegou ao fim.</span>
              ) : null}
            </div>
          )}
        </>
      )}

      {canCreate && !canCreate.allowed && (
        <div className="mt-6 rounded-xl border border-amber-700/30 bg-amber-900/10 p-3 text-xs text-amber-200">
          {canCreate.reason === 'limit_reached'
            ? `Você já atingiu o limite de comunidades criadas (${canCreate.current}/${canCreate.limit}).`
            : canCreate.reason === 'plan_not_allowed'
            ? 'A criação de comunidades está disponível para usuários Premium e VIP.'
            : 'Criação indisponível no momento.'}
        </div>
      )}

      <CreateCommunityModal open={showCreate} onOpenChange={setShowCreate} />
      <CommunityCreateGateModal
        open={showGate}
        onOpenChange={setShowGate}
        reason={canCreate?.reason}
        current={canCreate?.current}
        limit={canCreate?.limit}
      />
    </div>
  );
}

function EmptyState({
  tab,
  search,
  onCreate,
  canCreate,
}: {
  tab: TabKey;
  search: string;
  onCreate: () => void;
  canCreate: boolean;
}) {
  let title = 'Ainda não há comunidades por aqui.';
  let desc = 'Crie a primeira e comece uma conversa.';

  if (search.trim()) {
    title = 'Nenhuma comunidade encontrada';
    desc = `Não encontramos nada para "${search}". Tente outro termo.`;
  } else if (tab === 'mine') {
    title = 'Você ainda não participa de nenhuma comunidade';
    desc = 'Explore a aba Descobrir e entre nas que combinam com você.';
  } else if (tab === 'official') {
    title = 'Nenhuma comunidade oficial disponível';
    desc = 'Volte em breve — estamos preparando novidades.';
  } else if (tab === 'hot') {
    title = 'Nenhuma comunidade em alta no momento';
    desc = 'Que tal começar uma conversa para movimentar?';
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <Users className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{desc}</p>
      {canCreate && tab !== 'mine' && !search && (
        <Button size="sm" className="mt-4 gap-1" onClick={onCreate}>
          <Plus className="h-4 w-4" /> Criar comunidade
        </Button>
      )}
    </div>
  );
}
