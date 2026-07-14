/**
 * FAQ Index
 * ---------
 * Base de conhecimento de perguntas frequentes da plataforma.
 * As respostas aparecem diretamente no dropdown de busca do header
 * quando a pergunta do usuário coincide com uma entrada.
 *
 * Todas as respostas são em PT-BR e devem ser objetivas e completas.
 */

export interface FaqEntry {
  id: string;
  question: string;
  /** Resposta em markdown leve (suporta quebras de linha, listas com `- `). */
  answer: string;
  section: string;
  icon?: string; // lucide name
  /** Link opcional para a página relacionada. */
  route?: string;
  routeLabel?: string;
  keywords: string[];
}

export const FAQ_INDEX: FaqEntry[] = [
  // ───────── Aura / XP ─────────
  {
    id: 'faq-como-ganhar-xp',
    question: 'Como ganhar XP de Aura?',
    section: 'Aura · XP',
    icon: 'Zap',
    route: '/aura-match',
    routeLabel: 'Ir para Aura Match',
    answer: [
      'Você acumula XP de Aura com atividades sociais diárias:',
      '',
      '- Visite o Aura Match todos os dias — a primeira visita do dia já libera XP automático e mantém seu streak 🔥',
      '- Faça o **check-in diário** no card de streak para um bônus extra',
      '- Complete as **missões diárias** (4 missões aleatórias, +15 a +40 XP cada)',
      '- Envie **Super DMs** e **presentes XP** para outros usuários',
      '- **Receba presentes XP** da comunidade nos seus posts',
      '- Grave sua **bio de áudio** — likes nela viram XP',
      '- Suba no **ranking semanal Top Auras** (bônus aos domingos à meia-noite)',
      '- Participe da **Sala Mineração** — XP por minuto idle, mensagens de qualidade, reações recebidas, convites aceitos e mais',
      '- Mensagens de qualidade no chat (≥12 caracteres, ≥3 palavras distintas) também rendem XP',
    ].join('\n'),
    keywords: [
      'xp','aura','ganhar xp','como ganhar xp','juntar xp','acumular xp','conseguir xp',
      'subir nivel','subir nível','subir de nivel','aura xp','pontos','pontuacao','pontuação',
      'level up','levelup','progressao','progressão','experiencia','experiência',
      'como funciona xp','o que da xp','o que dá xp','atividades xp','missoes','missões',
      'streak','check in','check-in','sala mineracao','sala mineração','mineracao','mineração',
    ],
  },
  {
    id: 'faq-niveis-aura',
    question: 'Como funcionam os níveis de Aura?',
    section: 'Aura · Nível',
    icon: 'Sparkles',
    route: '/aura-match',
    routeLabel: 'Abrir Aura Match',
    answer: [
      'Cada faixa de XP libera um novo nível de Aura, com cor de brilho, perks sociais e badges próprios.',
      '',
      '- O XP acumulado avança a barra do seu nível atual',
      '- Ao completar o XP necessário, você sobe de nível automaticamente',
      '- Cada nível libera **perks sociais** novos (cores, ícones, prioridade no feed e em salas)',
      '- Veja seu progresso em tempo real no painel lateral da Sala Mineração e no seu perfil',
    ].join('\n'),
    keywords: ['nivel','nível','niveis','níveis','aura','progresso','barra','perks','nivel aura'],
  },
  {
    id: 'faq-prestigio',
    question: 'O que é Prestígio Social?',
    section: 'Aura · Prestígio',
    icon: 'Crown',
    answer: [
      'Prestígio Social é uma camada emocional acima do Score Social, com 6 tiers configuráveis.',
      '',
      '- Aparece como badge e card especial no seu perfil',
      '- Evolui conforme suas interações de longo prazo (presentes recebidos, avaliações 5★, depoimentos, conexões reais)',
      '- Diferente do XP de Aura: prestígio é reputação acumulada, não atividade diária',
    ].join('\n'),
    keywords: ['prestigio','prestígio','reputacao','reputação','tiers','badge prestigio'],
  },

  // ───────── Planos / Pagamento ─────────
  {
    id: 'faq-planos',
    question: 'Quais são os planos da plataforma?',
    section: 'Planos · Assinatura',
    icon: 'Crown',
    route: '/subscriptions',
    routeLabel: 'Ver planos',
    answer: [
      'A plataforma oferece três planos:',
      '',
      '- **Grátis** — acesso ao feed, perfil, conexões básicas',
      '- **Premium — R$ 25,90/mês** — radar, matches sem blur, presentes, recursos sociais avançados',
      '- **VIP — R$ 145,90/mês** — tudo do Premium + canais VIP, Acervo VIP, prioridade máxima, monetização completa',
      '',
      'Pagamento via PIX (liberação em segundos) ou cartão de crédito.',
    ].join('\n'),
    keywords: ['planos','assinar','assinatura','premium','vip','preco','preço','quanto custa','valores','mensalidade'],
  },
  {
    id: 'faq-pix',
    question: 'Como pagar com PIX?',
    section: 'Pagamento · PIX',
    icon: 'QrCode',
    route: '/subscriptions',
    answer: [
      'No checkout, escolha **PIX** como forma de pagamento.',
      '',
      '- O QR Code e o código copia-e-cola aparecem na tela',
      '- A liberação é **automática em segundos** após o pagamento',
      '- O sistema monitora o pagamento em tempo real (polling de 3s)',
      '- Se sair da tela e voltar, o status é revalidado automaticamente',
    ].join('\n'),
    keywords: ['pix','pagar pix','qr code','qrcode','copia e cola','pagamento','liberar plano'],
  },
  {
    id: 'faq-cancelar-plano',
    question: 'Como cancelar meu plano?',
    section: 'Planos · Cancelamento',
    icon: 'XCircle',
    route: '/account',
    routeLabel: 'Configurações da conta',
    answer: [
      'Acesse **Configurações da conta → Minha assinatura** e clique em **Cancelar assinatura**.',
      '',
      '- O acesso aos benefícios continua até o fim do ciclo já pago',
      '- Não há cobrança no próximo ciclo',
      '- Você pode reativar a qualquer momento',
    ].join('\n'),
    keywords: ['cancelar','cancelar plano','cancelar assinatura','desativar plano','encerrar assinatura'],
  },

  // ───────── Monetização Creator ─────────
  {
    id: 'faq-ganhar-dinheiro',
    question: 'Como ganhar dinheiro na plataforma?',
    section: 'Monetização · Creator',
    icon: 'DollarSign',
    route: '/earnings',
    routeLabel: 'Abrir Rendimentos',
    answer: [
      'Como creator, você monetiza de várias formas:',
      '',
      '- **Canais VIP** — assinaturas mensais/anuais com conteúdo exclusivo',
      '- **Conteúdo PPV** (pay-per-view) — fotos e vídeos avulsos com paywall',
      '- **Presentes XP e gorjetas** dos fãs',
      '- **Programa de indicações (Madrinhas)** — 5% de comissão',
      '',
      'Split: 6% de imposto → 20% plataforma → 5% afiliado → restante para você. Saque mínimo: R$ 50.',
      'Pré-requisitos: **Asaas Wallet** configurada + **chave PIX** validada.',
    ].join('\n'),
    keywords: ['ganhar dinheiro','monetizar','vender','rendimentos','receita','faturamento','creator','criador','split','comissao','comissão','saque','sacar'],
  },
  {
    id: 'faq-sacar',
    question: 'Como sacar meu saldo?',
    section: 'Financeiro · Saque',
    icon: 'Banknote',
    route: '/earnings',
    answer: [
      'Para sacar:',
      '',
      '- Cadastre uma **chave PIX** validada em Configurações',
      '- Saldo mínimo: **R$ 50,00**',
      '- Solicite o saque na aba **Rendimentos → Extrato**',
      '- Pagamento processado via Asaas em dias úteis',
    ].join('\n'),
    keywords: ['sacar','saque','retirar','pix saque','rendimentos','extrato','saldo','retirar dinheiro'],
  },

  // ───────── Verificação / Segurança ─────────
  {
    id: 'faq-verificacao',
    question: 'Como verificar meu perfil?',
    section: 'Verificação · Selo',
    icon: 'BadgeCheck',
    route: '/profile',
    answer: [
      'Acesse **Meu perfil → Verificação** e siga o fluxo KYC:',
      '',
      '- Foto do documento (frente e verso)',
      '- Selfie segurando o documento (captura nativa pela câmera)',
      '- Análise em até 48h',
      '- Aprovado: você recebe o **selo dourado verificado**',
    ].join('\n'),
    keywords: ['verificar','verificacao','verificação','selo','badge verificado','kyc','documento','rg','cnh','aprovar conta'],
  },
  {
    id: 'faq-modo-fantasma',
    question: 'O que é o Modo Fantasma?',
    section: 'Privacidade · Modo Fantasma',
    icon: 'Ghost',
    answer: [
      'O **Modo Fantasma** (Premium/VIP) torna sua presença anônima:',
      '',
      '- Você visita perfis sem aparecer em "Quem me visitou"',
      '- Seu status online fica oculto',
      '- Pode ser ativado/desativado a qualquer momento no header',
    ].join('\n'),
    keywords: ['modo fantasma','ghost mode','invisivel','invisível','anonimo','anônimo','sem aparecer','privacidade'],
  },
  {
    id: 'faq-bloquear-usuario',
    question: 'Como bloquear um usuário?',
    section: 'Segurança · Bloqueio',
    icon: 'ShieldOff',
    answer: [
      'No perfil do usuário, toque no **menu de 3 pontos** e selecione **Bloquear**.',
      '',
      '- Você não verá mais posts, mensagens ou notificações dessa pessoa',
      '- Ela também não consegue te encontrar ou interagir',
      '- Você pode desbloquear depois em Configurações → Bloqueios',
    ].join('\n'),
    keywords: ['bloquear','bloqueio','banir usuario','silenciar','reportar usuario','denunciar'],
  },

  // ───────── Conteúdo / Posts ─────────
  {
    id: 'faq-criar-post',
    question: 'Como criar um post?',
    section: 'Conteúdo · Publicar',
    icon: 'PlusSquare',
    route: '/create-post',
    answer: [
      'Toque no **+** no menu inferior ou no botão **Criar post**.',
      '',
      '- Adicione fotos ou vídeos (limite de 1920px de largura)',
      '- Use o editor mobile para blur, stickers e marca d\'água',
      '- Escolha tipo: **Público**, **PPV** (pay-per-view) ou **VIP**',
      '- Adicione tags sociais ou adultas para alcance certo',
    ].join('\n'),
    keywords: ['criar post','postar','publicar','novo post','upload','enviar foto','enviar video','vídeo','publicacao','publicação'],
  },
  {
    id: 'faq-stories',
    question: 'Como criar um story?',
    section: 'Conteúdo · Stories',
    icon: 'Camera',
    answer: [
      'No topo do feed, toque no seu avatar ou no **+** dentro do carrossel de stories.',
      '',
      '- Stories ficam visíveis por 24h',
      '- Suportam foto e vídeo curtos',
      '- Você vê quem visualizou cada story',
    ].join('\n'),
    keywords: ['story','stories','flash','24 horas','postar story'],
  },

  // ───────── Conta / Configurações ─────────
  {
    id: 'faq-trocar-senha',
    question: 'Como trocar minha senha?',
    section: 'Conta · Senha',
    icon: 'KeyRound',
    route: '/account',
    answer: [
      'Acesse **Configurações da conta → Segurança → Alterar senha**.',
      '',
      'Esqueceu a senha? Use **"Esqueci minha senha"** na tela de login — enviamos um link para seu e-mail.',
    ].join('\n'),
    keywords: ['senha','trocar senha','mudar senha','alterar senha','esqueci senha','recuperar conta','reset password'],
  },
  {
    id: 'faq-excluir-conta',
    question: 'Como excluir minha conta?',
    section: 'Conta · Exclusão',
    icon: 'Trash2',
    route: '/account',
    answer: [
      'Em **Configurações da conta → Excluir conta**, confirme a exclusão.',
      '',
      '- Todos os seus dados são anonimizados conforme a LGPD',
      '- Operação irreversível',
      '- Saldos pendentes precisam ser sacados antes',
    ].join('\n'),
    keywords: ['excluir conta','deletar conta','apagar conta','encerrar conta','sair de vez','lgpd'],
  },
];
