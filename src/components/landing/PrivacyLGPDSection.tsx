import { ShieldCheck, Lock, EyeOff, FileText, Trash2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const PILLARS = [
  {
    icon: Lock,
    title: "Criptografia ponta-a-ponta",
    desc: "Mensagens, áudios e mídias trafegam cifradas. Nem mesmo o servidor consegue ler.",
  },
  {
    icon: EyeOff,
    title: "Modo Fantasma",
    desc: "Visite perfis sem deixar rastros. Aparece em quem você quer e some dos demais.",
  },
  {
    icon: ShieldCheck,
    title: "Verificação +18",
    desc: "Toda conta passa por checagem de idade e identidade — sem expor seu documento publicamente.",
  },
  {
    icon: FileText,
    title: "Conformidade LGPD",
    desc: "Você é o dono dos seus dados. Acesso, correção, exportação e exclusão a qualquer momento.",
  },
  {
    icon: Download,
    title: "Exportação total",
    desc: "Solicite uma cópia completa do seu histórico e mídias em formato aberto, quando quiser.",
  },
  {
    icon: Trash2,
    title: "Exclusão definitiva",
    desc: "Apague sua conta e todos os dados associados em 1 clique. Sem perguntas. Sem retenção.",
  },
];

export function PrivacyLGPDSection() {
  return (
    <section className="relative z-10 py-16 sm:py-20 lg:py-24 px-4 sm:px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.04] to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 px-4 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            Privacidade & LGPD
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Sua{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              privacidade
            </span>{" "}
            é inegociável
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Construímos o OCULTO em cima de regras claras: você controla quem te vê, o que mostra e
            quando some.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 hover:border-emerald-500/40 transition-colors"
              >
                <div className="w-11 h-11 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-base mb-1.5">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            to="/legal/privacidade"
            className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-4 hover:underline"
          >
            Política de Privacidade
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <Link
            to="/legal/lgpd"
            className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-4 hover:underline"
          >
            Central LGPD
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <Link
            to="/legal/termos-de-uso"
            className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-4 hover:underline"
          >
            Termos de Uso
          </Link>
        </div>
      </div>
    </section>
  );
}
