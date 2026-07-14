/**
 * SafePostBlurOverlay — cobre o conteúdo de um post do feed com um aviso
 * de "conteúdo adulto". Acoplado ao SafeBlurProvider.
 *
 * Recompensa: a cada clique em "Mostrar" o usuário ganha +1 XP de Aura,
 * com limite diário de 30 XP (BRT) — controlado pelo RPC
 * `aura_reveal_safe_award_xp` no Supabase externo.
 */
import { EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

interface Props {
  username?: string;
  onReveal: () => void;
}

let lastAwardAt = 0;
// Evita repetir o mesmo toast de erro a cada clique
let lastErrorAt = 0;
let dailyCapToastedAt = 0;

async function awardRevealXp() {
  // Anti-spam local (300ms) — não impede o reveal nem conta limite no servidor
  const now = Date.now();
  if (now - lastAwardAt < 300) return;
  lastAwardAt = now;

  try {
    const { data, error } = await (supabase as any).rpc('aura_reveal_safe_award_xp');

    if (error) {
      // Não polui o usuário a cada clique se algo está mal configurado.
      // Mostra no máximo 1 vez a cada 10s.
      if (now - lastErrorAt > 10_000) {
        lastErrorAt = now;
        const msg = String(error?.message || '').toLowerCase();
        const code = String((error as any)?.code || '');
        if (code === 'PGRST202' || msg.includes('does not exist') || msg.includes('function')) {
          toast.error('Sistema de XP indisponível', {
            description: 'A função aura_reveal_safe_award_xp ainda não foi aplicada no banco.',
            duration: 4000,
          });
        } else if (msg.includes('not_authenticated') || msg.includes('jwt')) {
          toast.error('Faça login para ganhar XP', { duration: 3000 });
        } else {
          toast.error('Não foi possível creditar XP', {
            description: error.message || 'Tente novamente em instantes.',
            duration: 3000,
          });
        }
      }
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;

    if (row.ok && row.awarded > 0) {
      toast.success('+1 XP de Aura', {
        description: `${row.total_today}/${row.daily_cap} hoje`,
        duration: 1800,
      });
    } else if (!row.ok && row.total_today >= row.daily_cap) {
      // Avisa uma única vez a cada 30s ao bater o cap
      if (now - dailyCapToastedAt > 30_000) {
        dailyCapToastedAt = now;
        toast('Limite diário atingido', {
          description: `Você já recebeu ${row.daily_cap} XP hoje. Volte amanhã 🌙`,
          duration: 3000,
        });
      }
    }
  } catch (err: any) {
    if (now - lastErrorAt > 10_000) {
      lastErrorAt = now;
      toast.error('Falha de rede ao creditar XP', {
        description: err?.message || 'Verifique sua conexão.',
        duration: 3000,
      });
    }
  }
}

export function SafePostBlurOverlay({ onReveal }: Props) {
  return (
    <div
      role="region"
      aria-label="Conteúdo adulto bloqueado pelo Modo Seguro"
      className="absolute inset-0 z-20 flex items-center justify-center px-3 select-none"
    >
      <div
        className="absolute inset-0 bg-background/80"
        style={{ backdropFilter: 'blur(36px) saturate(140%)', WebkitBackdropFilter: 'blur(36px) saturate(140%)' }}
        aria-hidden="true"
      />

      <div className="relative w-[94%] sm:w-[90%] max-w-lg text-center rounded-2xl border border-border/60 bg-card/95 shadow-xl px-6 py-7">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground">
          <EyeOff className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-2">
          Aviso de conteúdo
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground mb-5">
          <span className="font-semibold text-foreground">O Oculto</span> marcou que este post
          contém conteúdo adulto.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onReveal();
            void awardRevealXp();
          }}
          className="gap-1.5 h-10 px-5"
        >
          <Eye className="h-4 w-4" />
          Mostrar
        </Button>
      </div>
    </div>
  );
}
