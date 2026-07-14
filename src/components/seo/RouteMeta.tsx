import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * RouteMeta — atualiza <title>, <meta name="description"> e <link rel="canonical">
 * por rota. Zero dependência externa. Mantém a meta estática do index.html como fallback.
 */

const ORIGIN = "https://ocultoswing.com.br";

type Meta = { title: string; description: string };

// Títulos ≤60 chars, descrições 50–160 chars.
const STATIC_META: Record<string, Meta> = {
  "/": {
    title: "OCULTO — Encontros liberais e criadores +18",
    description:
      "Plataforma brasileira para casais liberais e criadores +18. Verificação, Modo Fantasma e chat criptografado. Comece grátis.",
  },
  "/login": {
    title: "Entrar no OCULTO — Acesso discreto +18",
    description:
      "Acesse sua conta OCULTO com segurança. Login com e-mail ou Google, sessão única e Modo Fantasma para máxima discrição.",
  },
  "/signup": {
    title: "Criar conta no OCULTO — Cadastro +18 grátis",
    description:
      "Cadastre-se grátis no OCULTO. Comunidade liberal verificada, criadores adultos e ferramentas para casais e solteiros.",
  },
  "/forgot-password": {
    title: "Recuperar senha — OCULTO",
    description:
      "Recupere o acesso à sua conta OCULTO em poucos passos com link seguro enviado por e-mail.",
  },
  "/reset-password": {
    title: "Redefinir senha — OCULTO",
    description: "Defina uma nova senha para sua conta OCULTO de forma segura.",
  },
  "/feed": {
    title: "Feed OCULTO — Comunidade liberal +18",
    description:
      "Acompanhe posts, stories e novidades da comunidade liberal OCULTO. Conteúdo +18 verificado, com privacidade real.",
  },
  "/radar": {
    title: "Radar OCULTO — Quem está perto agora",
    description:
      "Descubra casais e perfis liberais próximos no Radar OCULTO. Filtros abstratos, status discreto e privacidade total.",
  },
  "/pesquisar": {
    title: "Pesquisar perfis e tags — OCULTO",
    description:
      "Busque perfis liberais, casais, criadores +18 e tags na comunidade OCULTO.",
  },
  "/subscriptions": {
    title: "Planos OCULTO — Premium e VIP",
    description:
      "Conheça os planos Free, Premium e VIP do OCULTO. Recursos exclusivos, monetização para criadores e benefícios +18.",
  },
  "/vitrine-vip": {
    title: "Vitrine VIP — Criadores +18 OCULTO",
    description:
      "Explore criadores VIP do OCULTO com assinaturas, PPV e conteúdo exclusivo +18.",
  },
  "/events": {
    title: "Eventos OCULTO — Encontros liberais",
    description:
      "Confira encontros, festas e experiências reais da comunidade liberal OCULTO.",
  },
  "/settings": {
    title: "Configurações da conta — OCULTO",
    description:
      "Gerencie privacidade, segurança, notificações e preferências da sua conta OCULTO.",
  },
  "/denunciar": {
    title: "Denunciar conteúdo — OCULTO",
    description:
      "Canal oficial para denunciar conteúdo, perfis ou comportamentos que violem as regras do OCULTO.",
  },
  "/contestacao": {
    title: "Contestar decisão — OCULTO",
    description:
      "Envie uma contestação formal sobre suspensões ou moderação na plataforma OCULTO.",
  },
};

const DYNAMIC_META: Array<{ test: RegExp; meta: Meta }> = [
  {
    test: /^\/legal\//,
    meta: {
      title: "Termos e políticas — OCULTO",
      description:
        "Termos de uso, política de privacidade, LGPD e políticas de conteúdo +18 da plataforma OCULTO.",
    },
  },
  {
    test: /^\/canal\//,
    meta: {
      title: "Canal de criador VIP — OCULTO",
      description:
        "Conteúdo exclusivo, assinaturas e PPV de criadores VIP verificados do OCULTO.",
    },
  },
  {
    test: /^\/invite\//,
    meta: {
      title: "Convite OCULTO — Junte-se à comunidade",
      description:
        "Você foi convidado para o OCULTO. Comunidade liberal +18 brasileira, verificada e discreta.",
    },
  },
];

const DEFAULT_META: Meta = {
  title: "OCULTO — Encontros liberais e criadores +18",
  description:
    "Plataforma brasileira para casais liberais e criadores +18. Verificação, Modo Fantasma e chat criptografado.",
};

function resolveMeta(pathname: string): Meta {
  if (STATIC_META[pathname]) return STATIC_META[pathname];
  for (const { test, meta } of DYNAMIC_META) {
    if (test.test(pathname)) return meta;
  }
  return DEFAULT_META;
}

function resolveOgType(pathname: string): string {
  if (/^\/canal\//.test(pathname)) return "profile";
  if (/^\/legal\//.test(pathname)) return "article";
  return "website";
}

function upsertMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertProperty(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

const JSONLD_ID = "route-jsonld";
function upsertJsonLd(payload: unknown | null) {
  const existing = document.getElementById(JSONLD_ID);
  if (!payload) {
    existing?.remove();
    return;
  }
  const el =
    (existing as HTMLScriptElement | null) ?? document.createElement("script");
  el.id = JSONLD_ID;
  el.setAttribute("type", "application/ld+json");
  el.textContent = JSON.stringify(payload);
  if (!existing) document.head.appendChild(el);
}

function resolveJsonLd(pathname: string, canonical: string): unknown | null {
  if (pathname === "/") {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "O OCULTO é seguro e discreto?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. Usamos verificação +18, modo fantasma, criptografia ponta-a-ponta nas mensagens e nunca exibimos nome real, e-mail ou documentos.",
          },
        },
        {
          "@type": "Question",
          name: "Quanto custa começar?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Você pode criar conta 100% grátis. Planos Premium e VIP desbloqueiam recursos avançados e monetização.",
          },
        },
        {
          "@type": "Question",
          name: "Posso ganhar dinheiro como criador?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. O plano VIP permite vender assinaturas, PPV, leilões e eventos. Você recebe 80% via PIX.",
          },
        },
        {
          "@type": "Question",
          name: "Vocês cumprem a LGPD?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Totalmente. Seus dados ficam criptografados e você pode solicitar exportação ou exclusão a qualquer momento.",
          },
        },
      ],
    };
  }
  const canalMatch = pathname.match(/^\/canal\/([^/]+)/);
  if (canalMatch) {
    const handle = decodeURIComponent(canalMatch[1]);
    return {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: `@${handle}`,
        alternateName: handle,
        url: canonical,
      },
    };
  }
  return null;
}

export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const { title, description } = resolveMeta(pathname);
    const canonical = `${ORIGIN}${pathname === "/" ? "/" : pathname}`;

    if (document.title !== title) document.title = title;
    upsertMeta("description", description);
    upsertCanonical(canonical);
    upsertProperty("og:title", title);
    upsertProperty("og:description", description);
    upsertProperty("og:url", canonical);
    upsertProperty("og:type", resolveOgType(pathname));
    upsertMeta("twitter:title", title);
    upsertMeta("twitter:description", description);
    upsertJsonLd(resolveJsonLd(pathname, canonical));
  }, [pathname]);

  return null;
}
