import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Heart,
  MessageSquare,
  ShieldCheck,
  Clock,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { useNotificationPreferences, NotificationPreferences } from "@/hooks/useNotificationPreferences";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { toast } from "@/hooks/use-toast";


interface PrefRow {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const PREF_ROWS: PrefRow[] = [
  {
    key: "messages",
    label: "Mensagens",
    description: "Alertas de novas mensagens no chat (texto mascarado em E2EE)",
    icon: <MessageSquare className="h-4 w-4" />,
    color: "text-blue-400",
  },
  {
    key: "likes",
    label: "Curtidas & Seguidores",
    description: "Quando alguém curte o teu post ou começa a seguir-te",
    icon: <Heart className="h-4 w-4" />,
    color: "text-pink-400",
  },
  {
    key: "looking_now",
    label: "Match VIP",
    description: "Alertas quando há um match mútuo",
    icon: <Heart className="h-4 w-4" />,
    color: "text-[hsl(45,93%,47%)]",
  },

  {
    key: "push_enabled",
    label: "Avisos de Validação (30 dias)",
    description: "Lembretes com 7 dias e 24 horas antes da expiração do prazo KYC",
    icon: <Clock className="h-4 w-4" />,
    color: "text-orange-400",
  },
  {
    key: "subscriptions",
    label: "Assinaturas & Compras",
    description: "Confirmação de novos assinantes e compras de conteúdo",
    icon: <Bell className="h-4 w-4" />,
    color: "text-[hsl(142,76%,36%)]",
  },
  {
    key: "visits",
    label: "Visitas ao Perfil",
    description: "Quando alguém visita o teu perfil",
    icon: <Bell className="h-4 w-4" />,
    color: "text-muted-foreground",
  },
];

// Extra: KYC push (stored as custom key in notification_preferences JSON)
const EXTENDED_KEYS = [
  {
    key: "kyc_push" as const,
    label: "Resultado do Selo Oculto (KYC)",
    description: "Notificação imediata quando o documento for aprovado ou reprovado",
    icon: <ShieldCheck className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    key: "validation_push" as const,
    label: "Avisos de Prazo de Verificação",
    description: "Alertas push com 7 dias e 24 horas de antecedência",
    icon: <Clock className="h-4 w-4" />,
    color: "text-orange-400",
  },
  {
    key: "match_push" as const,
    label: "Novo Match",
    description: "Alerta push instantâneo quando há match mútuo",
    icon: <Megaphone className="h-4 w-4" />,
    color: "text-[hsl(45,93%,47%)]",
    masterOnly: true,
  },
];


export function NotificationPreferencesCard() {
  const { preferences, isLoading, isUpdating, updatePreference, toggleAll, resetToDefaults } =
    useNotificationPreferences();
  const { user } = useAuth();
  const isMasterAdmin = useIsMasterAdmin();

  // Filtra entradas marcadas como masterOnly (ex.: Perfect Pair) para usuários comuns.
  const visibleExtended = EXTENDED_KEYS.filter((e: any) => !e.masterOnly || isMasterAdmin);

  // Extended prefs (KYC, validation, match) are stored in the same JSON blob
  const extPrefs = (preferences as any) as Record<string, boolean>;


  const updateExtPref = async (key: string, value: boolean) => {
    if (!user?.id) return;
    const current: Record<string, boolean> = { ...extPrefs, [key]: value };
    const { error } = await supabase
      .from("profiles")
      .update({ notification_preferences: current } as any)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro ao guardar preferência", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Gestão de Notificações Push
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={resetToDefaults}
              disabled={isUpdating}
            >
              <RefreshCw className="h-3 w-3" />
              Repor
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => toggleAll(false)}
              disabled={isUpdating}
            >
              Silenciar tudo
            </Button>
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Controla exactamente que tipos de alerta recebes no dispositivo.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Standard prefs */}
        {PREF_ROWS.map(({ key, label, description, icon, color }) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30 gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={color}>{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{description}</p>
              </div>
            </div>
            <Switch
              checked={preferences[key] !== false}
              onCheckedChange={(v) => updatePreference(key, v)}
              disabled={isUpdating}
            />
          </div>
        ))}

        {/* Divider */}
        <div className="pt-2 pb-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Eventos Especiais
          </p>
        </div>

        {/* Extended prefs */}
        {visibleExtended.map(({ key, label, description, icon, color }) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30 gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={color}>{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{description}</p>
              </div>
            </div>
            <Switch
              checked={extPrefs[key] !== false}
              onCheckedChange={(v) => updateExtPref(key, v)}
              disabled={isUpdating}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
