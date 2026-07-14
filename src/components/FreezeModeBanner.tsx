import { Snowflake, AlertTriangle } from "lucide-react";
import { useCurrentUserFreezeStatus } from "@/hooks/useDiscipline";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function FreezeModeBanner() {
  const { data: status } = useCurrentUserFreezeStatus();
  const [noticeOpen, setNoticeOpen] = useState(true);

  if (!status || status.account_status !== 'frozen' || !status.frozen_until) {
    return null;
  }

  const frozenUntilDate = new Date(status.frozen_until);
  const formattedDate = format(frozenUntilDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const timeRemaining = formatDistanceToNow(frozenUntilDate, { locale: ptBR });

  return (
    <>
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white py-3 px-4 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
        <Snowflake className="h-5 w-5 animate-pulse" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-center sm:text-left">
          <span className="font-semibold flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            Sua conta está congelada por violação das regras.
          </span>
          <span className="text-blue-100 text-sm">
            O acesso normal retorna em <strong className="text-white">{formattedDate}</strong> ({timeRemaining})
          </span>
        </div>
      </div>
    </div>
    <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Snowflake className="h-5 w-5" />
            Conta congelada por 7 dias
          </DialogTitle>
          <DialogDescription>
            Sua conta está congelada no sistema por ter sido denunciada por outros usuários. O processo está sob investigação da moderação; após o prazo, a conta poderá ser liberada ou suspensa conforme o resultado.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Acesso normal previsto para <strong className="text-foreground">{formattedDate}</strong> ({timeRemaining}).
        </div>
        <Button onClick={() => setNoticeOpen(false)} className="w-full">Entendi</Button>
      </DialogContent>
    </Dialog>
    </>
  );
}

// Hook para verificar se o usuário pode realizar ações
export function useCanPerformActions() {
  const { data: status, isLoading } = useCurrentUserFreezeStatus();
  
  const isFrozen = status?.account_status === 'frozen';
  const isBanned = status?.account_status === 'banned';
  
  return {
    canAct: !isFrozen && !isBanned,
    isFrozen,
    isBanned,
    isLoading,
    frozenUntil: status?.frozen_until,
    warningCount: status?.warning_count || 0,
  };
}
