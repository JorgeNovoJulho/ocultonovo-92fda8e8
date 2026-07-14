/**
 * UsernameRequiredGate — alerta global e insistente para usuários logados
 * que ainda não definiram seu @username.
 *
 * - Bloqueia a tela com um Dialog não-dismissível enquanto o username não for definido.
 * - Permite digitar e salvar diretamente no modal (com verificação de disponibilidade).
 * - Também oferece um botão "Editar no perfil" que abre /settings?focus=username#username,
 *   levando o usuário direto para o campo certo.
 * - Não aparece em rotas de autenticação / legais / instalar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, AtSign, Pencil, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import { useUsernameCheck } from "@/hooks/useUsernameCheck";
import { useQueryClient } from "@tanstack/react-query";
import { isMasterUsernameVariant, MASTER_EMAIL_CANONICAL, MASTER_USERNAME_CANONICAL } from "@/lib/masterUsername";
import {
  loadResolvedUsername,
  saveResolvedUsername,
  withTimeout,
  isAbortLikeError,
  markNetworkFailure,
} from "@/lib/authorScopeCache";

// Rotas em que NÃO devemos exibir o gate (auth/legal/instalação)
const SKIP_PREFIXES = [
  "/login", "/signup", "/forgot-password", "/reset-password",
  "/legal", "/instalar", "/denunciar", "/contestacao",
  "/invite-confirmed", "/checkout/resume", "/checkout-resume",
  "/update",
];

const RESERVED = ["admin", "administrador", "adm", "suporte", "moderador", "oculto"];

function isReservedUsername(u: string): boolean {
  if (!u || isMasterUsernameVariant(u)) return false;
  return (
    RESERVED.includes(u) ||
    u.includes("administrador") ||
    u.includes("moderador") ||
    u.includes("admin")
  );
}

export default function UsernameRequiredGate() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Fast-path: o JWT já traz user_metadata.username. Se existir, assumimos
  // como válido imediatamente (sem flicker, sem consulta bloqueante).
  const metaUsername = useMemo(() => {
    const u = (user as any)?.user_metadata?.username;
    return typeof u === "string" ? u.trim().toLowerCase() : "";
  }, [user]);

  // Cache em sessionStorage do username já resolvido — sobrevive a navegações
  // e reloads na mesma aba, eliminando o flicker do modal.
  const cachedUsername = useMemo(
    () => (user?.id ? loadResolvedUsername(user.id) : null),
    [user?.id],
  );

  const initialUsername = metaUsername || cachedUsername || null;

  const [checking, setChecking] = useState(false);
  const [dbUsername, setDbUsername] = useState<string | null>(initialUsername);
  const [isReserved, setIsReserved] = useState(false);
  const [input, setInput] = useState("");

  const [saving, setSaving] = useState(false);

  // Só consulta o banco UMA vez por sessão de usuário (evita refetch a cada
  // navegação que saturava HTTP/2 e gerava AbortError → modal piscando).
  const resolvedForUserRef = useRef<string | null>(null);

  const shouldSkipRoute = useMemo(
    () => SKIP_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(p + "/")),
    [location.pathname]
  );

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user?.id) return;

    // Bypass do administrador master (qualquer variante de username)
    const isMasterEmail = (user?.email || "").trim().toLowerCase() === MASTER_EMAIL_CANONICAL;
    if (isMasterEmail) {
      const masterName = metaUsername || cachedUsername || MASTER_USERNAME_CANONICAL;
      setDbUsername(masterName);
      setIsReserved(false);
      saveResolvedUsername(user.id, masterName);
      resolvedForUserRef.current = user.id;
      return;
    }

    // Se já temos username válido (JWT ou cache de sessão), não bloqueia UI;
    // valida em background uma única vez.
    if (resolvedForUserRef.current === user.id) return;

    // Só mostra "checking" se realmente não temos nada para mostrar.
    if (!initialUsername) setChecking(true);

    (async () => {
      try {
        const { data, error } = await withTimeout<any>(
          Promise.resolve(
            supabase
              .from("profiles")
              .select("username")
              .or(`id.eq.${user.id},user_id.eq.${user.id}`)
              .limit(1)
              .maybeSingle(),
          ),
          7000,
        );
        if (cancelled) return;

        if (error) {
          // Erro do PostgREST: marca como resolvido e preserva estado anterior.
          resolvedForUserRef.current = user.id;
          return;
        }

        const u = (data?.username || initialUsername || "").trim().toLowerCase();
        if (u) {
          setDbUsername(u);
          setIsReserved(isReservedUsername(u));
          saveResolvedUsername(user.id, u);
        } else {
          // Só zera se a query retornou OK e SEM username.
          setDbUsername(null);
        }
        resolvedForUserRef.current = user.id;
      } catch (err) {
        // Rede/timeout/abort: preserva estado anterior e NÃO abre o modal.
        if (isAbortLikeError(err)) markNetworkFailure();
        if (!cancelled) resolvedForUserRef.current = user.id;
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.email, authLoading, metaUsername, cachedUsername, initialUsername]);


  const needsUsername =
    !!user?.id &&
    !authLoading &&
    !shouldSkipRoute &&
    !checking &&
    // Só bloqueia se NEM o metadata NEM o banco têm username (ou se está reservado).
    ((!dbUsername && !metaUsername) || isReserved);




  const usernameCheck = useUsernameCheck(input, user?.id);

  if (!needsUsername) return null;

  const canSave =
    !!input &&
    input.length >= 3 &&
    usernameCheck.isAvailable === true &&
    !usernameCheck.isChecking &&
    !saving;

  const handleSave = async () => {
    if (!user?.id) return;
    const clean = input.trim().toLowerCase();
    if (!clean || clean.length < 3) { toast.error("Username inválido"); return; }
    if (!/^[a-z0-9_]+$/.test(clean)) { toast.error("Use apenas letras, números e _"); return; }
    if (usernameCheck.isAvailable !== true) { toast.error("Escolha um username disponível"); return; }
    setSaving(true);
    try {
      // Tenta atualizar pelo id; se nada mudou, tenta por user_id
      const { data: byId, error: e1 } = await (supabase as any)
        .from("profiles")
        .update({ username: clean, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();
      if (e1) throw e1;
      if (!byId) {
        const { error: e2 } = await (supabase as any)
          .from("profiles")
          .update({ username: clean, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (e2) throw e2;
      }
      toast.success(`@${clean} definido com sucesso`);
      setDbUsername(clean);
      setIsReserved(false);

      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (/duplicate|unique/i.test(msg)) toast.error("Este @username já está em uso");
      else toast.error(msg || "Falha ao salvar @username");
    } finally { setSaving(false); }
  };

  const goToSettings = () => {
    navigate("/settings?focus=username#username");
  };

  return (
    <Dialog open onOpenChange={() => { /* não permite fechar */ }}>
      <DialogContent
        className="max-w-md p-0 gap-0 border-amber-500/40 bg-background [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >

        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/10 px-5 py-4 border-b border-amber-500/30">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              {isReserved ? "Alteração de @username necessária" : "Defina seu @username"}
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-snug">
              {isReserved 
                ? "Seu nome de usuário atual contém termos reservados (como 'admin'). Para garantir a segurança e evitar confusão, escolha um novo @username."
                : "Seu perfil ainda não tem um @username. Ele é obrigatório para usar a plataforma, receber menções, indicações e compartilhar seu link público."
              }
            </DialogDescription>

          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gate-username" className="text-xs">Escolha seu @username</Label>
            <div className="relative">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                id="gate-username"
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/\s+/g, "").toLowerCase().slice(0, 30))}
                placeholder="seuusername"
                className={cn(
                  "pl-7 h-9",
                  usernameCheck.error && "border-destructive/60 focus-visible:ring-destructive/30",
                  usernameCheck.isAvailable === true && "border-emerald-500/60",
                )}
              />
            </div>
            {input.length >= 3 && (
              <p className={cn(
                "text-[11px] flex items-center gap-1",
                usernameCheck.isChecking ? "text-muted-foreground" :
                usernameCheck.error ? "text-destructive" :
                usernameCheck.isAvailable ? "text-emerald-400" : "text-muted-foreground"
              )}>
                {usernameCheck.isChecking ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Verificando disponibilidade…</>
                ) : usernameCheck.error ? (
                  <><AlertCircle className="h-3 w-3" /> {usernameCheck.error}</>
                ) : usernameCheck.isAvailable ? (
                  <><CheckCircle2 className="h-3 w-3" /> @{input} está disponível</>
                ) : null}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              3–30 caracteres. Apenas letras minúsculas, números e _ . Não pode ser duplicado.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-[hsl(45,93%,10%)] font-semibold border-0"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Salvar @username
            </Button>
            <Button
              variant="outline"
              onClick={goToSettings}
              className="border-amber-500/40 hover:bg-amber-500/10"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar no perfil
            </Button>
          </div>

          <p className="text-[11px] text-amber-300/90 leading-snug flex items-start gap-1.5 pt-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            Este aviso continuará aparecendo até que você defina um @username válido.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
