/**
 * CaixaOcultaParticipantsModal — lista paginada de participantes.
 * Só carrega quando aberto. Mostra avatar+username via batch profiles lookup.
 */
import { useEffect, useState } from 'react';
import { Users, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabaseExternal';
import { useCoxParticipants, type CoxCampaign } from '@/hooks/useCaixaOculta';

interface Props {
  campaign: CoxCampaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ProfileLite { user_id: string; username: string | null; avatar_url: string | null; }

const PAGE_SIZE = 30;

export function CaixaOcultaParticipantsModal({ campaign, open, onOpenChange }: Props) {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useCoxParticipants(open ? campaign.id : null, page, PAGE_SIZE);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});

  useEffect(() => {
    if (!data?.length) return;
    const ids = data.map((d) => d.user_id).filter((id) => !profiles[id]);
    if (!ids.length) return;
    (async () => {
      const { data: rows } = await (supabase as any)
        .from('profiles')
        .select('user_id, id, username, avatar_url')
        .or(ids.map((id) => `user_id.eq.${id},id.eq.${id}`).join(','));
      if (rows) {
        const next = { ...profiles };
        for (const r of rows) {
          const key = r.user_id ?? r.id;
          next[key] = { user_id: key, username: r.username, avatar_url: r.avatar_url };
        }
        setProfiles(next);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const hasMore = (data?.length ?? 0) === PAGE_SIZE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Participantes
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{campaign.title}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !data?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ninguém participou ainda.</p>
          ) : (
            <ul className="divide-y">
              {data.map((p) => {
                const prof = profiles[p.user_id];
                const initial = (prof?.username ?? '?').slice(0, 1).toUpperCase();
                return (
                  <li key={`${p.user_id}-${p.entry_number}`} className="flex items-center gap-3 py-2">
                    <span className="w-8 shrink-0 text-xs font-mono text-muted-foreground text-right">
                      #{p.entry_number}
                    </span>
                    <Avatar className="h-8 w-8">
                      {prof?.avatar_url && <AvatarImage src={prof.avatar_url} alt={prof.username ?? ''} />}
                      <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {prof?.username ? `@${prof.username}` : `Usuário ${p.user_id.slice(0, 6)}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {page + 1}</span>
          <Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CaixaOcultaParticipantsModal;
