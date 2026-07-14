import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, ChevronDown, Megaphone, RotateCcw, Volume2, Vibrate, VibrateOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  isChatSoundMuted,
  setChatSoundMuted,
  playTestSound,
  getChatVolume,
  setChatVolume,
  isVibrationSupported,
  isChatVibrationEnabled,
  setChatVibrationEnabled,
  getChatVibrationPattern,
  setChatVibrationPattern,
  playTestVibration,
  DEFAULT_VIBRATION_PATTERN,
  VIBRATION_MIN_MS,
  VIBRATION_MAX_MS,
} from '@/lib/messageSound';
import {
  isAttentionMuted,
  setAttentionMuted,
  getAttentionVolume,
  setAttentionVolume,
  playAttentionAlert,
} from '@/lib/attentionPing';

/**
 * Painel de preferências do aviso de chat:
 *  - Mute / unmute som
 *  - Volume (0–100%)
 *  - Vibração on/off (separada do som; desabilitada com aviso quando o
 *    dispositivo não suporta `navigator.vibrate`)
 *  - Padrão de vibração: 1ª pulsação, pausa, 2ª pulsação (em ms)
 *  - Botões "Testar" para som e vibração
 *
 * Persistência via localStorage; sincroniza com outras abas via `storage`.
 */
export function ChatSoundToggle() {
  const supportsVibration = useMemo(() => isVibrationSupported(), []);

  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => isChatSoundMuted());
  const [volume, setVolumeState] = useState<number>(() => getChatVolume());
  const [vibrationOn, setVibrationOn] = useState<boolean>(() => isChatVibrationEnabled());
  const [pattern, setPattern] = useState<number[]>(() => {
    const p = getChatVibrationPattern();
    // Normaliza para 3 segmentos editáveis (on, off, on)
    return [
      p[0] ?? DEFAULT_VIBRATION_PATTERN[0],
      p[1] ?? DEFAULT_VIBRATION_PATTERN[1],
      p[2] ?? DEFAULT_VIBRATION_PATTERN[2],
    ];
  });
  const [attMuted, setAttMuted] = useState<boolean>(() => isAttentionMuted());
  const [attVolume, setAttVolumeState] = useState<number>(() => getAttentionVolume());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === 'oculto.chat.mute') setMuted(isChatSoundMuted());
      if (e.key === 'oculto.chat.volume') setVolumeState(getChatVolume());
      if (e.key === 'oculto.chat.vibrate') setVibrationOn(isChatVibrationEnabled());
      if (e.key === 'oculto.chat.vibrate.pattern') {
        const p = getChatVibrationPattern();
        setPattern([
          p[0] ?? DEFAULT_VIBRATION_PATTERN[0],
          p[1] ?? DEFAULT_VIBRATION_PATTERN[1],
          p[2] ?? DEFAULT_VIBRATION_PATTERN[2],
        ]);
      }
      if (e.key === 'oculto.attention.mute') setAttMuted(isAttentionMuted());
      if (e.key === 'oculto.attention.volume') setAttVolumeState(getAttentionVolume());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setChatSoundMuted(next);
    if (!next) playTestSound(volume);
  };

  const onVolumeChange = (v: number[]) => {
    const value = Math.min(1, Math.max(0, (v[0] ?? 0) / 100));
    setVolumeState(value);
    setChatVolume(value);
  };

  const onVolumeCommit = (v: number[]) => {
    const value = Math.min(1, Math.max(0, (v[0] ?? 0) / 100));
    if (!muted) playTestSound(value);
  };

  const onVibrationToggle = (checked: boolean) => {
    setVibrationOn(checked);
    setChatVibrationEnabled(checked);
    if (checked) playTestVibration(pattern);
  };

  const updatePatternAt = (index: number, value: number) => {
    const safe = Math.min(VIBRATION_MAX_MS, Math.max(VIBRATION_MIN_MS, Math.round(value)));
    const next = [...pattern];
    next[index] = safe;
    setPattern(next);
    setChatVibrationPattern(next);
  };

  const resetPattern = () => {
    const next = [...DEFAULT_VIBRATION_PATTERN];
    setPattern(next);
    setChatVibrationPattern(next);
    if (vibrationOn) playTestVibration(next);
  };

  const volumePct = Math.round(volume * 100);
  const vibrationLabel = supportsVibration
    ? (vibrationOn
        ? (muted ? 'Vibração reforçada' : 'Vibração ativa')
        : 'Vibração desativada')
    : 'Sem vibração';
  const soundLabel = muted ? 'Som desativado' : `Som ${volumePct}%`;

  return (
    <div
      className={cn(
        'border-b border-fuchsia-300/40 dark:border-fuchsia-400/25',
        // Gradiente de destaque — funciona em claro e escuro
        'bg-gradient-to-r from-fuchsia-100 via-pink-100 to-amber-100',
        'dark:from-fuchsia-950/60 dark:via-pink-950/50 dark:to-amber-950/40',
        'shadow-[inset_0_-1px_0_rgba(217,70,239,0.18)]',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-white/30 dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-2">
          {muted ? (
            <BellOff className="h-4 w-4 shrink-0 text-fuchsia-700 dark:text-fuchsia-300" />
          ) : (
            <Bell className="h-4 w-4 shrink-0 text-fuchsia-700 dark:text-fuchsia-300" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight text-fuchsia-950 dark:text-fuchsia-50">
              Configurações do Chat
            </p>
            <p className="truncate text-[11px] font-medium text-fuchsia-900/80 dark:text-fuchsia-200/85">
              {soundLabel} · {vibrationLabel}
            </p>
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-fuchsia-800/80 dark:text-fuchsia-200/80 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <>
          {/* Linha 1 — Som on/off + teste */}
          <div className="flex items-center justify-between gap-2 border-t border-border/20 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {muted ? (
                <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <Bell className="h-4 w-4 text-primary shrink-0" />
              )}
              <span className="text-xs text-muted-foreground truncate">
                Aviso sonoro de novas mensagens
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={() => playTestSound(volume)}
                aria-label="Testar som de notificação"
              >
                <Volume2 className="mr-1 h-3.5 w-3.5" />
                Testar
              </Button>
              <Button
                type="button"
                variant={muted ? 'outline' : 'default'}
                size="sm"
                className={cn(
                  'h-8 min-w-[5.5rem] px-2.5 text-[11px]',
                  !muted && 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
                onClick={toggleMute}
                aria-pressed={!muted}
              >
                {muted ? 'Ativar' : 'Ativado'}
              </Button>
            </div>
          </div>

          {/* Linha 2 — Volume */}
          <div className={cn('px-3 pb-2', muted && 'opacity-60')}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">Volume do aviso</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{volumePct}%</span>
            </div>
            <Slider
              value={[volumePct]}
              min={0}
              max={100}
              step={5}
              onValueChange={onVolumeChange}
              onValueCommit={onVolumeCommit}
              disabled={muted}
              aria-label="Volume do aviso sonoro"
            />
          </div>

          {/* Linha 3 — Vibração on/off (com fallback) */}
          <div className="flex items-center justify-between gap-2 border-t border-border/20 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {vibrationOn && supportsVibration ? (
                <Vibrate className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <VibrateOff className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  Vibração ao receber mensagem
                </p>
                {!supportsVibration && (
                  <p className="truncate text-[10px] text-amber-400/80">
                    Não suportada neste dispositivo — apenas o som será reproduzido.
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={vibrationOn && supportsVibration}
              onCheckedChange={onVibrationToggle}
              disabled={!supportsVibration}
              aria-label="Vibração de chat"
            />
          </div>

          {/* Linha 4 — Padrão de vibração */}
          {supportsVibration && (
            <div
              className={cn(
                'space-y-2 border-t border-border/20 px-3 pb-3 pt-1',
                !vibrationOn && 'opacity-60',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Padrão de vibração</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={resetPattern}
                    disabled={!vibrationOn}
                    aria-label="Restaurar padrão de vibração"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Padrão
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => playTestVibration(pattern)}
                    disabled={!vibrationOn}
                  >
                    <Vibrate className="mr-1 h-3 w-3" />
                    Testar
                  </Button>
                </div>
              </div>

              <PatternSlider
                label="1ª pulsação"
                value={pattern[0]}
                disabled={!vibrationOn}
                onChange={(v) => updatePatternAt(0, v)}
              />
              <PatternSlider
                label="Pausa"
                value={pattern[1]}
                disabled={!vibrationOn}
                onChange={(v) => updatePatternAt(1, v)}
              />
              <PatternSlider
                label="2ª pulsação"
                value={pattern[2]}
                disabled={!vibrationOn}
                onChange={(v) => updatePatternAt(2, v)}
              />
            </div>
          )}

          {/* Linha 5 — Chamada de Atenção (Megafone) */}
          <div className="border-t border-border/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Megaphone className={cn(
                  'h-4 w-4 shrink-0',
                  attMuted ? 'text-muted-foreground' : 'text-[#D4AF37]'
                )} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    Chamada de atenção
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {attMuted ? 'Som desativado' : `Som ${Math.round(attVolume * 100)}%`} · som intenso entre os dois usuários
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  onClick={() => void playAttentionAlert({ force: true })}
                  aria-label="Testar chamada de atenção"
                >
                  <Volume2 className="mr-1 h-3.5 w-3.5" />
                  Testar
                </Button>
                <Button
                  type="button"
                  variant={attMuted ? 'outline' : 'default'}
                  size="sm"
                  className={cn(
                    'h-8 min-w-[5.5rem] px-2.5 text-[11px]',
                    !attMuted && 'bg-[#D4AF37] text-black hover:bg-[#FFD700]',
                  )}
                  onClick={() => {
                    const next = !attMuted;
                    setAttMuted(next);
                    setAttentionMuted(next);
                    if (!next) void playAttentionAlert({ force: true });
                  }}
                  aria-pressed={!attMuted}
                >
                  {attMuted ? 'Ativar' : 'Ativado'}
                </Button>
              </div>
            </div>

            <div className={cn('mt-2', attMuted && 'opacity-60')}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Volume da chamada</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(attVolume * 100)}%</span>
              </div>
              <Slider
                value={[Math.round(attVolume * 100)]}
                min={0}
                max={100}
                step={5}
                disabled={attMuted}
                onValueChange={(v) => {
                  const value = Math.min(1, Math.max(0, (v[0] ?? 0) / 100));
                  setAttVolumeState(value);
                  setAttentionVolume(value);
                }}
                onValueCommit={(v) => {
                  const value = Math.min(1, Math.max(0, (v[0] ?? 0) / 100));
                  if (!attMuted) void playAttentionAlert({ force: true });
                }}
                aria-label="Volume da chamada de atenção"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PatternSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{value} ms</span>
      </div>
      <Slider
        value={[value]}
        min={VIBRATION_MIN_MS}
        max={VIBRATION_MAX_MS}
        step={10}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

export default ChatSoundToggle;
