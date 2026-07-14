/**
 * EarnByReferralCard — destaque "Ganhe Indicando" para usuários novos/engajados.
 * Aparece apenas para nível 'new' ou 'engaged'. Persiste dismiss por 14 dias.
 * Respeita config dinâmica: se admin desativar a CTA 'cta_earn_referral', some.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, X, ChevronRight } from 'lucide-react';
import { useInitialExperienceItems, useEngagementLevel } from '@/hooks/useInitialExperience';

const KEY = 'oculto_earn_referral_dismiss_v1';
const HIDE_MS = 14 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(KEY) || 0);
    if (!ts || ts < Date.now()) { if (ts) localStorage.removeItem(KEY); return false; }
    return true;
  } catch { return false; }
}

export function EarnByReferralCard() {
  const { data: items } = useInitialExperienceItems();
  const { data: level } = useEngagementLevel();
  const [dismissed, setDismissed] = useState(isDismissed());
  const navigate = useNavigate();

  if (dismissed) return null;
  if (level && level !== 'new' && level !== 'engaged') return null;

  const cta = (items ?? []).find(i => i.id === 'cta_earn_referral' && i.kind === 'cta');
  if (!cta) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, String(Date.now() + HIDE_MS)); } catch {}
    setDismissed(true);
  };

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent p-3"
      role="region"
      aria-label="Ganhe indicando"
    >
      <button
        aria-label="Dispensar"
        onClick={dismiss}
        className="absolute top-1 right-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 shrink-0">
        <Banknote className="h-5 w-5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-amber-300">{cta.title}</div>
        {cta.body && <div className="text-xs text-muted-foreground line-clamp-2">{cta.body}</div>}
      </div>
      <button
        onClick={() => navigate(cta.cta_route || '/affiliates')}
        className="flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 shrink-0"
      >
        {cta.cta_label || 'Começar'}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
