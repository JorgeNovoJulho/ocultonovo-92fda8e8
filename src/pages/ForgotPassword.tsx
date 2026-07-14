import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";
import { getAuthRedirectUrl } from "@/lib/appConfig";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Informe seu email", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl('/reset-password'),
    });
    setIsLoading(false);

    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-xl bg-card/80 border border-border/50 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-8">
            <Logo />
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold text-foreground">Email enviado!</h1>
              <p className="text-muted-foreground">
                Verifique sua caixa de entrada e clique no link para redefinir sua senha.
              </p>
              <Link to="/login">
                <Button variant="outline" className="mt-4 w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-center text-foreground mb-2">
                Recuperar senha
              </h1>
              <p className="text-muted-foreground text-center mb-8">
                Informe seu email para receber o link de redefinição.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 bg-muted/30 border-border/50 focus:border-primary"
                    disabled={isLoading}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar link"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                <Link to="/login" className="text-primary hover:underline font-medium">
                  <ArrowLeft className="h-3 w-3 inline mr-1" />
                  Voltar ao login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
