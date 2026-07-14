/**
 * useGlobalImageFallback
 * Attaches a document-level error listener to ALL <img> elements.
 * When any image fails to load, replaces the broken src with a
 * lightweight SVG placeholder — prevents layout collapse and blank spaces.
 *
 * Call once in DashboardLayout or App root.
 * Ultra-light: uses event delegation (one listener on document).
 */
import { useEffect } from 'react';

// 1×1 grey SVG — 100% inline, no network request
const PLACEHOLDER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect width='1' height='1' fill='%23333'/%3E%3C/svg%3E";

export function useGlobalImageFallback() {
  useEffect(() => {
    const handleImgError = (event: Event) => {
      const img = event.target as HTMLImageElement | null;
      if (!img || img.tagName !== 'IMG') return;

      // Already using placeholder — avoid infinite loop
      if (img.src === PLACEHOLDER_SVG || img.dataset.fallbackApplied) return;

      img.dataset.fallbackApplied = '1';
      img.src = PLACEHOLDER_SVG;
      img.style.objectFit = 'contain';
      img.style.opacity = '0.3';
    };

    // Use capture phase so we catch errors before React handlers
    document.addEventListener('error', handleImgError, true);
    return () => document.removeEventListener('error', handleImgError, true);
  }, []);
}
