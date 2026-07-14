import { memo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useSocialAiSuggestions, trackSocialAi } from '@/social-universe/ai';

/**
 * Mapeia rotas legadas/quebradas vindas do RPC `social_ai_recommend`
 * para rotas reais existentes no App.tsx, evitando 404 ao clicar nos cards.
 */
const ROUTE_FIX: Record<string, string> = {
  '/account': '/profile',
  '/account/edit': '/profile',
  '/edit-profile': '/profile',
  '/settings/profile': '/profile',
};
function resolveRoute(route: string): string {
  if (!route) return '/feed';
  if (ROUTE_FIX[route]) return ROUTE_FIX[route];
  // qualquer /account/* → /profile
  if (route.startsWith('/account')) return '/profile';
  return route;
}

/**
 * SocialAiHintsStrip — tira de dicas inteligentes (regra-based, opt-out aware).
 * Renderiza no topo do feed, máx N dicas, dismissable. Sem spam (cooldown no servidor).
 */
function SocialAiHintsStripComp() {
  const { data: suggestions = [] } = useSocialAiSuggestions();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Set<string>>(new Set());

  const visible = suggestions.filter(s => !dismissed.has(s.key));

  // marca "shown" uma vez
  useEffect(() => {
    visible.forEach(s => {
      if (!shown.has(s.key)) {
        trackSocialAi(s.key, 'shown');
        setShown(prev => new Set(prev).add(s.key));
      }
    });
  }, [visible, shown]);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-[12px] font-bold text-white/90 px-1">
        <Sparkles className="h-3.5 w-3.5 text-violet-300" aria-hidden />
        Para você agora
      </div>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {visible.map((s) => (
          <article
            key={s.key}
            className="w-[240px] shrink-0 snap-start rounded-xl border border-violet-400/20 bg-violet-500/5 p-2.5 relative"
          >
            <button
              type="button"
              aria-label="Dispensar"
              onClick={() => {
                trackSocialAi(s.key, 'dismissed');
                setDismissed(prev => new Set(prev).add(s.key));
              }}
              className="absolute top-1 right-1 p-1 text-white/40 hover:text-white/70"
            >
              <X className="h-3 w-3" />
            </button>
            <h3 className="text-[12px] font-semibold text-white/95 pr-5 line-clamp-1">{s.title}</h3>
            <p className="mt-0.5 text-[11px] text-white/65 line-clamp-2">{s.body}</p>
            <button
              type="button"
              onClick={() => {
                trackSocialAi(s.key, 'clicked');
                navigate(resolveRoute(s.route));
              }}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-violet-200 hover:text-violet-100"
            >
              {s.cta} <ArrowRight className="h-3 w-3" />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export const SocialAiHintsStrip = memo(SocialAiHintsStripComp);
