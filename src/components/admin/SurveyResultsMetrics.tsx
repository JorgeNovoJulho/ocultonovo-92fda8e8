/**
 * SurveyResultsMetrics — agrega e exibe os resultados da pesquisa OCULTO
 * (totais por status + distribuição de respostas por pergunta).
 *
 * Fonte: oculto_user_survey_steps (canônico) com fallback nas colunas espelho.
 * Acesso: apenas Master (componente é renderizado dentro de AdminPesquisasPage,
 * que já valida useIsMasterAdmin).
 */
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SURVEY_QUESTIONS, type SurveyQuestion } from '@/data/userSurveyQuestions';

type Row = {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  reward_given: boolean | null;
  source_channel: string | null;
  first_impression: string | null;
  main_interest: string | null;
  main_friction: string | null;
  return_reason: string | null;
  source_channel_other: string | null;
  first_impression_note: string | null;
  main_interest_note: string | null;
  main_friction_note: string | null;
  return_reason_note: string | null;
};

type StepRow = {
  survey_id: string;
  question_key: string;
  answer_value: string | null;
  answer_note: string | null;
};

function readRpcPayload(data: unknown): { rows: Row[]; steps: StepRow[] } | null {
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== 'object') return null;
  const maybe = payload as { surveys?: unknown; steps?: unknown };
  return {
    rows: (Array.isArray(maybe.surveys) ? maybe.surveys : []) as Row[],
    steps: (Array.isArray(maybe.steps) ? maybe.steps : []) as StepRow[],
  };
}

function normalizeAnswerValue(question: SurveyQuestion, value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const byValue = question.options.find((opt) => opt.value === raw);
  if (byValue) return byValue.value;
  const byLabel = question.options.find((opt) => opt.label.trim().toLowerCase() === raw.toLowerCase());
  return byLabel?.value ?? raw;
}

function addCount(map: Map<string, number>, value: string | null | undefined) {
  const v = value?.trim();
  if (!v) return;
  map.set(v, (map.get(v) ?? 0) + 1);
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

function rowHasMirrorAnswer(row: Row) {
  return SURVEY_QUESTIONS.some((q) => Boolean((row[q.mirrorColumn as keyof Row] as string | null)?.trim()));
}

export default function SurveyResultsMetrics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data: rpcData, error: rpcError } = await (supabase as any)
      .rpc('oculto_admin_survey_results');

    const rpcDenied =
      rpcError &&
      (String((rpcError as any).code ?? '') === '42501' ||
        String(rpcError.message ?? '').toLowerCase().includes('acesso negado'));
    if (rpcDenied) {
      setRows([]);
      setSteps([]);
      setErrorMessage('Acesso negado pela RPC administrativa. Reexecute o SQL corrigido e abra esta página logado como ocultomaster.');
      setLoading(false);
      return;
    }

    if (!rpcError) {
      const payload = readRpcPayload(rpcData);
      if (payload) {
        setRows(payload.rows);
        setSteps(payload.steps);
        setLoading(false);
        return;
      }
    }

    const { data, error } = await (supabase as any)
      .from('oculto_user_surveys')
      .select(
        'id, status, reward_given, source_channel, first_impression, main_interest, main_friction, return_reason, source_channel_other, first_impression_note, main_interest_note, main_friction_note, return_reason_note',
      )
      .limit(5000);
    if (error) {
      setRows([]);
      setSteps([]);
      setErrorMessage(error.message ?? 'Não foi possível carregar as respostas.');
      setLoading(false);
      return;
    }

    const surveyRows = (data ?? []) as Row[];
    setRows(surveyRows);

    const { data: stepData, error: stepError } = await (supabase as any)
      .from('oculto_user_survey_steps')
      .select('survey_id, question_key, answer_value, answer_note')
      .order('created_at', { ascending: true })
      .limit(25000);

    if (stepError) {
      setSteps([]);
      setErrorMessage(stepError.message ?? 'Não foi possível carregar as respostas por etapa.');
    } else {
      setSteps((stepData ?? []) as StepRow[]);
    }
    if (rpcError && !String(rpcError.message ?? '').includes('oculto_admin_survey_results')) {
      setErrorMessage('Leitura administrativa completa indisponível; usando leitura direta permitida pela sessão.');
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => {
    const stepKeysBySurvey = new Map<string, Set<string>>();
    for (const step of steps) {
      if (!step.survey_id || !step.question_key || !step.answer_value?.trim()) continue;
      const keys = stepKeysBySurvey.get(step.survey_id) ?? new Set<string>();
      keys.add(step.question_key);
      stepKeysBySurvey.set(step.survey_id, keys);
    }
    const stepSurveyIds = new Set(steps.map((s) => s.survey_id));
    const total = rows.length;
    const effectiveStatuses = rows.map((r) => {
      if (r.status === 'skipped') return 'skipped';
      const answeredKeys = stepKeysBySurvey.get(r.id) ?? new Set<string>();
      const answeredAll = SURVEY_QUESTIONS.every((q) => (
        answeredKeys.has(q.key) || Boolean((r[q.mirrorColumn as keyof Row] as string | null)?.trim())
      ));
      if (r.status === 'completed' || answeredAll) return 'completed';
      if (r.status === 'in_progress' || stepSurveyIds.has(r.id) || rowHasMirrorAnswer(r)) return 'in_progress';
      return 'pending';
    });
    const completed = effectiveStatuses.filter((s) => s === 'completed').length;
    const inProgress = effectiveStatuses.filter((s) => s === 'in_progress').length;
    const skipped = effectiveStatuses.filter((s) => s === 'skipped').length;
    const pending = effectiveStatuses.filter((s) => s === 'pending').length;
    const rewarded = rows.filter((r) => r.reward_given === true).length;
    const analyzed = rows.filter((r) => r.status !== 'pending' || stepSurveyIds.has(r.id) || rowHasMirrorAnswer(r)).length;
    return { total, completed, inProgress, skipped, pending, rewarded, analyzed };
  }, [rows, steps]);

  const distributions = useMemo(() => {
    const stepBySurveyAndQuestion = new Map<string, StepRow>();
    for (const step of steps) {
      if (!step.survey_id || !step.question_key) continue;
      stepBySurveyAndQuestion.set(`${step.survey_id}:${step.question_key}`, step);
    }

    const stepSurveyIds = new Set(steps.map((s) => s.survey_id));
    // Agrega qualquer pesquisa que tenha resposta real, mesmo se o status ficou pendente por falha antiga.
    const answered = rows.filter((r) => r.status !== 'pending' || stepSurveyIds.has(r.id) || rowHasMirrorAnswer(r));
    return SURVEY_QUESTIONS.map((q) => {
      const counts = new Map<string, number>();
      for (const row of answered) {
        const step = stepBySurveyAndQuestion.get(`${row.id}:${q.key}`);
        addCount(counts, normalizeAnswerValue(q, step?.answer_value ?? (row[q.mirrorColumn as keyof Row] as string | null)));
      }
      const totalAnswers = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      const knownValues = new Set(q.options.map((opt) => opt.value));
      const extraItems = Array.from(counts.entries())
        .filter(([value]) => !knownValues.has(value))
        .map(([value, count]) => ({ value, label: value, count }));
      const items = [
        ...q.options.map((opt) => ({
          value: opt.value,
          label: opt.label,
          count: counts.get(opt.value) ?? 0,
        })),
        ...extraItems,
      ]
        .sort((a, b) => b.count - a.count);
      const noteCount = answered.filter((r) => {
        const step = stepBySurveyAndQuestion.get(`${r.id}:${q.key}`);
        const note = step?.answer_note ?? r[q.mirrorNoteColumn as keyof Row];
        return typeof note === 'string' && note.trim().length > 0;
      }).length;
      return { key: q.key, title: q.title, totalAnswers, items, noteCount };
    });
  }, [rows, steps]);

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-pink-500" />
          Resultados das respostas
        </h2>
        <Button variant="ghost" size="sm" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="py-8 grid place-items-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : summary.total === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma resposta registrada ainda.
        </p>
      ) : (
        <>
          {errorMessage && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              {errorMessage}
            </p>
          )}

          {/* Cards de totais */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[
              { label: 'Total', value: summary.total, tone: 'bg-muted/50' },
              { label: 'Pendentes', value: summary.pending, tone: 'bg-blue-500/10 text-blue-500' },
              { label: 'Concluídas', value: summary.completed, tone: 'bg-emerald-500/10 text-emerald-600' },
              { label: 'Em andamento', value: summary.inProgress, tone: 'bg-amber-500/10 text-amber-600' },
              { label: 'Puladas', value: summary.skipped, tone: 'bg-zinc-500/10 text-zinc-500' },
              { label: 'XP entregue', value: summary.rewarded, tone: 'bg-pink-500/10 text-pink-600' },
            ].map((c) => (
              <div key={c.label} className={cn('rounded-xl p-3 text-center', c.tone)}>
                <div className="text-xl font-bold tabular-nums">{c.value}</div>
                <div className="text-[10px] uppercase tracking-wide opacity-80">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">
            Taxa de conclusão:{' '}
            <strong className="text-foreground">{pct(summary.completed, summary.total)}%</strong>
            {' · '}Respostas analisadas:{' '}
            <strong className="text-foreground">{summary.analyzed}</strong>
          </div>

          {/* Distribuição por pergunta */}
          <div className="space-y-4 pt-2">
            {distributions.map((d) => (
              <div key={d.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{d.title}</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {d.totalAnswers} resposta{d.totalAnswers === 1 ? '' : 's'}
                    {d.noteCount > 0 && ` · ${d.noteCount} com nota`}
                  </Badge>
                </div>
                {d.totalAnswers === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem respostas.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.items.map((it) => {
                      const p = pct(it.count, d.totalAnswers);
                      return (
                        <li key={it.value} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate pr-2">{it.label}</span>
                            <span className="tabular-nums text-muted-foreground shrink-0">
                              {it.count} · {p}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-pink-500 to-fuchsia-500"
                              style={{ width: `${p}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
