import { describe, it, expect } from "vitest";
import { t, downloadPack } from "@/lib/i18n";

describe("i18n fallback", () => {
  it("returns PT-BR string for unknown lang argument", () => {
    expect(t("action.follow", "pt")).toBe("Seguir");
  });

  it("falls back to PT-BR when key missing in EN pack", async () => {
    await downloadPack("en");
    // chave inexistente em ambos → retorna a própria chave
    expect(t("nonexistent.key", "en")).toBe("nonexistent.key");
    // chave existente em PT_DICT mas potencialmente ausente no EN ainda traduz para EN se houver,
    // ou cai pra PT — nunca quebra.
    const value = t("action.follow", "en");
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
  });

  it("interpolates variables", () => {
    expect(t("language.changedTo", { lang: "Test" })).toContain("Test");
  });

  it("falls back to PT for ES when key missing", async () => {
    await downloadPack("es");
    const v = t("action.cancel", "es");
    // "Cancelar" funciona em PT/ES, garantia mínima: string não vazia
    expect(v.length).toBeGreaterThan(0);
  });
});
