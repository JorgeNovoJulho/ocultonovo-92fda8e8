import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/Logo";
import { CheckCircle2, Users, ArrowRight, AlertCircle } from "lucide-react";

const COOKIE_NAME = "invite_ref_username";

export default function InvitePage() {
  const { username } = useParams<{ username: string }>();

  const { data: inviter, isLoading, error } = useQuery({
    queryKey: ["invite-profile", username],
    queryFn: async () => {
      if (!username) throw new Error("No username");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url, is_verified, bio")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Not found");
      return data;
    },
    enabled: !!username,
    staleTime: 60000,
    retry: 1,
  });

  // Save referrer cookie for signup
  if (inviter?.id && username) {
    document.cookie = `${COOKIE_NAME}=${inviter.id}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Logo className="mx-auto h-8" />
          <Skeleton className="h-24 w-24 rounded-full mx-auto" />
          <Skeleton className="h-6 w-40 mx-auto" />
          <Skeleton className="h-4 w-56 mx-auto" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !inviter) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Convite inválido</h2>
          <p className="text-sm text-muted-foreground">Este perfil não foi encontrado.</p>
          <Button asChild className="w-full">
            <Link to="/signup">Criar conta sem convite</Link>
          </Button>
        </div>
      </div>
    );
  }

  const displayName = inviter.name || inviter.username || "Alguém";

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Logo className="mx-auto h-8" />

        {/* Inviter Card */}
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
          <Avatar className="h-24 w-24 mx-auto border-4 border-primary/30">
            <AvatarImage src={inviter.avatar_url || ""} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
              {displayName[0]?.toUpperCase() || "O"}
            </AvatarFallback>
          </Avatar>

          <div>
            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
              {inviter.is_verified && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground">@{inviter.username}</p>
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-bold text-primary">{displayName}</span> te convidou para
              conhecer o <span className="font-bold text-primary">OCULTO</span>! Crie sua conta
              e descubra conexões e experiências exclusivas.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Comunidade exclusiva</span>
            <span>•</span>
            <span>100% seguro</span>
          </div>
        </div>

        {/* CTA */}
        <Button asChild size="lg" className="w-full h-14 text-base font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Link to="/signup">
            Criar Minha Conta
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>

        <Button asChild variant="ghost" className="w-full text-muted-foreground">
          <Link to="/login">Já tenho conta</Link>
        </Button>

        <p className="text-[10px] text-muted-foreground">
          Ao criar sua conta, você concorda com nossos{" "}
          <Link to="/legal/termos-de-uso" className="underline">Termos</Link> e{" "}
          <Link to="/legal/privacidade" className="underline">Privacidade</Link>.
        </p>
      </div>
    </div>
  );
}
