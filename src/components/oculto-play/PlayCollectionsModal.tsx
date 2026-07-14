/**
 * PlayCollectionsModal — Etapa 17.
 * Gestor de coleções pessoais do OCULTO PLAY: criar, listar, abrir, excluir.
 * UI flat (sem shadow pesado) seguindo Mobile Perf Golden Rules.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Library, Plus, Trash2, ChevronRight, Loader2, ArrowLeft, X, Lock, Globe,
  Play, Pause, Square, ListMusic, LayoutGrid, List, Send, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

import { toast } from 'sonner';
import {
  useMyOcultoPlayCollections,
  useOcultoPlayCollectionActions,
  useOcultoPlayCollectionItems,
  type OcultoPlayCollection,
} from '@/hooks/useOcultoPlayCollections';
import {
  playSharedAudio, pauseSharedAudio, pauseAllSharedAudio,
  subscribeAudio, getOrCreateAudio, ocultoPlayMetaFromItem,
} from '@/lib/ocultoPlayAudioSession';
import { cn } from '@/lib/utils';


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PlayCollectionsModal({ open, onOpenChange }: Props) {
  const list = useMyOcultoPlayCollections();
  const { create, remove, removeItem } = useOcultoPlayCollectionActions();
  const [mode, setMode] = useState<'list' | 'create' | 'view'>('list');
  const [selected, setSelected] = useState<OcultoPlayCollection | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const itemsQ = useOcultoPlayCollectionItems(mode === 'view' ? selected?.id ?? null : null);

  const reset = () => {
    setMode('list');
    setSelected(null);
    setName('');
    setDesc('');
    setIsPublic(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), description: desc.trim() || undefined, isPublic });
      toast.success('Coleção criada');
      reset();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao criar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta coleção?')) return;
    try {
      await remove.mutateAsync(id);
      toast.success('Coleção removida');
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao remover');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="w-[96vw] sm:max-w-lg max-h-[92dvh] p-0 gap-0 overflow-hidden flex flex-col"
      >
        <div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6 min-w-0">
            {mode === 'view' && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setMode('list');
                  setSelected(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Library className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">
            {mode === 'create'
              ? 'Nova coleção'
              : mode === 'view'
              ? selected?.name ?? 'Coleção'
              : 'Minhas coleções'}
            </span>
          </DialogTitle>
        </DialogHeader>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-5">

        {/* LIST */}
        {mode === 'list' && (
          <>
            <div className="-mx-1 px-1">
              {list.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (list.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Você ainda não tem coleções. Crie a primeira!
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {list.data!.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 p-2.5 rounded-md border border-border/40 hover:bg-muted/30 transition-colors"
                    >
                      <button
                        onClick={() => {
                          setSelected(c);
                          setMode('view');
                        }}
                        className="flex-1 text-left flex items-center gap-2 min-w-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{c.name}</span>
                            {c.is_public ? (
                              <Globe className="h-3 w-3 text-emerald-400 shrink-0" />
                            ) : (
                              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {c.item_count} {c.item_count === 1 ? 'item' : 'itens'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pt-3">
              <Button onClick={() => setMode('create')} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Nova coleção
              </Button>
            </div>

          </>
        )}

        {/* CREATE */}
        {mode === 'create' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Favoritos da semana"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Sobre o que é esta coleção…"
                maxLength={200}
                className="resize-none h-20"
              />
            </div>
            <button
              onClick={() => setIsPublic((v) => !v)}
              className={cn(
                'w-full flex items-center justify-between gap-2 p-2.5 rounded-md border text-sm transition-colors',
                isPublic
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-border/40 bg-muted/20 text-muted-foreground',
              )}
            >
              <span className="flex items-center gap-2">
                {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {isPublic ? 'Pública' : 'Privada'}
              </span>
              <span className="text-[11px] opacity-70">
                {isPublic ? 'Visível a outros usuários' : 'Apenas você'}
              </span>
            </button>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMode('list')}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || create.isPending}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* VIEW */}
        {mode === 'view' && selected && (
          <CollectionViewer
            collection={selected}
            items={itemsQ.data ?? []}
            loading={itemsQ.isLoading}
            onRemoveItem={async (itemId) => {
              try {
                await removeItem.mutateAsync({ collectionId: selected.id, itemId });
                itemsQ.refetch();
              } catch (e: any) {
                toast.error(e.message ?? 'Falha');
              }
            }}
          />
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* CollectionViewer — playback, seleção múltipla e fila sequencial     */
/* ------------------------------------------------------------------ */
function CollectionViewer({
  collection,
  items,
  loading,
  onRemoveItem,
}: {
  collection: OcultoPlayCollection;
  items: any[];
  loading: boolean;
  onRemoveItem: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [forwardItem, setForwardItem] = useState<any | null>(null);

  const playable = items.filter((it) => !!it.audio_url);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const queueRef = useRef<string[]>([]);

  // Sub para refletir play/pause/end do item atual
  useEffect(() => {
    if (!currentId) return;
    const unsub = subscribeAudio(currentId, (s) => {
      setIsPlaying(s.playing);
    });
    const audio = getOrCreateAudio(currentId, undefined);
    if (!audio) return () => unsub();
    const onEnded = () => {
      // toca o próximo da fila se houver
      const idx = queueRef.current.indexOf(currentId);
      const next = idx >= 0 ? queueRef.current[idx + 1] : null;
      if (next) {
        const item = playable.find((p) => p.id === next);
        if (item?.audio_url) {
          setCurrentId(next);
          playSharedAudio(next, item.audio_url, ocultoPlayMetaFromItem(item)).catch(() => {});
          return;
        }
      }
      setIsPlaying(false);
    };
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
      unsub();
    };
  }, [currentId, playable]);

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allChecked = playable.length > 0 && selected.size === playable.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(playable.map((p) => p.id)));

  const startQueue = (ids: string[]) => {
    if (!ids.length) {
      toast.message('Nenhum áudio na fila');
      return;
    }
    queueRef.current = ids;
    const first = ids[0];
    const item = playable.find((p) => p.id === first);
    if (!item?.audio_url) return;
    setCurrentId(first);
    playSharedAudio(first, item.audio_url, ocultoPlayMetaFromItem(item)).catch((e) =>
      toast.error(e?.message ?? 'Falha ao reproduzir'),
    );
  };

  const playOne = (it: any) => {
    if (!it.audio_url) {
      toast.message('Este item não é um áudio');
      return;
    }
    if (currentId === it.id && isPlaying) {
      pauseSharedAudio(it.id);
      return;
    }
    queueRef.current = [it.id];
    setCurrentId(it.id);
    playSharedAudio(it.id, it.audio_url, ocultoPlayMetaFromItem(it)).catch((e) =>
      toast.error(e?.message ?? 'Falha ao reproduzir'),
    );
  };

  const stopAll = () => {
    pauseAllSharedAudio();
    queueRef.current = [];
    setCurrentId(null);
    setIsPlaying(false);
  };

  return (
    <>
      {/* Toolbar de seleção/playback + alternador de modo */}
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <span className="text-[11px] text-muted-foreground mr-1">Modo:</span>
        <Button
          size="sm"
          variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
          className="h-7 px-2 gap-1"
          onClick={() => setViewMode('cards')}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Cards
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'list' ? 'secondary' : 'ghost'}
          className="h-7 px-2 gap-1"
          onClick={() => setViewMode('list')}
        >
          <List className="h-3.5 w-3.5" /> Lista
        </Button>
      </div>

      {playable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-2 border-b border-border/40">

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={allChecked}
              onCheckedChange={toggleAll}
              aria-label="Selecionar todos"
            />
            Selecionar todos ({selected.size}/{playable.length})
          </label>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5"
              onClick={() => startQueue(playable.map((p) => p.id))}
              disabled={!playable.length}
            >
              <ListMusic className="h-3.5 w-3.5" /> Tocar tudo
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5"
              onClick={() =>
                startQueue(playable.filter((p) => selected.has(p.id)).map((p) => p.id))
              }
              disabled={selected.size === 0}
            >
              <Play className="h-3.5 w-3.5" /> Selecionados
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={stopAll}
              disabled={!currentId}
            >
              <Square className="h-3.5 w-3.5" /> Parar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Coleção vazia. Use o botão "+ Coleção" nos itens do PLAY para adicionar.
          </p>
        ) : viewMode === 'cards' ? (
          <ul className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((it) => {
              const isCurrent = currentId === it.id;
              const playingThis = isCurrent && isPlaying;
              const hasAudio = !!it.audio_url;
              const isSel = selected.has(it.id);
              return (
                <li
                  key={it.id}
                  className={cn(
                    'relative aspect-[3/4] rounded-md overflow-hidden bg-muted border transition-colors',
                    isCurrent ? 'border-primary' : 'border-border/40',
                  )}
                >
                  {it.thumb_url || it.media_url ? (
                    <img
                      src={it.thumb_url ?? it.media_url ?? ''}
                      alt={it.title ?? ''}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                      Sem mídia
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => playOne(it)}
                    disabled={!hasAudio}
                    className={cn(
                      'absolute inset-0 flex items-center justify-center transition-opacity',
                      playingThis ? 'bg-black/40' : 'bg-black/0 hover:bg-black/30',
                      !hasAudio && 'cursor-not-allowed',
                    )}
                    aria-label={playingThis ? 'Pausar' : 'Tocar'}
                  >
                    {hasAudio && (
                      <span className="h-9 w-9 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow">
                        {playingThis ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4 translate-x-[1px]" />
                        )}
                      </span>
                    )}
                  </button>

                  {hasAudio && (
                    <label
                      className="absolute top-1 left-1 bg-black/60 rounded p-1 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleSel(it.id)}
                        aria-label="Selecionar"
                      />
                    </label>
                  )}

                  <div className="absolute top-1 right-1 flex items-center gap-1">
                    {hasAudio && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setForwardItem(it); }}
                        className="h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                        title="Encaminhar"
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveItem(it.id); }}
                      className="h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                      title="Remover desta coleção"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {it.title && (
                    <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] text-white truncate">{it.title}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y divide-border/40 rounded-md border border-border/40 overflow-hidden">
            {items.map((it) => {
              const isCurrent = currentId === it.id;
              const playingThis = isCurrent && isPlaying;
              const hasAudio = !!it.audio_url;
              const isSel = selected.has(it.id);
              return (
                <li
                  key={it.id}
                  className={cn(
                    'flex items-center gap-2 p-2 transition-colors',
                    isCurrent ? 'bg-primary/10' : 'hover:bg-muted/40',
                  )}
                >
                  {hasAudio ? (
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleSel(it.id)}
                      aria-label="Selecionar"
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  <p className="flex-1 text-sm truncate">{it.title ?? 'Sem título'}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasAudio && (
                      <Button
                        size="icon"
                        variant={playingThis ? 'default' : 'ghost'}
                        className="h-8 w-8"
                        onClick={() => playOne(it)}
                        title={playingThis ? 'Pausar' : 'Tocar'}
                      >
                        {playingThis ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    )}
                    {hasAudio && isCurrent && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={stopAll}
                        title="Parar"
                       aria-label="Ação">
                        <Square className="h-4 w-4" />
                      </Button>
                    )}
                    {hasAudio && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setForwardItem(it)}
                        title="Encaminhar"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => onRemoveItem(it.id)}
                      title="Remover desta coleção"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ForwardItemModal
        item={forwardItem}
        onClose={() => setForwardItem(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* ForwardItemModal — escolhe usuário e encaminha para a "Recebidas"   */
/* ------------------------------------------------------------------ */
type UserHit = { user_id: string; username: string | null; name: string | null; avatar_url: string | null };

function ForwardItemModal({ item, onClose }: { item: any | null; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!item) { setQuery(''); setHits([]); return; }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await (supabase as any).rpc('social_beta_search_users', { _q: q });
        setHits((data || []) as UserHit[]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, item]);

  const send = async (u: UserHit) => {
    if (!item) return;
    setSending(u.user_id);
    try {
      const { error } = await (supabase as any).rpc('oculto_play_forward_to_user', {
        p_target_user: u.user_id,
        p_item_id: item.id,
      });
      if (error) throw error;
      toast.success(`Encaminhado para ${u.name ?? u.username ?? 'usuário'}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao encaminhar');
    } finally {
      setSending(null);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[96vw] sm:max-w-md max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" /> Encaminhar áudio
            </DialogTitle>
          </DialogHeader>
          {item?.title && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{item.title}</p>
          )}
        </div>
        <div className="px-4 pb-4 flex-1 min-h-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por usuário ou nome…"
              className="pl-8"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {searching ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : query.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Digite ao menos 2 caracteres para buscar.
              </p>
            ) : hits.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhum usuário encontrado.
              </p>
            ) : (
              <ul className="space-y-1">
                {hits.map((u) => (
                  <li key={u.user_id}>
                    <button
                      onClick={() => send(u)}
                      disabled={sending === u.user_id}
                      className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 text-left disabled:opacity-60"
                    >
                      {u.avatar_url ? (
                        <img src={buildSupabaseImageThumb(u.avatar_url, { width: 64, quality: 70 }) ?? u.avatar_url} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{u.name ?? u.username ?? 'Usuário'}</p>
                        {u.username && (
                          <p className="text-[11px] text-muted-foreground truncate">@{u.username}</p>
                        )}
                      </div>
                      {sending === u.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


