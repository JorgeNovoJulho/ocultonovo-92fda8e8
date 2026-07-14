/**
 * TopicBody — renderiza o corpo de um tópico de comunidade.
 * Detecta tokens de mídia em markdown (![imagem](url), [vídeo](url), [áudio](url))
 * e os transforma em mídia real:
 *  • imagens consecutivas viram carrossel (object-contain, sem cortes)
 *  • clique em imagem abre lightbox em tela cheia
 *  • vídeo e áudio inline com <video controls> / <audio controls>
 * O restante do texto passa por renderMentions.
 */
import { useMemo, useState, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { renderMentions } from './renderMentions';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { InlineLinkMedia, hasEmbeddableLink } from '@/components/InlineLinkMedia';
import { isImageCached, markImageCached } from '@/lib/imageLoadCache';
import { CommunityVideoPlayer } from './CommunityVideoPlayer';

type Token =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string }
  | { type: 'video'; url: string }
  | { type: 'audio'; url: string };

const MEDIA_RE =
  /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|\[(?:vídeo|video)\]\((https?:\/\/[^\s)]+)\)|\[(?:áudio|audio)\]\((https?:\/\/[^\s)]+)\)/gi;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  MEDIA_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MEDIA_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1]) tokens.push({ type: 'image', url: m[1] });
    else if (m[2]) tokens.push({ type: 'video', url: m[2] });
    else if (m[3]) tokens.push({ type: 'audio', url: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

// Agrupa imagens consecutivas em um único bloco de carrossel
type Block =
  | { kind: 'text'; value: string }
  | { kind: 'images'; urls: string[] }
  | { kind: 'video'; url: string }
  | { kind: 'audio'; url: string };

function groupBlocks(tokens: Token[]): Block[] {
  const out: Block[] = [];
  for (const t of tokens) {
    if (t.type === 'image') {
      const last = out[out.length - 1];
      if (last && last.kind === 'images') last.urls.push(t.url);
      else out.push({ kind: 'images', urls: [t.url] });
    } else if (t.type === 'text') {
      const trimmed = t.value.replace(/\n{3,}/g, '\n\n');
      // ignora separadores puros entre mídias
      if (trimmed.trim().length > 0) out.push({ kind: 'text', value: trimmed });
    } else if (t.type === 'video') out.push({ kind: 'video', url: t.url });
    else if (t.type === 'audio') out.push({ kind: 'audio', url: t.url });
  }
  return out;
}

export function TopicBody({ body }: { body: string | null | undefined }) {
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const blocks = useMemo(() => groupBlocks(tokenize(body || '')), [body]);
  if (!body) return null;

  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.kind === 'text') {
          const embeddable = hasEmbeddableLink(b.value);
          return (
            <div key={i} className="space-y-2">
              <p className="text-sm whitespace-pre-wrap text-foreground/90 break-words">
                {renderMentions(b.value)}
              </p>
              {embeddable ? (
                <InlineLinkMedia text={b.value} />
              ) : (
                <LinkPreviewCard text={b.value} readOnly />
              )}
            </div>
          );
        }
        if (b.kind === 'images') {
          return (
            <ImageCarousel
              key={i}
              urls={b.urls}
              onOpen={(idx) => setLightbox({ urls: b.urls, index: idx })}
            />
          );
        }
        if (b.kind === 'video') {
          return <CommunityVideoPlayer key={i} url={b.url} className="my-1" />;
        }
        return (
          <audio key={i} src={b.url} controls preload="none" className="w-full" />
        );
      })}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-[100vw] w-screen h-dvh sm:h-[95vh] p-0 bg-black/95 border-0 flex items-center justify-center">
          {lightbox && (
            <Lightbox
              urls={lightbox.urls}
              index={lightbox.index}
              onClose={() => setLightbox(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImageCarousel({ urls, onOpen }: { urls: string[]; onOpen: (i: number) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const multi = urls.length > 1;

  const scrollTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-border bg-black/40">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {urls.map((u, i) => (
          <div key={i} className="min-w-full snap-start flex items-center justify-center">
            <ResilientImage
              src={u}
              alt={`Imagem ${i + 1}`}
              onClick={() => onOpen(i)}
              className="max-h-[70vh] w-auto max-w-full object-contain cursor-zoom-in"
            />
          </div>
        ))}
      </div>

      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); scrollTo(Math.max(0, active - 1)); }}
            disabled={active === 0}
            className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); scrollTo(Math.min(urls.length - 1, active + 1)); }}
            disabled={active === urls.length - 1}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
            aria-label="Próxima"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {urls.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
              />
            ))}
          </div>
          <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white">
            {active + 1}/{urls.length}
          </div>
        </>
      )}
    </div>
  );
}

function Lightbox({
  urls,
  index,
  onClose,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
}) {
  const [active, setActive] = useState(index);
  const multi = urls.length > 1;
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={urls[active]}
        alt=""
        className="max-h-full max-w-full object-contain select-none"
      />
      {multi && (
        <>
          <button
            onClick={() => setActive((a) => Math.max(0, a - 1))}
            disabled={active === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setActive((a) => Math.min(urls.length - 1, a + 1))}
            disabled={active === urls.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs px-2.5 py-1 rounded-full bg-white/10 text-white">
            {active + 1} / {urls.length}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * ResilientImage — eager loading + auto-retry com backoff em falhas transitórias.
 * Marca cache na sessão para evitar flicker em remontes.
 */
function ResilientImage({
  src, alt, className, onClick,
}: { src: string; alt: string; className?: string; onClick?: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(() => isImageCached(src));
  const finalSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`;
  return (
    <img
      src={finalSrc}
      alt={alt}
      onClick={onClick}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => { markImageCached(src); setLoaded(true); }}
      onError={() => {
        if (attempt < 3) setTimeout(() => setAttempt((a) => a + 1), 400 * (attempt + 1));
      }}
      className={className}
      style={!loaded ? { background: 'transparent' } : undefined}
    />
  );
}
