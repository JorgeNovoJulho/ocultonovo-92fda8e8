/**
 * adErrors — mensagens padronizadas com código + ação sugerida.
 * Usadas por useAdAi e StockImageLibrary para feedback claro ao usuário.
 */

export type AdErrorAction = "retry" | "cancel" | "check_connection" | "change_query" | "contact_support";

export interface AdStructuredError {
  code: string;          // ex: AI_TIMEOUT, AI_PARSE, STOCK_TIMEOUT
  title: string;         // título curto
  message: string;       // descrição amigável
  actions: AdErrorAction[]; // ações sugeridas
}

const ACTION_LABELS: Record<AdErrorAction, string> = {
  retry: "Tentar novamente",
  cancel: "Cancelar",
  check_connection: "Verificar conexão",
  change_query: "Trocar busca",
  contact_support: "Falar com suporte",
};

export function actionLabel(a: AdErrorAction) {
  return ACTION_LABELS[a];
}

/** Normaliza qualquer erro em um AdStructuredError tipado. */
export function toStructuredError(scope: "ai_copy" | "ai_vision" | "ai_image" | "stock" | "export", raw: unknown): AdStructuredError {
  const msg = (raw as any)?.message || String(raw || "");
  const lower = msg.toLowerCase();

  // Tempo esgotado
  if (lower.includes("timeout") || lower.includes("esgotado")) {
    return {
      code: `${prefix(scope)}_TIMEOUT`,
      title: "Tempo esgotado",
      message: msg || "A operação demorou demais para responder.",
      actions: ["retry", "check_connection", "cancel"],
    };
  }

  // Conexão / rede
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch")) {
    return {
      code: `${prefix(scope)}_NETWORK`,
      title: "Sem conexão",
      message: "Não foi possível conectar ao serviço. Verifique sua internet.",
      actions: ["check_connection", "retry", "cancel"],
    };
  }

  // Limite / rate
  if (lower.includes("429") || lower.includes("rate") || lower.includes("limit")) {
    return {
      code: `${prefix(scope)}_RATE_LIMIT`,
      title: "Muitas tentativas",
      message: "Você atingiu o limite temporário. Aguarde alguns segundos e tente de novo.",
      actions: ["retry", "cancel"],
    };
  }

  // Parsing
  if (lower.includes("json") || lower.includes("parse") || lower.includes("unexpected")) {
    return {
      code: `${prefix(scope)}_PARSE`,
      title: "Resposta inesperada",
      message: "A IA retornou um formato inválido. Tente novamente — geralmente resolve.",
      actions: ["retry", "cancel"],
    };
  }

  // Específicos de stock (Unsplash)
  if (scope === "stock") {
    if (lower.includes("nenhuma") || lower.includes("empty") || lower.includes("not found")) {
      return {
        code: "STOCK_EMPTY",
        title: "Nenhum resultado",
        message: "Sua busca não retornou imagens. Tente termos mais comuns ou remova filtros.",
        actions: ["change_query", "retry"],
      };
    }
  }

  // Auth / chave
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthor")) {
    return {
      code: `${prefix(scope)}_AUTH`,
      title: "Acesso negado",
      message: "Sessão expirada ou sem permissão. Recarregue a página e tente novamente.",
      actions: ["retry", "contact_support", "cancel"],
    };
  }

  return {
    code: `${prefix(scope)}_UNKNOWN`,
    title: "Algo deu errado",
    message: msg || "Erro inesperado. Tente novamente em instantes.",
    actions: ["retry", "cancel"],
  };
}

function prefix(scope: "ai_copy" | "ai_vision" | "ai_image" | "stock" | "export") {
  switch (scope) {
    case "ai_copy":
      return "AI_COPY";
    case "ai_vision":
      return "AI_VISION";
    case "ai_image":
      return "AI_IMAGE";
    case "stock":
      return "STOCK";
    case "export":
      return "EXPORT";
  }
}
