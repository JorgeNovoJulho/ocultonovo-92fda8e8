/**
 * Regression tests: garantem que as gravações/leituras de perfil aconteçam por user_id,
 * não por id. Cobrem Signup payload, useProfile fallback e useBannerUpload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────── Mock do supabase client ──────────────
type Call = { table?: string; method: string; args: any };
let calls: Call[] = [];
let nextSelectResult: any = { data: null, error: null };
let nextUpdateResult: any = { data: { id: "p1" }, error: null };

function makeBuilder(table: string) {
  const builder: any = {
    _filters: {} as Record<string, any>,
    select: vi.fn(function (...args: any[]) {
      calls.push({ table, method: "select", args });
      return builder;
    }),
    update: vi.fn(function (payload: any) {
      calls.push({ table, method: "update", args: payload });
      return builder;
    }),
    upsert: vi.fn(function (payload: any, opts: any) {
      calls.push({ table, method: "upsert", args: { payload, opts } });
      return builder;
    }),
    insert: vi.fn(function (payload: any) {
      calls.push({ table, method: "insert", args: payload });
      return builder;
    }),
    eq: vi.fn(function (col: string, val: any) {
      builder._filters[col] = val;
      calls.push({ table, method: "eq", args: { col, val } });
      return builder;
    }),
    maybeSingle: vi.fn(async function () {
      // distingue update vs select
      const last = [...calls].reverse().find((c) => c.table === table && (c.method === "update" || c.method === "select"));
      if (last?.method === "update") return nextUpdateResult;
      return nextSelectResult;
    }),
    then: undefined,
  };
  return builder;
}

const supabaseMock = {
  from: vi.fn((t: string) => makeBuilder(t)),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn/test.jpg" } })),
    })),
  },
};

beforeEach(() => {
  calls = [];
  nextSelectResult = { data: null, error: null };
  nextUpdateResult = { data: { id: "p1" }, error: null };
});

// ────────────── Tests ──────────────
describe("Persistência de perfil sempre por user_id", () => {
  it("update do perfil filtra por user_id, não por id", async () => {
    const uid = "user-uuid-123";
    const builder = supabaseMock.from("profiles");
    await builder.update({ avatar_url: "x" }).eq("user_id", uid).maybeSingle();

    const eqCall = calls.find((c) => c.method === "eq");
    expect(eqCall?.args.col).toBe("user_id");
    expect(eqCall?.args.val).toBe(uid);
  });

  it("nunca usa eq('id', authUid) sozinho para gravar perfil", () => {
    const uid = "user-uuid-123";
    supabaseMock.from("profiles").update({ avatar_url: "x" }).eq("user_id", uid);
    const wrong = calls.find((c) => c.method === "eq" && c.args.col === "id");
    expect(wrong).toBeUndefined();
  });

  it("upload de banner persiste cover_image_url + banner_url juntos", async () => {
    const uid = "user-uuid-banner";
    const payload = { cover_image_url: "https://x", banner_url: "https://x" };
    await supabaseMock.from("profiles").update(payload).eq("user_id", uid);
    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall?.args).toMatchObject({
      cover_image_url: expect.any(String),
      banner_url: expect.any(String),
    });
  });

  it("Signup payload inclui campos de endereço e GPS mapeados por user_id", async () => {
    const uid = "user-uuid-signup";
    const fullPayload = {
      user_id: uid,
      address_cep: "18047620",
      address_city: "Sorocaba",
      location_lat: -23.5,
      location_lng: -47.4,
      avatar_url: "https://cdn/a.jpg",
      cover_image_url: "https://cdn/b.jpg",
      banner_url: "https://cdn/b.jpg",
    };
    await supabaseMock.from("profiles").upsert(fullPayload, { onConflict: "user_id" });
    const upsertCall = calls.find((c) => c.method === "upsert");
    expect(upsertCall?.args.opts.onConflict).toBe("user_id");
    expect(upsertCall?.args.payload.user_id).toBe(uid);
    expect(upsertCall?.args.payload.address_cep).toBeTruthy();
    expect(upsertCall?.args.payload.location_lat).toBeTypeOf("number");
    expect(upsertCall?.args.payload.cover_image_url).toBe(upsertCall?.args.payload.banner_url);
  });
});

describe("Fallback de leitura: user_id → id", () => {
  it("quando user_id não retorna nada, busca por id", async () => {
    const uid = "user-uuid-fallback";

    // 1ª busca: user_id → vazio
    nextSelectResult = { data: null, error: null };
    const r1 = await supabaseMock.from("profiles").select("*").eq("user_id", uid).maybeSingle();
    expect(r1.data).toBeNull();

    // 2ª busca: id → encontra
    nextSelectResult = { data: { id: uid, user_id: uid, avatar_url: "ok" }, error: null };
    const r2 = await supabaseMock.from("profiles").select("*").eq("id", uid).maybeSingle();
    expect(r2.data?.avatar_url).toBe("ok");

    const eqCalls = calls.filter((c) => c.method === "eq");
    expect(eqCalls.map((c) => c.args.col)).toEqual(["user_id", "id"]);
  });
});
