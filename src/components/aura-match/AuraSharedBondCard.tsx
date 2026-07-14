import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuraBond } from '@/hooks/useAuraBond';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Heart, Timer, Sparkles } from 'lucide-react';

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AuraSharedBondCard() {
  const { bond, loading, remainingMs } = useAuraBond();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Fluxo correto do convite:
   * - O Aura Bond só pode ser criado quando há um perfil-alvo selecionado
   *   no AuraQuickPanel (aberto a partir de uma bolha do carrossel).
   * - Antes, o botão era um <a href="/aura-match"> — quando o usuário já
   *   estava na própria página, o React Router tratava como troca de rota
   *   "para si mesma", remontava todo o feed e dava a sensação de "piscar
   *   e voltar ao menu".
   * - Agora: se já estamos em /aura-match, fazemos scroll suave até o
   *   carrossel de bolhas e exibimos um toast guiando o usuário a tocar
   *   em alguém. Em qualquer outra rota, navegamos por SPA (sem reload).
   */
  const handleInvite = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onAuraPage = location.pathname.startsWith('/aura-match');
      if (!onAuraPage) {
        navigate('/aura-match#aura-anchor-bubbles');
        return;
      }
      const target = document.getElementById('aura-anchor-bubbles');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toast('Escolha alguém para compartilhar sua Aura', {
        description: 'Toque em uma bolha do carrossel para abrir o painel e enviar o convite.',
        duration: 4500,
      });
    },
    [location.pathname, navigate],
  );

  if (loading) return null;

  if (!bond) {
    return (
      <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/15 text-pink-300">
            <Heart className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Aura Compartilhada</h2>
            <p className="text-[11px] text-muted-foreground">
              Convide alguém pelo perfil para ativar +20% XP por 1h em todas as ações.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">+20% XP · 1h</Badge>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-pink-400/60"
          aria-label="Convidar parceiro para compartilhar Aura"
        >
          <Heart className="h-3.5 w-3.5" /> Convidar parceiro
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-pink-400/30 bg-gradient-to-br from-pink-500/15 via-fuchsia-500/10 to-transparent p-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 ring-2 ring-pink-400/40">
          <AvatarImage src={bond.partner_avatar || undefined} />
          <AvatarFallback>{bond.partner_name?.slice(0, 1) || '?'}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-bold">Aura compartilhada com {bond.partner_name || 'parceiro'}</h2>
            <Badge className="gap-1 bg-pink-500/25 text-[10px] text-pink-100 hover:bg-pink-500/25">
              <Sparkles className="h-2.5 w-2.5" /> +20% XP
            </Badge>
          </div>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-pink-200">
            <Timer className="h-3 w-3" />
            Termina em <strong className="tabular-nums">{fmt(remainingMs)}</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
