/**
 * PostTag — átomo visual padronizado para os "chips" do cabeçalho do post
 * (Público, +18, Seguro, VIP, Amigos, plano, tipo, cidade, fixada…).
 *
 * Garante mesmo height, padding, fonte e truncamento em qualquer largura de
 * tela, evitando que tags de tamanhos diferentes quebrem o alinhamento do
 * cabeçalho. Use SEMPRE este componente para novas tags do post.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export type PostTagTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "vip"
  | "danger"
  | "warning";

const TONE_CLASSES: Record<PostTagTone, string> = {
  neutral: "border-border/60 bg-card/60 text-foreground/80",
  primary: "border-primary/30 bg-primary/10 text-primary",
  secondary: "border-secondary/40 bg-secondary/10 text-secondary",
  vip: "border-[hsl(45,93%,47%)]/40 bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)]",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-400/50 bg-amber-400/10 text-amber-300",
};

export interface PostTagProps {
  /** Conteúdo textual da tag (deve ser curto — é truncado se passar do limite). */
  children: React.ReactNode;
  /** Ícone opcional renderizado à esquerda — receberá tamanho fixo de 10px. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Tom semântico (cor/borda/background). Padrão `neutral`. */
  tone?: PostTagTone;
  /** Largura máxima do conteúdo (px). Padrão 140 — evita explodir o cabeçalho. */
  maxWidth?: number;
  className?: string;
  title?: string;
}

/**
 * Padrão visual fixo (não alterar caso a caso):
 *  - height: 20px (h-5)
 *  - padding horizontal: 8px (px-2)
 *  - radius: full
 *  - font-size: 10px
 *  - font-weight: 600 (semibold) — uniforme em todas as tags
 *  - gap interno: 4px (gap-1)
 *  - texto truncado com max-width
 */
export const PostTag = React.memo(function PostTag({
  children,
  icon: Icon,
  tone = "neutral",
  maxWidth = 140,
  className,
  title,
}: PostTagProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 h-5 px-2 rounded-full border text-[10px] font-semibold leading-none whitespace-nowrap shrink-0",
        TONE_CLASSES[tone],
        className,
      )}
      style={{ maxWidth }}
    >
      {Icon ? <Icon className="h-2.5 w-2.5 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
});

export default PostTag;
