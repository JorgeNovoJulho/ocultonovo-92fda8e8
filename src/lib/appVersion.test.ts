import { describe, it, expect, beforeEach } from "vitest";
import {
  __test,
  appendUpdateRedirectLog,
  getUpdateRedirectLog,
  clearUpdateRedirectLog,
  markWebAppVersionAccepted,
} from "./appVersion";

const {
  isChunkLoadError,
  shouldReload,
  effectiveLocalVersion,
  isInPostUpdateGrace,
  buildUpdateRouteUrl,
  isUpdateRecoveryPath,
  hydrateRecoveryStateFromUrl,
  cleanupRecoveryQueryParams,
  RELOAD_GUARD_KEY,
  CHUNK_GUARD_KEY,
  ACCEPTED_VERSION_KEY,
  ACCEPTED_AT_KEY,
  GUARD_WINDOW_MS,
  POST_UPDATE_GRACE_MS,
} = __test;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("appVersion — detecção de ChunkLoadError", () => {
  it.each([
    ["ChunkLoadError clássico", new Error("ChunkLoadError: Loading chunk 42 failed.")],
    ["Failed to fetch dynamically imported module", new Error("Failed to fetch dynamically imported module: /assets/x.js")],
    ["error loading dynamically imported module", new Error("error loading dynamically imported module")],
    ["Importing a module script failed", new Error("Importing a module script failed.")],
    ["mensagem como string", "ChunkLoadError"],
  ])("identifica %s", (_label, err) => {
    expect(isChunkLoadError(err)).toBe(true);
  });

  it.each([
    ["erro genérico", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
    ["string vazia", ""],
  ])("NÃO confunde %s com chunk error", (_label, err) => {
    expect(isChunkLoadError(err as unknown)).toBe(false);
  });
});

describe("appVersion — guard de redirect (sem loop)", () => {
  it("permite o primeiro redirect e bloqueia o segundo dentro da janela", () => {
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(true);
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(false);
  });

  it("guard de chunk é independente do guard de version", () => {
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(true);
    expect(shouldReload(CHUNK_GUARD_KEY)).toBe(true);
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(false);
    expect(shouldReload(CHUNK_GUARD_KEY)).toBe(false);
  });

  it("libera novamente após a janela expirar", () => {
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(true);
    sessionStorage.setItem(
      RELOAD_GUARD_KEY,
      String(Date.now() - GUARD_WINDOW_MS - 1000),
    );
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(true);
  });
});

describe("appVersion — version mismatch & grace pós-update", () => {
  it("effectiveLocalVersion respeita versão aceita recente para estabilizar pós-update", () => {
    localStorage.setItem(ACCEPTED_VERSION_KEY, "v2");
    localStorage.setItem(ACCEPTED_AT_KEY, String(Date.now()));
    expect(effectiveLocalVersion()).toBe("v2");
  });

  it("markWebAppVersionAccepted salva versão, timestamp e limpa pendência do modal", () => {
    localStorage.setItem("oculto:webapp-update-modal:pending", JSON.stringify({ remote: "v2", at: 1 }));
    expect(markWebAppVersionAccepted("v2", 12345)).toBe(true);
    expect(localStorage.getItem(ACCEPTED_VERSION_KEY)).toBe("v2");
    expect(localStorage.getItem(ACCEPTED_AT_KEY)).toBe("12345");
    expect(localStorage.getItem("oculto:webapp-update-modal:pending")).toBeNull();
  });

  it("isInPostUpdateGrace = true logo após aceitar versão", () => {
    localStorage.setItem(ACCEPTED_VERSION_KEY, "v2");
    localStorage.setItem(ACCEPTED_AT_KEY, String(Date.now()));
    expect(isInPostUpdateGrace()).toBe(true);
  });

  it("isInPostUpdateGrace = false após expirar janela", () => {
    localStorage.setItem(ACCEPTED_VERSION_KEY, "v2");
    localStorage.setItem(
      ACCEPTED_AT_KEY,
      String(Date.now() - POST_UPDATE_GRACE_MS - 1000),
    );
    expect(isInPostUpdateGrace()).toBe(false);
  });
});

describe("appVersion — log local de redirects", () => {
  it("grava entrada com timestamp e motivo", () => {
    clearUpdateRedirectLog();
    appendUpdateRedirectLog({
      t: Date.now(),
      iso: new Date().toISOString(),
      reason: "chunk_error",
      from: "https://x/y",
      local: "dev",
      accepted: null,
      acceptedAt: 0,
      inGrace: false,
    });
    const log = getUpdateRedirectLog();
    expect(log).toHaveLength(1);
    expect(log[0].reason).toBe("chunk_error");
    expect(typeof log[0].t).toBe("number");
    expect(log[0].iso).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("trunca para no máximo 50 entradas (FIFO)", () => {
    clearUpdateRedirectLog();
    for (let i = 0; i < 60; i++) {
      appendUpdateRedirectLog({
        t: i,
        iso: new Date(i).toISOString(),
        reason: i % 2 ? "chunk_error" : "version_mismatch",
        from: `https://x/${i}`,
        local: "dev",
        accepted: null,
        acceptedAt: 0,
        inGrace: false,
      });
    }
    const log = getUpdateRedirectLog();
    expect(log).toHaveLength(50);
    expect(log[0].t).toBe(10);
    expect(log[log.length - 1].t).toBe(59);
  });
});

describe("appVersion — regressão: sem múltiplos redirects em loop", () => {
  it("após primeiro redirect, segundo é bloqueado pelo guard", () => {
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(true);
    expect(shouldReload(RELOAD_GUARD_KEY)).toBe(false);
  });

  it("após /update.html completar, grace impede novo redirect mesmo com chunk error", () => {
    localStorage.setItem(ACCEPTED_VERSION_KEY, "v9");
    localStorage.setItem(ACCEPTED_AT_KEY, String(Date.now()));
    expect(isInPostUpdateGrace()).toBe(true);
  });

  it("buildUpdateRouteUrl inclui returnTo seguro quando origem não é /update", () => {
    window.history.replaceState({}, "", "/pesquisar?tab=grid#top");
    const url = buildUpdateRouteUrl("chunk");
    const parsed = new URL(url, "https://ocultoswing.com.br");

    expect(parsed.pathname).toBe("/update.html");
    expect(parsed.searchParams.get("reason")).toBe("chunk_error");
    expect(parsed.searchParams.get("returnTo")).toBe("/pesquisar?tab=grid#top");
  });

  it("buildUpdateRouteUrl troca /update pelo feed como returnTo seguro", () => {
    window.history.replaceState({}, "", "/update?reason=chunk_error");
    const url = buildUpdateRouteUrl("version");
    const parsed = new URL(url, "https://ocultoswing.com.br");

    expect(parsed.searchParams.get("reason")).toBe("version_mismatch");
    expect(parsed.searchParams.get("returnTo")).toBe("/feed");
  });

  it("buildUpdateRouteUrl troca rotas do Play pelo feed para evitar loop", () => {
    window.history.replaceState({}, "", "/oculto-play?item=abc");
    const url = buildUpdateRouteUrl("chunk");
    const parsed = new URL(url, "https://ocultoswing.com.br");

    expect(parsed.searchParams.get("returnTo")).toBe("/feed");
  });

  it("carrega _ucv/_uct da URL de recovery sem manter loop na navegação", () => {
    window.history.replaceState({}, "", "/feed?_u=ok&_ucv=v123&_uct=999999&r=chunk_error&_reload=999");
    hydrateRecoveryStateFromUrl();
    cleanupRecoveryQueryParams();

    expect(localStorage.getItem(ACCEPTED_VERSION_KEY)).toBe("v123");
    expect(localStorage.getItem(ACCEPTED_AT_KEY)).toBe("999999");
    expect(window.location.search).toBe("");
  });

  it("detecta corretamente rotas de recovery do update", () => {
    expect(isUpdateRecoveryPath("/update")).toBe(true);
    expect(isUpdateRecoveryPath("/update.html")).toBe(true);
    expect(isUpdateRecoveryPath("/feed")).toBe(false);
  });
});
