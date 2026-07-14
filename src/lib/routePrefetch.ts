/**
 * Prefetch de chunks lazy das rotas principais.
 *
 * A bottom-nav (mobile) e a sidebar (desktop) usam este mapa para disparar
 * o download do chunk assim que o usuário toca (pointerdown) ou passa o
 * cursor (mouseenter) sobre o botão — antes do clique.
 *
 * Como os `import()` são idempotentes (o browser dedupe), chamar mais de
 * uma vez é seguro e não gera request extra.
 */

const loaders: Record<string, () => Promise<unknown>> = {
  "/feed": () => import("@/pages/Index"),
  "/": () => import("@/pages/Index"),
  "/aura-match": () => import("@/pages/AuraMatchPage"),
  "/radar": () => import("@/pages/RadarPage"),
  "/messages": () => import("@/pages/MessagesPage"),
  "/chat": () => import("@/pages/MessagesPage"),
  "/oculto-play": () => import("@/pages/OcultoPlayPage"),
};

const started = new Set<string>();

export function prefetchRoute(href: string): void {
  if (typeof window === "undefined") return;
  // Normaliza (remove querystring/hash)
  const clean = href.split("?")[0].split("#")[0];
  if (started.has(clean)) return;
  const loader = loaders[clean];
  if (!loader) return;
  started.add(clean);
  // Requestidle para não competir com renderização em curso
  const run = () => {
    loader().catch(() => started.delete(clean));
  };
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(run, { timeout: 300 });
  else setTimeout(run, 0);
}

/**
 * Prefetch das rotas mais quentes em idle — chamado uma vez no boot.
 */
export function prefetchHotRoutes(): void {
  ["/feed", "/aura-match", "/radar", "/messages", "/oculto-play"].forEach(
    (href) => prefetchRoute(href),
  );
}

