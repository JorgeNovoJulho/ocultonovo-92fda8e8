/**
 * RequireUsernameGate — força o usuário autenticado a definir um @username
 * antes de continuar usando o app. Aparece como modal bloqueante em qualquer
 * rota protegida quando `profiles.username` está vazio.
 *
 * Garantias:
 *  - Não fecha ao clicar fora / ESC.
 *  - Valida formato (regex Instagram-like) + disponibilidade (RPC).
 *  - Salva via UPDATE em profiles, invalida cache de profile + referral code,
 *    e refaz refetch antes de fechar — persistência confirmada.
 *  - O @username confirmado é usado para gerar links no formato
 *    https://ocultoswing.com.br/creator-invite/USERNAME_EM_MAIUSCULAS
 *    (transformação feita pelo `buildCreatorInviteUrl`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AtSign, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabaseExternal';
import {
  isValidUsername,
  slugifyUsername,
  checkAvailability,
} from '@/lib/signupAvailability';
import { buildCreatorInviteShareUrl } from '@/lib/inviteLinks';

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'invalid'; message: string };

export function RequireUsernameGate() {
  const { user } = useAuth();
  const { profile, isLoading } = useProfile();
  const queryClient = useQueryClient();

  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Não temos profile.username válido?
  const needsUsername = useMemo(() => {
    if (!user?.id) return false;
    if (isLoading) return false;
    // profile pode estar com placeholder; só considera "vazio" se realmente
    // tiver vindo do banco (id presente) e username for nulo/branco.
    if (!profile?.id) return false;
    const u = (profile.username || '').trim();
    return u.length === 0;
  }, [user?.id, isLoading, profile?.id, profile?.username]);

  // Sugestão inicial baseada em email / metadata
  useEffect(() => {
    if (!needsUsername || value || touched) return;
    const meta = (user?.user_metadata || {}) as Record<string, any>;
    const seed =
      (typeof meta.username === 'string' && meta.username) ||
      (typeof user?.email === 'string' && user.email.split('@')[0]) ||
      '';
    const slug = slugifyUsername(seed);
    if (slug) setValue(slug);
  }, [needsUsername, value, touched, user]);

  // Debounce validação + checagem de disponibilidade
  useEffect(() => {
    if (!needsUsername) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const raw = value.trim().toLowerCase();
    if (!raw) {
      setCheck({ status: 'idle' });
      return;
    }
    const formatError = isValidUsername(raw);
    if (formatError) {
      setCheck({ status: 'invalid', message: formatError });
      return;
    }
    setCheck({ status: 'checking' });
    debounceRef.current = setTimeout(async () => {
      try {
        const { username_taken } = await checkAvailability('', raw);
        setCheck({ status: username_taken ? 'taken' : 'available' });
      } catch {
        // Em falha de rede, otimisticamente liberamos — o UPDATE no submit
        // ainda falharia por UNIQUE se já existir.
        setCheck({ status: 'available' });
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, needsUsername]);

  if (!needsUsername) return null;

  const previewUrl = (() => {
    if (check.status !== 'available') return null;
    return buildCreatorInviteShareUrl(value);
  })();

  const canSubmit = check.status === 'available' && !saving;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user?.id) return;
    const username = value.trim().toLowerCase();
    if (!username) return;
    const fmtErr = isValidUsername(username);
    if (fmtErr) {
      setCheck({ status: 'invalid', message: fmtErr });
      return;
    }
    setSaving(true);
    try {
      // Re-checa disponibilidade no momento do save (anti-race)
      const { username_taken } = await checkAvailability('', username);
      if (username_taken) {
        setCheck({ status: 'taken' });
        setSaving(false);
        return;
      }

      // UPDATE no profile do usuário autenticado
      const { error } = await supabase
        .from('profiles')
        .update({ username })
        .eq('user_id', user.id);

      if (error) {
        // Conflito UNIQUE como fallback
        if ((error as any)?.code === '23505') {
          setCheck({ status: 'taken' });
          setSaving(false);
          return;
        }
        throw error;
      }

      // Garante persistência: invalida + refetch antes de fechar o modal
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      await queryClient.refetchQueries({ queryKey: ['profile', user.id] });
      queryClient.invalidateQueries({ queryKey: ['creator-referral-code'] });

      toast.success(`@${username} salvo!`, {
        description: 'Seu link de convite já está pronto.',
      });
    } catch (err: any) {
      toast.error('Não foi possível salvar', {
        description: err?.message || 'Tente novamente.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => { /* bloqueante: não fecha */ }}>
      <DialogContent
        className="max-w-md"
        // Impede fechamento por ESC / clique fora
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-2">
            <AtSign className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-lg">Escolha seu @username</DialogTitle>
          <DialogDescription className="text-sm">
            É como você será reconhecido(a) no Oculto Swing e também o que vai
            no seu link de convite. Use letras minúsculas, números e <code>_</code>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              @
            </span>
            <Input
              autoFocus
              value={value}
              onChange={(e) => {
                setTouched(true);
                // Normaliza enquanto digita
                const next = e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '_')
                  .replace(/_+/g, '_')
                  .slice(0, 30);
                setValue(next);
              }}
              placeholder="seu_username"
              className="pl-7 pr-9"
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {check.status === 'checking' && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {check.status === 'available' && <Check className="h-4 w-4 text-emerald-400" />}
              {(check.status === 'taken' || check.status === 'invalid') && (
                <X className="h-4 w-4 text-destructive" />
              )}
            </span>
          </div>

          {check.status === 'invalid' && (
            <p className="text-xs text-destructive">{check.message}</p>
          )}
          {check.status === 'taken' && (
            <p className="text-xs text-destructive">Esse @username já está em uso.</p>
          )}
          {check.status === 'available' && previewUrl && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-400/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-emerald-300/90 mb-0.5">
                Seu link de convite ficará assim:
              </p>
              <p className="text-xs font-mono text-emerald-200 break-all">{previewUrl}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando…
              </>
            ) : (
              'Confirmar @username'
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            Você poderá alterá-lo depois nas configurações do perfil.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
