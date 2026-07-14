/**
 * AffiliateCampaignsStrip — carrossel leve de campanhas do "Ganhe Indicando"
 * para o feed. Sem auto-play, flat (regras de ouro mobile).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { useAffiliateCampaigns } from '@/hooks/useAffiliateProgram';
import { cn } from '@/lib/utils';

export function AffiliateCampaignsStrip({ className }: { className?: string }) {
  const { data: campaigns = [] } = useAffiliateCampaigns();
  const [idx, setIdx] = useState(0);

  if (!campaigns.length) return null;
  const c = campaigns[idx % campaigns.length];

  return (
    <div className={cn('rounded-xl border border-border/40 bg-card/60 p-3', className)}
         style={{ borderColor: `hsl(${c.hue}, 60%, 35%)` }}>
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `hsl(${c.hue}, 70%, 45%, 0.15)`, color: `hsl(${c.hue}, 80%, 65%)` }}
        >
          <Gift className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
          {c.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.body}</p>}
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="flex items-center gap-3">
              <Link
                to={c.cta_route}
                className="inline-flex items-center gap-1 text-xs font-bold"
                style={{ color: `hsl(${c.hue}, 80%, 65%)` }}
              >
                {c.cta_label}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/programa-indicacoes"
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Ver todos os programas
              </Link>
            </div>
            {campaigns.length > 1 && (
              <div className="flex items-center gap-1.5">
                {campaigns.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-label={`Campanha ${i + 1}`}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === (idx % campaigns.length) ? 'w-4 bg-foreground/80' : 'w-1.5 bg-muted-foreground/40'
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
