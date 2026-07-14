/**
 * AdminOcultoPlayTodayPanel — Master cura "Hoje no Oculto".
 *
 * Mostra os itens já escolhidos do dia + busca rápida em oculto_play_items
 * publicados para selecionar novos. Tudo via RPC SECURITY DEFINER.
 */
import { useEffect, useState } from 'react';
import { Loader2, Star, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  useOcultoPlayToday,
  useOcultoPlayTodayCuration,
} from '@/hooks/useOcultoPlayGamification';

interface CandidateItem {
  id: string;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  kind: string;
  view_count: number;
  like_count: number;
}

export function AdminOcultoPlayTodayPanel() {
  const { data: picks, isLoading } = useOcultoPlayToday();
  const { pick, unpick } = useOcultoPlayTodayCuration();

  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSearch(true);
      let q = supabase
        .from('oculto_play_items')
        .select('id,title,caption,thumb_url,kind,view_count,like_count')
        .eq('is_published', true)
        .order('view_count', { ascending: false })
        .limit(30);
      if (search.trim().length > 1) {
        q = q.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (cancelled) return;
      setLoadingSearch(false);
      if (error) { toast.error('Erro ao buscar itens'); return; }
      setCandidates((data ?? []) as unknown as CandidateItem[]);
    })();
    return () => { cancelled = true; };
  }, [search]);

  const pickedIds = new Set((picks ?? []).map((p) => p.item_id));

  const onPick = async (id: string) => {
    try {
      await pick.mutateAsync({ itemId: id, position: (picks?.length ?? 0) + 1 });
      toast.success('Adicionado a Hoje no Oculto');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao destacar');
    }
  };
  const onUnpick = async (id: string) => {
    try {
      await unpick.mutateAsync(id);
      toast.success('Removido da curadoria');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao remover');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          Curadoria — Hoje no Oculto
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Os itens selecionados aparecem na aba <strong>Hoje</strong> do Play. A lista é diária.
        </p>
      </div>

      {/* Picks atuais */}
      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !picks || picks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum item destacado hoje.</p>
          ) : (
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {picks.map((p) => (
                <li key={p.item_id} className="relative rounded-lg overflow-hidden border bg-card">
                  {p.thumb_url ? (
                    <img src={p.thumb_url} alt="" className="w-full h-24 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-24 bg-muted" />
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium truncate">{p.title ?? p.caption ?? '(sem título)'}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {p.kind} · {p.view_count}👁 · {p.like_count}♥
                    </p>
                  </div>
                  <button
                    onClick={() => onUnpick(p.item_id)}
                    className="absolute top-1.5 right-1.5 h-6 w-6 grid place-items-center rounded-full bg-black/60 hover:bg-red-600 text-white"
                    title="Remover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Busca + candidatos */}
      <div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar itens publicados…"
            className="pl-8"
          />
        </div>
        <Card>
          <CardContent className="p-3">
            {loadingSearch ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum item encontrado.</p>
            ) : (
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {candidates.map((c) => {
                  const already = pickedIds.has(c.id);
                  return (
                    <li key={c.id} className="relative rounded-lg overflow-hidden border bg-card">
                      {c.thumb_url ? (
                        <img src={c.thumb_url} alt="" className="w-full h-24 object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-24 bg-muted" />
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{c.title ?? c.caption ?? '(sem título)'}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {c.kind} · {c.view_count}👁 · {c.like_count}♥
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant={already ? 'secondary' : 'default'}
                        disabled={already}
                        onClick={() => onPick(c.id)}
                        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full"
                        title={already ? 'Já destacado' : 'Destacar'}
                      >
                        {already ? <Star className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
