/**
 * Página de preferências para o Pulso de Aura.
 * Rota: /settings/pulses
 *
 * Cobre Fase 1 (receber/som/vibração) + Fase 2 (premium/raro, ressonância,
 * histórico de atenção, modo silencioso, bloqueios de efeitos).
 */
import { Sparkles, BellOff, Volume2, Vibrate, ArrowLeft, MoonStar, Crown, Zap, Eye, EyeOff, History, ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAuraPulses } from '@/hooks/useAuraPulses';
import { playPulseChime, playChimeByType, tryVibrate } from '@/lib/pulseSound';

export default function PulsesSettingsPage() {
  const { prefs, savePrefs } = useAuraPulses(null);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link to="/settings"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Sparkles className="h-5 w-5 text-fuchsia-400" />
          Pulsos de Aura
        </h1>
        <Button asChild variant="outline" size="sm" className="ml-auto h-8 gap-1">
          <Link to="/settings/pulses/history"><History className="h-3.5 w-3.5" /> Histórico</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que é um Pulso de Aura?</CardTitle>
          <CardDescription>
            Um sinal breve e discreto que outro usuário pode te enviar dentro de uma sala
            do Aura Match para chamar sua atenção. Você está no controle: pode silenciar,
            bloquear tipos específicos ou desativar tudo.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Bloco principal — receber/som/vibração */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recebimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row
            icon={<BellOff className="h-4 w-4 text-fuchsia-300" />}
            title="Receber pulsos"
            description="Se desligado, ninguém poderá enviar pulsos pra você."
            checked={prefs.receive_pulses}
            onChange={(v) => savePrefs({ receive_pulses: v })}
          />
          <Row
            icon={<MoonStar className="h-4 w-4 text-indigo-300" />}
            title="Modo silencioso"
            description="Pulsos chegam sem som, vibração ou overlay — apenas no histórico."
            checked={prefs.silent_mode}
            disabled={!prefs.receive_pulses}
            onChange={(v) => savePrefs({ silent_mode: v })}
          />
          <Row
            icon={<Volume2 className="h-4 w-4 text-amber-300" />}
            title="Som"
            description="Toca uma faísca curta quando você recebe um pulso."
            checked={prefs.sound_enabled}
            disabled={!prefs.receive_pulses || prefs.silent_mode}
            onChange={(v) => savePrefs({ sound_enabled: v })}
            onTest={() => playPulseChime()}
          />
          <Row
            icon={<Vibrate className="h-4 w-4 text-emerald-300" />}
            title="Vibração (mobile)"
            description="Uma vibração breve no celular ao receber um pulso."
            checked={prefs.haptic_enabled}
            disabled={!prefs.receive_pulses || prefs.silent_mode}
            onChange={(v) => savePrefs({ haptic_enabled: v })}
            onTest={() => tryVibrate([35, 25, 35])}
          />
        </CardContent>
      </Card>

      {/* Tipos especiais */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pulsos especiais</CardTitle>
          <CardDescription className="text-xs">
            Controle quais tipos podem chegar até você.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row
            icon={<Crown className="h-4 w-4 text-[#B57BFF]" />}
            title="Aceitar Pulso Premium"
            description="Pulso mais intenso enviado por usuários Premium ou VIP."
            checked={prefs.allow_premium_pulse}
            disabled={!prefs.receive_pulses}
            onChange={(v) => savePrefs({ allow_premium_pulse: v })}
            onTest={() => playChimeByType('premium')}
          />
          <Row
            icon={<Zap className="h-4 w-4 text-[#FF3DE0]" />}
            title="Aceitar Pulso Raro"
            description="Pulso de alto impacto, restrito a usuários VIP com prestígio."
            checked={prefs.allow_rare_pulse}
            disabled={!prefs.receive_pulses}
            onChange={(v) => savePrefs({ allow_rare_pulse: v })}
            onTest={() => playChimeByType('rare')}
          />
          <Row
            icon={<ShieldOff className="h-4 w-4 text-amber-300" />}
            title="Silenciar som do Raro"
            description="Continua recebendo, mas sem o som diferenciado."
            checked={prefs.block_rare_sound}
            disabled={!prefs.receive_pulses || !prefs.allow_rare_pulse}
            onChange={(v) => savePrefs({ block_rare_sound: v })}
          />
          <Row
            icon={<EyeOff className="h-4 w-4 text-rose-300" />}
            title="Silenciar efeitos do Raro"
            description="Recebe sem o overlay grandão — apenas notificação discreta."
            checked={prefs.block_rare_effects}
            disabled={!prefs.receive_pulses || !prefs.allow_rare_pulse}
            onChange={(v) => savePrefs({ block_rare_effects: v })}
          />
        </CardContent>
      </Card>

      {/* Ressonância pública + histórico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row
            icon={<Eye className="h-4 w-4 text-fuchsia-300" />}
            title="Aparecer na Ressonância pública"
            description="Quando você responde a um pulso, a sala vê uma faísca anônima sutil."
            checked={prefs.show_resonance_public}
            onChange={(v) => savePrefs({ show_resonance_public: v })}
          />
          <Row
            icon={<History className="h-4 w-4 text-amber-300" />}
            title="Salvar meu Histórico de Atenção"
            description="Mantém um registro privado dos pulsos enviados e recebidos."
            checked={prefs.save_attention_history}
            onChange={(v) => savePrefs({ save_attention_history: v })}
          />
          <Row
            icon={<EyeOff className="h-4 w-4 text-indigo-300" />}
            title="Esconder dos outros que pulsei com eles"
            description="O outro lado não verá entradas tuas no histórico dele."
            checked={prefs.hide_my_history}
            onChange={(v) => savePrefs({ hide_my_history: v })}
          />
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Bloqueios e silenciamentos individuais continuam respeitados — pulsos de contatos
        bloqueados nunca chegam até você.
      </p>
    </div>
  );
}

interface RowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  onTest?: () => void;
}
function Row({ icon, title, description, checked, disabled, onChange, onTest }: RowProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {onTest && checked && !disabled && (
          <button
            type="button"
            onClick={onTest}
            className="mt-1 text-[11px] text-fuchsia-300 hover:underline"
          >
            Testar
          </button>
        )}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
