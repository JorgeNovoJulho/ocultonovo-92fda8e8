/**
 * LGPDConsentsCard — Onda 2 LGPD
 * UI granular de consentimentos exibida na aba "Privacidade" das Configurações.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, BarChart3, Sparkles, Target, MapPin, Heart, Radio,
  Bell, Mail, Megaphone, EyeOff, Share2,
} from 'lucide-react';
import { useLGPDConsent, LGPDConsentType } from '@/hooks/useLGPDConsent';
import { toast } from 'sonner';

interface ConsentItem {
  type: LGPDConsentType;
  group: 'cookies' | 'geo' | 'features' | 'comms';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  required?: boolean;
}

const ITEMS: ConsentItem[] = [
  // Cookies
  { type: 'cookies_analytics', group: 'cookies', title: 'Cookies de Analytics', description: 'Métricas anônimas para melhorar a plataforma.', icon: BarChart3 },
  { type: 'cookies_personalization', group: 'cookies', title: 'Cookies de Personalização', description: 'Lembrar preferências de tema e idioma.', icon: Sparkles },
  { type: 'cookies_marketing', group: 'cookies', title: 'Cookies de Marketing', description: 'Anúncios relevantes e medição de campanhas.', icon: Target },

  // Geo
  { type: 'geolocation_radar', group: 'geo', title: 'Geolocalização — Radar', description: 'Usar sua localização para mostrar pessoas próximas no Radar.', icon: Radio },
  { type: 'geolocation_aura', group: 'geo', title: 'Geolocalização — Aura Match', description: 'Localização aproximada para encontrar afinidades no Aura.', icon: Heart },
  { type: 'geolocation_events', group: 'geo', title: 'Geolocalização — Eventos', description: 'Sugerir eventos VIP perto de você.', icon: MapPin },

  // Features
  { type: 'aura_match', group: 'features', title: 'Aura Match', description: 'Participar do sistema de afinidade automática.', icon: Sparkles },
  { type: 'realtime_presence', group: 'features', title: 'Presença em tempo real', description: 'Mostrar quando você está online para outros usuários.', icon: ShieldCheck },
  { type: 'adult_content', group: 'features', title: 'Conteúdo adulto +18', description: 'Confirmar que você tem 18+ e aceita receber conteúdo sensível.', icon: EyeOff },

  // Comms
  { type: 'notifications_push', group: 'comms', title: 'Notificações Push', description: 'Receber alertas no navegador/app.', icon: Bell },
  { type: 'notifications_email', group: 'comms', title: 'Notificações por e-mail', description: 'Resumos de atividade, matches e respostas.', icon: Mail },
  { type: 'marketing_campaigns', group: 'comms', title: 'Campanhas de marketing', description: 'Promoções, novidades e ofertas especiais.', icon: Megaphone },
  { type: 'data_sharing_partners', group: 'comms', title: 'Compartilhar com parceiros', description: 'Compartilhar dados anonimizados com parceiros analíticos.', icon: Share2 },
];

const GROUP_LABEL: Record<ConsentItem['group'], string> = {
  cookies: 'Cookies',
  geo: 'Geolocalização',
  features: 'Funcionalidades',
  comms: 'Comunicações',
};

export function LGPDConsentsCard() {
  const { isGranted, setConsent, loading } = useLGPDConsent();

  const grouped = useMemo(() => {
    const out: Record<string, ConsentItem[]> = {};
    for (const it of ITEMS) (out[it.group] ||= []).push(it);
    return out;
  }, []);

  const handleToggle = async (type: LGPDConsentType, value: boolean) => {
    try {
      await setConsent(type, value, 'settings');
      toast.success(value ? 'Consentimento concedido' : 'Consentimento revogado', {
        description: 'Sua preferência foi registrada conforme a LGPD.',
      });
    } catch {
      toast.error('Não foi possível salvar', { description: 'Tente novamente em alguns segundos.' });
    }
  };

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Consentimentos LGPD
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Granular</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Você controla, por categoria, o que a plataforma pode fazer com seus dados.
          Suas escolhas são registradas com data, versão da política e fonte da decisão.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {(Object.keys(grouped) as ConsentItem['group'][]).map((g) => (
          <div key={g} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {GROUP_LABEL[g]}
            </h4>
            <div className="rounded-lg border border-border/30 divide-y divide-border/30">
              {grouped[g].map((item) => {
                const Icon = item.icon;
                const granted = isGranted(item.type);
                return (
                  <div key={item.type} className="flex items-start justify-between gap-4 p-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${granted ? 'bg-primary/15' : 'bg-muted'}`}>
                        <Icon className={`h-4 w-4 ${granted ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={granted}
                      disabled={loading}
                      onCheckedChange={(v) => handleToggle(item.type, v)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/30">
          Base legal: Art. 7º e Art. 8º da Lei 13.709/2018 (LGPD). Você pode revogar
          qualquer consentimento a qualquer momento — efeito imediato.
        </p>
      </CardContent>
    </Card>
  );
}
