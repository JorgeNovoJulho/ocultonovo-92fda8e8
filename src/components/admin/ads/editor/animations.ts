// Injeta keyframes globais usados pelas animações por camada.
let injected = false;

export function ensureAnimationStyles() {
  if (injected || typeof document === "undefined") return;
  if (document.getElementById("ad-editor-animations")) {
    injected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = "ad-editor-animations";
  style.textContent = `
    @keyframes adFadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes adSlideUp { from { opacity: 0; transform: translateY(40px) } to { opacity: 1; transform: translateY(0) } }
    @keyframes adSlideDown { from { opacity: 0; transform: translateY(-40px) } to { opacity: 1; transform: translateY(0) } }
    @keyframes adSlideLeft { from { opacity: 0; transform: translateX(40px) } to { opacity: 1; transform: translateX(0) } }
    @keyframes adSlideRight { from { opacity: 0; transform: translateX(-40px) } to { opacity: 1; transform: translateX(0) } }
    @keyframes adZoomIn { from { opacity: 0; transform: scale(0.8) } to { opacity: 1; transform: scale(1) } }
    @keyframes adPop { 0% { opacity: 0; transform: scale(0.6) } 60% { opacity: 1; transform: scale(1.08) } 100% { transform: scale(1) } }
    @keyframes adBlurIn { from { opacity: 0; filter: blur(14px) } to { opacity: 1; filter: blur(0) } }
  `;
  document.head.appendChild(style);
  injected = true;
}

export const ANIMATION_MAP: Record<string, string> = {
  "fade-in": "adFadeIn",
  "slide-up": "adSlideUp",
  "slide-down": "adSlideDown",
  "slide-left": "adSlideLeft",
  "slide-right": "adSlideRight",
  "zoom-in": "adZoomIn",
  "pop": "adPop",
  "blur-in": "adBlurIn",
};

export const ANIMATION_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Nenhuma" },
  { value: "fade-in", label: "Fade in" },
  { value: "slide-up", label: "Subir" },
  { value: "slide-down", label: "Descer" },
  { value: "slide-left", label: "Da direita" },
  { value: "slide-right", label: "Da esquerda" },
  { value: "zoom-in", label: "Zoom in" },
  { value: "pop", label: "Pop" },
  { value: "blur-in", label: "Blur in" },
];
