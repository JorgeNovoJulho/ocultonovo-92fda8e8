import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MySubscriptionsHistorySection } from "@/components/subscriptions/MySubscriptionsHistorySection";

export default function MySubscriptionsPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="container max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button asChild size="icon" variant="ghost" className="h-9 w-9" aria-label="Ação">
            <Link to="/profile" aria-label="Voltar ao perfil">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">Minhas assinaturas</h1>
            <p className="text-xs text-muted-foreground truncate">
              Histórico completo de canais VIP — plano, status e validade.
            </p>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl mx-auto px-4 py-6">
        <MySubscriptionsHistorySection showHeader={false} />
      </main>
    </div>
  );
}
