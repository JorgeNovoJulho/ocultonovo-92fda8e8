/**
 * Perguntas da pesquisa conversacional do OCULTO.
 * Cada chave é gravada em oculto_user_survey_steps.question_key
 * e espelhada na coluna correspondente em oculto_user_surveys.
 */
export type SurveyQuestionOption = { value: string; label: string };

export type SurveyQuestion = {
  key:
    | 'source_channel'
    | 'first_impression'
    | 'main_interest'
    | 'main_friction'
    | 'return_reason';
  step: number;
  /** Coluna espelho em oculto_user_surveys */
  mirrorColumn:
    | 'source_channel'
    | 'first_impression'
    | 'main_interest'
    | 'main_friction'
    | 'return_reason';
  /** Coluna espelho da observação opcional */
  mirrorNoteColumn:
    | 'source_channel_other'
    | 'first_impression_note'
    | 'main_interest_note'
    | 'main_friction_note'
    | 'return_reason_note';
  title: string;
  subtitle?: string;
  options: SurveyQuestionOption[];
  /** Mostra textarea de observação opcional */
  allowNote: boolean;
  notePlaceholder?: string;
  /** Se true, ao escolher esta opção o textarea é obrigatório (usado em "Outro") */
  noteRequiredForValue?: string;
  /** Etapa opcional — só entra se status = 'skipped' (concluir mais tarde) */
  optional?: boolean;
};

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    key: 'source_channel',
    step: 1,
    mirrorColumn: 'source_channel',
    mirrorNoteColumn: 'source_channel_other',
    title: 'Como você chegou ao OCULTO?',
    subtitle: 'Escolha a opção que mais combina.',
    options: [
      { value: 'friend', label: 'Indicação de amigo(a)' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'google', label: 'Pesquisa no Google' },
      { value: 'whatsapp', label: 'Grupo/lista no WhatsApp' },
      { value: 'event', label: 'Evento presencial' },
      { value: 'other', label: 'Outro' },
    ],
    allowNote: true,
    notePlaceholder: 'Conta pra gente onde nos encontrou…',
    noteRequiredForValue: 'other',
  },
  {
    key: 'first_impression',
    step: 2,
    mirrorColumn: 'first_impression',
    mirrorNoteColumn: 'first_impression_note',
    title: 'Qual foi sua primeira impressão?',
    options: [
      { value: 'loved', label: '🤩 Amei, surpreendeu' },
      { value: 'liked', label: '🙂 Gostei, parece legal' },
      { value: 'curious', label: '🤔 Fiquei curioso(a), ainda explorando' },
      { value: 'confused', label: '😕 Achei confuso' },
      { value: 'disliked', label: '😐 Não gostei muito' },
    ],
    allowNote: true,
    notePlaceholder: 'Quer detalhar? (opcional)',
  },
  {
    key: 'main_interest',
    step: 3,
    mirrorColumn: 'main_interest',
    mirrorNoteColumn: 'main_interest_note',
    title: 'O que mais te interessa por aqui?',
    options: [
      { value: 'connections', label: 'Fazer novas conexões' },
      { value: 'events', label: 'Eventos e encontros reais' },
      { value: 'creators', label: 'Conteúdo de criadores' },
      { value: 'community', label: 'Comunidade e grupos' },
      { value: 'monetize', label: 'Ganhar dinheiro como criador' },
      { value: 'curiosity', label: 'Só estou conhecendo' },
    ],
    allowNote: true,
    notePlaceholder: 'Algo específico que você espera? (opcional)',
  },
  {
    key: 'main_friction',
    step: 4,
    mirrorColumn: 'main_friction',
    mirrorNoteColumn: 'main_friction_note',
    title: 'Teve alguma dificuldade até agora?',
    options: [
      { value: 'none', label: 'Nenhuma, tudo tranquilo' },
      { value: 'navigation', label: 'Difícil achar as coisas' },
      { value: 'signup', label: 'Cadastro/onboarding' },
      { value: 'performance', label: 'App lento ou travando' },
      { value: 'content', label: 'Pouco conteúdo na minha região' },
      { value: 'payments', label: 'Dúvidas em pagamentos/assinatura' },
      { value: 'other', label: 'Outro' },
    ],
    allowNote: true,
    notePlaceholder: 'Pode descrever? Ajuda muito.',
    noteRequiredForValue: 'other',
  },
  {
    key: 'return_reason',
    step: 5,
    mirrorColumn: 'return_reason',
    mirrorNoteColumn: 'return_reason_note',
    title: 'O que te faria voltar com mais frequência?',
    options: [
      { value: 'more_people', label: 'Mais gente da minha região' },
      { value: 'more_events', label: 'Mais eventos reais' },
      { value: 'more_content', label: 'Mais conteúdo de criadores' },
      { value: 'better_perf', label: 'App mais rápido/estável' },
      { value: 'rewards', label: 'Recompensas/benefícios' },
      { value: 'other', label: 'Outro' },
    ],
    allowNote: true,
    notePlaceholder: 'Conta pra gente (opcional)',
  },
];

export const SURVEY_TOTAL_REQUIRED = SURVEY_QUESTIONS.filter((q) => !q.optional).length;
