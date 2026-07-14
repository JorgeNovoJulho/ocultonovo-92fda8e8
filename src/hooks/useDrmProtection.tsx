import { useState, useEffect, useRef, useCallback, RefObject } from "react";

interface UseDrmProtectionOptions {
  containerRef: RefObject<HTMLElement>;
  onViolation?: () => void;
  enabled?: boolean;
}

/**
 * DRM watchdog — observa remoção/oculto da watermark.
 *
 * IMPORTANTE: o `onViolation` é guardado em ref para NÃO invalidar o effect
 * a cada render do componente pai. Antes, o pai (PostExpandedModal) re-renderizava
 * dezenas de vezes por segundo via `onTimeUpdate`, recriando `onViolation` →
 * o effect rodava de novo, MutationObserver era desconectado/reconectado, e o
 * pipeline de vídeo (render frames) ficava congelado enquanto o áudio seguia.
 */
export function useDrmProtection({
  containerRef,
  onViolation,
  enabled = true,
}: UseDrmProtectionOptions) {
  const [isViolated, setIsViolated] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const watermarkExistsRef = useRef(false);
  const onViolationRef = useRef(onViolation);

  // Mantém ref atualizado sem disparar o effect que monta o observer.
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  const resetViolation = useCallback(() => {
    setIsViolated(false);
    watermarkExistsRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

    const checkWatermark = () => !!container.querySelector('[data-drm-watermark="true"]');

    const fireViolation = () => {
      setIsViolated(true);
      onViolationRef.current?.();
    };

    // Aguarda watermark ser inserida.
    const initTimeout = setTimeout(() => {
      if (checkWatermark()) watermarkExistsRef.current = true;
    }, 500);

    observerRef.current = new MutationObserver((mutations) => {
      if (!watermarkExistsRef.current) {
        if (checkWatermark()) watermarkExistsRef.current = true;
        return;
      }

      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0) {
          for (const node of mutation.removedNodes) {
            if (node instanceof HTMLElement) {
              if (
                node.getAttribute?.("data-drm-watermark") === "true" ||
                node.querySelector?.('[data-drm-watermark="true"]')
              ) {
                fireViolation();
                return;
              }
            }
          }
        }

        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLElement &&
          mutation.target.getAttribute("data-drm-watermark") === "true"
        ) {
          const style = mutation.target.style;
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0" ||
            parseFloat(style.opacity || "1") < 0.1
          ) {
            fireViolation();
            return;
          }
        }
      }

      if (watermarkExistsRef.current && !checkWatermark()) fireViolation();
    });

    observerRef.current.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    return () => {
      clearTimeout(initTimeout);
      observerRef.current?.disconnect();
    };
    // ⚠️ NÃO incluir onViolation aqui — use ref para evitar reconexão a cada render.
  }, [containerRef, enabled]);

  return { isViolated, resetViolation };
}
