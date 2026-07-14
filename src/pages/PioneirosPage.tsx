import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Users, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useAddToWaitlist } from "@/hooks/useWaitlist";
import { useFounderVagas } from "@/hooks/useCreatorFounders";
import { useWaitlistCount } from "@/hooks/useWaitlist";
import { Logo } from "@/components/Logo";
import { Link } from "react-router-dom";

export default function PioneirosPage() {
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const addToWaitlist = useAddToWaitlist();
  const { data: vagas } = useFounderVagas();
  const { data: waitlistCount } = useWaitlistCount();

  const founderFilled = vagas?.filled ?? 0;
  const founderTotal = vagas?.total ?? 50;
  const founderPct = Math.min((founderFilled / founderTotal) * 100, 100);

  const pioneerTotal = 150;
  const pioneerFilled = Math.min((waitlistCount ?? 0) + founderFilled, pioneerTotal);
  const pioneerPct = Math.min((pioneerFilled / pioneerTotal) * 100, 100);
  const remaining = Math.max(pioneerTotal - pioneerFilled, 0);
  const isCampaignClosed = remaining <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isCampaignClosed) return;
    try {
      const result = await addToWaitlist.mutateAsync({ email, source: "pioneiros" });
      setPosition(result.position);
      setIsSubmitted(true);
    } catch {
      // toast handled by hook
    }
  };

  // Campaign closed state
  if (isCampaignClosed) {
    return (
      <div className="min-h-dvh bg-black text-white">
        <nav className="flex items-center justify-between p-4 sm:p-6 md:px-12">
          <Link to="/">
            <Logo />
          </Link>
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white text-xs">
              Entrar
            </Button>
          </Link>
        </nav>

        <main className="flex flex-col items-center justify-center px-4 sm:px-6 pt-16 sm:pt-24 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl text-center space-y-8"
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.2em] font-semibold border"
              style={{ color: "#D4AF37", borderColor: "#D4AF3740", background: "#D4AF3710" }}
            >
              <Crown className="w-3.5 h-3.5" />
              Campanha Encerrada
            </div>

            <h1
              className="text-2xl sm:text-4xl lg:text-5xl font-black leading-tight tracking-tight"
              style={{ color: "#D4AF37" }}
            >
              AS 150 VAGAS ORIGINAIS
              <br />
              FORAM PREENCHIDAS.
            </h1>

            <p className="text-neutral-400 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
              O segredo agora é público. Seja bem-vindo à nova era do{" "}
              <span className="text-white font-bold">OCULTO</span>.
            </p>

            {/* Progress bars full */}
            <div className="w-full max-w-md mx-auto space-y-4 mt-8">
              <div>
                <div className="flex justify-between text-xs text-neutral-500 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Crown className="w-3 h-3" style={{ color: "#D4AF37" }} />
                    Criadores Founders
                  </span>
                  <span>{founderFilled}/{founderTotal}</span>
                </div>
                <div className="h-2.5 rounded-full bg-neutral-900 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${founderPct}%`,
                      background: "linear-gradient(90deg, #D4AF37, #B8960C)",
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-500 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" style={{ color: "#D4AF37" }} />
                    Pioneiros Originais
                  </span>
                  <span>{pioneerFilled}/{pioneerTotal}</span>
                </div>
                <div className="h-2.5 rounded-full bg-neutral-900 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: "100%",
                      background: "linear-gradient(90deg, #D4AF37, #FFD700)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* CTA to official landing */}
            <Link to="/#plans">
              <Button
                size="lg"
                className="mt-8 h-14 text-base font-black uppercase tracking-wider rounded-xl border-0"
                style={{
                  background: "linear-gradient(135deg, #D4AF37, #B8960C)",
                  color: "#000",
                  boxShadow: "0 0 30px rgba(212,175,55,0.3)",
                }}
              >
                Ver Planos a partir de R$ 25,90
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>

            <div
              className="flex items-center justify-center gap-2 text-xs py-3 px-4 rounded-lg border mt-6"
              style={{ borderColor: "#D4AF3720", color: "#D4AF3780" }}
            >
              <Shield className="w-4 h-4" />
              Garantia de Proteção de Dados (LGPD) — Cadastro 100% Privado
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // Success state after form submission
  if (isSubmitted && position) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md space-y-6"
        >
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-bold" style={{ color: "#D4AF37" }}>
            Você é um dos 150 Originais!
          </h1>
          <div className="p-6 rounded-xl border" style={{ borderColor: "#D4AF3740", background: "#0a0a0a" }}>
            <p className="text-neutral-400 mb-3">Sua posição:</p>
            <div className="text-6xl font-black" style={{ color: "#D4AF37" }}>
              #{position}
            </div>
          </div>
          <p className="text-neutral-500 text-sm">
            Avisaremos por email quando sua vaga for liberada com 25% de desconto na sua primeira assinatura.
          </p>
          <Link to="/">
            <Button variant="ghost" className="text-neutral-400 hover:text-white mt-4">
              ← Voltar ao início
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  // Active campaign - form state
  return (
    <div className="min-h-dvh bg-black text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between p-4 sm:p-6 md:px-12">
        <Link to="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/programa-indicacoes#pioneiros">
            <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white text-xs">
              Conheça o programa de pioneiros
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-white text-xs">
              Entrar
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Text Block */}
      <main className="flex flex-col items-center justify-center px-4 sm:px-6 pt-12 sm:pt-20 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl text-center space-y-8"
        >
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.2em] font-semibold border"
            style={{ color: "#D4AF37", borderColor: "#D4AF3740", background: "#D4AF3710" }}
          >
            <Crown className="w-3.5 h-3.5" />
            Acesso Exclusivo
          </div>

          {/* Main Text */}
          <h1
            className="text-2xl sm:text-4xl lg:text-5xl font-black leading-tight tracking-tight"
            style={{ color: "#D4AF37" }}
          >
            O MUNDO COMUM TEM REGRAS DEMAIS.
            <br />
            O OCULTO TEM APENAS UMA:
            <br />
            <span className="text-white">A CONEXÃO REAL.</span>
          </h1>

          <p className="text-neutral-400 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            Chega de algoritmos genéricos. O nosso{" "}
            <span style={{ color: "#D4AF37" }}>Radar de Proximidade</span>{" "}
            encontra quem partilha seus desejos a poucos metros de você, com
            precisão cirúrgica e sigilo absoluto.
          </p>

          <p
            className="text-lg sm:text-xl font-bold"
            style={{ color: "#D4AF37" }}
          >
            Restam apenas{" "}
            <span className="text-2xl sm:text-3xl font-black text-white">
              {remaining}
            </span>{" "}
            vagas para os 150 pioneiros originais.
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-12 w-full max-w-md space-y-4"
        >
          <Input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-14 text-base bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-[#D4AF37]/30 rounded-xl"
          />
          <Button
            type="submit"
            disabled={addToWaitlist.isPending || !email}
            className="w-full min-h-14 py-3 px-4 text-sm sm:text-base font-black uppercase tracking-wider rounded-xl border-0 whitespace-normal text-center leading-tight"
            style={{
              background: "linear-gradient(135deg, #D4AF37, #B8960C)",
              color: "#000",
              boxShadow: "0 0 30px rgba(212,175,55,0.3)",
            }}
          >
            {addToWaitlist.isPending ? (
              "Processando..."
            ) : (
              <span className="flex items-center justify-center gap-2 flex-wrap">
                <span>Reivindicar meu acesso e 25% de desconto</span>
                <ArrowRight className="w-5 h-5 shrink-0" />
              </span>
            )}
          </Button>
        </motion.form>

        {/* Progress Bars */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-16 w-full max-w-md space-y-6"
        >
          {/* Creators */}
          <div>
            <div className="flex justify-between text-xs text-neutral-500 mb-1.5">
              <span className="flex items-center gap-1">
                <Crown className="w-3 h-3" style={{ color: "#D4AF37" }} />
                Criadores Founders
              </span>
              <span>{founderFilled}/{founderTotal}</span>
            </div>
            <div className="h-2.5 rounded-full bg-neutral-900 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${founderPct}%`,
                  background: "linear-gradient(90deg, #D4AF37, #B8960C)",
                }}
              />
            </div>
          </div>

          {/* Pioneers */}
          <div>
            <div className="flex justify-between text-xs text-neutral-500 mb-1.5">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" style={{ color: "#D4AF37" }} />
                Pioneiros Originais
              </span>
              <span>{pioneerFilled}/{pioneerTotal}</span>
            </div>
            <div className="h-2.5 rounded-full bg-neutral-900 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pioneerPct}%`,
                  background: "linear-gradient(90deg, #D4AF37, #FFD700)",
                }}
              />
            </div>
          </div>

          {/* LGPD Badge */}
          <div
            className="flex items-center justify-center gap-2 text-xs py-3 px-4 rounded-lg border mt-8"
            style={{ borderColor: "#D4AF3720", color: "#D4AF3780" }}
          >
            <Shield className="w-4 h-4" />
            Garantia de Proteção de Dados (LGPD) — Cadastro 100% Privado
          </div>
        </motion.div>
      </main>
    </div>
  );
}
