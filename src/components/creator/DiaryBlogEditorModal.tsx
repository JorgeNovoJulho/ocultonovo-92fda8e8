/**
 * DiaryBlogEditorModal — Editor "tipo blog" do Diário VIP.
 *
 * Refatorado para suportar:
 *  - Editor de texto rico em contentEditable (formatação aplicada apenas
 *    sobre a seleção do usuário; se não houver seleção, aplica no bloco inteiro).
 *  - Botões: B, I, U (sublinhado), S (riscado), alinhamento esquerda/centro/direita,
 *    lista, link, limpar formatação.
 *  - Catálogo expandido: 8 famílias de fonte, 16 cores, tamanhos 2px→64px.
 *  - IA: gerar teaser, melhorar formatação, corrigir ortografia, sugerir destaques.
 *    Aplica sobre a seleção, ou no bloco inteiro se nada selecionado.
 *  - Imagens (com edição completa: blur, emoji, texto, crop, rotação), vídeo, áudio, links.
 *  - Geração automática do link de compartilhamento (vinculado ao username do criador,
 *    rota /canal/:creator). Botão para copiar / compartilhar nativo.
 *  - Privacidade: público / amigos / pago (PIX, cartão ou ambos).
 *  - Preview e post final renderizam exatamente a mesma marcação HTML do editor.
 *
 * Persistência: blocos em `posts.style_meta.diary_blocks` (cada bloco de texto
 * carrega `html` + `text` fallback). `content_text` recebe o plain-text.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Notebook, Image as ImageIcon, Video as VideoIcon, Music, Type as TypeIcon,
  Sparkles, Loader2, Upload, Eye, Trash2, ArrowUp, ArrowDown, Bold, Italic, Underline,
  Strikethrough, AlignLeft, AlignCenter, AlignRight, Link2,
  Lock, Globe2, Users, DollarSign, Wand2, Pencil, SpellCheck2, Highlighter, Share2, Copy, RemoveFormatting,
  BookMarked, CalendarClock, Hash, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { getCanonicalAuthorIds } from "@/lib/postAuthorResolver";
import { smartImageUpload, smartVideoUpload } from "@/lib/smartUpload";
import { useQueryClient } from "@tanstack/react-query";
import { buildShareUrl } from "@/lib/appConfig";
import { useSchedulePost } from "@/hooks/useScheduledPosts";
import DiaryMediaPlayer from "./blog/DiaryMediaPlayer";

const ImageEditor = lazy(() => import("@/components/ImageEditor").then(m => ({ default: m.ImageEditor })));

// ───────────────────────────── Tipos de bloco ─────────────────────────────
type Privacy = "public" | "friends" | "paid";
type PaidMethod = "pix" | "card" | "both";

type TextBlock = {
  id: string;
  type: "text";
  /** HTML renderizado no editor rico — fonte da verdade para preview/feed. */
  html: string;
  /** Plain text gerado a partir do html — usado para concat/teaser/IA. */
  text: string;
  /** Defaults aplicados ao container do bloco (sobrepostos por spans inline). */
  fontFamily: string;
  fontSize: number;
  color: string;
  align?: "left" | "center" | "right";
};
type ImageBlock = { id: string; type: "image"; url: string; caption?: string; width?: number };
type VideoBlock = { id: string; type: "video"; url: string; caption?: string };
type AudioBlock = { id: string; type: "audio"; url: string; caption?: string };
type LinkBlock  = { id: string; type: "link"; url: string; title?: string };
type Block = TextBlock | ImageBlock | VideoBlock | AudioBlock | LinkBlock;

const FONT_FAMILIES = [
  { label: "Serif elegante", value: 'Georgia, "Times New Roman", serif' },
  { label: "Sans moderno",   value: 'Inter, system-ui, sans-serif' },
  { label: "Mono",           value: 'ui-monospace, SFMono-Regular, monospace' },
  { label: "Cursivo",        value: '"Brush Script MT", cursive' },
  { label: "Display",        value: '"Playfair Display", Georgia, serif' },
  { label: "Humanista",      value: '"Helvetica Neue", Arial, sans-serif' },
  { label: "Quadrada",       value: '"Courier New", monospace' },
  { label: "Caligráfica",    value: '"Dancing Script", "Brush Script MT", cursive' },
];
const COLOR_PRESETS = [
  "#fafafa", "#f5d76e", "#fbbf24", "#f97316", "#ef4444", "#ec4899", "#f472b6", "#a78bfa",
  "#8b5cf6", "#3b82f6", "#22d3ee", "#10b981", "#34d399", "#84cc16", "#737373", "#0a0a0a",
];
// Tamanhos do 2px ao 64px (passo 1 até 24, depois 2)
const FONT_SIZES: number[] = (() => {
  const out: number[] = [];
  for (let i = 2; i <= 24; i++) out.push(i);
  for (let i = 26; i <= 64; i += 2) out.push(i);
  return out;
})();

const DEFAULT_TEXT_COLOR = "hsl(var(--foreground))";

function resolveDiaryTextColor(color?: string): string {
  if (!color) return DEFAULT_TEXT_COLOR;
  const normalized = color.trim().toLowerCase();
  if (["#fafafa", "#ffffff", "rgb(250, 250, 250)", "rgb(255, 255, 255)", "white"].includes(normalized)) {
    return DEFAULT_TEXT_COLOR;
  }
  return color;
}

const newId = () => Math.random().toString(36).slice(2, 10);
const URL_REGEX = /\bhttps?:\/\/[^\s<>]+/gi;
const SINGLE_URL_REGEX = /^https?:\/\/\S+$/i;

/**
 * Limpa HTML colado: remove backgrounds/cores claras/larguras fixas/fontes
 * absolutas para que o texto adote naturalmente o fundo escuro do editor.
 * Preserva estrutura semântica (parágrafos, listas, negrito, itálico, links).
 */
function sanitizePastedHtml(rawHtml: string): string {
  if (!rawHtml) return "";
  const noMd = rawHtml.replace(/<!--[\s\S]*?-->/g, "");
  const div = document.createElement("div");
  div.innerHTML = noMd;
  // remove tags perigosas / de layout do Word/GDocs
  div.querySelectorAll("script,style,meta,link,head,title,iframe,object,embed,o\\:p").forEach(n => n.remove());
  // remove imagens inline (geralmente lixo do GDocs/Word); o usuário usa o bloco Imagem
  div.querySelectorAll("img").forEach(n => n.remove());
  const ALLOWED = new Set([
    "P","BR","STRONG","B","EM","I","U","S","STRIKE","SPAN","DIV",
    "UL","OL","LI","A","BLOCKQUOTE","H1","H2","H3","H4","H5","H6","HR",
  ]);
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
        return;
      }
      // remove todos os atributos exceto href/target/rel para <a>
      [...child.attributes].forEach((a) => {
        const keep = (child.tagName === "A" && ["href","target","rel"].includes(a.name));
        if (!keep) child.removeAttribute(a.name);
      });
      // <a>: força segurança
      if (child.tagName === "A") {
        const href = (child as HTMLAnchorElement).getAttribute("href") || "";
        if (/^javascript:/i.test(href)) child.removeAttribute("href");
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child as Element);
    });
  };
  walk(div);
  // colapsa <div> vazias em <br>
  div.querySelectorAll("div").forEach((d) => {
    if (!d.textContent?.trim() && d.children.length === 0) d.replaceWith(document.createElement("br"));
  });
  return div.innerHTML.trim();
}

function normalizeDiaryHtml(rawHtml: string): string {
  if (!rawHtml) return "";
  const div = document.createElement("div");
  div.innerHTML = rawHtml;
  div.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
    const inlineColor = node.style.color?.trim().toLowerCase();
    if (["#fafafa", "#ffffff", "rgb(250, 250, 250)", "rgb(255, 255, 255)", "white"].includes(inlineColor)) {
      node.style.color = DEFAULT_TEXT_COLOR;
    }
  });
  return div.innerHTML;
}


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelName?: string;
  editingPost?: any | null;
}

// ───────────────────── Utilitários HTML ─────────────────────
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  // Preserva quebras: substitui <br> e <div>/<p> por \n
  div.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  div.querySelectorAll("div,p,li").forEach((n) => {
    n.insertAdjacentText("afterend", "\n");
  });
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtmlBasic(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Auto-linkify URLs em HTML preservando tags existentes. */
function autoLinkify(html: string): string {
  if (!html) return "";
  // Não mexer em textos dentro de <a> existentes — split por âncoras
  const parts = html.split(/(<a\b[^>]*>.*?<\/a>)/gi);
  return parts.map((p) => {
    if (/^<a\b/i.test(p)) return p;
    return p.replace(URL_REGEX, (m) =>
      `<a href="${m}" target="_blank" rel="noopener noreferrer" style="color:#fbbf24;text-decoration:underline;word-break:break-all">${m}</a>`,
    );
  }).join("");
}


// ───────────────────── Tags: normalização, memória local com frequência e ranking ─────────────────────
const TAG_FREQ_KEY        = (uid: string) => `diary-tag-freq:${uid}`;
const TAG_LEGACY_LIST_KEY = (uid: string) => `diary-tag-suggestions:${uid}`;
const MAX_TAGS_PER_POST   = 10;
const MAX_TAG_LEN         = 30;
const MIN_TAG_LEN         = 2;
const MAX_SUGGESTIONS_STORE = 300;

/**
 * Normaliza para um formato consistente:
 *  - trim
 *  - remove '#' inicial
 *  - converte espaços/pontuação leve em '-'
 *  - mantém letras (com acento), dígitos, '-' e '_'
 *  - remove '-' duplicados/iniciais/finais
 *  - lowercase
 *  - limita tamanho
 */
function normalizeTag(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[\s,;.!?/\\|]+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toLowerCase()
    .slice(0, MAX_TAG_LEN);
}

function isValidTag(tag: string): boolean {
  return !!tag && tag.length >= MIN_TAG_LEN && tag.length <= MAX_TAG_LEN;
}

type TagFreqMap = Record<string, number>;

function loadTagFreq(uid?: string | null): TagFreqMap {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(TAG_FREQ_KEY(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const out: TagFreqMap = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const n = normalizeTag(String(k));
          const count = Number(v);
          if (isValidTag(n) && Number.isFinite(count) && count > 0) out[n] = (out[n] || 0) + count;
        }
        return out;
      }
    }
    // Migração de formato legado (apenas array de strings) → frequência 1
    const legacy = localStorage.getItem(TAG_LEGACY_LIST_KEY(uid));
    if (legacy) {
      const arr = JSON.parse(legacy);
      if (Array.isArray(arr)) {
        const out: TagFreqMap = {};
        for (const t of arr) {
          const n = normalizeTag(String(t));
          if (isValidTag(n)) out[n] = (out[n] || 0) + 1;
        }
        return out;
      }
    }
  } catch { /* noop */ }
  return {};
}

function persistTagFreq(uid: string, freq: TagFreqMap) {
  try {
    // mantém só as 300 mais frequentes
    const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, MAX_SUGGESTIONS_STORE);
    const compact: TagFreqMap = {};
    for (const [k, v] of entries) compact[k] = v;
    localStorage.setItem(TAG_FREQ_KEY(uid), JSON.stringify(compact));
  } catch { /* noop */ }
}

function incrementTagFreq(uid: string, tags: string[]): TagFreqMap {
  const next = { ...loadTagFreq(uid) };
  for (const raw of tags) {
    const n = normalizeTag(raw);
    if (!isValidTag(n)) continue;
    next[n] = (next[n] || 0) + 1;
  }
  persistTagFreq(uid, next);
  return next;
}

function mergeTagsIntoFreq(uid: string, tags: string[]): TagFreqMap {
  const next = { ...loadTagFreq(uid) };
  for (const raw of tags) {
    const n = normalizeTag(raw);
    if (!isValidTag(n)) continue;
    if (!(n in next)) next[n] = 1;
  }
  persistTagFreq(uid, next);
  return next;
}

/** Texto normalizado para matching de relevância (lowercase + remove acento). */
function flattenForMatch(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Ranqueia sugestões por:
 *  1) frequência de uso (peso 1×)
 *  2) relevância ao texto atual (título/subtítulo/teaser/corpo) → +50 se a tag aparece
 *  3) prefixo do filtro vence "contém" no filtro
 */
function rankSuggestions(
  freq: TagFreqMap,
  contextText: string,
  filter: string,
  exclude: Set<string>,
  limit: number,
): string[] {
  const ctx = flattenForMatch(contextText);
  const f = flattenForMatch(filter.trim());
  const entries: { tag: string; score: number }[] = [];
  for (const [tag, count] of Object.entries(freq)) {
    if (exclude.has(tag)) continue;
    const ft = flattenForMatch(tag);
    if (f) {
      if (!ft.includes(f)) continue;
    }
    let score = count;
    if (ctx && ctx.includes(ft)) score += 50; // relevância contextual
    if (f && ft.startsWith(f)) score += 10;    // prefixo no filtro
    entries.push({ tag, score });
  }
  entries.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
  return entries.slice(0, limit).map((e) => e.tag);
}

// ───────────────────── Subcomponente: seção de Tags com autocomplete ─────────────────────
interface TagsSectionProps {
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  tagInput: string;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  tagFreq: TagFreqMap;
  contextText: string;
  tagFocused: boolean;
  setTagFocused: React.Dispatch<React.SetStateAction<boolean>>;
  tagHighlightIdx: number;
  setTagHighlightIdx: React.Dispatch<React.SetStateAction<number>>;
}

function TagsSection({
  tags, setTags, tagInput, setTagInput, tagFreq, contextText,
  tagFocused, setTagFocused, tagHighlightIdx, setTagHighlightIdx,
}: TagsSectionProps) {
  const selectedSet = useMemo(() => new Set(tags), [tags]);

  // Sugestões ranqueadas (com filtro do input)
  const autocompleteList = useMemo(
    () => rankSuggestions(tagFreq, contextText, tagInput, selectedSet, 8),
    [tagFreq, contextText, tagInput, selectedSet],
  );

  // Sugestões para o painel "Sugeridas" (sem filtro)
  const generalSuggestions = useMemo(
    () => rankSuggestions(tagFreq, contextText, "", selectedSet, 20),
    [tagFreq, contextText, selectedSet],
  );

  const remaining = MAX_TAGS_PER_POST - tags.length;
  const showDropdown = tagFocused && tagInput.trim().length > 0 && autocompleteList.length > 0;

  // Reseta o índice quando a lista muda
  useEffect(() => { setTagHighlightIdx(0); }, [tagInput, autocompleteList.length, setTagHighlightIdx]);

  const commitTag = (raw: string): boolean => {
    const n = normalizeTag(raw);
    if (!isValidTag(n)) {
      toast.error(`Tag inválida (mínimo ${MIN_TAG_LEN} caracteres)`);
      return false;
    }
    if (selectedSet.has(n)) {
      toast.error("Essa tag já foi adicionada");
      setTagInput("");
      return false;
    }
    if (tags.length >= MAX_TAGS_PER_POST) {
      toast.error(`Máximo de ${MAX_TAGS_PER_POST} tags por post`);
      return false;
    }
    setTags((ts) => [...ts, n]);
    setTagInput("");
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (autocompleteList.length) {
        e.preventDefault();
        setTagHighlightIdx((i) => Math.min(autocompleteList.length - 1, i + 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (autocompleteList.length) {
        e.preventDefault();
        setTagHighlightIdx((i) => Math.max(0, i - 1));
      }
      return;
    }
    if (e.key === "Escape") {
      setTagFocused(false);
      return;
    }
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      const fromList = showDropdown ? autocompleteList[tagHighlightIdx] : null;
      const candidate = fromList || tagInput;
      if (!candidate.trim()) return;
      commitTag(candidate);
      return;
    }
    if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags((ts) => ts.slice(0, -1));
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <p className="text-xs font-semibold flex items-center gap-2">
        <Hash className="h-4 w-4 text-pink-400" />
        Tags
        <span className="text-[10px] text-muted-foreground font-normal">
          (até {MAX_TAGS_PER_POST}; aparecem no fim da publicação; sugestões por frequência + relevância ao texto)
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {tags.length}/{MAX_TAGS_PER_POST}
        </span>
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 border border-pink-500/40 text-pink-200 text-[11px] px-2 py-0.5"
            >
              #{t}
              <button
                type="button"
                onClick={() => setTags((ts) => ts.filter((x) => x !== t))}
                className="hover:text-pink-100"
                aria-label={`Remover tag ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown de autocomplete */}
      <div className="relative">
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onFocus={() => setTagFocused(true)}
            onBlur={() => setTimeout(() => setTagFocused(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder={
              remaining > 0
                ? `Digite uma tag e pressione Enter (ex.: incesto, traição, voyeur)`
                : `Limite de ${MAX_TAGS_PER_POST} tags atingido`
            }
            maxLength={MAX_TAG_LEN}
            disabled={remaining <= 0}
            className="h-9 text-sm"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={remaining <= 0 || !tagInput.trim()}
            onClick={() => commitTag(tagInput)}
          >
            Adicionar
          </Button>
        </div>

        {showDropdown && (
          <ul
            role="listbox"
            className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg text-sm"
          >
            {autocompleteList.map((s, idx) => {
              const isActive = idx === tagHighlightIdx;
              const count = tagFreq[s] || 0;
              return (
                <li
                  key={s}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => { e.preventDefault(); commitTag(s); }}
                  onMouseEnter={() => setTagHighlightIdx(idx)}
                  className={cn(
                    "flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer",
                    isActive ? "bg-pink-500/15 text-pink-200" : "text-foreground/90 hover:bg-muted",
                  )}
                >
                  <span className="truncate">#{s}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{count}×</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Painel "Sugeridas" (ranking por frequência + relevância) */}
      {generalSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Sugeridas para esta postagem
          </p>
          <div className="flex flex-wrap gap-1.5">
            {generalSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => commitTag(s)}
                disabled={remaining <= 0}
                className="rounded-full border border-border text-[11px] px-2 py-0.5 text-muted-foreground hover:bg-pink-500/10 hover:text-pink-200 hover:border-pink-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                #{s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────── Componente principal ─────────────────────
export default function DiaryBlogEditorModal({ open, onOpenChange, channelName, editingPost }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editingPost?.id;
  const ownerProfileId = (profile as any)?.id || null;
  const username = (profile as any)?.username || (profile as any)?.id || "";
  const finalChannelName = channelName || (profile as any)?.display_name || "criador";

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [teaser, setTeaser] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");

  const [blocks, setBlocks] = useState<Block[]>([{
    id: newId(), type: "text", html: "", text: "",
    fontFamily: FONT_FAMILIES[0].value, fontSize: 17, color: DEFAULT_TEXT_COLOR, align: "left",
  } as TextBlock]);

  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [paidMethod, setPaidMethod] = useState<PaidMethod>("both");
  const [price, setPrice] = useState<string>("9.90");

  const [aiLoading, setAiLoading] = useState<"teaser" | "improve" | "spell" | "highlights" | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingImage, setEditingImage] = useState<{ blockId: string; file: File } | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  // Capítulos / série
  const [seriesId, setSeriesId] = useState<string>("none");
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [chapterNumber, setChapterNumber] = useState<string>("");
  const [series, setSeries] = useState<{ id: string; title: string }[]>([]);

  // Tags do post + memória local de sugestões (mapa frequência)
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [tagFreq, setTagFreq] = useState<TagFreqMap>({});
  const [tagHighlightIdx, setTagHighlightIdx] = useState<number>(0);
  const [tagFocused, setTagFocused] = useState<boolean>(false);

  // Agendamento
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(""); // datetime-local string
  const schedulePost = useSchedulePost();
  const minScheduleAt = useMemo(() => {
    const d = new Date(Date.now() + 60_000); // pelo menos 1 min no futuro
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [open]);

  // ── Persistência de rascunho (memória entre navegações) ─────────────
  // Salva tudo (exceto arquivo binário da capa) em localStorage enquanto
  // o usuário digita. Restaura ao reabrir o modal. Limpa SOMENTE quando
  // o usuário cancela / fecha pelo X / publica / agenda com sucesso.
  const draftKey = useMemo(() => {
    if (!user?.id) return null;
    return isEditing
      ? `diary-draft:${user.id}:edit:${editingPost?.id}`
      : `diary-draft:${user.id}:new`;
  }, [user?.id, isEditing, editingPost?.id]);
  const draftHydratedRef = useRef(false);

  // Restaura rascunho ao abrir (somente para post novo — edição usa dados do post)
  useEffect(() => {
    if (!open || !draftKey || isEditing) { draftHydratedRef.current = false; return; }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.title === "string") setTitle(d.title);
        if (typeof d.subtitle === "string") setSubtitle(d.subtitle);
        if (typeof d.teaser === "string") setTeaser(d.teaser);
        if (Array.isArray(d.blocks) && d.blocks.length) setBlocks(d.blocks);
        if (d.privacy) setPrivacy(d.privacy);
        if (d.paidMethod) setPaidMethod(d.paidMethod);
        if (typeof d.price === "string") setPrice(d.price);
        if (typeof d.seriesId === "string") setSeriesId(d.seriesId);
        if (typeof d.newSeriesTitle === "string") setNewSeriesTitle(d.newSeriesTitle);
        if (typeof d.chapterNumber === "string") setChapterNumber(d.chapterNumber);
        if (Array.isArray(d.tags)) setTags(d.tags.map(normalizeTag).filter(Boolean));
        if (typeof d.scheduleEnabled === "boolean") setScheduleEnabled(d.scheduleEnabled);
        if (typeof d.scheduleAt === "string") setScheduleAt(d.scheduleAt);
        if (typeof d.coverPreview === "string" && d.coverPreview.startsWith("data:")) {
          setCoverPreview(d.coverPreview);
        }
      }
    } catch { /* noop */ }
    // pequeno delay para evitar que o save dispare antes da hidratação
    setTimeout(() => { draftHydratedRef.current = true; }, 50);
  }, [open, draftKey, isEditing]);

  // Salva rascunho a cada mudança (debounce 400ms)
  useEffect(() => {
    if (!open || !draftKey || !draftHydratedRef.current || submitting) return;
    const t = setTimeout(() => {
      try {
        const payload = {
          title, subtitle, teaser,
          blocks,
          privacy, paidMethod, price,
          seriesId, newSeriesTitle, chapterNumber,
          tags,
          scheduleEnabled, scheduleAt,
          // Capa: só persiste se já estiver em data URL (não ObjectURL)
          coverPreview: coverPreview.startsWith("data:") ? coverPreview : "",
          savedAt: Date.now(),
        };
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch { /* quota ou serialização — ignora */ }
    }, 400);
    return () => clearTimeout(t);
  }, [
    open, draftKey, submitting,
    title, subtitle, teaser, blocks,
    privacy, paidMethod, price,
    seriesId, newSeriesTitle, chapterNumber,
    tags,
    scheduleEnabled, scheduleAt, coverPreview,
  ]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try { localStorage.removeItem(draftKey); } catch { /* noop */ }
  }, [draftKey]);

  // Carrega séries do criador
  useEffect(() => {
    if (!open || !ownerProfileId) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("creator_content_series")
          .select("id, title")
          .eq("creator_id", ownerProfileId)
          .order("sort_order", { ascending: true });
        setSeries(data || []);
      } catch { /* noop */ }
    })();
  }, [open, ownerProfileId]);

  // Carrega sugestões de tags (memória local + tags usadas em posts narrativos do criador)
  useEffect(() => {
    if (!open || !user?.id) return;
    setTagFreq(loadTagFreq(user.id));
    if (!ownerProfileId) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("posts")
          .select("style_meta")
          .eq("author_id", ownerProfileId)
          .eq("content_format", "narrative")
          .order("created_at", { ascending: false })
          .limit(80);
        const fromPosts: string[] = [];
        for (const row of data || []) {
          const t = (row?.style_meta as any)?.tags;
          if (Array.isArray(t)) for (const x of t) {
            const n = normalizeTag(String(x));
            if (isValidTag(n)) fromPosts.push(n);
          }
        }
        if (fromPosts.length) {
          // Apenas garante que as tags dos posts existentes apareçam nas sugestões
          // (não infla contagem a cada reabertura do modal).
          const next = mergeTagsIntoFreq(user.id, fromPosts);
          setTagFreq(next);
        }
      } catch { /* noop */ }
    })();
  }, [open, user?.id, ownerProfileId]);

  // ID que usaremos no link de compartilhamento (publicado OU edição)
  const shareId = publishedId || editingPost?.id || null;
  const shareUrl = useMemo(() => {
    if (!shareId) {
      return buildShareUrl(`/canal/${ownerProfileId || username || ""}`);
    }
    return buildShareUrl(`/leitura/${shareId}`);
  }, [shareId, ownerProfileId, username]);


  // Prefill em edição
  useEffect(() => {
    if (!open || !editingPost?.id) return;
    setTitle(editingPost.title || "");
    setSubtitle(editingPost.subtitle || "");
    setTeaser(editingPost.teaser || "");
    setCoverPreview(editingPost.thumbnail_url || "");
    setCoverFile(null);

    const meta = editingPost.style_meta || {};
    if (Array.isArray(meta.diary_blocks) && meta.diary_blocks.length > 0) {
      // Migra blocos legados (sem html) — gera html a partir do text
      const migrated: Block[] = meta.diary_blocks.map((b: any) => {
        if (b.type !== "text") return b;
        if (b.html) {
          return { ...b, html: normalizeDiaryHtml(b.html), color: resolveDiaryTextColor(b.color) };
        }
        const escaped = escapeHtmlBasic(b.text || "").replace(/\n/g, "<br>");
        return { ...b, html: normalizeDiaryHtml(escaped), color: resolveDiaryTextColor(b.color) };
      });
      setBlocks(migrated);
    } else if (editingPost.content_text) {
      const escaped = escapeHtmlBasic(editingPost.content_text).replace(/\n/g, "<br>");
      setBlocks([{
        id: newId(), type: "text", html: escaped, text: editingPost.content_text,
        fontFamily: FONT_FAMILIES[0].value, fontSize: 17, color: DEFAULT_TEXT_COLOR, align: "left",
      } as TextBlock]);
    }

    if (editingPost.is_paid) {
      setPrivacy("paid");
      setPrice(editingPost.paid_price ? String(editingPost.paid_price) : "9.90");
      setPaidMethod((meta.paid_method as PaidMethod) || "both");
    } else if (editingPost.privacy_level === "friends") {
      setPrivacy("friends");
    } else {
      setPrivacy("public");
    }

    setSeriesId(editingPost.series_id || "none");
    setChapterNumber(editingPost.chapter_number ? String(editingPost.chapter_number) : "");
    setNewSeriesTitle("");
    {
      const metaTags = (editingPost.style_meta as any)?.tags;
      if (Array.isArray(metaTags)) setTags(metaTags.map((t: any) => normalizeTag(String(t))).filter(Boolean));
      else setTags([]);
    }
  }, [open, editingPost?.id]);

  const reset = () => {
    if (coverPreview && coverFile) URL.revokeObjectURL(coverPreview);
    setTitle(""); setSubtitle(""); setTeaser("");
    setCoverFile(null); setCoverPreview("");
    setBlocks([{
      id: newId(), type: "text", html: "", text: "",
      fontFamily: FONT_FAMILIES[0].value, fontSize: 17, color: DEFAULT_TEXT_COLOR, align: "left",
    } as TextBlock]);
    setPrivacy("public"); setPaidMethod("both"); setPrice("9.90");
    setSeriesId("none"); setNewSeriesTitle(""); setChapterNumber("");
    setTags([]); setTagInput("");
    setScheduleEnabled(false); setScheduleAt("");
    setAiLoading(null); setSubmitting(false); setHighlights([]); setPublishedId(null);
    draftHydratedRef.current = false;
    clearDraft();
  };


  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  // ───────────────────────── Operações em blocos ─────────────────────────
  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  };
  const removeBlock = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      if (i < 0) return bs;
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const addTextBlock = () => setBlocks((bs) => [...bs, {
    id: newId(), type: "text", html: "", text: "",
    fontFamily: FONT_FAMILIES[0].value, fontSize: 17, color: DEFAULT_TEXT_COLOR, align: "left",
  } as TextBlock]);

  const addLinkBlock = () => {
    const url = window.prompt("Cole o link externo (https://...)");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast.error("Link inválido"); return; }
    setBlocks((bs) => [...bs, { id: newId(), type: "link", url, title: url } as LinkBlock]);
  };

  // ───────────────── Upload de mídia ─────────────────
  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !user?.id) return;
    const localUrl = URL.createObjectURL(f);
    const tempBlock: ImageBlock = { id: newId(), type: "image", url: localUrl };
    setBlocks((bs) => [...bs, tempBlock]);
    try {
      const r = await smartImageUpload(f, user.id, "diary-vip", "post-media", () => {});
      updateBlock(tempBlock.id, { url: r.publicUrl });
      URL.revokeObjectURL(localUrl);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao enviar imagem");
      removeBlock(tempBlock.id);
    }
  };

  const handleVideoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !user?.id) return;
    if (f.size > 80 * 1024 * 1024) { toast.error("Vídeo muito grande (máx 80MB)"); return; }
    toast.loading("Enviando vídeo...", { id: "diary-vid" });
    try {
      const r = await smartVideoUpload(f, user.id, "diary-vip", "post-media", () => {});
      setBlocks((bs) => [...bs, { id: newId(), type: "video", url: r.publicUrl } as VideoBlock]);
      toast.success("Vídeo adicionado", { id: "diary-vid" });
    } catch (err: any) { toast.error(err?.message || "Falha ao enviar vídeo", { id: "diary-vid" }); }
  };

  const handleAudioPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !user?.id) return;
    if (f.size > 30 * 1024 * 1024) { toast.error("Áudio muito grande (máx 30MB)"); return; }
    toast.loading("Enviando áudio...", { id: "diary-aud" });
    try {
      const r = await smartVideoUpload(f, user.id, "diary-vip-audio", "post-media", () => {});
      setBlocks((bs) => [...bs, { id: newId(), type: "audio", url: r.publicUrl } as AudioBlock]);
      toast.success("Áudio adicionado", { id: "diary-aud" });
    } catch (err: any) { toast.error(err?.message || "Falha ao enviar áudio", { id: "diary-aud" }); }
  };

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (coverPreview && coverFile) URL.revokeObjectURL(coverPreview);
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const openImageEditorFor = useCallback(async (block: ImageBlock) => {
    try {
      const resp = await fetch(block.url);
      const blob = await resp.blob();
      const file = new File([blob], "diary-image.jpg", { type: blob.type || "image/jpeg" });
      setEditingImage({ blockId: block.id, file });
    } catch { toast.error("Não foi possível abrir o editor de imagem"); }
  }, []);

  const onImageEdited = async (editedUrl: string) => {
    if (!editingImage || !user?.id) return;
    try {
      const resp = await fetch(editedUrl);
      const blob = await resp.blob();
      const file = new File([blob], "diary-edited.jpg", { type: blob.type || "image/jpeg" });
      const r = await smartImageUpload(file, user.id, "diary-vip", "post-media", () => {});
      updateBlock(editingImage.blockId, { url: r.publicUrl });
      toast.success("Imagem atualizada");
    } catch (err: any) { toast.error(err?.message || "Falha ao salvar imagem editada"); }
    finally { setEditingImage(null); }
  };

  // ───────────────────────── IA ─────────────────────────
  /** Wrapper resiliente: tenta invoke, e em caso de "Failed to send a request"
   *  faz fallback para fetch direto via VITE_SUPABASE_URL. */
  const callAI = async (system: string, userMsg: string): Promise<string> => {
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    };
    try {
      const { data, error } = await supabase.functions.invoke("openai-chat", { body });
      if (error) throw new Error(error.message || "Falha na função de IA");
      const txt = (data as any)?.choices?.[0]?.message?.content?.trim();
      if (!txt) throw new Error((data as any)?.error || "IA não retornou resposta");
      return txt;
    } catch (e: any) {
      // Fallback fetch direto
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-chat`;
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) throw e;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          },
          body: JSON.stringify(body),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.error || `Erro IA (${resp.status})`);
        const txt = json?.choices?.[0]?.message?.content?.trim();
        if (!txt) throw new Error("IA não retornou resposta");
        return txt;
      } catch (e2: any) {
        throw new Error(e2?.message || e?.message || "Falha ao contatar IA");
      }
    }
  };

  const concatPlainText = useMemo(() => {
    return blocks.map((b) => {
      if (b.type === "text") return b.text || stripHtml(b.html);
      if (b.type === "link") return b.url;
      if (b.type === "image") return b.caption || "";
      return "";
    }).filter(Boolean).join("\n\n");
  }, [blocks]);

  const aiTeaser = async () => {
    if (!concatPlainText.trim()) { toast.error("Escreva o texto antes de gerar o teaser"); return; }
    setAiLoading("teaser");
    try {
      const out = await callAI(
        "Você cria teasers curtos e instigantes (até 280 caracteres) em português do Brasil para o Diário VIP de um criador adulto. Tom: sensual, misterioso, sofisticado, sem clichês. Nunca prometa o que não está no texto.",
        `TÍTULO: ${title}\n\nTEXTO:\n${concatPlainText.slice(0, 4000)}\n\nGere apenas o teaser, sem aspas.`,
      );
      setTeaser(out.slice(0, 600));
      toast.success("Teaser gerado");
    } catch (e: any) { toast.error(e?.message || "Erro IA"); }
    finally { setAiLoading(null); }
  };

  /** Atua sobre o PRIMEIRO bloco de texto. Se o usuário quiser, pode focar
   *  outro bloco antes — futura iteração suporta seleção ativa. */
  const firstTextBlock = (): TextBlock | null => {
    const b = blocks.find((x) => x.type === "text") as TextBlock | undefined;
    return b || null;
  };

  const aiImproveFormat = async () => {
    const b = firstTextBlock();
    if (!b || !(b.text || stripHtml(b.html)).trim()) {
      toast.error("Escreva algo no primeiro bloco de texto"); return;
    }
    setAiLoading("improve");
    try {
      const out = await callAI(
        "Você é um editor literário brasileiro. Reformate o texto preservando voz e intenção do autor: melhore ritmo, fluidez, parágrafos e clareza. Estruture em parágrafos curtos (2-4 linhas) separados por linha em branco. NÃO invente fatos. Retorne APENAS HTML simples usando <p>, <strong>, <em> e <br> — sem <html>, <body> ou scripts.",
        b.text || stripHtml(b.html),
      );
      const cleaned = sanitizeAiHtml(out);
      updateBlock(b.id, { html: cleaned, text: stripHtml(cleaned) });
      toast.success("Texto reformatado");
    } catch (e: any) { toast.error(e?.message || "Erro IA"); }
    finally { setAiLoading(null); }
  };

  const aiSpellCheck = async () => {
    const b = firstTextBlock();
    if (!b || !(b.text || stripHtml(b.html)).trim()) {
      toast.error("Escreva algo no primeiro bloco de texto"); return;
    }
    setAiLoading("spell");
    try {
      const out = await callAI(
        "Você é um revisor ortográfico e gramatical de português do Brasil. Corrija apenas ortografia, acentuação, concordância e pontuação. NÃO mude estilo, ritmo ou sentido. Preserve quebras de parágrafo. Retorne APENAS o texto corrigido em HTML simples usando <p> e <br>, sem comentários.",
        b.text || stripHtml(b.html),
      );
      const cleaned = sanitizeAiHtml(out);
      updateBlock(b.id, { html: cleaned, text: stripHtml(cleaned) });
      toast.success("Ortografia corrigida");
    } catch (e: any) { toast.error(e?.message || "Erro IA"); }
    finally { setAiLoading(null); }
  };

  const aiHighlights = async () => {
    if (!concatPlainText.trim()) { toast.error("Escreva o texto antes de pedir destaques"); return; }
    setAiLoading("highlights");
    try {
      const out = await callAI(
        "Você é um editor. Liste de 3 a 6 frases curtas (até 14 palavras cada) que merecem destaque no texto. Retorne uma frase por linha, sem numeração, sem aspas, sem comentários.",
        concatPlainText.slice(0, 4000),
      );
      const lines = out.split(/\n+/).map((l) => l.replace(/^[\-\*\d\.\)\s]+/, "").trim()).filter(Boolean).slice(0, 6);
      setHighlights(lines);
      toast.success(`${lines.length} sugestões de destaque`);
    } catch (e: any) { toast.error(e?.message || "Erro IA"); }
    finally { setAiLoading(null); }
  };

  // ───────────────────────── Submit ─────────────────────────
  const handleSubmit = async () => {
    if (!user?.id || !ownerProfileId) { toast.error("Sessão inválida"); return; }
    if (!title.trim()) { toast.error("Título obrigatório"); return; }
    if (!concatPlainText.trim()) { toast.error("Adicione algum conteúdo"); return; }
    const priceNum = privacy === "paid" ? parseFloat(price.replace(",", ".")) : 0;
    if (privacy === "paid" && (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 500)) {
      toast.error("Valor avulso deve estar entre R$ 1,00 e R$ 500,00"); return;
    }

    setSubmitting(true);
    try {
      let coverUrl: string | null = null;
      if (coverFile) {
        const r = await smartImageUpload(coverFile, user.id, "vip-diary-cover", "post-media", () => {});
        coverUrl = r.publicUrl;
      }

      // Resolve série (existente ou nova)
      let resolvedSeriesId: string | null = seriesId !== "none" ? seriesId : null;
      let resolvedSeriesTitle: string | null = null;
      if (!resolvedSeriesId && newSeriesTitle.trim()) {
        try {
          const { data: newSerie, error: sErr } = await (supabase as any)
            .from("creator_content_series")
            .insert({ creator_id: ownerProfileId, title: newSeriesTitle.trim().slice(0, 120) })
            .select("id, title").single();
          if (sErr) throw sErr;
          resolvedSeriesId = newSerie.id;
          resolvedSeriesTitle = newSerie.title;
        } catch (e: any) {
          toast.error(e?.message || "Falha ao criar série");
        }
      } else if (resolvedSeriesId) {
        resolvedSeriesTitle = series.find((s) => s.id === resolvedSeriesId)?.title || null;
      }

      const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);
      const privacyLevel =
        privacy === "friends" ? "friends"
        : privacy === "paid"  ? "vip"
        : "public";
      const wordCount = concatPlainText.trim().split(/\s+/).filter(Boolean).length;
      const readMinutes = Math.max(1, Math.round(wordCount / 200));

      const normalizedBlocks: Block[] = blocks.map((b) => {
        if (b.type !== "text") return b;
        const html = b.html || escapeHtmlBasic(b.text || "").replace(/\n/g, "<br>");
        return { ...b, html, text: stripHtml(html) };
      });

      const payload: any = {
        author_id: authorProfileId,
        creator_id: creatorId,
        content_text: concatPlainText.trim(),
        media_type: "text",
        thumbnail_url: coverUrl ?? (isEditing ? editingPost.thumbnail_url : null),
        privacy_level: privacyLevel,
        is_locked: privacy === "paid",
        is_paid: privacy === "paid",
        paid_price: priceNum || 0,
        section_type: "diary",
        content_format: "narrative",
        narrative_status: "published",
        title: title.trim().slice(0, 200),
        subtitle: subtitle.trim().slice(0, 250) || null,
        teaser: teaser.trim().slice(0, 600) || null,
        read_time_minutes: readMinutes,
        series_id: resolvedSeriesId,
        series_title: resolvedSeriesTitle,
        chapter_number: chapterNumber ? parseInt(chapterNumber, 10) : null,
        style_meta: {
          diary_blocks: normalizedBlocks,
          paid_method: privacy === "paid" ? paidMethod : null,
          editor_version: "diary-blog-v2",
          share_username: username || null,
          tags: tags.map(normalizeTag).filter(Boolean).slice(0, MAX_TAGS_PER_POST),
        },
      };


      let savedId: string | null = isEditing ? editingPost.id : null;

      // ── Agendamento: cria registro pendente e NÃO insere no feed agora ──
      if (!isEditing && scheduleEnabled) {
        if (!scheduleAt) { toast.error("Escolha data e hora do agendamento"); setSubmitting(false); return; }
        const when = new Date(scheduleAt);
        if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 30_000) {
          toast.error("O agendamento precisa ser pelo menos 1 minuto no futuro");
          setSubmitting(false); return;
        }
        await schedulePost.mutateAsync({ payload, scheduled_for: when });
        toast.success(`Agendado para ${when.toLocaleString("pt-BR")}`);
        queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] });
        handleClose(false);
        return;
      }

      if (isEditing) {
        const { author_id, creator_id, ...up } = payload;
        const { error } = await (supabase as any).from("posts").update(up).eq("id", editingPost.id);
        if (error) throw error;
        toast.success("Página do diário atualizada!");
      } else {
        const { data, error } = await (supabase as any).from("posts").insert(payload).select("id").single();
        if (error) throw error;
        savedId = data?.id || null;
        if (savedId) setPublishedId(savedId);
        toast.success("Página do diário publicada!");
      }

      // Memoriza tags para futuras sugestões (incrementa frequência)
      if (user?.id && tags.length) {
        const next = incrementTagFreq(user.id, tags);
        setTagFreq(next);
      }

      queryClient.invalidateQueries({ queryKey: ["creator-channel"] });
      queryClient.invalidateQueries({ queryKey: ["creator-media"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["posts-infinite"] });
      queryClient.refetchQueries({ queryKey: ["posts-infinite"], type: "active" });

      // Mantém modal aberto para mostrar link de compartilhamento gerado
      if (!isEditing && savedId) {
        // Não fecha — usuário copia o link e fecha manualmente
      } else {
        handleClose(false);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao publicar");
    } finally { setSubmitting(false); }
  };

  // ───────────────────────── Compartilhar ─────────────────────────
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copiado!");
    } catch { toast.error("Não foi possível copiar"); }
  };
  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, text: teaser || title, url: shareUrl });
      } catch { /* cancelado */ }
    } else {
      copyShareLink();
    }
  };

  // ───────────────────────── Render ─────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className={cn(
          "p-0 gap-0 border-border bg-background",
          "w-screen h-[100dvh] max-w-none rounded-none",
          "sm:w-full sm:h-auto sm:max-h-[94vh] sm:max-w-3xl sm:rounded-lg",
          "flex flex-col overflow-hidden min-h-0",
        )}>
          <DialogHeader className="px-4 py-3 border-b border-border/60 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Notebook className="h-5 w-5 text-[hsl(45,93%,55%)]" />
              {isEditing ? "Editar página do diário" : "Nova página do Diário VIP"}
              <span className="text-muted-foreground font-normal truncate"> — {finalChannelName}</span>
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Editor tipo blog: texto rico, imagens editáveis, vídeo, áudio, links e IA.
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 py-4 space-y-4 [&::-webkit-scrollbar]:hidden"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Cabeçalho */}
            <div className="space-y-2">
              <Label htmlFor="d-title">Título *</Label>
              <Input id="d-title" placeholder="Ex.: Uma noite que nunca vou esquecer"
                value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-sub">Subtítulo</Label>
              <Input id="d-sub" placeholder="Uma linha curta para complementar"
                value={subtitle} onChange={(e) => setSubtitle(e.target.value.slice(0, 250))} maxLength={250} />
            </div>

            {/* Série / Capítulo */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-2">
                <BookMarked className="h-4 w-4 text-amber-400" />
                Série / Capítulo
                <span className="text-[10px] text-muted-foreground font-normal">(opcional — habilita navegação entre capítulos)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Série existente</Label>
                  <Select value={seriesId} onValueChange={(v) => { setSeriesId(v); if (v !== "none") setNewSeriesTitle(""); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {series.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Nº do capítulo</Label>
                  <Input
                    type="number" min="1" inputMode="numeric" placeholder="1"
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value.replace(/[^0-9]/g, ""))}
                    className="h-9"
                  />
                </div>
              </div>
              {seriesId === "none" && (
                <div className="space-y-1.5">
                  <Label className="text-[11px]">…ou criar nova série</Label>
                  <Input
                    placeholder="Título da nova série (ex.: Segredos de Canela)"
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value.slice(0, 120))}
                    maxLength={120}
                    className="h-9"
                  />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Capítulos da mesma série recebem botões «Anterior» / «Próximo» automaticamente na leitura.
              </p>
            </div>


            {/* Tags */}
            <TagsSection
              tags={tags}
              setTags={setTags}
              tagInput={tagInput}
              setTagInput={setTagInput}
              tagFreq={tagFreq}
              contextText={`${title} \n ${subtitle} \n ${teaser} \n ${concatPlainText}`}
              tagFocused={tagFocused}
              setTagFocused={setTagFocused}
              tagHighlightIdx={tagHighlightIdx}
              setTagHighlightIdx={setTagHighlightIdx}
            />



            {/* Capa */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverPick} className="hidden" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Capa (opcional)</p>
                  <p className="text-[11px] text-muted-foreground">Aparece no card do diário.</p>
                </div>
                {coverPreview && (
                  <img decoding="async" src={coverPreview} alt="capa" loading="lazy"
                    className="h-14 w-14 object-cover rounded-md border border-border shrink-0" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Enviar capa
                </Button>
                {coverPreview && (
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => { if (coverFile && coverPreview) URL.revokeObjectURL(coverPreview); setCoverFile(null); setCoverPreview(""); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
                  </Button>
                )}
              </div>
            </div>

            {/* Teaser + IA */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label htmlFor="d-teaser">Teaser (sempre visível) <span className="text-muted-foreground text-[10px]">{teaser.length}/600</span></Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={aiTeaser} disabled={aiLoading === "teaser"}>
                  {aiLoading === "teaser" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  Gerar com IA
                </Button>
              </div>
              <Textarea id="d-teaser" placeholder="Resumo público que aparece para todo mundo, mesmo sem acesso."
                value={teaser} onChange={(e) => setTeaser(e.target.value.slice(0, 600))} rows={3} className="resize-none" />
            </div>

            {/* IA — barra de ações sobre o texto */}
            <div className="rounded-lg border border-border bg-card/30 p-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> IA sobre o texto:
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={aiImproveFormat} disabled={aiLoading === "improve"}>
                {aiLoading === "improve" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                Melhorar formatação
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={aiSpellCheck} disabled={aiLoading === "spell"}>
                {aiLoading === "spell" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <SpellCheck2 className="h-3 w-3 mr-1" />}
                Corrigir ortografia
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={aiHighlights} disabled={aiLoading === "highlights"}>
                {aiLoading === "highlights" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Highlighter className="h-3 w-3 mr-1" />}
                Sugerir destaques
              </Button>
            </div>

            {highlights.length > 0 && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                  <Highlighter className="h-3 w-3" /> Pontos de destaque sugeridos
                </p>
                <ul className="text-[12px] text-foreground/80 space-y-1 list-disc pl-4">
                  {highlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
                <p className="text-[10px] text-muted-foreground">Selecione esses trechos no texto e clique em B/I/U para destacá-los.</p>
              </div>
            )}

            {/* Blocos */}
            <div className="space-y-3">
              <Label className="text-xs">Conteúdo *</Label>

              {blocks.map((b, idx) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  isFirst={idx === 0}
                  isLast={idx === blocks.length - 1}
                  onChange={(patch) => updateBlock(b.id, patch)}
                  onRemove={() => removeBlock(b.id)}
                  onMoveUp={() => moveBlock(b.id, -1)}
                  onMoveDown={() => moveBlock(b.id, 1)}
                  onEditImage={() => b.type === "image" && openImageEditorFor(b as ImageBlock)}
                />
              ))}

              {/* Toolbar inserção */}
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
              <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoPick} className="hidden" />
              <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioPick} className="hidden" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-9" onClick={addTextBlock}><TypeIcon className="h-3.5 w-3.5 mr-1.5" /> Texto</Button>
                <Button size="sm" variant="outline" className="h-9" onClick={() => imageInputRef.current?.click()}><ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Imagem</Button>
                <Button size="sm" variant="outline" className="h-9" onClick={() => videoInputRef.current?.click()}><VideoIcon className="h-3.5 w-3.5 mr-1.5" /> Vídeo</Button>
                <Button size="sm" variant="outline" className="h-9" onClick={() => audioInputRef.current?.click()}><Music className="h-3.5 w-3.5 mr-1.5" /> Áudio</Button>
                <Button size="sm" variant="outline" className="h-9" onClick={addLinkBlock}><Link2 className="h-3.5 w-3.5 mr-1.5" /> Link</Button>
              </div>
            </div>

            {/* Privacidade */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> Privacidade</p>
              <div className="grid grid-cols-3 gap-2">
                <PrivacyChip active={privacy === "public"} onClick={() => setPrivacy("public")} icon={<Globe2 className="h-3.5 w-3.5" />} label="Público" />
                <PrivacyChip active={privacy === "friends"} onClick={() => setPrivacy("friends")} icon={<Users className="h-3.5 w-3.5" />} label="Amigos" />
                <PrivacyChip active={privacy === "paid"} onClick={() => setPrivacy("paid")} icon={<DollarSign className="h-3.5 w-3.5" />} label="Pago" />
              </div>
              {privacy === "paid" && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Preço avulso (R$)</Label>
                    <Input type="number" step="0.01" min="1" max="500" inputMode="decimal"
                      value={price} onChange={(e) => setPrice(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Métodos de pagamento aceitos</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <PrivacyChip active={paidMethod === "pix"} onClick={() => setPaidMethod("pix")} icon={null} label="PIX" />
                      <PrivacyChip active={paidMethod === "card"} onClick={() => setPaidMethod("card")} icon={null} label="Cartão" />
                      <PrivacyChip active={paidMethod === "both"} onClick={() => setPaidMethod("both")} icon={null} label="Ambos" />
                    </div>
                  </div>
                </div>
              )}
              {privacy === "friends" && (
                <p className="text-[11px] text-muted-foreground">Somente quem te segue verá esta página.</p>
              )}
            </div>

            {/* Agendamento */}
            {!isEditing && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarClock className="h-4 w-4 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">Agendar publicação</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Defina data e hora — vai para o feed automaticamente.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={scheduleEnabled}
                    onClick={() => setScheduleEnabled((v) => !v)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      scheduleEnabled ? "bg-sky-500" : "bg-muted",
                    )}
                  >
                    <span className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                      scheduleEnabled ? "translate-x-5" : "translate-x-0.5",
                    )} />
                  </button>
                </div>
                {scheduleEnabled && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Data e horário</Label>
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      min={minScheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="h-9"
                    />
                    {scheduleAt && (
                      <p className="text-[10px] text-sky-300/90">
                        Publica em {new Date(scheduleAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Enquanto não chegar a hora, a página fica salva como agendada e não aparece no feed.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Compartilhamento */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Share2 className="h-4 w-4 text-amber-400" /> Link de compartilhamento
                {!shareId && <span className="text-[10px] text-muted-foreground font-normal">(prévia — atualizado ao publicar)</span>}
              </p>
              <Input value={shareUrl} readOnly onFocus={(e) => e.currentTarget.select()} className="text-xs" />

              {/* Preview estilo Open Graph (WhatsApp/Telegram/Facebook) */}
              <div className="rounded-md border border-border/70 bg-card/40 overflow-hidden">
                {coverPreview ? (
                  <img decoding="async" src={coverPreview} alt="" className="w-full aspect-[1.91/1] object-cover" loading="lazy" />
                ) : (
                  <div className="w-full aspect-[1.91/1] bg-gradient-to-br from-amber-500/20 via-background to-pink-500/10 flex items-center justify-center">
                    <Notebook className="h-10 w-10 text-amber-400/60" />
                  </div>
                )}
                <div className="p-2.5 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                    {(() => { try { return new URL(shareUrl).host; } catch { return "ocultoswing.com.br"; } })()}
                  </p>
                  <p className="text-sm font-semibold leading-tight line-clamp-2">
                    {title.trim() || "Título da sua página"}
                  </p>
                  {(subtitle.trim() || teaser.trim()) && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {subtitle.trim() || teaser.trim()}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={copyShareLink}
                  className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white border-0">
                  <Copy className="h-3.5 w-3.5 mr-1.5" />Copiar
                </Button>
                <Button size="sm" onClick={nativeShare}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white border-0">
                  <Share2 className="h-3.5 w-3.5 mr-1.5" />Compartilhar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Vinculado ao seu username — qualquer visita que assinar pelo link conta como sua indicação.
              </p>
            </div>
          </div>

          <DialogFooter className="px-3 py-2 border-t border-border/60 gap-2 flex-row shrink-0">
            <Button onClick={() => handleClose(false)} disabled={submitting}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white border-0">
              Cancelar
            </Button>
            <Button onClick={() => setShowPreview(true)} disabled={submitting}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white border-0">
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Pré-visualizar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !title.trim() || !concatPlainText.trim()}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] hover:from-[hsl(45,93%,55%)] hover:to-[hsl(35,80%,48%)] text-[hsl(45,93%,10%)] font-semibold">
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {isEditing ? "Salvar" : (scheduleEnabled ? "Agendar" : "Publicar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className={cn(
          "p-0 gap-0 border-border bg-background",
          "w-screen h-[100dvh] max-w-none rounded-none",
          "sm:w-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg",
          "flex flex-col overflow-hidden min-h-0",
        )}>
          <DialogHeader className="px-4 py-3 border-b border-border/60 shrink-0">
            <DialogTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Pré-visualização</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "thin" }}>
            <article className="px-4 py-5 max-w-2xl mx-auto">
              {coverPreview && (
                <img decoding="async" src={coverPreview} alt="" loading="lazy"
                  className="w-full aspect-video object-cover rounded-lg mb-4 border border-border" />
              )}
              <h1 className="text-2xl font-bold mb-1">{title || "Sem título"}</h1>
              {subtitle && <p className="text-muted-foreground mb-3">{subtitle}</p>}
              {teaser && (
                <blockquote className="border-l-4 border-amber-400 pl-3 italic text-sm text-muted-foreground mb-5">{teaser}</blockquote>
              )}
              <div className="space-y-4">
                {blocks.map((b) => <BlockPreview key={b.id} block={b} />)}
              </div>
            </article>
          </div>
          <DialogFooter className="px-3 py-2 border-t border-border/60 shrink-0">
            <Button variant="ghost" onClick={() => setShowPreview(false)} className="flex-1 sm:flex-initial">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingImage && (
        <Suspense fallback={null}>
          <ImageEditor
            open={!!editingImage}
            onOpenChange={(o) => { if (!o) setEditingImage(null); }}
            imageFile={editingImage.file}
            onSave={onImageEdited}
          />
        </Suspense>
      )}
    </>
  );
}

// ───────────────────────── Sanitização HTML da IA ─────────────────────────
/** Permite apenas tags inline/parágrafo seguras. Remove scripts/styles. */
function sanitizeAiHtml(raw: string): string {
  if (!raw) return "";
  // Remove blocos de código markdown se a IA tiver envolvido a resposta
  const noMd = raw.replace(/^```html?\s*/i, "").replace(/```\s*$/i, "").trim();
  const div = document.createElement("div");
  div.innerHTML = noMd;
  const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "SPAN", "DIV", "UL", "OL", "LI", "A"]);
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        // Substitui por seus filhos (achata)
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
      } else {
        // Limpa atributos perigosos
        [...child.attributes].forEach((a) => {
          if (!["href", "target", "rel", "style"].includes(a.name)) child.removeAttribute(a.name);
          if (a.name === "href" && /^javascript:/i.test(a.value)) child.removeAttribute("href");
        });
        walk(child as Element);
      }
    });
  };
  walk(div);
  return div.innerHTML;
}

// ───────────────────────── Bloco — Editor inline ─────────────────────────
function BlockEditor({
  block, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown, onEditImage,
}: {
  block: Block;
  isFirst: boolean; isLast: boolean;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEditImage: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {block.type === "text" ? "Texto" : block.type === "image" ? "Imagem" : block.type === "video" ? "Vídeo" : block.type === "audio" ? "Áudio" : "Link"}
        </span>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveUp} disabled={isFirst} aria-label="Mover para cima"><ArrowUp className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveDown} disabled={isLast} aria-label="Mover para baixo"><ArrowDown className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={onRemove} aria-label="Remover"><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>

      {block.type === "text" && <TextBlockEditor block={block} onChange={onChange} />}
      {block.type === "image" && (
        <div className="space-y-2">
          <div className="relative">
            <img decoding="async" src={block.url} alt="" loading="lazy" className="w-full rounded-md object-contain max-h-80 bg-black/30" />
            <Button size="sm" variant="secondary" className="absolute top-2 right-2 h-7 text-xs" onClick={onEditImage}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          </div>
          <Input placeholder="Legenda (opcional)" value={block.caption || ""}
            onChange={(e) => onChange({ caption: e.target.value })} className="h-8 text-sm" />
        </div>
      )}
      {block.type === "video" && (
        <div className="space-y-2">
          <DiaryMediaPlayer src={block.url} kind="video" />
          <Input placeholder="Legenda (opcional)" value={block.caption || ""}
            onChange={(e) => onChange({ caption: e.target.value })} className="h-8 text-sm" />
        </div>
      )}
      {block.type === "audio" && (
        <div className="space-y-2">
          <DiaryMediaPlayer src={block.url} kind="audio" />
          <Input placeholder="Legenda (opcional)" value={block.caption || ""}
            onChange={(e) => onChange({ caption: e.target.value })} className="h-8 text-sm" />
        </div>
      )}
      {block.type === "link" && (
        <LinkPreviewCard url={block.url} title={block.title} onTitle={(t) => onChange({ title: t })} editable />
      )}
    </div>
  );
}

// ───────────────────────── Editor rico (contentEditable) ─────────────────────────
function TextBlockEditor({ block, onChange }: { block: TextBlock; onChange: (p: Partial<Block>) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSelectionRef = useRef<Range | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const resolvedTextColor = resolveDiaryTextColor(block.color);

  // Sincroniza HTML externo (ex.: pós IA) sem perder cursor enquanto digita
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const normalizedHtml = normalizeDiaryHtml(block.html || "");
    if (el.innerHTML !== normalizedHtml && !isFocused) {
      el.innerHTML = normalizedHtml;
    }
  }, [block.html, isFocused]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) {
      lastSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = lastSelectionRef.current;
    const el = editorRef.current;
    if (!range || !el) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  };

  const selectAllInEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const hasSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    return editorRef.current?.contains(sel.anchorNode) ?? false;
  };

  /** Aplica execCommand na seleção atual. Se não há seleção, seleciona tudo antes. */
  const applyCommand = (command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (lastSelectionRef.current) restoreSelection();
    if (!hasSelection()) selectAllInEditor();
    try {
      // execCommand é depreciado mas amplamente suportado e zero-dependência (essencial p/ celulares antigos)
      document.execCommand(command, false, value);
    } catch { /* noop */ }
    flushHtml();
  };

  const flushHtml = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = normalizeDiaryHtml(el.innerHTML);
    if (html !== el.innerHTML) el.innerHTML = html;
    onChange({ html, text: stripHtml(html) });
  };

  const onInput = () => { flushHtml(); };

  const insertLink = () => {
    const url = window.prompt("Cole a URL (https://...)");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast.error("Link inválido"); return; }
    applyCommand("createLink", url);
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap bg-background/60 rounded-md p-1.5 border border-border/40">
        <select
          value={block.fontFamily}
          onMouseDown={saveSelection}
          onChange={(e) => { onChange({ fontFamily: e.target.value }); applyCommand("fontName", e.target.value); }}
          className="h-7 text-[11px] bg-background border border-border rounded px-1 max-w-[120px]"
          aria-label="Fonte"
        >
          {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select
          value={block.fontSize}
          onMouseDown={saveSelection}
          onChange={(e) => {
            const size = parseInt(e.target.value, 10);
            onChange({ fontSize: size });
            // execCommand fontSize aceita 1-7 — usamos wrapper span com style
            applyCommandFontSizePx(editorRef.current, size, saveSelection, restoreSelection, hasSelection, selectAllInEditor);
            flushHtml();
          }}
          className="h-7 text-[11px] bg-background border border-border rounded px-1"
          aria-label="Tamanho"
        >
          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
        </select>

        <ToolbarBtn label="Negrito" onMouseDown={saveSelection} onClick={() => applyCommand("bold")}><Bold className="h-3 w-3" /></ToolbarBtn>
        <ToolbarBtn label="Itálico" onMouseDown={saveSelection} onClick={() => applyCommand("italic")}><Italic className="h-3 w-3" /></ToolbarBtn>
        <ToolbarBtn label="Sublinhado" onMouseDown={saveSelection} onClick={() => applyCommand("underline")}><Underline className="h-3 w-3" /></ToolbarBtn>
        <ToolbarBtn label="Riscado" onMouseDown={saveSelection} onClick={() => applyCommand("strikeThrough")}><Strikethrough className="h-3 w-3" /></ToolbarBtn>

        <span className="w-px h-5 bg-border mx-0.5" />

        <ToolbarBtn label="Alinhar esquerda" onMouseDown={saveSelection} onClick={() => { applyCommand("justifyLeft"); onChange({ align: "left" }); }}><AlignLeft className="h-3 w-3" /></ToolbarBtn>
        <ToolbarBtn label="Centralizar" onMouseDown={saveSelection} onClick={() => { applyCommand("justifyCenter"); onChange({ align: "center" }); }}><AlignCenter className="h-3 w-3" /></ToolbarBtn>
        <ToolbarBtn label="Alinhar direita" onMouseDown={saveSelection} onClick={() => { applyCommand("justifyRight"); onChange({ align: "right" }); }}><AlignRight className="h-3 w-3" /></ToolbarBtn>

        <span className="w-px h-5 bg-border mx-0.5" />

        <ToolbarBtn label="Inserir link" onMouseDown={saveSelection} onClick={insertLink}><Link2 className="h-3 w-3" /></ToolbarBtn>
        <ToolbarBtn label="Limpar formatação" onMouseDown={saveSelection} onClick={() => applyCommand("removeFormat")}><RemoveFormatting className="h-3 w-3" /></ToolbarBtn>

        <div className="flex items-center gap-0.5 ml-1 flex-wrap">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              onClick={() => {
                const nextColor = resolveDiaryTextColor(c);
                onChange({ color: nextColor });
                applyCommand("foreColor", nextColor);
              }}
              className={cn(
                "h-5 w-5 rounded-full border",
                resolvedTextColor === resolveDiaryTextColor(c) ? "ring-2 ring-amber-400 border-transparent" : "border-border",
              )}
              style={{ background: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={() => { saveSelection(); setIsFocused(false); flushHtml(); }}
        onFocus={() => setIsFocused(true)}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={(e) => {
          e.preventDefault();
          const cd = e.clipboardData;
          if (!cd) return;
          const plain = (cd.getData("text/plain") || "").trim();
          const html = cd.getData("text/html") || "";
          // URL única colada → vira link clicável (com preview na leitura)
          if (plain && SINGLE_URL_REGEX.test(plain)) {
            const safe = plain.replace(/"/g, "%22");
            document.execCommand(
              "insertHTML", false,
              `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="color:#fbbf24;text-decoration:underline;word-break:break-all">${safe}</a>&nbsp;`
            );
            flushHtml();
            return;
          }
          // HTML rico: sanitiza (remove fundos/cores claras/larguras) preservando estrutura
          if (html) {
            const cleaned = sanitizePastedHtml(html);
            document.execCommand("insertHTML", false, cleaned || (plain.replace(/\n/g, "<br>")));
          } else {
            // Texto puro: preserva quebras, auto-linkifica URLs
            const escaped = plain
              .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(URL_REGEX, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer" style="color:#fbbf24;text-decoration:underline;word-break:break-all">${m}</a>`)
              .replace(/\n/g, "<br>");
            document.execCommand("insertHTML", false, escaped);
          }
          flushHtml();
        }}
        className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-auto [&_*]:!bg-transparent [&_*]:!max-w-full [&_a]:text-amber-400 [&_a]:underline [&_a]:break-all"
        style={{
          fontFamily: block.fontFamily,
          fontSize: `${block.fontSize}px`,
          color: resolvedTextColor,
          textAlign: block.align || "left",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 320,
        }}
        data-placeholder="Escreva ou cole aqui... a formatação é mantida e fundos brancos são removidos automaticamente."
        suppressHydrationWarning
      />

      <p className="text-[10px] text-muted-foreground">
        Dica: selecione o trecho que quer formatar antes de clicar nos botões.
        Sem seleção, o efeito é aplicado a todo o bloco.
      </p>
    </div>
  );
}

/** Aplica font-size em px envolvendo a seleção com <span style="font-size:Npx">. */
function applyCommandFontSizePx(
  el: HTMLElement | null, sizePx: number,
  saveSelection: () => void, restoreSelection: () => boolean,
  hasSelection: () => boolean, selectAll: () => void,
) {
  if (!el) return;
  el.focus();
  restoreSelection();
  if (!hasSelection()) selectAll();
  // Usa execCommand fontSize com sentinela 7 e depois reescreve os spans gerados
  try { document.execCommand("fontSize", false, "7"); } catch {}
  el.querySelectorAll('font[size="7"]').forEach((node) => {
    const span = document.createElement("span");
    span.style.fontSize = `${sizePx}px`;
    span.innerHTML = (node as HTMLElement).innerHTML;
    node.replaceWith(span);
  });
  saveSelection();
}

function ToolbarBtn({ children, onClick, onMouseDown, label }: { children: React.ReactNode; onClick: () => void; onMouseDown?: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onMouseDown?.(e); }}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-foreground/80 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function LinkPreviewCard({ url, title, onTitle, editable }: { url: string; title?: string; onTitle?: (t: string) => void; editable?: boolean }) {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="block rounded-md border border-border bg-background/60 p-3 hover:bg-background/80 transition-colors"
      onClick={(e) => editable && e.preventDefault()}
    >
      <div className="flex items-start gap-3">
        <img decoding="async" src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`}
          alt="" width={32} height={32} loading="lazy" className="rounded shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {editable ? (
            <Input value={title || ""} onChange={(e) => onTitle?.(e.target.value)}
              placeholder="Título (opcional)" className="h-7 text-xs mb-1" />
          ) : (title && <p className="text-sm font-medium truncate">{title}</p>)}
          <p className="text-[11px] text-muted-foreground truncate">{host}</p>
          <p className="text-[10px] text-muted-foreground/70 truncate">{url}</p>
        </div>
      </div>
    </a>
  );
}

// ───────────────────────── Bloco — Preview leitura ─────────────────────────
function BlockPreview({ block }: { block: Block }) {
  if (block.type === "text") {
    const html = autoLinkify(normalizeDiaryHtml(block.html || escapeHtmlBasic(block.text || "").replace(/\n/g, "<br>")));
    return (
      <div
        style={{
          fontFamily: block.fontFamily,
          fontSize: `${block.fontSize}px`,
          color: resolveDiaryTextColor(block.color),
          textAlign: block.align || "left",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (block.type === "image") {
    return (
      <figure className="space-y-1">
        <img decoding="async" src={block.url} alt={block.caption || ""} loading="lazy"
          className="w-full rounded-md object-contain max-h-[70vh] bg-black/30" />
        {block.caption && <figcaption className="text-xs text-muted-foreground text-center">{block.caption}</figcaption>}
      </figure>
    );
  }
  if (block.type === "video") return <DiaryMediaPlayer src={block.url} kind="video" />;
  if (block.type === "audio") return <DiaryMediaPlayer src={block.url} kind="audio" />;
  return <LinkPreviewCard url={block.url} title={block.title} />;
}

function PrivacyChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium border transition-colors",
        active ? "bg-amber-500/15 text-amber-300 border-amber-400/50"
               : "bg-background border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}{label}
    </button>
  );
}
