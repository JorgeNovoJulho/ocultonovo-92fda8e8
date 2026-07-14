/**
 * DynamicsContent — roteiros prontos para criar sessão pré-configurada
 * na sub-área Dinâmicas. Três templates de fluxo (Curto/Médio/Intenso).
 */
import { useState } from 'react';
import { Clock3, Layers3, Loader2, PlayCircle } from 'lucide-react';
import { useSocialBetaSessions } from '@/hooks/useSocialBetaSessions';
import { useSocialBetaSlotEvent } from '@/hooks/useSocialBetaSlotEvent';
import { toast } from 'sonner';

type Template = {
  id: string;
  title: string;
  description: string;
  steps: string[];
  duration: string;
  participants: number;
};

const TEMPLATES: Template[] = [
  {
    id: 'curto',
    title: 'Aquecimento rápido',
    description: 'Quebra-gelo leve em 3 fases curtas. Bom pra primeira aproximação.',
    steps: ['Apresentação', 'Carta leve', 'Combinado final'],
    duration: '~15min',
    participants: 4,
  },
  {
    id: 'medio',
    title: 'Dinâmica equilibrada',
    description: 'Fluxo com aquecimento, carta provocante e fechamento consensual.',
    steps: ['Recepção', 'Carta divertida', 'Carta provocante', 'Pausa', 'Combinado'],
    duration: '~30min',
    participants: 6,
  },
  {
    id: 'intenso',
    title: 'Fluxo intenso',
    description: 'Para grupos já confortáveis. Inclui supervisão e checkpoints.',
    steps: ['Recepção', 'Carta provocante', 'Checkpoint', 'Carta avançada', 'Pausa', 'Encerramento'],
    duration: '~60min',
    participants: 8,
  },
];

export function DynamicsContent() {
  const { createSession } = useSocialBetaSessions('dynamics', true);
  const { track } = useSocialBetaSlotEvent('dynamics', true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const start = async (t: Template) => {
    setBusyId(t.id);
    track('start_template', { template_id: t.id, participants: t.participants });
    try {
      const sid = await createSession(t.title, `${t.description} Fases: ${t.steps.join(' → ')}.`, t.participants);
      track('session_created', { template_id: t.id, session_id: sid });
      toast.success('Sessão criada com este roteiro 💫', {
        description: 'Convide os participantes pelo painel abaixo.',
      });
    } catch {
      track('session_failed', { template_id: t.id });
      toast.error('Não foi possível criar a sessão.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-foreground" />
        <h2 className="font-semibold">Roteiros prontos</h2>
        <span className="ml-auto text-xs text-muted-foreground">cria sessão pré-configurada</span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {TEMPLATES.map((t) => {
          const busy = busyId === t.id;
          return (
            <article key={t.id} className="rounded-lg border border-border bg-background p-4 space-y-2.5">
              <h3 className="font-semibold text-sm">{t.title}</h3>
              <p className="text-xs text-muted-foreground">{t.description}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Clock3 className="h-3 w-3" /> {t.duration}
                <span>·</span>
                <span>até {t.participants}</span>
              </div>
              <ol className="space-y-1 text-[11px] text-muted-foreground">
                {t.steps.map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="font-medium text-foreground/70">{i + 1}.</span> {s}
                  </li>
                ))}
              </ol>
              <button
                onClick={() => start(t)}
                disabled={busy}
                className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Criando…</>
                ) : (
                  <><PlayCircle className="h-3 w-3" /> Iniciar sessão</>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
