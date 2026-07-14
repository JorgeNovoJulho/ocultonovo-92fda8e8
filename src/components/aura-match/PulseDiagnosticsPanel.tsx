/**
 * PulseDiagnosticsPanel
 *
 * Painel flutuante de diagnóstico técnico do fluxo de Pulso de Aura.
 * Visível APENAS para o administrador master (ocultomaster).
 *
 * Mostra:
 *  - Slug da sala atual
 *  - room_id derivado (UUID determinístico do slug)
 *  - Lista dos últimos envios via RPC `aura_pulse_send_by_slug` com:
 *      payload, duração, status (ok / erro), código de erro e resposta crua.
 *
 * Não tem efeito colateral — apenas leitura. Pode ser minimizado.
 */
import { useState } from 'react';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import type { PulseDiagnostic } from '@/hooks/useAuraPulses';
import { Bug, X, Trash2, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  slug: string | null | undefined;
  roomId: string | null;
  diagnostics: PulseDiagnostic[];
  onClear: () => void;
}

function fmtTime(ms: number) {
  try {
    const d = new Date(ms);
    return d.toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch { return String(ms); }
}

function short(v: string | null | undefined, n = 8) {
  if (!v) return '—';
  return v.length > n * 2 + 3 ? `${v.slice(0, n)}…${v.slice(-n)}` : v;
}

export function PulseDiagnosticsPanel({ slug, roomId, diagnostics, onClear }: Props) {
  const { data: isMaster } = useIsMasterAdmin();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!isMaster) return null;

  const lastError = diagnostics.find((d) => !d.ok);

  return (
    <div className="fixed bottom-3 right-3 z-[9999] flex flex-col items-end font-mono text-[11px]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-lg ring-1 ring-white/10 backdrop-blur ${
            lastError ? 'bg-red-500/95 text-white' : 'bg-amber-400 text-black'
          }`}
          aria-label="Abrir painel de diagnóstico de pulsos"
          title="Diagnóstico de Pulso (master)"
        >
          <Bug className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wider">Pulso · debug</span>
          {diagnostics.length > 0 && (
            <span className="ml-1 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
              {diagnostics.length}
            </span>
          )}
        </button>
      ) : (
        <div className="w-[min(92vw,420px)] max-h-[70vh] overflow-hidden rounded-lg border border-amber-400/50 bg-black/90 text-white shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400 px-2.5 py-1.5 text-black">
            <div className="flex items-center gap-1.5">
              <Bug className="h-3.5 w-3.5" />
              <span className="font-semibold uppercase tracking-wider">Pulso · diagnóstico (master)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onClear}
                className="rounded p-1 hover:bg-black/10"
                aria-label="Limpar diagnóstico"
                title="Limpar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 hover:bg-black/10"
                aria-label="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Sala atual */}
          <div className="space-y-0.5 border-b border-white/10 bg-black/60 px-2.5 py-2">
            <div className="flex justify-between gap-2">
              <span className="text-white/50">slug:</span>
              <span className="truncate text-amber-300">{slug ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-white/50">room_id:</span>
              <span
                className="cursor-pointer truncate text-amber-300 hover:underline"
                onClick={() => { if (roomId) void navigator.clipboard?.writeText(roomId); }}
                title={roomId || 'Clique para copiar'}
              >
                {roomId ?? '—'}
              </span>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-[50vh] overflow-y-auto">
            {diagnostics.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-white/50">
                Envie um pulso para começar a registrar.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {diagnostics.map((d, i) => {
                  const isOpen = expanded === i;
                  return (
                    <li key={`${d.at}-${i}`} className="px-2.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : i)}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {d.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                          )}
                          <span className="text-white/60">{fmtTime(d.at)}</span>
                          <span className="rounded bg-white/10 px-1 py-px text-[10px] uppercase">
                            {d.pulseType}
                          </span>
                          <span className="truncate text-white/80">
                            → {short(d.targetId)}
                          </span>
                          {!d.ok && d.error?.code && (
                            <span className="rounded bg-red-500/30 px-1 py-px text-[10px] text-red-200">
                              {d.error.code}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-white/40">
                          <span>{d.durationMs}ms</span>
                          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </span>
                      </button>
                      {isOpen && (
                        <pre className="mt-1 overflow-x-auto rounded bg-black/60 p-2 text-[10px] leading-snug text-white/80">
{JSON.stringify(
  {
    payload: {
      p_room_slug: d.slug,
      p_target_id: d.targetId,
      p_message_id: d.messageId,
      p_pulse_type: d.pulseType,
    },
    derivedRoomId: d.roomId,
    ok: d.ok,
    durationMs: d.durationMs,
    response: d.response,
    error: d.error,
  },
  null,
  2,
)}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
