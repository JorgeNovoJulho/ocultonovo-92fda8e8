/**
 * ProfileTempBlockedCard — exibido quando o perfil está temporariamente
 * bloqueado pelo admin master. Bloqueia toda a navegação no perfil.
 */
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { MobileNavbar } from '@/components/MobileNavbar';

const SUPPORT_EMAIL = 'faleconosco@ocultoswing.com.br';

export function ProfileTempBlockedCard() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <div className="container max-w-2xl mx-auto px-4 py-10">
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl md:text-2xl font-semibold">
            Perfil temporariamente bloqueado
          </h2>
          <p className="text-muted-foreground">
            Este perfil está temporariamente indisponível. Tente novamente mais tarde.
          </p>
          <p className="text-sm text-muted-foreground">
            Dúvidas? Entre em contato pelo e-mail:
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium break-all"
          >
            <Mail className="h-4 w-4" />
            {SUPPORT_EMAIL}
          </a>
          <div className="pt-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Button>
          </div>
        </Card>
      </div>
      <MobileNavbar />
    </div>
  );
}
