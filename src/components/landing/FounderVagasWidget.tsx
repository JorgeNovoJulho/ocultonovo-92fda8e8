import { useState } from "react";
import { useFounderVagas } from "@/hooks/useCreatorFounders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CreatorFounderApplicationForm } from "@/components/CreatorFounderApplicationForm";

export function FounderVagasWidget() {
  const [formOpen, setFormOpen] = useState(false);
  const { data: vagas, isLoading } = useFounderVagas();

  if (isLoading) return null;

  const filled = vagas?.filled ?? 0;
  const total = vagas?.total ?? 50;
  const isFull = vagas?.is_full ?? false;
  const percentage = Math.min((filled / total) * 100, 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7 }}
      className="relative z-10 py-16 sm:py-20"
    >
      <div className="container mx-auto px-4 sm:px-6 max-w-2xl">
        <div className="relative rounded-2xl border border-amber-500/30 bg-gradient-to-br from-background via-background to-amber-950/20 p-8 sm:p-10 text-center overflow-hidden">
          {/* Glow */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-60 bg-amber-500/10 rounded-full blur-[100px]" />

          <Badge className="mb-4 bg-gradient-to-r from-amber-600/80 to-yellow-500/80 text-white border-0 text-xs uppercase tracking-widest">
            <Crown className="w-3 h-3 mr-1" /> Programa Exclusivo
          </Badge>

          <h2 className="text-2xl sm:text-3xl font-black mb-2 text-foreground">
            Creator Founders
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mb-6 max-w-md mx-auto">
            50 vagas exclusivas para criadores pioneiros, ganhe <strong>1 ano de isenção da mensalidade</strong>, no plano VIP Creator Anual.
          </p>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{filled} de {total} vagas preenchidas</span>
              <span>{Math.round(percentage)}%</span>
            </div>
            <Progress value={percentage} className="h-3 bg-muted" />
          </div>

          <p className="text-xs text-amber-400/80 mb-6">
            {isFull ? "Todas as vagas foram preenchidas!" : `Restam apenas ${total - filled} vagas!`}
          </p>

          {/* CTA */}
          {isFull ? (
            <Link to="/signup">
              <Button size="lg" className="bg-gradient-to-r from-primary to-secondary text-primary-foreground font-bold">
                <Lock className="w-4 h-4 mr-2" />
                Assinar Plano Creator
              </Button>
            </Link>
          ) : (
            <>
              <Button
                size="lg"
                onClick={() => setFormOpen(true)}
                className="w-full sm:w-auto bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-black uppercase tracking-wider
                  shadow-[0_0_30px_rgba(255,215,0,0.5)] hover:shadow-[0_0_50px_rgba(255,215,0,0.7)] transition-all"
              >
                <Crown className="w-5 h-5 mr-2" />
                Candidatar-se à Vaga Creator Founder
              </Button>
              <CreatorFounderApplicationForm open={formOpen} onOpenChange={setFormOpen} />
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}
