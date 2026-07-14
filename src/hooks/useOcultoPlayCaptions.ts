/**
 * useOcultoPlayCaptions — Etapa 42
 *
 * Gerencia legendas/captions do item atual:
 * - Lista os idiomas disponíveis (kind=subtitles|captions).
 * - Persiste idioma preferido em localStorage (`oculto:play:cc:lang`).
 * - Persiste offset de sincronia em localStorage (`oculto:play:cc:offset`).
 * - Faz parse do .vtt selecionado em CaptionCue[].
 * - Atualiza `currentText` conforme `currentTime` do media element.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCaptions, type CaptionCue, type PlayTrack } from '@/hooks/useOcultoPlayTracks';

const LANG_KEY = 'oculto:play:cc:lang';
const OFFSET_KEY = 'oculto:play:cc:offset';

function readPreferredLang(): string | null {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}
function writePreferredLang(lang: string | null) {
  try {
    if (lang) localStorage.setItem(LANG_KEY, lang);
    else localStorage.removeItem(LANG_KEY);
  } catch { /* ignore */ }
}
function readOffset(): number {
  try { return Number(localStorage.getItem(OFFSET_KEY)) || 0; } catch { return 0; }
}
function writeOffset(v: number) {
  try { localStorage.setItem(OFFSET_KEY, String(v)); } catch { /* ignore */ }
}

export interface UsePlayCaptionsResult {
  /** Faixas de legenda disponíveis (subtitles + captions). */
  langs: PlayTrack[];
  /** Idioma atualmente selecionado (BCP-47). */
  selectedLang: string | null;
  /** Define manualmente o idioma. Passe null para "Sem legenda". */
  setLang: (lang: string | null) => void;
  /** Cues do idioma atual. */
  cues: CaptionCue[];
  /** Texto que deve ser mostrado no instante atual (ou ''). */
  currentText: string;
  /** Offset (segundos) para sincronia fina. */
  offset: number;
  setOffset: (v: number) => void;
  /** True enquanto baixa/parseia. */
  loading: boolean;
}

export function useOcultoPlayCaptions(
  tracks: PlayTrack[],
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>,
  enabled: boolean,
): UsePlayCaptionsResult {
  const langs = useMemo(
    () => tracks.filter(t => t.kind === 'subtitles' || t.kind === 'captions'),
    [tracks],
  );

  const [selectedLang, setSelectedLangState] = useState<string | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [offset, setOffsetState] = useState<number>(() => readOffset());
  const [loading, setLoading] = useState(false);

  // Seleciona idioma quando muda a lista
  useEffect(() => {
    if (!langs.length) {
      setSelectedLangState(null);
      return;
    }
    const preferred = readPreferredLang();
    const candidate =
      langs.find(t => t.lang === preferred) ||
      langs.find(t => t.is_default) ||
      langs[0];
    setSelectedLangState(candidate.lang);
  }, [langs]);

  const setLang = (lang: string | null) => {
    setSelectedLangState(lang);
    writePreferredLang(lang);
  };
  const setOffset = (v: number) => {
    const next = Math.round(v * 10) / 10;
    setOffsetState(next);
    writeOffset(next);
  };

  // Carrega cues do idioma selecionado
  useEffect(() => {
    if (!enabled || !selectedLang) { setCues([]); return; }
    const track = langs.find(t => t.lang === selectedLang);
    if (!track) { setCues([]); return; }
    let alive = true;
    setLoading(true);
    fetchCaptions(track.vtt_url).then(c => {
      if (alive) setCues(c);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [enabled, selectedLang, langs]);

  // Loop de sincronia usando timeupdate do media element
  const lastIndexRef = useRef(-1);
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !enabled || cues.length === 0) {
      setCurrentText('');
      lastIndexRef.current = -1;
      return;
    }
    const onTime = () => {
      const t = el.currentTime - offset;
      // Procura em torno do último índice — cues estão em ordem crescente
      const last = lastIndexRef.current;
      let idx = -1;
      if (last >= 0 && last < cues.length) {
        const c = cues[last];
        if (t >= c.start && t <= c.end) idx = last;
      }
      if (idx === -1) {
        // Busca binária simples
        let lo = 0, hi = cues.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const c = cues[mid];
          if (t < c.start) hi = mid - 1;
          else if (t > c.end) lo = mid + 1;
          else { idx = mid; break; }
        }
      }
      lastIndexRef.current = idx;
      setCurrentText(idx >= 0 ? cues[idx].text : '');
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('seeking', onTime);
    onTime();
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeking', onTime);
    };
  }, [cues, enabled, offset, mediaRef]);

  return { langs, selectedLang, setLang, cues, currentText, offset, setOffset, loading };
}
