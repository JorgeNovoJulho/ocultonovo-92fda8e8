/**
 * Checklist persistente de ativação em produção do gateway Asaas.
 * - Itens automáticos: lidos de pix_gateway_config + system_settings
 * - Itens manuais: persistidos em system_settings.asaas_activation_checklist (JSON)
 * Mostra barra de progresso e badge "Pronto para produção" quando 100%.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Rocket,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

const SETTING_KEY = "asaas_activation_checklist";

type ManualKey =
  | "test_connection_ok"
  | "test_pix_sale_ok"
  | "test_card_sale_ok"
  | "webhook_200_received"
  | "split_configured"
  | "payout_tested";

interface ChecklistState {
  manual: Record<ManualKey, { done: boolean; at?: string; by?: string }>;
}

const DEFAULT_STATE: ChecklistState = {
  manual: {
    test_connection_ok: { done: false },
    test_pix_sale_ok: { done: false },
    test_card_sale_ok: { done: false },
    webhook_200_received: { done: false },
    split_configured: { done: false },
    payout_tested: { done: false },
  },
};

export function ProductionActivationChecklist() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [auto, setAuto] = useState({
    api_key_saved: false,
    webhook_secret_saved: false,
    pix_key_saved: false,
    sandbox_off: false,
    gateway_active: false,
    last_test_ok: false,
  });
  const [state, setState] = useState<ChecklistState>(DEFAULT_STATE);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: cfg }, { data: settings }] = await Promise.all([
        (supabase as any)
          .from("pix_gateway_config")
          .select(
            "api_key_encrypted, webhook_secret_encrypted, pix_key, sandbox_mode, is_active",
          )
          .maybeSingle(),
        (supabase as any)
          .from("system_settings")
          .select("key, value")
          .in("key", [
            SETTING_KEY,
            "asaas_last_test_status",
            "pix_last_test_status",
          ]),
      ]);

      const map: Record<string, string> = {};
      (settings || []).forEach((r: any) => (map[r.key] = r.value));

      setAuto({
        api_key_saved: !!cfg?.api_key_encrypted,
        webhook_secret_saved: !!cfg?.webhook_secret_encrypted,
        pix_key_saved: !!cfg?.pix_key,
        sandbox_off: cfg?.sandbox_mode === false,
        gateway_active: cfg?.is_active === true,
        last_test_ok:
          map["asaas_last_test_status"] === "OK" ||
          map["pix_last_test_status"] === "OK",
      });

      try {
        const parsed = map[SETTING_KEY] ? JSON.parse(map[SETTING_KEY]) : null;
        if (parsed?.manual) {
          setState({ manual: { ...DEFAULT_STATE.manual, ...parsed.manual } });
        }
      } catch {
        // ignore parse error
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleManual = async (key: ManualKey, value: boolean) => {
    setSaving(key);
    const next: ChecklistState = {
      manual: {
        ...state.manual,
        [key]: {
          done: value,
          at: value ? new Date().toISOString() : undefined,
        },
      },
    };
    setState(next);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        next.manual[key].by = u.user.email || u.user.id;
      }
      const { error } = await (supabase as any).from("system_settings").upsert(
        {
          key: SETTING_KEY,
          value: JSON.stringify(next),
          description: "Checklist de ativação Asaas em produção",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast({
        title: value ? "Etapa marcada" : "Etapa desmarcada",
        description: "Progresso salvo no banco.",
      });
    } catch (e: any) {
      toast({
        title: "Erro ao salvar",
        description: e?.message || String(e),
        variant: "destructive",
      });
      // rollback
      setState(state);
    } finally {
      setSaving(null);
    }
  };

  const items = useMemo(
    () => [
      {
        id: "api_key_saved",
        label: "API Key salva no banco",
        done: auto.api_key_saved,
        manual: false as const,
      },
      {
        id: "webhook_secret_saved",
        label: "Webhook secret salvo",
        done: auto.webhook_secret_saved,
        manual: false as const,
      },
      {
        id: "pix_key_saved",
        label: "Chave PIX da plataforma cadastrada",
        done: auto.pix_key_saved,
        manual: false as const,
      },
      {
        id: "sandbox_off",
        label: "Sandbox desligado (produção)",
        done: auto.sandbox_off,
        manual: false as const,
      },
      {
        id: "gateway_active",
        label: "Gateway marcado como ativo",
        done: auto.gateway_active,
        manual: false as const,
      },
      {
        id: "last_test_ok",
        label: 'Último "Testar Conexão" retornou OK',
        done: auto.last_test_ok,
        manual: false as const,
      },
      {
        id: "test_connection_ok",
        label: "Conexão validada manualmente pelo Admin",
        done: state.manual.test_connection_ok.done,
        manual: true as const,
        at: state.manual.test_connection_ok.at,
      },
      {
        id: "test_pix_sale_ok",
        label: "Teste de venda PIX (R$1) concluído",
        done: state.manual.test_pix_sale_ok.done,
        manual: true as const,
        at: state.manual.test_pix_sale_ok.at,
      },
      {
        id: "test_card_sale_ok",
        label: "Teste de venda Cartão concluído",
        done: state.manual.test_card_sale_ok.done,
        manual: true as const,
        at: state.manual.test_card_sale_ok.at,
      },
      {
        id: "webhook_200_received",
        label: "Webhook recebido com 200 OK",
        done: state.manual.webhook_200_received.done,
        manual: true as const,
        at: state.manual.webhook_200_received.at,
      },
      {
        id: "split_configured",
        label: "Split configurado (74/20/6) e somando 100%",
        done: state.manual.split_configured.done,
        manual: true as const,
        at: state.manual.split_configured.at,
      },
      {
        id: "payout_tested",
        label: "Payout (saque) testado com criador real",
        done: state.manual.payout_tested.done,
        manual: true as const,
        at: state.manual.payout_tested.at,
      },
    ],
    [auto, state],
  );

  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  const pct = Math.round((completed / total) * 100);
  const ready = pct === 100;

  return (
    <Card
      className={`mt-2 ${
        ready
          ? "border-green-500/40 bg-green-500/5"
          : "border-primary/30 bg-primary/5"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket
              className={`h-4 w-4 ${ready ? "text-green-500" : "text-primary"}`}
            />
            Checklist de Ativação em Produção
            {ready && (
              <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/15">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Pronto para produção
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-8 px-2"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <CardDescription className="text-xs">
          {completed} de {total} etapas concluídas — progresso persistido no
          banco para o Admin Master.
        </CardDescription>
        <div className="pt-2">
          <Progress value={pct} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
              item.done
                ? "border-green-500/30 bg-green-500/5"
                : "border-border bg-background"
            }`}
          >
            {item.manual ? (
              <Checkbox
                id={`chk-${item.id}`}
                checked={item.done}
                disabled={saving === item.id}
                onCheckedChange={(v) =>
                  toggleManual(item.id as ManualKey, !!v)
                }
              />
            ) : item.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <label
              htmlFor={item.manual ? `chk-${item.id}` : undefined}
              className={`flex-1 cursor-${item.manual ? "pointer" : "default"} ${
                item.done ? "" : "text-muted-foreground"
              }`}
            >
              {item.label}
              {item.manual && item.at && (
                <span className="ml-2 text-xs text-muted-foreground">
                  · {new Date(item.at).toLocaleString()}
                </span>
              )}
            </label>
            <Badge
              variant="outline"
              className={
                item.manual
                  ? "border-muted-foreground/30 text-xs"
                  : "border-primary/30 text-xs"
              }
            >
              {item.manual ? "manual" : "auto"}
            </Badge>
            {saving === item.id && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
