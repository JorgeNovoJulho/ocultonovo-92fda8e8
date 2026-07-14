/**
 * GuestSignupGateModal — modal exibido quando um visitante (sem conta)
 * tenta executar uma ação restrita no OCULTO PLAY.
 *
 * - Alerta +18 com checkbox obrigatório de concordância
 * - CTA "Criar minha conta grátis" → /signup?from=play&item=<id>
 * - "Já tenho conta" → /login?from=play&item=<id>
 * - Renderizado acima do player (z-index altíssimo) para nunca ficar atrás.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldAlert, Sparkles, Lock } from 'lucide-react';
import { useGuestGateStore } from '@/store/useGuestGateStore';

export function GuestSignupGateModal() {
  const isOpen = useGuestGateStore((s) => s.isOpen);
  const reason = useGuestGateStore((s) => s.reason);
  const intentItemId = useGuestGateStore((s) => s.intentItemId);
  const close = useGuestGateStore((s) => s.close);
  const [agreed, setAgreed] = useState(false);
  const navigate = useNavigate();

  const goSignup = () => {
    if (!agreed) return;
    const qs = new URLSearchParams({ from: 'play' });
    if (intentItemId) qs.set('item', intentItemId);
    close();
    setAgreed(false);
    navigate(`/signup?${qs.toString()}`);
  };

  const goLogin = () => {
    const qs = new URLSearchParams({ from: 'play' });
    if (intentItemId) qs.set('item', intentItemId);
    close();
    setAgreed(false);
    navigate(`/login?${qs.toString()}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent
        className="max-w-sm !z-[2147483000]"
        overlayClassName="!z-[2147482999]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-fuchsia-400" />
            Crie sua conta para continuar
          </DialogTitle>
          <DialogDescription>
            {reason
              ? `Você precisa de uma conta para ${reason}.`
              : 'Você precisa de uma conta gratuita para interagir.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 flex gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              O <strong>OCULTO</strong> é uma rede social adulta. Alguns conteúdos são
              destinados <strong>apenas para maiores de 18 anos</strong>. Ao criar sua conta,
              você confirma que tem 18 anos ou mais e concorda com nossos
              {' '}<a href="/legal/termos" target="_blank" className="underline">Termos</a>{' '}
              e <a href="/legal/privacidade" target="_blank" className="underline">Privacidade</a>.
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
            <Checkbox
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              className="mt-0.5"
            />
            <span>
              Sou maior de 18 anos e concordo com os Termos de Uso e a Política de Privacidade.
            </span>
          </label>

          <div className="rounded-lg bg-gradient-to-r from-fuchsia-500/15 via-pink-500/10 to-rose-500/15 border border-fuchsia-500/30 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-fuchsia-100">
              <Sparkles className="h-3.5 w-3.5" /> Sua conta começa no plano gratuito
            </p>
            <p className="text-fuchsia-100/80 mt-1">
              Curta, salve, comente, compartilhe e explore o OCULTO PLAY inteiro. Sem cobrança.
            </p>
          </div>

          <Button
            type="button"
            disabled={!agreed}
            onClick={goSignup}
            className="w-full h-11 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 hover:from-fuchsia-400 hover:to-rose-400 text-white font-semibold"
          >
            Criar minha conta grátis
          </Button>
          <Button type="button" variant="ghost" onClick={goLogin} className="w-full h-9 text-xs">
            Já tenho conta — entrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
