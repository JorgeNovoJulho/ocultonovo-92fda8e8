import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * ScrollToTop — restaura o scroll para o topo em cada navegação (exceto botão Voltar).
 * Também remove classes de bloqueio de scroll que modais podem deixar para trás.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const previousPathRef = useRef(pathname);

  useEffect(() => {
    const isAdminToAdminNavigation =
      previousPathRef.current.startsWith("/admin") && pathname.startsWith("/admin");

    // Restaura scroll imediatamente (sem animação para evitar flickering em mobile)
    if (navType !== "POP" && !isAdminToAdminNavigation) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }

    // Limpeza nuclear: remove qualquer classe/estilo que bloqueia o scroll
    // (Radix UI Dialog, Vaul Drawer, etc. podem deixar overflow:hidden no body)
    const cleanup = () => {
      const body = document.body;
      const html = document.documentElement;

      // Remove classes de bloqueio comuns
      body.classList.remove(
        "lock-scroll",
        "no-scroll",
        "modal-open",
        "overflow-hidden",
        "scroll-locked"
      );
      html.classList.remove(
        "lock-scroll",
        "no-scroll",
        "modal-open",
        "overflow-hidden",
        "scroll-locked"
      );

      // Limpa estilos inline de overflow injetados por libs
      if (body.style.overflow === "hidden") body.style.overflow = "";
      if (body.style.overflowY === "hidden") body.style.overflowY = "";
      if (html.style.overflow === "hidden") html.style.overflow = "";
      if (html.style.overflowY === "hidden") html.style.overflowY = "";

      // Radix UI injeta padding-right para compensar scrollbar — limpa também
      if (body.style.paddingRight) body.style.paddingRight = "";
    };

    // Executa imediatamente e depois de um tick (para pegar injeções assíncronas)
    cleanup();
    previousPathRef.current = pathname;
    const t = setTimeout(cleanup, 100);
    return () => clearTimeout(t);
  }, [pathname, navType]);

  return null;
}
