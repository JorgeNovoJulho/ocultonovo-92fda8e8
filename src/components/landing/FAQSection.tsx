import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FAQItem {
  q: string;
  a: string;
}

const DEFAULT_FAQ: FAQItem[] = [
  {
    q: "O OCULTO é seguro e discreto?",
    a: "Sim. Usamos verificação +18, modo fantasma, criptografia ponta-a-ponta nas mensagens e nunca exibimos seu nome real, e-mail ou documentos para outros usuários. Você controla exatamente o que aparece no seu perfil.",
  },
  {
    q: "Quanto custa começar?",
    a: "Você pode criar uma conta 100% grátis e usar o feed, mensagens, matches e o Radar com limites. Os planos Premium e VIP desbloqueiam recursos avançados como Modo Fantasma, áudio/vídeo no chat, eventos VIP e monetização de conteúdo.",
  },
  {
    q: "Posso ganhar dinheiro como criador(a)?",
    a: "Sim. O plano VIP permite vender assinaturas, conteúdo PPV (pague-para-ver), criar leilões e eventos pagos. Do valor de cada venda: a plataforma fica com 20%, impostos representam 6% e o indicador (quando houver) recebe 5% — o restante vai para o criador, podendo chegar a 74% do total. Saques via PIX a partir de R$ 250.",
  },
  {
    q: "Como funciona o programa de indicações?",
    a: "Ao convidar amigos com seu link, você recebe 5% de comissão recorrente sobre tudo que eles assinarem ou comprarem na plataforma. Os saques caem direto no seu PIX.",
  },
  {
    q: "Vocês cumprem a LGPD?",
    a: "Totalmente. Seus dados pessoais (nome real, CPF, documentos) ficam criptografados e nunca são expostos. Você pode solicitar exportação ou exclusão a qualquer momento na Central de Privacidade.",
  },
  {
    q: "É liberado para casais?",
    a: "Sim. Casais liberais têm uma área exclusiva com perfis verificados, eventos privados, tags específicas (ménage, swing, voyeur) e filtros avançados no Radar.",
  },
  {
    q: "Como posso cancelar?",
    a: "A qualquer momento, direto no painel. Sem multa, sem fidelidade. Sua conta volta automaticamente para o plano gratuito ao fim do período pago.",
  },
];

interface FAQSectionProps {
  items?: FAQItem[];
  title?: string;
  subtitle?: string;
}

export function FAQSection({
  items = DEFAULT_FAQ,
  title = "Perguntas frequentes",
  subtitle = "Tudo que você precisa saber antes de entrar",
}: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative z-10 py-16 sm:py-20 lg:py-24 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-4 py-1.5">
            <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
            FAQ
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">{title}</h2>
          <p className="text-base sm:text-lg text-muted-foreground">{subtitle}</p>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border bg-card/60 backdrop-blur-sm transition-all duration-300",
                  isOpen
                    ? "border-primary/40 shadow-[0_0_30px_rgba(255,0,127,0.08)]"
                    : "border-border/40 hover:border-border"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-4 sm:py-5"
                  aria-expanded={isOpen}
                >
                  <span className="font-semibold text-sm sm:text-base text-foreground">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-300",
                      isOpen && "rotate-180 text-primary"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 sm:px-6 pb-5 text-sm sm:text-base text-muted-foreground leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Outras dúvidas?{" "}
          <a
            href="/legal/termos-de-uso"
            className="text-primary hover:underline font-medium"
          >
            Termos
          </a>{" "}
          ·{" "}
          <a
            href="/legal/privacidade"
            className="text-primary hover:underline font-medium"
          >
            Privacidade
          </a>
        </p>
      </div>
    </section>
  );
}

export const LANDING_FAQ_ITEMS = DEFAULT_FAQ;
