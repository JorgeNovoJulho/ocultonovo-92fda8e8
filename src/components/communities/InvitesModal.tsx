/**
 * Modal de convites por link — owner/mod gera, copia e revoga convites.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Link2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCommunityInvites, useCreateInvite, useRevokeInvite } from '@/hooks/useCommunities';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
}

export function InvitesModal({ open, onOpenChange, communityId }: Props) {
  const { data: invites = [], isLoading } = useCommunityInvites(communityId, open);
  const create = useCreateInvite(communityId);
  const revoke = useRevokeInvite(communityId);
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresDays, setExpiresDays] = useState<string>('');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  function handleCreate() {
    const max = maxUses.trim() ? parseInt(maxUses, 10) : null;
    const days = expiresDays.trim() ? parseInt(expiresDays, 10) : null;
    const expires_at = days && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
    create.mutate({ expires_at, max_uses: max && max > 0 ? max : null });
  }

  function copyLink(code: string) {
    const url = `${baseUrl}/comunidades/invite/${code}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copiado!'),
      () => toast.error('Não foi possível copiar.'),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Convites por link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="block text-muted-foreground mb-1">Expira em (dias)</span>
                <input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="block text-muted-foreground mb-1">Máx. usos</span>
                <input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                />
              </label>
            </div>
            <Button size="sm" className="w-full gap-1.5" onClick={handleCreate} disabled={create.isPending}>
              <Plus className="h-3.5 w-3.5" /> Gerar convite
            </Button>
          </div>

          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
            {isLoading && <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>}
            {!isLoading && invites.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum convite ativo.</p>
            )}
            {invites.map((inv) => {
              const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
              const exhausted = inv.max_uses != null && inv.uses_count >= inv.max_uses;
              const inactive = !inv.is_active || expired || exhausted;
              return (
                <div
                  key={inv.id}
                  className={`flex items-center gap-2 rounded-lg border border-border p-2 ${inactive ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate">{inv.code}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                        {inv.uses_count}{inv.max_uses ? `/${inv.max_uses}` : ''} usos
                      </Badge>
                      {inv.expires_at && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                          até {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
                        </Badge>
                      )}
                      {inactive && <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">inativo</Badge>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(inv.code)} disabled={inactive}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {inv.is_active && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-rose-400"
                      onClick={() => revoke.mutate(inv.id)}
                      disabled={revoke.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
