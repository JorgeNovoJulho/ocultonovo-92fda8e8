import { ShieldCheck, MapPin, MessageCircle, Bell, UserCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    icon: UserCheck,
    title: "Perfis verificados",
    desc: "Selo de verificação para casais e criadores com checagem manual de identidade.",
  },
  {
    icon: MapPin,
    title: "Encontro Seguro",
    desc: "Compartilhe seu encontro com pessoas de confiança e receba alerta automático se não confirmar.",
  },
  {
    icon: Bell,
    title: "Alerta no WhatsApp",
    desc: "Botão de pânico aciona contatos de emergência com sua última localização registrada.",
  },
  {
    icon: MessageCircle,
    title: "Chat com bloqueio em 1 toque",
    desc: "Bloqueie, denuncie ou silencie qualquer perfil — e nunca mais apareça para ele.",
  },
  {
    icon: AlertTriangle,
    title: "Moderação ativa 24/7",
    desc: "Time humano + IA monitorando comportamento suspeito, golpes e perfis falsos.",
  },
  {
    icon: ShieldCheck,
    title: "Sem doxxing",
    desc: "Nome real, telefone, e-mail e documentos nunca são exibidos publicamente. Nunca.",
  },
];

export function SafetySection() {
  return (
    <section className="relative z-10 py-16 sm:py-20 lg:py-24 px-4 sm:px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.04] to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-4 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            Encontros Seguros
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Liberdade com{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-pink-500">
              proteção real
            </span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Conexões adultas exigem segurança adulta. Aqui você decide quando, com quem e em que
            condições — e tem rede de proteção do início ao fim.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 hover:border-primary/40 transition-colors"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-base mb-1.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
