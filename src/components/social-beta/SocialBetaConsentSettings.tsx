/**
 * Fatia 3.5 — Painel de Consentimento LGPD (lado usuário)
 *
 * Mostra o nível máximo aceito pelo usuário no Módulo Social Beta e permite
 * revisar / revogar a qualquer momento. Lê e grava diretamente em
 * `oculto_social_beta_consents` (RLS self_read / self_upsert / self_update).
 */
import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, RotateCcw, Check } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import type { SocialBetaLevel } from '@/hooks/useSocialBetaModules';

const LEVELS: { value: SocialBetaLevel; label: string; hint: string }[] = [
  { value: 'leve', label: 'Leve', hint: 'Conversas suaves e descontraídas.' },
  { value: 'divertido', label: 'Divertido', hint: 'Brincadeiras e desafios alegres.' },
  { value: 'provocante', label: 'Provocante', hint: 'Tom mais quente, sem explicitude.' },
  { value: 'avancado', label: 'Avançado', hint: 'Conteúdo adulto explícito (+18).' },
];

export function SocialBetaConsentSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SocialBetaLevel | null>(null);
  const [current, setCurrent] = useState<SocialBetaLevel | null>(null);

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from('oculto_social_beta_consents')
      .select('max_accepted_level')
      .eq('user_id', user.id)
      .maybeSingle();
    setCurrent((data?.max_accepted_level as SocialBetaLevel) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const setLevel = async (level: SocialBetaLevel) => {
    if (!user?.id || saving) return;
    setSaving(level);
    try {
      const { error } = await (supabase as any).rpc('social_beta_accept_consent', {
        _max_accepted_level: level, _version: 'v1',
      });
      if (error) throw error;
      setCurrent(level);
      toast({ title: 'Preferência salva', description: `Nível: ${level}` });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message ?? 'Falha ao salvar', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const revoke = () => setLevel('leve');

  if (!user?.id) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-semibold">Meu consentimento (Social Beta)</h3>
      </header>
      <p className="text-xs text-muted-foreground">
        Define até qual intensidade de conteúdo você aceita receber nas dinâmicas
        do módulo. Pode ajustar ou revogar a qualquer momento — em conformidade
        com a LGPD.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {LEVELS.map((l) => {
              const active = current === l.value;
              const busy = saving === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  disabled={busy}
                  onClick={() => setLevel(l.value)}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                    active
                      ? 'border-emerald-400/60 bg-emerald-500/10'
                      : 'border-border bg-background hover:border-primary/40'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{l.label}</span>
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : active ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{l.hint}</p>
                </button>
              );
            })}
          </div>

          {current && current !== 'leve' && (
            <Button
              size="sm"
              variant="outline"
              onClick={revoke}
              disabled={saving !== null}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revogar para nível mínimo (Leve)
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export default SocialBetaConsentSettings;
