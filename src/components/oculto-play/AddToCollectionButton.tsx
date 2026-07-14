/**
 * AddToCollectionButton — Etapa 18.
 * Botão "+ Coleção" em cards do OCULTO PLAY. Abre um Popover leve com a lista
 * de coleções do usuário. Permite criar inline e adicionar/remover o item.
 */
import { useState } from 'react';
import { Plus, FolderPlus, Loader2, Check, Library } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  useMyOcultoPlayCollections,
  useOcultoPlayCollectionActions,
} from '@/hooks/useOcultoPlayCollections';
import { supabase } from '@/lib/supabaseExternal';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Props {
  itemId: string;
  size?: 'sm' | 'md';
}


export function AddToCollectionButton({ itemId, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const list = useMyOcultoPlayCollections();
  const { create, addItem, removeItem } = useOcultoPlayCollectionActions();

  // Quais coleções já contêm este item?
  const containing = useQuery({
    queryKey: ['oculto-play', 'item-in-collections', itemId],
    enabled: open,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_play_collection_items')
        .select('collection_id')
        .eq('item_id', itemId);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.collection_id as string));
    },
  });

  const toggle = async (collectionId: string, contains: boolean) => {
    try {
      if (contains) {
        await removeItem.mutateAsync({ collectionId, itemId });
      } else {
        await addItem.mutateAsync({ collectionId, itemId });
      }
      containing.refetch();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha');
    }
  };

  const handleCreateInline = async () => {
    if (!newName.trim()) return;
    try {
      const id = await create.mutateAsync({ name: newName.trim() });
      await addItem.mutateAsync({ collectionId: id, itemId });
      toast.success('Adicionado à nova coleção');
      setNewName('');
      setCreating(false);
      containing.refetch();
      list.refetch();
    } catch (e: any) {
      toast.error(e.message ?? 'Falha ao criar');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'grid place-items-center rounded-full text-white transition-colors',
            size === 'md'
              ? 'h-10 w-10 bg-emerald-500/20 hover:bg-emerald-500/40 border border-white/10 shadow-lg'
              : 'h-6 w-6 bg-black/55 hover:bg-fuchsia-500/70',
          )}
          title="Adicionar à coleção"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <FolderPlus className={size === 'md' ? 'h-5 w-5' : 'h-3 w-3'} />
        </button>

      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-64 p-2 !z-[2147482000]"
        style={{ zIndex: 2147482000 }}
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <Library className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">Adicionar a…</span>
        </div>

        {list.isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto -mx-1 px-1 space-y-1">
            {(list.data?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2 text-center">
                Sem coleções ainda.
              </p>
            ) : (
              list.data!.map((c) => {
                const has = containing.data?.has(c.id) ?? false;
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id, has)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                      has
                        ? 'bg-fuchsia-500/15 text-fuchsia-200'
                        : 'hover:bg-muted/40 text-foreground',
                    )}
                  >
                    <span className="truncate flex-1 text-left">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.item_count}
                    </span>
                    {has && <Check className="h-3 w-3 text-fuchsia-300" />}
                  </button>
                );
              })
            )}
          </div>
        )}

        <div className="border-t border-border/40 mt-2 pt-2">
          {creating ? (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateInline()}
                placeholder="Nome da coleção"
                className="h-7 text-xs"
                maxLength={60}
              />
              <Button
                size="sm"
                className="h-7 px-2"
                onClick={handleCreateInline}
                disabled={!newName.trim() || create.isPending}
              >
                {create.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'OK'
                )}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="w-full h-7 gap-1.5 text-xs"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3 w-3" /> Criar nova coleção
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
