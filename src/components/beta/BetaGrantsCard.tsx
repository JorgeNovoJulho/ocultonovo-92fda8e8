/**
 * BetaGrantsCard — admin master.
 * Mostra resumo de acessos beta ativos e permite encerrá-los em massa.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ShieldAlert } from 'lucide-react';
import { useBetaGrantsSummary, useRevokeBetaGrants } from '@/hooks/useBetaGrants';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function BetaGrantsCard() {
  const { data, isLoading } = useBetaGrantsSummary();
  const revoke = useRevokeBetaGrants();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[hsl(45,93%,47%)]" />
          Acessos Beta de Monetização
        </CardTitle>
        <CardDescription>
          Liberações simuladas (sem cobrança) feitas durante o Beta — PPV e assinaturas de canais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Ativos" value={data?.total_active ?? 0} />
            <Metric label="PPV (avulso)" value={data?.active_paid_content ?? 0} />
            <Metric label="Assinaturas" value={data?.active_subscriptions ?? 0} />
            <Metric label="Usuários únicos" value={data?.unique_users_active ?? 0} />
          </div>
        )}

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <ShieldAlert className="h-3.5 w-3.5 inline mr-1 text-destructive" />
            Ao ativar monetização real, todos os grants beta são revogados automaticamente pelo backend.
            Use este botão para forçar a revogação antes do lançamento.
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={revoke.isPending || (data?.total_active ?? 0) === 0}
            onClick={() => setConfirmOpen(true)}
          >
            {revoke.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Encerrar acessos beta de monetização
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar todos os acessos beta?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto marca como revogados todos os {data?.total_active ?? 0} acesso(s) beta ativos
              (PPV + assinaturas de canais). Não afeta assinaturas/compras reais. Os usuários
              precisarão pagar de verdade para acessar novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await revoke.mutateAsync(); setConfirmOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Encerrar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
