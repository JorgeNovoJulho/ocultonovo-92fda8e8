import { ExternalLink, Link2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const URL_REGEX = /https?:\/\/[^\s<>()]+/i;
const TRAILING_PUNCTUATION = /[.,!?;:)\]]+$/;

export function extractFirstUrl(text?: string | null) {
  const match = (text || '').match(URL_REGEX)?.[0];
  return match ? match.replace(TRAILING_PUNCTUATION, '') : null;
}

export function formatLastSeen(value?: string | null, showOnlineStatus?: boolean | null) {
  if (showOnlineStatus === false) return 'Offline';
  if (!value) return 'Offline';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Visto por último hoje às ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Visto por último ontem às ${time}`;

  return `Visto por último em ${date.toLocaleDateString('pt-BR')} às ${time}`;
}

function getYouTubeId(url: URL) {
  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] || null;
    return url.searchParams.get('v');
  }
  return null;
}

export function LinkPreview({ text, isMine }: { text?: string | null; isMine?: boolean }) {
  const rawUrl = extractFirstUrl(text);
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const youtubeId = getYouTubeId(parsed);
  const host = parsed.hostname.replace(/^www\./, '');
  const title = youtubeId ? 'Prévia do YouTube' : host;
  const description = youtubeId ? 'Abrir vídeo no YouTube' : parsed.pathname.length > 1 ? parsed.pathname : rawUrl;

  return (
    <a
      href={rawUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn(
        'mt-1 block overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'whitespace-normal',
        isMine
          ? 'border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15'
          : 'border-border bg-background/70 text-foreground hover:bg-muted/70'
      )}
    >
      {youtubeId && (
        <div className="relative aspect-video bg-muted">
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
            alt="Prévia do link"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-background/20">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
        </div>
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{host}</span>
          <ExternalLink className="ml-auto h-3 w-3 shrink-0" />
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
        <p className="line-clamp-2 break-all text-xs opacity-75">{description}</p>
      </div>
    </a>
  );
}
