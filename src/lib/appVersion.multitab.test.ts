/**
 * Simulação "multi-aba" do throttle de /version.json.
 *
 * Não temos browser real aqui; mas múltiplas abas do mesmo navegador
 * compartilham o mesmo `localStorage`. Em JSDOM, `canCheckAppVersion`
 * usa esse storage como fonte da verdade, então invocá-lo várias vezes
 * em sequência reproduz N abas tentando checar simultaneamente.
 *
 * Garante: dado o throttle de 1 min, somente UMA chamada passa por janela,
 * independentemente de quantas "abas" tentem.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  canCheckAppVersion,
  getNextAllowedCheckAt,
  getLastCheckAt,
  resetVersionDebugStats,
} from "./appVersion";

describe("appVersion · throttle multi-aba", () => {
  beforeEach(() => {
    localStorage.clear();
    resetVersionDebugStats();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite somente 1 checagem por janela mesmo com várias abas concorrentes", () => {
    // 10 "abas" tentam ao mesmo tempo
    const results = Array.from({ length: 10 }, () => canCheckAppVersion());
    const passes = results.filter(Boolean).length;
    expect(passes).toBe(1);
  });

  it("nenhuma aba consegue checar de novo antes de 1 min", () => {
    expect(canCheckAppVersion()).toBe(true);
    // +40 segundos
    vi.setSystemTime(new Date("2026-01-01T10:00:40Z"));
    const results = Array.from({ length: 5 }, () => canCheckAppVersion());
    expect(results.every((r) => r === false)).toBe(true);
  });

  it("libera nova checagem depois de 1 min", () => {
    expect(canCheckAppVersion()).toBe(true);
    vi.setSystemTime(new Date("2026-01-01T10:01:01Z"));
    expect(canCheckAppVersion()).toBe(true);
    // janela reinicia
    expect(canCheckAppVersion()).toBe(false);
  });

  it("force=true ignora o throttle (botão admin)", () => {
    expect(canCheckAppVersion()).toBe(true);
    expect(canCheckAppVersion()).toBe(false);
    expect(canCheckAppVersion(true)).toBe(true);
  });

  it("getNextAllowedCheckAt cai dentro da janela de 1 min após uma checagem", () => {
    const t0 = Date.now();
    canCheckAppVersion();
    const next = getNextAllowedCheckAt();
    const last = getLastCheckAt();
    expect(last).toBeGreaterThanOrEqual(t0);
    expect(next - last).toBe(60 * 1000);
  });
});
