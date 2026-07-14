/**
 * HighlightMatch — destaca ocorrências de qualquer termo de `terms` dentro
 * de `text`, com matching tolerante a acentos e caixa. Usado no dropdown
 * da busca global para mostrar por que cada perfil apareceu.
 */
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  terms: string[];
  className?: string;
  /** classes Tailwind aplicadas ao <mark> destacado. */
  highlightClassName?: string;
}

function norm(s: string): string {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightMatchBase({
  text,
  terms,
  className,
  highlightClassName,
}: Props) {
  const termsKey = useMemo(
    () =>
      Array.from(new Set((terms || []).map(norm).filter((t) => t && t.length >= 1)))
        .sort((a, b) => b.length - a.length)
        .join("\u0001"),
    [terms]
  );

  const segments = useMemo(() => {
    const original = text || "";
    if (!original) return [{ value: "", hit: false }];
    const cleanedTerms = termsKey ? termsKey.split("\u0001") : [];
    if (cleanedTerms.length === 0) return [{ value: original, hit: false }];

    const normalized = norm(original);
    const pattern = new RegExp(`(${cleanedTerms.map(escapeRegExp).join("|")})`, "gi");

    const parts: { value: string; hit: boolean }[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(normalized)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (start > lastIndex) parts.push({ value: original.slice(lastIndex, start), hit: false });
      // Usa o slice do original (preserva acentos/caixa) — comprimento bate
      // porque norm() não altera o length dos caracteres ASCII e remove apenas
      // marcas diacríticas (que vêm como combining chars separados após NFD).
      // Para garantir alinhamento, calculamos slice no original pelo mesmo range.
      parts.push({ value: original.slice(start, end), hit: true });
      lastIndex = end;
      if (m[0].length === 0) pattern.lastIndex++;
    }
    if (lastIndex < original.length) parts.push({ value: original.slice(lastIndex), hit: false });
    return parts;
  }, [text, termsKey]);

  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.hit ? (
          <mark
            key={i}
            className={cn(
              "rounded px-0.5 bg-primary/25 text-primary font-semibold",
              highlightClassName
            )}
          >
            {s.value}
          </mark>
        ) : (
          <span key={i}>{s.value}</span>
        )
      )}
    </span>
  );
}

export const HighlightMatch = memo(HighlightMatchBase, (prev, next) => {
  if (prev.text !== next.text) return false;
  if (prev.className !== next.className) return false;
  if (prev.highlightClassName !== next.highlightClassName) return false;
  const a = prev.terms || [];
  const b = next.terms || [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
});
