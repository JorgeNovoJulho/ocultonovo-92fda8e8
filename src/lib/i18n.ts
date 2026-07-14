/**
 * i18n leve, sem dependências externas.
 *
 * Estratégia:
 *  - PT-BR é o idioma padrão e está sempre carregado em memória (catálogo embutido).
 *  - EN e ES são "pacotes" carregados sob demanda via dynamic import
 *    (`src/lib/i18n/packs/{en,es}.ts`). Isso simula um "download de pacote
 *    de idioma": o chunk só vai pra rede quando o usuário escolhe trocar.
 *  - Após baixar uma vez, marcamos `app.lang.pack.{lang}` no localStorage
 *    para indicar "instalado" (o bundler ainda faz cache do chunk).
 *  - A troca de idioma dispara um evento global e re-renderiza tudo que usa
 *    `useI18n()`. Também atualiza `<html lang>` em tempo real.
 */
import { useEffect, useState, useCallback } from "react";

export type Lang = "pt" | "en" | "es";

type Dict = Record<string, string>;

// PT-BR — sempre embutido (idioma padrão e fallback global).
const PT_DICT: Dict = {
  "language.label": "Idioma",
  "language.pt": "Português",
  "language.en": "English",
  "language.es": "Español",
  "language.download": "Baixar pacote {lang}",
  "language.downloading": "Baixando pacote {lang}…",
  "language.downloaded": "Pacote {lang} pronto",
  "language.downloadFailed": "Falha ao baixar o pacote",
  "language.installed": "Instalado",
  "language.changedTo": "Idioma alterado para {lang}",

  "suggestions.title": "Explorar novos misteriosos(as)",
  "suggestions.viewAll": "Explorar novos misteriosos(as)",
  "suggestions.dismiss": "Dispensar sugestão",
  "suggestions.prev": "Anterior",
  "suggestions.next": "Próximo",
  "suggestions.viewProfile": "Ver perfil de {name}",
  "suggestions.mutual": "{count} seguindo em comum",
  "suggestions.affinity": "{count} afinidades",
  "suggestions.newProfile": "Novo perfil",
  "suggestions.follow": "Adicionar",
  "suggestions.following": "Seguindo",
  "suggestions.adminDescription":
    'Configure a sessão "Explorar novos misteriosos(as)" e o preço do destaque dourado.',

  "feed.tabs.following": "Seguindo",
  "feed.tabs.foryou": "Novidades do Feed",
  "feed.tabs.vip": "Meu Conteúdo VIP",
  "feed.tabs.card": "Modo Card",
  "feed.empty.posts": "Nenhum post ainda",
  "feed.empty.following": "Nenhum post de quem você segue",

  "stories.your": "Seu Story",
  "stories.empty": "Nenhum story disponível",
  "stories.user.fallback": "Usuário",

  "header.beta": "BETA",
  "header.search": "Buscar",
  "header.notifications": "Notificações",
  "header.theme": "Tema",

  // Bottom nav (mobile)
  "nav.home": "Início",
  "nav.radar": "Radar",
  "nav.aura": "Aura",
  "nav.alerts": "Alertas",
  "nav.chat": "Chat",
  "nav.you": "Você",
  "nav.menu": "Menu",
  "nav.explore": "Explorar",
  "nav.messages": "Mensagens",

  // Botões globais
  "action.follow": "Seguir",
  "action.following": "Seguindo",
  "action.unfollow": "Deixar de seguir",
  "action.like": "Curtir",
  "action.liked": "Curtido",
  "action.comment": "Comentar",
  "action.share": "Compartilhar",
  "action.save": "Salvar",
  "action.saved": "Salvo",
  "action.send": "Enviar",
  "action.cancel": "Cancelar",
  "action.confirm": "Confirmar",
  "action.close": "Fechar",
  "action.delete": "Excluir",
  "action.edit": "Editar",
  "action.loading": "Carregando…",
  "action.retry": "Tentar novamente",

  // Toasts comuns
  "toast.copied": "Copiado para a área de transferência",
  "toast.saved": "Salvo com sucesso",
  "toast.error.generic": "Algo deu errado. Tente novamente.",
  "toast.error.network": "Sem conexão. Verifique sua internet.",
  "toast.success.generic": "Tudo certo!",
};

// Loaders preguiçosos — Vite faz code-split automaticamente.
const PACK_LOADERS: Record<Exclude<Lang, "pt">, () => Promise<{ default: Dict }>> = {
  en: () => import("./i18n/packs/en"),
  es: () => import("./i18n/packs/es"),
};

const LOADED: Partial<Record<Lang, Dict>> = { pt: PT_DICT };

/** Estados visuais do "download" do pacote — para o LanguageSelector. */
export type PackStatus = "installed" | "available" | "downloading" | "error";
const PACK_STATE: Partial<Record<Lang, PackStatus>> = { pt: "installed" };
const PACK_PROMISE: Partial<Record<Lang, Promise<void>>> = {};

const STORAGE_KEY = "app.lang";
const PACK_KEY = (l: Lang) => `app.lang.pack.${l}`;
const LANG_EVENT = "app:lang-changed";
const PACK_EVENT = "app:lang-pack-loaded";

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && (stored === "pt" || stored === "en" || stored === "es")) return stored;
  } catch {}
  // Padrão do sistema é SEMPRE pt-BR, conforme requisito.
  return "pt";
}

export function getLang(): Lang {
  return detectLang();
}

export function isPackInstalled(lang: Lang): boolean {
  if (lang === "pt") return true;
  if (LOADED[lang]) return true;
  try {
    return localStorage.getItem(PACK_KEY(lang)) === "1";
  } catch {
    return false;
  }
}

export function getPackStatus(lang: Lang): PackStatus {
  if (lang === "pt") return "installed";
  if (PACK_STATE[lang] === "downloading" || PACK_STATE[lang] === "error") {
    return PACK_STATE[lang]!;
  }
  return isPackInstalled(lang) ? "installed" : "available";
}

/** Carrega o pacote de idioma (lazy chunk). Idempotente, com deduplicação. */
export async function downloadPack(lang: Lang): Promise<void> {
  if (lang === "pt" || LOADED[lang]) return;
  if (PACK_PROMISE[lang]) return PACK_PROMISE[lang]!;
  const loader = PACK_LOADERS[lang as Exclude<Lang, "pt">];
  if (!loader) return;
  PACK_STATE[lang] = "downloading";
  try {
    window.dispatchEvent(new CustomEvent(PACK_EVENT, { detail: { lang, status: "downloading" } }));
  } catch {}
  const promise = (async () => {
    try {
      const mod = await loader();
      LOADED[lang] = mod.default;
      PACK_STATE[lang] = "installed";
      try {
        localStorage.setItem(PACK_KEY(lang), "1");
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent(PACK_EVENT, { detail: { lang, status: "installed" } }));
      } catch {}
    } catch (err) {
      PACK_STATE[lang] = "error";
      try {
        window.dispatchEvent(new CustomEvent(PACK_EVENT, { detail: { lang, status: "error" } }));
      } catch {}
      throw err;
    } finally {
      delete PACK_PROMISE[lang];
    }
  })();
  PACK_PROMISE[lang] = promise;
  return promise;
}

function applyHtmlLang(lang: Lang) {
  try {
    const code = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "es-ES";
    document.documentElement.lang = code;
  } catch {}
}

/** Troca o idioma. Faz download do pacote se necessário. */
export async function setLang(lang: Lang): Promise<void> {
  if (lang !== "pt" && !LOADED[lang]) {
    await downloadPack(lang);
  }
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  applyHtmlLang(lang);
  try {
    window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
  } catch {}
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

export function t(
  key: string,
  varsOrLang?: Record<string, string | number> | Lang,
  maybeLang?: Lang
): string {
  let vars: Record<string, string | number> | undefined;
  let lang: Lang | undefined;
  if (typeof varsOrLang === "string") {
    lang = varsOrLang;
  } else {
    vars = varsOrLang;
    lang = maybeLang;
  }
  const l = lang ?? detectLang();
  const dict = LOADED[l] ?? PT_DICT;
  const raw = dict[key] ?? PT_DICT[key] ?? key;
  return interpolate(raw, vars);
}

// Bootstrap: se o usuário já tinha um pacote instalado, recarrega no startup.
if (typeof window !== "undefined") {
  applyHtmlLang(detectLang());
  const current = detectLang();
  if (current !== "pt" && !LOADED[current]) {
    // best-effort, sem await
    downloadPack(current).catch(() => {});
  }
}

export function useI18n() {
  const [lang, setLangState] = useState<Lang>(() => detectLang());
  const [, force] = useState(0);

  useEffect(() => {
    const onLang = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail) setLangState(detail);
    };
    const onPack = () => force((n) => n + 1);
    window.addEventListener(LANG_EVENT, onLang);
    window.addEventListener(PACK_EVENT, onPack);
    return () => {
      window.removeEventListener(LANG_EVENT, onLang);
      window.removeEventListener(PACK_EVENT, onPack);
    };
  }, []);

  const translate = useCallback(
    (key: string, vars?: Record<string, string | number>) => t(key, vars, lang),
    [lang]
  );

  const changeLang = useCallback(async (l: Lang) => {
    await setLang(l);
  }, []);

  return {
    lang,
    t: translate,
    setLang: changeLang,
    downloadPack,
    isPackInstalled,
    getPackStatus,
  };
}
