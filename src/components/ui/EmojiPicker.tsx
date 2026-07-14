import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EmojiPicker
 * - Dropdown autônomo (sem Radix Portal) para funcionar dentro de Sheets/Dialogs
 *   modais (que aplicam pointer-events:none no body e bloqueiam portais externos).
 * - Posicionamento via position: fixed calculado a partir do retângulo do botão,
 *   abrindo sempre para cima (ideal para composer no rodapé) com clamp na tela.
 * - Scroll vertical/horizontal invisível.
 */

const EMOJI_CATEGORIES: { id: string; label: string; icon: string; emojis: string[] }[] = [
  {
    id: "smileys",
    label: "Sorrisos",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐",
      "😑","😶","😏","😒","🙄","😬","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤧","🥵",
      "🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳",
      "😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","😤","😡","🤬",
    ],
  },
  {
    id: "love",
    label: "Amor",
    icon: "❤️",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💟","♥️","💌","💋","👄","💍","💐","🌹","🌷","🌻","🌼","🌸","🥀","💏","💑","👩‍❤️‍👨","👨‍❤️‍👨","👩‍❤️‍👩",
    ],
  },
  {
    id: "gestures",
    label: "Gestos",
    icon: "👍",
    emojis: [
      "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️",
      "👋","🤚","🖐️","✋","🖖","👏","🙌","🤲","🙏","✍️","💪","🦵","🦶","👂","👃","🧠","👀","👁️","👅",
    ],
  },
  {
    id: "spicy",
    label: "Picante",
    icon: "🔥",
    emojis: [
      "🔥","💦","🍑","🍆","🌶️","🍒","🍓","🍌","🥒","🍯","🥵","😈","👿","💋","👄","👅","🩱","👙","🩲","🤤","💄","🥂","🍷","🍸","🛏️","🕯️","🧴","🪢","🩹",
    ],
  },
  {
    id: "celebration",
    label: "Festa",
    icon: "🎉",
    emojis: [
      "🎉","🎊","🥳","🎂","🎁","🎈","🪅","🎆","🎇","✨","🌟","⭐","💫","🎀","🪩","🍾","🥂","🍻","🍷","🍸","🍹","🍺","🎶","🎵","🎤","🎧","💃","🕺",
    ],
  },
  {
    id: "symbols",
    label: "Símbolos",
    icon: "💯",
    emojis: [
      "💯","✅","❌","⭕","❗","❓","💢","💥","💫","💨","💤","🆗","🆕","🔝","🔥","⚡","☀️","🌙","⭐","🌈","☁️","💎","👑","🏆","🥇","🥈","🥉","🎯","💰","💸","💵",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

const PANEL_WIDTH = 320; // px
const PANEL_HEIGHT = 320; // px (aprox.)

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const computePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const margin = 8;
    const width = Math.min(PANEL_WIDTH, vw - margin * 2);
    // Abre acima do botão por padrão (composer no rodapé)
    let top = r.top - PANEL_HEIGHT - margin;
    if (top < margin) top = Math.min(r.bottom + margin, vh - PANEL_HEIGHT - margin);
    let left = r.left;
    if (left + width > vw - margin) left = vw - width - margin;
    if (left < margin) left = margin;
    setPos({ left, top });
  };

  useEffect(() => {
    if (!open) return;
    computePosition();
    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onScroll);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = EMOJI_CATEGORIES.find((c) => c.id === activeCat) ?? EMOJI_CATEGORIES[0];
  const width = Math.min(PANEL_WIDTH, (typeof window !== "undefined" ? window.innerWidth : PANEL_WIDTH) - 16);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Inserir emoji"
        aria-expanded={open}
      >
        <Smile className="h-5 w-5 text-muted-foreground" />
      </Button>

      {open && pos && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Selecionar emoji"
          className={cn(
            "fixed z-[9999] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-2",
          )}
          style={{ left: pos.left, top: pos.top, width, pointerEvents: "auto" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={cn(
              "flex items-center gap-1 border-b pb-2 mb-2 overflow-x-auto",
              "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCat(cat.id)}
                className={cn(
                  "h-8 w-8 flex-shrink-0 flex items-center justify-center text-lg rounded transition-colors",
                  activeCat === cat.id ? "bg-muted ring-1 ring-primary/40" : "hover:bg-muted/60"
                )}
                aria-label={cat.label}
                title={cat.label}
              >
                {cat.icon}
              </button>
            ))}
          </div>
          <div
            className={cn(
              "grid grid-cols-8 gap-1 max-h-56 overflow-y-auto overscroll-contain",
              "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            {current.emojis.map((emoji, i) => (
              <button
                key={`${current.id}-${i}-${emoji}`}
                type="button"
                onClick={() => onSelect(emoji)}
                className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
