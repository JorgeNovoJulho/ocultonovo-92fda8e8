import { describe, it, expect } from "vitest";
import { resolveAvatarUrl, hasValidAvatar } from "./avatarUrl";

/**
 * Regressão: garante que valores "vazios" / placeholder nunca sejam
 * tratados como foto real (especialmente na tela Pesquisar, onde a
 * ordenação prioriza cards com foto e mostra CTA "Atualize sua foto").
 *
 * Qualquer mudança aqui que faça um destes casos passar como "foto válida"
 * QUEBRA a tela Pesquisar e deve ser bloqueada.
 */
describe("resolveAvatarUrl — regressão Pesquisar/avatares", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["string vazia", ""],
    ["espaços", "   "],
    ["literal 'null'", "null"],
    ["literal 'NULL'", "NULL"],
    ["literal 'undefined'", "undefined"],
    ["literal 'none'", "none"],
    ["placeholder.svg simples", "placeholder.svg"],
    ["/placeholder.svg", "/placeholder.svg"],
    ["URL completa com placeholder.svg", "https://x.supabase.co/storage/v1/object/public/avatars/placeholder.svg"],
    ["pasta /placeholders/", "/placeholders/casal-1.jpg"],
    ["placeholder em maiúsculas", "PLACEHOLDER.SVG"],
  ])("trata %s como SEM avatar", (_label, input) => {
    expect(resolveAvatarUrl(input as any)).toBeNull();
    expect(hasValidAvatar(input as any)).toBe(false);
    expect(hasValidAvatar({ avatar_url: input as any })).toBe(false);
  });

  it("aceita URLs http(s) válidas de avatar", () => {
    const url = "https://rvybbrkzmboqbhcemqar.supabase.co/storage/v1/object/public/avatars/abc/foo.jpg";
    expect(resolveAvatarUrl(url)).toBe(url);
    expect(hasValidAvatar(url)).toBe(true);
  });

  it("aceita path relativo do bucket avatars (normaliza para URL pública)", () => {
    const result = resolveAvatarUrl("abc/foo.jpg");
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("avatars");
  });

  it("nunca retorna URL contendo 'placeholder.svg' mesmo após normalização", () => {
    const out = resolveAvatarUrl("placeholder.svg");
    expect(out).toBeNull();
  });
});
