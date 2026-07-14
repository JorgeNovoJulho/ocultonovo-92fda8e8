import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckCircle2, Lightbulb, ChevronLeft, ChevronRight, Circle, HelpCircle } from "lucide-react";
import { getDiscoveryIcon } from "./discoveryIcons";
import { markSlideGuideViewed } from "@/lib/slideGuideViewed";
import { useSlideGuide } from "@/hooks/useSlideGuide";
import type { DiscoverySlide } from "@/data/discoveryUniverseSlides";

interface PreviewOverride {
  slug?: string;
  title?: string | null;
  intro?: string | null;
  steps?: string[] | null;
  tip?: string | null;
  faq?: { q: string; a: string }[] | null;
  cta_label?: string | null;
  cta_route?: string | null;
  is_published?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slide: DiscoverySlide;
  onCta?: () => void;
  /** Quando passado, usa este conteúdo direto (ex: pré-visualização no admin) e
   *  não persiste o estado "Visto". */
  previewOverride?: PreviewOverride;
}

interface FaqItem { q: string; a: string; }
interface SlideGuide {
  intro: string;
  steps: string[];
  tip?: string;
  faq?: FaqItem[];
}

const GUIDES: Record<string, SlideGuide> = {
  'aura-match': {
    intro: 'Aura Match conecta você a pessoas com energia compatível em salas temáticas em tempo real.',
    steps: [
      'Entre numa sala (Casais, Singles, LGBTQIA+, Ménage, Livre).',
      'Sua aura é exibida de forma anônima — sem nomes reais.',
      'Envie um Pulso para chamar atenção de quem te interessa.',
      'Se houver match mútuo, abre um chat privado E2EE.',
    ],
    tip: 'Quanto mais ativo na sala, mais visível sua aura fica.',
    faq: [
      { q: 'Meu nome real aparece?', a: 'Não. Auras são anônimas até você decidir revelar.' },
      { q: 'Posso entrar em mais de uma sala?', a: 'Sim, mas sua presença ativa fica numa de cada vez.' },
      { q: 'Existe limite de Pulsos?', a: 'Sim, conforme seu plano. VIP tem mais e desbloqueia tipos raros.' },
    ],
  },
  'salas': {
    intro: 'Salas temáticas são espaços ao vivo onde pessoas com interesses similares se encontram.',
    steps: [
      'Escolha a sala pelo perfil (ex: Casais, Singles).',
      'Veja quem está online agora e a aura coletiva.',
      'Participe do chat aberto ou envie Pulsos diretos.',
      'Saia quando quiser — seu histórico fica salvo.',
    ],
    tip: 'Cada sala tem regras próprias. Respeite o clima do grupo.',
    faq: [
      { q: 'O histórico some quando saio?', a: 'Não. Todas as mensagens permanecem para você consultar depois.' },
      { q: 'Posso ser banido de uma sala?', a: 'Sim, por moderação automática ou denúncias válidas.' },
    ],
  },
  'radar': {
    intro: 'O Radar mostra de forma abstrata quem está perto, sem revelar localização exata.',
    steps: [
      'Ative seu Radar (Premium/VIP).',
      'Veja chamas representando auras próximas.',
      'Toque numa chama para enviar um Pulso anônimo.',
      'Se a pessoa retornar, vocês conversam.',
    ],
    tip: 'A posição é aproximada e rotaciona — sua privacidade é prioridade.',
    faq: [
      { q: 'Alguém vê meu endereço?', a: 'Nunca. Mostramos só ângulos abstratos, não coordenadas reais.' },
      { q: 'Qual o raio do Radar?', a: 'Cerca de 200 km, com prioridade para auras mais próximas.' },
    ],
  },
  'chat': {
    intro: 'Conversas privadas com criptografia ponta-a-ponta (E2EE) AES-256.',
    steps: [
      'Abra um chat após um match ou Super DM.',
      'Envie texto, áudio, imagens e PDFs.',
      'Mensagens podem ter auto-destruição.',
      'Bloqueie ou denuncie a qualquer momento.',
    ],
    tip: 'Nem nós conseguimos ler suas mensagens — só você e o destinatário.',
    faq: [
      { q: 'Onde ficam as chaves?', a: 'Apenas no seu dispositivo. Sem chave, ninguém lê.' },
      { q: 'Posso recuperar mensagens auto-destruídas?', a: 'Não. Esse é o ponto da função.' },
    ],
  },
  'criar-post': {
    intro: 'Publique no feed e ganhe visibilidade, seguidores e XP de Prestígio.',
    steps: [
      'Toque em "Criar Post".',
      'Adicione imagens, vídeo, texto ou enquete.',
      'Defina visibilidade: público, seguidores ou VIP.',
      'Acompanhe curtidas, comentários e visitas.',
    ],
    tip: 'Posts consistentes (1-2 por dia) sobem mais no feed.',
    faq: [
      { q: 'Posso editar depois?', a: 'Sim, mas o algoritmo considera a data original.' },
      { q: 'Posts VIP aparecem no feed público?', a: 'Não, ficam restritos a assinantes do seu plano.' },
    ],
  },
  'vitrine-vip': {
    intro: 'A Vitrine VIP é o catálogo público dos criadores premium da plataforma.',
    steps: [
      'Navegue pelos criadores em destaque.',
      'Veja prévias de trailer e acervo.',
      'Assine para acessar o conteúdo completo.',
      'Receba novidades direto dos criadores assinados.',
    ],
    faq: [
      { q: 'Como entrar na Vitrine?', a: 'Criadores VIP com perfil completo e KYC entram automaticamente.' },
    ],
  },
  'canais-vip': {
    intro: 'Canais VIP são feeds exclusivos dos criadores para assinantes.',
    steps: [
      'Assine o plano do criador.',
      'Receba posts, vídeos e lives exclusivas.',
      'Converse direto com o criador.',
      'Cancele quando quiser nos seus planos.',
    ],
    faq: [
      { q: 'Posso cancelar a qualquer momento?', a: 'Sim, pelo menu Meus Planos, sem multa.' },
    ],
  },
  'monetizar': {
    intro: 'Transforme seu perfil em renda: assinaturas, PPV, presentes e leilões.',
    steps: [
      'Cadastre sua chave PIX e dados fiscais.',
      'Crie planos de assinatura (mensal/anual).',
      'Publique conteúdo pago (PPV) individual.',
      'Acompanhe seu extrato e saque a partir de R$ 250.',
    ],
    tip: 'Split automático: 20% plataforma → 6% impostos → 5% afiliado (quando houver) → 69% criador.',
    faq: [
      { q: 'Qual valor mínimo de saque?', a: 'R$ 250,00 via PIX.' },
      { q: 'Como funciona o split?', a: '20% plataforma, 6% impostos, 5% afiliado (quando houver) e 69% para o criador.' },
      { q: 'Quanto tempo até o dinheiro liberar?', a: '7 dias após a confirmação do pagamento.' },
    ],
  },
  'plano-vip': {
    intro: 'O plano VIP libera todos os recursos premium da plataforma.',
    steps: [
      'Borda dourada e selo verificado no perfil.',
      'Radar e Aura Match sem limites.',
      'Pulsos raros e prioridade no feed.',
      'Modo Fantasma (anonimato premium).',
    ],
    faq: [
      { q: 'Posso testar o VIP grátis?', a: 'Cupons promocionais aparecem em campanhas pontuais.' },
    ],
  },
  'eventos': {
    intro: 'Eventos VIP são encontros presenciais organizados por criadores e pela plataforma.',
    steps: [
      'Veja a agenda na aba Eventos.',
      'Confirme presença (RSVP).',
      'Entre no grupo de chat do evento.',
      'Avalie de 1 a 5 estrelas no final.',
    ],
    faq: [
      { q: 'É seguro?', a: 'Use o Check-in de Encontro Seguro para avisar um contato de confiança.' },
    ],
  },
  'leiloes': {
    intro: 'Leilões em tempo real para conteúdos, encontros e itens exclusivos.',
    steps: [
      'Cadastre um cartão para pré-autorização.',
      'Dê seu lance — atualização ao vivo.',
      'Anti-sniping: lances no final estendem 2 min.',
      'Vencedor é cobrado automaticamente.',
    ],
    faq: [
      { q: 'Sou cobrado se perder?', a: 'Não. A pré-autorização é liberada em até 7 dias.' },
    ],
  },
  'conquistas': {
    intro: 'Sistema de medalhas e marcos que celebra sua jornada na plataforma.',
    steps: [
      'Cada interação desbloqueia conquistas.',
      'Conquistas dão XP extra de Prestígio.',
      'Veja seu painel em "Conquistas".',
      'Algumas são raras — colecione todas.',
    ],
    faq: [
      { q: 'Conquistas expiram?', a: 'Não. Uma vez desbloqueadas, são suas para sempre.' },
    ],
  },
  'prestigio': {
    intro: 'Prestígio Social é a camada emocional sobre seu Score — mostra sua autoridade na rede.',
    steps: [
      'Acumule XP com ações autênticas.',
      'Suba de tier para desbloquear perks.',
      'Tiers altos ganham destaque visual.',
      'Veja sua trilha completa no perfil.',
    ],
    tip: 'Verificação + perfil completo = +300 XP de cara.',
    faq: [
      { q: 'XP pode diminuir?', a: 'Sim, em casos de denúncia válida, chargeback ou bloqueio.' },
    ],
  },
  'encontro-seguro': {
    intro: 'Sistema de Check-in que avisa um contato de confiança durante seus encontros.',
    steps: [
      'Defina um contato de emergência (WhatsApp).',
      'Antes do encontro, faça o Check-in.',
      'Se não confirmar segurança, o contato é avisado.',
      'Tudo confidencial e opcional.',
    ],
    tip: 'Sua segurança vem primeiro — use sempre que sair com alguém novo.',
    faq: [
      { q: 'O contato vê detalhes da pessoa?', a: 'Não. Só recebe um alerta para te procurar.' },
    ],
  },
  'bio-audio': {
    intro: 'A Bio de Áudio é uma gravação curta (até 30s) que toca direto no seu perfil. Ela transmite emoção, sotaque e personalidade — algo que texto e foto nunca conseguem.',
    steps: [
      'Acesse seu perfil e toque em "Gravar bio de áudio".',
      'Grave até 30 segundos — diga seu nome, um cumprimento ou algo marcante.',
      'Ouça antes de salvar. Pode regravar quantas vezes quiser.',
      'Quem visitar seu perfil pode tocar o áudio com 1 toque.',
    ],
    tip: 'Perfis com bio de áudio recebem em média 3x mais interações. Seja autêntico — voz natural converte mais que voz "produzida".',
    faq: [
      { q: 'Qual a duração máxima?', a: '30 segundos. O suficiente para uma impressão marcante sem cansar.' },
      { q: 'Posso apagar depois?', a: 'Sim, a qualquer momento pelo mesmo painel do perfil.' },
      { q: 'É público para todos?', a: 'Sim, qualquer visitante do seu perfil pode ouvir.' },
      { q: 'Funciona no Free?', a: 'Sim! Bio de áudio está liberada para todos os planos.' },
    ],
  },
  'webapp-update': {
    intro: 'As atualizações do WebApp substituem arquivos antigos em cache pela versão mais recente publicada, corrigindo travamentos, cards quebrados e telas desatualizadas sem apagar sua conta.',
    steps: [
      'O card compara a sua versão instalada com a versão disponível no servidor em tempo real.',
      'Se houver diferença, toque em “Atualizar agora” para limpar apenas arquivos antigos do app e recarregar a versão mais nova.',
      'Seu login, conversas, perfil e preferências continuam intactos durante a atualização.',
      'Sempre que um ajuste importante for publicado, atualizar garante que você veja o feed e os recursos corretamente.',
    ],
    tip: 'Atualizar o WebApp é a forma mais rápida de receber correções visuais, melhorias de desempenho e evitar cache antigo preso no navegador.',
    faq: [
      { q: 'A atualização apaga minha conta?', a: 'Não. Ela só renova os arquivos do app no navegador e preserva login, perfil, chats e preferências.' },
      { q: 'Quando devo atualizar?', a: 'Sempre que o card mostrar “Desatualizado”, quando algo parecer antigo ou depois de uma correção importante publicada.' },
      { q: 'Por que existe versão atual e disponível?', a: 'A versão atual é a que está no seu aparelho agora. A disponível é a última publicada no servidor.' },
    ],
  },
  'first-post': {
    intro: 'Sua primeira publicação é o passo que liga seu perfil ao feed. Sem ela, o algoritmo não tem como te entregar para outras pessoas — e você fica praticamente invisível na plataforma.',
    steps: [
      'Toque em "Publicar agora" — o modal de criação abre direto aqui no feed.',
      'Escreva uma frase curta sobre você ou adicione uma foto/vídeo. Texto puro também conta.',
      'Defina a visibilidade: público (mais alcance), seguidores ou VIP.',
      'Toque em "Publicar". Pronto — você entra no feed e começa a aparecer para outras pessoas.',
    ],
    tip: 'Perfis sem nenhuma publicação têm até 90% menos visitas. A primeira postagem é o gatilho que liga o algoritmo a favor do seu perfil.',
    faq: [
      { q: 'Preciso postar foto?', a: 'Não. Texto puro, áudio, vídeo ou enquete também valem como primeira publicação.' },
      { q: 'Posso apagar depois?', a: 'Sim, a qualquer momento — mas a primeira postagem já basta para destravar o algoritmo.' },
      { q: 'É público para todo mundo?', a: 'Você escolhe a visibilidade na hora de publicar: público, só seguidores ou só VIP.' },
      { q: 'Por que esse card aparece para mim?', a: 'Porque você ainda não fez nenhuma publicação. Assim que postar, este card some automaticamente.' },
    ],
  },
  'mineracao-room': {
    intro: 'A Sala Mineração é a sala de retenção do Aura Match: quanto mais você permanece e conversa de verdade, mais XP você minera. Cada minuto conectado, cada mensagem genuína e cada interação recebida vira pontuação direta no seu perfil.',
    steps: [
      'Atinja os requisitos mínimos: Aura nível 2, Score Social 500 e Prestígio 500 XP.',
      'Toque em "Entrar na Mineração". Se cumprir os requisitos, você entra direto; senão, a tela mostra exatamente o que falta.',
      'Permaneça na sala: a cada minuto conectado você ganha +1 XP automaticamente.',
      'Converse com qualidade: mensagens com 12+ caracteres, 3+ palavras distintas e sem repetição valem +1 XP cada.',
      'Receba interações: pulso (+1), destaque (+5), like (+2), reação (+1), menção respondida (+2).',
      'Convide outras pessoas: quando o convidado entra na sala, você ganha +5 XP.',
    ],
    tip: 'A sala tem proteção anti-bot: mensagens curtas como "oi" ou "kk", repetições e flood (mais de uma msg a cada 20s) NÃO geram XP. Vale conversar de verdade. Dislike recebido desconta -3 XP, mas seu saldo nunca fica negativo.',
    faq: [
      { q: 'Por que tem requisitos?', a: 'A Sala Mineração é premiada — recompensa em XP é alta. Os requisitos garantem que só membros engajados (e não bots/novatos) entrem.' },
      { q: 'Como conseguir Aura nível 2?', a: 'Faça check-in diário no Aura Match, entre em salas regulares e receba pulsos/destaque. O XP de aura aumenta naturalmente com presença.' },
      { q: 'Como aumentar o Score Social?', a: 'Publique no feed e mantenha consistência. Cada curtida, comentário e compartilhamento que você recebe soma pontos.' },
      { q: 'Como ganhar Prestígio?', a: 'Conexões reais, avaliações 5 estrelas, depoimentos recebidos, eventos VIP e missões da plataforma elevam seu prestígio.' },
      { q: 'Posso ficar minerando ausente?', a: 'Não. Se a aba fica oculta ou você sai da sala, o tick por minuto pausa automaticamente.' },
      { q: 'Existe limite diário?', a: 'Não há cap fixo, mas a economia é controlada por idempotência server-side — não dá para "farmar" mais de 1 mensagem por 20s ou repetir conteúdo.' },
    ],
  },

};

const FALLBACK: SlideGuide = {
  intro: 'Conheça mais sobre este recurso da plataforma.',
  steps: ['Toque no botão principal para começar.', 'Explore as opções.', 'Volte sempre que precisar.'],
};

export function SlideInfoDialog({ open, onOpenChange, slide, onCta, previewOverride }: Props) {
  const Icon = getDiscoveryIcon(slide.icon);
  const isPreview = !!previewOverride;
  const { data: dbOverride } = useSlideGuide(isPreview ? null : slide.slug);
  const override = previewOverride ?? dbOverride;

  const guide: SlideGuide = useMemo(() => {
    const base = GUIDES[slide.slug] || FALLBACK;
    if (!override) return base;
    return {
      intro: override.intro || base.intro,
      steps: override.steps && override.steps.length > 0 ? override.steps : base.steps,
      tip: override.tip ?? base.tip,
      faq: override.faq && override.faq.length > 0 ? override.faq : base.faq,
    };
  }, [override, slide.slug]);

  const ctaLabel = override?.cta_label || slide.ctaLabel || 'Começar';

  // Stepper
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setCompleted(false);
    }
  }, [open, slide.slug]);

  const total = guide.steps.length;
  const isLast = step >= total - 1;
  const progressPct = total > 0 ? Math.round(((step + 1) / total) * 100) : 100;

  const handleClose = (next: boolean) => {
    if (!next && !isPreview) markSlideGuideViewed(slide.slug);
    onOpenChange(next);
  };

  const handleNext = () => {
    if (isLast) {
      setCompleted(true);
      if (!isPreview) markSlideGuideViewed(slide.slug);
    } else {
      setStep(s => Math.min(total - 1, s + 1));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="
          w-[calc(100vw-0.5rem)] sm:w-full max-w-[96vw] sm:max-w-md
          max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden
          p-3 sm:p-6 rounded-2xl
          [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          break-words
        "
      >
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
            <span className="inline-flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shrink-0">
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{override?.title || slide.title}</span>
          </DialogTitle>
          <DialogDescription className="text-[13px] sm:text-xs leading-relaxed break-words">
            {guide.intro}
          </DialogDescription>
        </DialogHeader>


        {/* Stepper */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Passo {Math.min(step + 1, total)} de {total}
            </p>
            <span className="text-[11px] font-medium text-primary tabular-nums">{progressPct}%</span>
          </div>

          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Dots clicáveis */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {guide.steps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Ir para passo ${i + 1}`}
                className={`h-7 w-7 sm:h-6 sm:w-6 rounded-full text-[11px] font-semibold transition
                  ${i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step || completed
                      ? 'bg-primary/30 text-primary'
                      : 'bg-muted text-muted-foreground'}
                `}
              >
                {i + 1}
              </button>
            ))}
            {completed && (
              <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
              </span>
            )}
          </div>

          {/* Conteúdo do passo atual */}
          <div className="mt-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:p-4 min-h-[68px]">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                {step + 1}
              </span>
              <p className="flex-1 text-[13.5px] sm:text-[13px] text-foreground/90 leading-snug">
                {guide.steps[step]}
              </p>
            </div>
          </div>

          {/* Nav */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="h-9 px-2 sm:px-3 shrink-0"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden xs:inline sm:inline">Voltar</span>
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="h-9 px-3 sm:px-4 shrink-0"
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  <span className="truncate">{completed ? 'Concluído' : 'Marcar concluído'}</span>
                </>
              ) : (
                <>
                  Avançar <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>

        </div>

        {guide.tip && (
          <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-[12.5px] sm:text-[11.5px] text-foreground/85 leading-relaxed flex gap-2">
            <Lightbulb className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <span><span className="font-semibold text-primary">Dica:</span> {guide.tip}</span>
          </div>
        )}

        {/* FAQ */}
        {guide.faq && guide.faq.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5" /> Perguntas frequentes
            </p>
            <Accordion type="single" collapsible className="w-full">
              {guide.faq.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-border/50">
                  <AccordionTrigger className="text-[13px] sm:text-[12.5px] py-2.5 text-left hover:no-underline gap-2">
                    <span className="flex items-start gap-2 min-w-0 flex-1">
                      <Circle className="h-2 w-2 mt-1.5 shrink-0 fill-primary text-primary" />
                      <span className="break-words min-w-0">{f.q}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-[12.5px] sm:text-[12px] text-muted-foreground leading-relaxed pl-4 break-words">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

          </div>
        )}

        <DialogFooter className="mt-4 flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            className="w-full sm:w-auto h-11 sm:h-10 text-sm"
          >
            Fechar
          </Button>
          {onCta && (
            <Button
              onClick={() => {
                if (!isPreview) markSlideGuideViewed(slide.slug);
                onOpenChange(false);
                onCta();
              }}
              className="w-full sm:w-auto h-11 sm:h-10 text-sm font-semibold"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {ctaLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
