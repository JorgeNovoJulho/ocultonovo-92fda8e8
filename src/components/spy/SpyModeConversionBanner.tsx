/**
 * Banner de Conversão para Modo Espião
 * Exibido após o limite de posts para incentivar cadastro
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Sparkles, Lock, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function SpyModeConversionBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-4"
    >
      <Card className="overflow-hidden border-2 border-primary/50 shadow-[0_0_30px_rgba(255,0,127,0.3)] animate-pulse-glow">
        {/* Fundo com gradiente */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
        
        <CardContent className="relative p-8 text-center">
          {/* Ícone principal */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Eye className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          
          {/* Título */}
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            Curioso, hein? 👀
          </h2>
          
          {/* Subtítulo */}
          <p className="text-lg text-muted-foreground mb-2">
            Quer ver <span className="text-primary font-semibold">todos os segredos</span>?
          </p>
          
          {/* Benefícios */}
          <div className="flex flex-wrap justify-center gap-3 my-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-foreground">Conteúdo desbloqueado</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-foreground">Sem censura</span>
            </div>
          </div>
          
          {/* CTA */}
          <Link to="/signup">
            <Button 
              size="lg"
              className="glow-primary bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-bold h-14 px-10 text-lg shadow-[0_0_20px_rgba(255,0,127,0.5)]"
            >
              Crie sua conta agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          
          {/* Texto secundário */}
          <p className="text-xs text-muted-foreground mt-4">
            100% grátis • Anônimo • +18 anos
          </p>
        </CardContent>
      </Card>
      
      {/* Bloqueio visual - impede scroll adicional */}
      <div className="h-32 bg-gradient-to-b from-transparent to-background" />
    </motion.div>
  );
}
