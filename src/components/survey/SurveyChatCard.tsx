/**
 * SurveyChatCard — Card conversacional passo a passo da pesquisa OCULTO.
 * Renderiza acima do input do chat com ocultomaster.
 *
 * Persiste cada resposta em:
 *  - oculto_user_survey_steps (via upsert)
 *  - coluna espelho em oculto_user_surveys (via patch)
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ClipboardList, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useUserSurvey } from '@/hooks/useUserSurvey';
import { finalizeSurveyReward, markSurveyFlowDone, postSurveyQnaToChat, type SurveyQnaPair } from '@/lib/userSurveyApi';
import { useAuth } from '@/hooks/useAuth';
import { SurveyRewardModal } from '@/components/survey/SurveyRewardModal';
import {
  SURVEY_QUESTIONS,
  SURVEY_TOTAL_REQUIRED,
  type SurveyQuestion,
} from '@/data/userSurveyQuestions';

type Props = {
  onClose?: () => void;
  onCompleted?: () => void;
};

export function SurveyChatCard({ onClose, onCompleted }: Props) {
  const { loading, survey, steps, start, update, saveStep, complete, skip } = useUserSurvey();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Determina pergunta atual: primeira sem resposta registrada
  const answeredKeys = useMemo(() => new Set(steps.map((s) => s.question_key)), [steps]);

  const currentIndex = useMemo(() => {
    const idx = SURVEY_QUESTIONS.findIndex((q) => !answeredKeys.has(q.key));
    return idx === -1 ? SURVEY_QUESTIONS.length : idx;
  }, [answeredKeys]);

  // Estado local da resposta em digitação
  const [stepIndex, setStepIndex] = useState<number>(currentIndex);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardXp, setRewardXp] = useState<number>(200);
  const [rewardBalance, setRewardBalance] = useState<number | null>(null);
  const [rewardConversationId, setRewardConversationId] = useState<string | null>(null);

  // Sincroniza step se respostas anteriores mudarem (realtime)
  useMemo(() => { setStepIndex(currentIndex); }, [currentIndex]);

  const question: SurveyQuestion | null = SURVEY_QUESTIONS[stepIndex] ?? null;
  const totalSteps = SURVEY_QUESTIONS.length;
  const answeredRequired = SURVEY_QUESTIONS.filter(
    (q) => !q.optional && answeredKeys.has(q.key),
  ).length;
  const progressPct = Math.min(
    100,
    Math.round((answeredRequired / SURVEY_TOTAL_REQUIRED) * 100),
  );

  const reset = () => {
    setSelectedValue(null);
    setNote('');
  };

  const handleStart = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Se já existe pesquisa em andamento, apenas avança para a 1ª pergunta
      if (survey && (survey.status === 'in_progress' || survey.status === 'pending')) {
        if (survey.status === 'pending') {
          await update({ status: 'in_progress', started_at: new Date().toISOString() } as any);
        }
        setStepIndex(currentIndex);
        return;
      }
      const s = await start();
      if (!s) {
        toast.error('Não consegui iniciar a pesquisa agora. Tente novamente em instantes.');
        return;
      }
      setStepIndex(0);
    } catch (err) {
      console.warn('[SurveyChatCard] handleStart falhou:', err);
      toast.error('Não consegui iniciar a pesquisa. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (val: string) => {
    setSelectedValue(val);
  };

  const handleNext = async () => {
    if (!question) return;
    if (!selectedValue) {
      toast.error('Escolha uma opção para continuar.');
      return;
    }
    if (
      question.noteRequiredForValue &&
      selectedValue === question.noteRequiredForValue &&
      !note.trim()
    ) {
      toast.error('Por favor, descreva em poucas palavras.');
      return;
    }

    setSaving(true);
    try {
      // Garante survey existente
      if (!survey) {
        const s = await start();
        if (!s) throw new Error('start_failed');
      }

      // Persistência paralela: step + coluna espelho
      const trimmedNote = note.trim() || null;
      await Promise.all([
        saveStep({
          step_number: question.step,
          question_key: question.key,
          answer_type: 'choice',
          answer_value: selectedValue,
          answer_note: trimmedNote,
        }),
        update({
          [question.mirrorColumn]: selectedValue,
          [question.mirrorNoteColumn]: trimmedNote,
        } as any),
      ]);

      reset();

      const nextIdx = stepIndex + 1;
      const remainingRequired = SURVEY_QUESTIONS.slice(nextIdx).some((q) => !q.optional);

      if (!remainingRequired) {
        const completed = await complete();
        markSurveyFlowDone(user?.id);

        // Monta o histórico Q&A (pergunta do master + resposta do usuário) em
        // ordem e grava na conversa para virar parte do chat.
        try {
          const surveyIdForQna = completed?.id ?? survey?.id;
          if (surveyIdForQna) {
            // Inclui também o par recém-respondido (ainda não está em `steps`)
            const justAnswered = {
              question_key: question.key,
              answer_value: selectedValue,
              answer_note: trimmedNote,
            };
            const allAnswers = new Map<string, { value: string | null; note: string | null }>();
            for (const s of steps) {
              allAnswers.set(s.question_key, {
                value: s.answer_value ?? null,
                note: s.answer_note ?? null,
              });
            }
            allAnswers.set(justAnswered.question_key, {
              value: justAnswered.answer_value ?? null,
              note: justAnswered.answer_note ?? null,
            });

            const pairs: SurveyQnaPair[] = [];
            for (const q of SURVEY_QUESTIONS) {
              const ans = allAnswers.get(q.key);
              if (!ans || !ans.value) continue;
              const opt = q.options.find((o) => o.value === ans.value);
              const answerLabel = opt?.label ?? ans.value;
              pairs.push({
                question: q.title,
                answer: answerLabel,
                note: ans.note,
              });
            }
            if (pairs.length > 0) {
              await postSurveyQnaToChat(surveyIdForQna, pairs);
            }
          }
        } catch (e) {
          console.warn('[SurveyChatCard] postSurveyQnaToChat falhou:', e);
        }

        // Concede +200 XP (idempotente) e dispara mensagem final do master
        try {
          const surveyIdToFinalize = completed?.id ?? survey?.id;
          if (surveyIdToFinalize) {
            const result = await finalizeSurveyReward(surveyIdToFinalize);
            if (result.ok) {
              markSurveyFlowDone(user?.id);
              setRewardXp(result.xp_amount ?? 200);
              setRewardBalance(typeof result.new_balance === 'number' ? result.new_balance : null);
              setRewardConversationId(result.conversation_id ?? null);
              setRewardOpen(true);
            } else {
              toast.success('Obrigado! Suas respostas foram registradas. 💜');
            }
          } else {
            toast.success('Obrigado! Suas respostas foram registradas. 💜');
          }
        } catch (e) {
          console.warn('[SurveyChatCard] finalize falhou:', e);
          toast.success('Obrigado! Suas respostas foram registradas. 💜');
        }
        onCompleted?.();
        return;
      }

      setStepIndex(nextIdx);
    } catch (err) {
      console.warn('[SurveyChatCard] saveStep falhou:', err);
      toast.error('Não consegui salvar agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (stepIndex === 0) return;
    setStepIndex((i) => Math.max(0, i - 1));
    reset();
  };

  const handleSkip = async () => {
    try {
      await skip();
      toast.message('Sem problemas, você pode responder depois.');
      onClose?.();
    } catch {
      onClose?.();
    }
  };

  // Modal de recompensa fica disponível mesmo após a pesquisa fechar
  const rewardModalNode = (
    <SurveyRewardModal
      open={rewardOpen}
      onClose={() => setRewardOpen(false)}
      xpAmount={rewardXp}
      newBalance={rewardBalance}
      onOpenChat={() => {
        if (rewardConversationId) navigate(`/messages?c=${rewardConversationId}`);
        else navigate('/messages');
      }}
    />
  );

  // Estados de UI
  if (loading) return rewardModalNode;

  // Survey concluída — só renderiza o modal de recompensa, se aberto
  if (survey?.status === 'completed' || survey?.status === 'skipped') return rewardModalNode;

  // Card de convite (antes do start)
  if (!survey || survey.status === 'pending') {
    return (
      <>
        {rewardModalNode}
        <div className="mx-2 mb-2 rounded-2xl border-2 border-primary/70 bg-gradient-to-br from-primary/25 via-fuchsia-500/20 to-primary/10 dark:from-primary/30 dark:via-fuchsia-500/25 dark:to-primary/15 p-3 shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.4)] ring-1 ring-primary/30">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary text-primary-foreground p-2 shrink-0 shadow-md">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <Badge className="mb-1.5 text-[10px] bg-primary text-primary-foreground border-0 shadow-sm">
                Pesquisa rápida · 5 perguntas
              </Badge>
              <p className="text-sm font-semibold leading-tight text-foreground">
                Pode responder 5 perguntinhas? Ajuda demais a melhorar o OCULTO. 💜
              </p>
              <div className="mt-2.5 flex gap-2 items-center">
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={saving}
                  className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
                >
                  {saving ? 'Abrindo…' : 'Começar agora'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={saving}
                  className="h-8 text-foreground/80 hover:text-foreground hover:bg-background/60"
                >
                  Agora não
                </Button>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  if (!question) return rewardModalNode;

  const isLastRequired =
    !SURVEY_QUESTIONS.slice(stepIndex + 1).some((q) => !q.optional);

  return (
    <>
      {rewardModalNode}
      <div
        className="mx-2 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-primary/30 bg-card/95 shadow-sm backdrop-blur"
        style={{
          maxHeight: 'clamp(170px, calc(100dvh - 15.5rem - env(safe-area-inset-bottom)), 420px)',
          marginBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="shrink-0 p-2 pb-1.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <Badge variant="secondary" className="text-[10px] leading-none">
              Pergunta {Math.min(stepIndex + 1, totalSteps)} de {totalSteps}
            </Badge>
            <button
              onClick={handleSkip}
              className="text-[11px] leading-none text-muted-foreground hover:text-foreground"
            >
              Pular pesquisa
            </button>
          </div>

          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="sticky top-0 z-10 bg-card/95 pb-1.5 backdrop-blur">
            <p className="text-sm font-semibold leading-snug">{question.title}</p>
            {question.subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{question.subtitle}</p>
            )}
          </div>

          <div className="mt-1.5 grid grid-cols-1 gap-1 min-[360px]:grid-cols-2">
            {question.options.map((opt) => {
              const active = selectedValue === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'min-h-8 rounded-xl border px-2.5 py-1.5 text-left text-xs leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {question.allowNote && (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={question.notePlaceholder ?? 'Observação (opcional)'}
              rows={2}
              maxLength={500}
              className="mt-2 min-h-[58px] text-sm resize-none"
            />
          )}
        </div>

      <div className="z-20 shrink-0 flex items-center justify-between gap-2 border-t border-border/50 bg-card/95 p-2 shadow-[0_-8px_18px_-16px_hsl(var(--foreground)/0.45)] backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={stepIndex === 0 || saving}
          className="h-8 px-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Button
          size="sm"
          onClick={handleNext}
          disabled={!selectedValue || saving}
          className="h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
        >
          {isLastRequired ? (
            <>
              <Check className="h-4 w-4 mr-1" /> Concluir
            </>
          ) : (
            <>
              Próxima <ArrowRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
      </div>
    </>
  );
}

export default SurveyChatCard;
