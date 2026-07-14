import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  checkWebAppVersion,
  forceWebAppUpdate,
  getInstalledAppVersion,
  type WebAppUpdateInfo,
} from "@/utils/appUpdateRecovery";

/**
 * Card "Atualização do WebApp" — Configurações > Sistema.
 * Botão manual para forçar carregamento da versão mais recente.
 * Preserva login, sessão, preferências e dados críticos.
 */
export function AppUpdateCard() {
  const { toast } = useToast();
  const [info, setInfo] = useState<WebAppUpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);

  const installed = getInstalledAppVersion();

  const refresh = async (silent = false) => {
    setChecking(true);
    try {
      const result = await checkWebAppVersion();
      setInfo(result);
      if (!silent) {
        const serverReachable = Boolean(result.remote);
        toast({
          title: !serverReachable
            ? "Conexão de versão indisponível"
            : result.upToDate
              ? "Você já está na versão mais recente"
              : "Atualização disponível",
          description: serverReachable
            ? `Versão atual: ${result.current} • Servidor: ${result.remote}`
            : "Toque em atualizar para limpar o cache e reconectar com a versão publicada.",
          variant: serverReachable ? "default" : "destructive",
        });
      }
    } catch {
      if (!silent) {
        toast({
          title: "Erro ao verificar versão",
          description: "Tente novamente em instantes.",
          variant: "destructive",
        });
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    toast({
      title: "Atualizando o Oculto…",
      description: "Estamos carregando a versão mais recente. Isso pode levar alguns segundos.",
    });
    try {
      await forceWebAppUpdate("settings", info?.remote);
      // forceWebAppUpdate faz redirect — não deve voltar aqui.
    } catch {
      setUpdating(false);
      toast({
        title: "Não foi possível atualizar automaticamente",
        description: "Feche o navegador/app e abra novamente.",
        variant: "destructive",
      });
    }
  };

  const serverReachable = Boolean(info?.remote);
  const upToDate = serverReachable ? Boolean(info?.upToDate) : false;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4 text-primary" />
          Atualização do WebApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se você estiver vendo uma versão antiga ou algo parecer desatualizado, toque abaixo
          para carregar a versão mais recente do Oculto.
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="font-mono">
            instalada: {installed}
          </Badge>
          <Badge variant="outline" className="font-mono">
            disponível: {checking && !info?.remote ? "verificando…" : (info?.remote ?? installed)}
          </Badge>
          {info && (
            !serverReachable ? (
              <Badge className="bg-amber-500 text-zinc-950 hover:bg-amber-500 border-amber-300">
                <AlertCircle className="h-3 w-3 mr-1" /> Reconectar
              </Badge>
            ) : upToDate ? (
              <Badge className="bg-emerald-500 text-white hover:bg-emerald-500 border-emerald-300">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Atualizado
              </Badge>
            ) : (
              <Badge className="bg-red-500 text-white hover:bg-red-500 border-red-300 animate-pulse">
                <AlertCircle className="h-3 w-3 mr-1" /> Desatualizado
              </Badge>
            )
          )}
        </div>


        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleUpdate}
            disabled={updating}
            className={
              "flex-1 gap-2 bg-yellow-400 text-zinc-900 hover:bg-yellow-300 font-semibold ring-1 ring-yellow-200"
            }
          >
            {updating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Atualizando…</>
            ) : (
              <><Download className="h-4 w-4" /> {upToDate ? "Forçar atualização" : "Atualizar agora"}</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => refresh(false)}
            disabled={checking || updating}
            className="gap-2"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Verificar versão
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          🔒 Isso não apaga sua conta, suas conversas nem seu login. Apenas limpa o cache de
          arquivos antigos e recarrega a versão mais recente publicada.
        </p>
      </CardContent>
    </Card>
  );
}

export default AppUpdateCard;
