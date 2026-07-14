import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseExternal";
import { getAuthRedirectUrl } from "@/lib/appConfig";

interface QuickSignupModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  contextLabel?: string;
}

export default function QuickSignupModal({ open, onOpenChange, onSuccess, contextLabel }: QuickSignupModalProps) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      toast.error("Preencha email e senha");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!username || username.length < 3) {
          toast.error("Username precisa de pelo menos 3 caracteres");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
            emailRedirectTo: getAuthRedirectUrl('/auth/callback'),
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Acessando conteúdo...");
        onSuccess();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login feito!");
        onSuccess();
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "signup" ? "Criar conta para acessar" : "Entrar para acessar"}</DialogTitle>
          <DialogDescription>
            {contextLabel || "Crie sua conta gratuita na OCULTO em 30 segundos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="qs-username">Username</Label>
              <Input id="qs-username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="seu_user" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="qs-email">Email</Label>
            <Input id="qs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qs-password">Senha</Label>
            <Input id="qs-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Já tenho conta — entrar" : "Não tenho conta — criar"}
          </button>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={loading} className="w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {mode === "signup" ? "Criar conta e acessar" : "Entrar e acessar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
