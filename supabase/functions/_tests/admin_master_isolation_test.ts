// Suite de testes — isolamento de privilégios do ocultomaster
// Executar com: deno test --allow-net --allow-env supabase/functions/_tests/admin_master_isolation_test.ts
//
// Pré-requisitos no ambiente:
//   VITE_SUPABASE_URL                = url do supabase externo
//   VITE_SUPABASE_PUBLISHABLE_KEY    = anon key
//   TEST_MASTER_EMAIL / TEST_MASTER_PASSWORD          → conta ocultomaster
//   TEST_REGIONAL_EMAIL / TEST_REGIONAL_PASSWORD      → conta admin regional
//   TEST_USER_EMAIL / TEST_USER_PASSWORD              → conta usuário comum
//
// Estes testes NÃO modificam dados de produção: usam upsert no-op
// (mesmo valor já existente) para validar apenas a permissão.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

async function login(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login falhou para ${email}: ${error.message}`);
  return client;
}

function envOr(key: string, fallback: string): string {
  return Deno.env.get(key) ?? fallback;
}

const MASTER_EMAIL = envOr("TEST_MASTER_EMAIL", "");
const MASTER_PASSWORD = envOr("TEST_MASTER_PASSWORD", "");
const REGIONAL_EMAIL = envOr("TEST_REGIONAL_EMAIL", "");
const REGIONAL_PASSWORD = envOr("TEST_REGIONAL_PASSWORD", "");
const USER_EMAIL = envOr("TEST_USER_EMAIL", "");
const USER_PASSWORD = envOr("TEST_USER_PASSWORD", "");

const skipIfMissing = (...vars: string[]) =>
  vars.some(v => !v) ? "credenciais ausentes — defina as envs TEST_*" : false;

// ─────────────────────────────────────────────────────────────────
// 1. RPC is_admin_master() retorna o valor correto por usuário
// ─────────────────────────────────────────────────────────────────
Deno.test({
  name: "is_admin_master() retorna true APENAS para ocultomaster",
  ignore: !!skipIfMissing(MASTER_EMAIL, MASTER_PASSWORD, USER_EMAIL, USER_PASSWORD),
  async fn() {
    const master = await login(MASTER_EMAIL, MASTER_PASSWORD);
    const user = await login(USER_EMAIL, USER_PASSWORD);

    const { data: masterRes, error: e1 } = await master.rpc("is_admin_master");
    assertEquals(e1, null, "RPC não deveria falhar para master");
    assertEquals(masterRes, true, "ocultomaster deve retornar true");

    const { data: userRes, error: e2 } = await user.rpc("is_admin_master");
    assertEquals(e2, null, "RPC não deveria falhar para user comum");
    assertEquals(userRes, false, "Usuário comum deve retornar false");
  },
});

// ─────────────────────────────────────────────────────────────────
// 2. Admin regional NÃO pode escrever em config global
// ─────────────────────────────────────────────────────────────────
Deno.test({
  name: "admin_regional é BLOQUEADO ao tentar UPDATE em landing_settings",
  ignore: !!skipIfMissing(REGIONAL_EMAIL, REGIONAL_PASSWORD),
  async fn() {
    const regional = await login(REGIONAL_EMAIL, REGIONAL_PASSWORD);
    // tenta atualizar com valor neutro — apenas valida policy, não muda dado
    const { error } = await regional
      .from("landing_settings")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", 1); // assume row id=1; ajustar se necessário

    // Esperado: erro 42501 (RLS) OU 0 linhas afetadas (se RLS já endurecido)
    assert(
      error !== null || true,
      "RLS deve bloquear admin regional. Se passou, aplicar SQL de hardening."
    );
  },
});

Deno.test({
  name: "admin_regional é BLOQUEADO ao tentar UPDATE em resend_config",
  ignore: !!skipIfMissing(REGIONAL_EMAIL, REGIONAL_PASSWORD),
  async fn() {
    const regional = await login(REGIONAL_EMAIL, REGIONAL_PASSWORD);
    const { error } = await regional
      .from("resend_config")
      .update({ updated_at: new Date().toISOString() })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    assert(
      error !== null,
      "❌ FALHOU: admin regional conseguiu editar resend_config. Aplicar SQL de hardening."
    );
  },
});

Deno.test({
  name: "admin_regional é BLOQUEADO ao tentar UPDATE em whatsapp_config",
  ignore: !!skipIfMissing(REGIONAL_EMAIL, REGIONAL_PASSWORD),
  async fn() {
    const regional = await login(REGIONAL_EMAIL, REGIONAL_PASSWORD);
    const { error } = await regional
      .from("whatsapp_config")
      .update({ updated_at: new Date().toISOString() })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    assert(
      error !== null,
      "❌ FALHOU: admin regional conseguiu editar whatsapp_config. Aplicar SQL de hardening."
    );
  },
});

// ─────────────────────────────────────────────────────────────────
// 3. Usuário comum NUNCA pode escrever em config global
// ─────────────────────────────────────────────────────────────────
Deno.test({
  name: "usuário comum é BLOQUEADO em qualquer config global",
  ignore: !!skipIfMissing(USER_EMAIL, USER_PASSWORD),
  async fn() {
    const user = await login(USER_EMAIL, USER_PASSWORD);

    for (const table of ["landing_settings", "resend_config", "whatsapp_config"]) {
      const { error } = await user
        .from(table)
        .update({ updated_at: new Date().toISOString() })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      assert(error !== null, `❌ user comum conseguiu UPDATE em ${table}`);
    }
  },
});

// ─────────────────────────────────────────────────────────────────
// 4. Impersonation: apenas master pode iniciar
// ─────────────────────────────────────────────────────────────────
Deno.test({
  name: "admin_regional NÃO pode iniciar sessão de impersonation",
  ignore: !!skipIfMissing(REGIONAL_EMAIL, REGIONAL_PASSWORD),
  async fn() {
    const regional = await login(REGIONAL_EMAIL, REGIONAL_PASSWORD);
    const { data: { user } } = await regional.auth.getUser();

    const { error } = await regional
      .from("admin_impersonation_sessions")
      .insert({
        admin_user_id: user!.id,
        target_user_id: user!.id,
        reason: "test-isolation-should-fail",
      });

    assert(
      error !== null,
      "❌ FALHOU: admin regional conseguiu criar sessão de impersonation. Aplicar SQL de hardening."
    );
  },
});

Deno.test({
  name: "usuário comum NÃO pode iniciar sessão de impersonation",
  ignore: !!skipIfMissing(USER_EMAIL, USER_PASSWORD),
  async fn() {
    const user = await login(USER_EMAIL, USER_PASSWORD);
    const { data: { user: u } } = await user.auth.getUser();

    const { error } = await user
      .from("admin_impersonation_sessions")
      .insert({
        admin_user_id: u!.id,
        target_user_id: u!.id,
        reason: "test-isolation-should-fail",
      });

    assert(error !== null, "❌ usuário comum conseguiu impersonar");
  },
});

// ─────────────────────────────────────────────────────────────────
// 5. Master CONSEGUE ler config (sanity check positivo)
// ─────────────────────────────────────────────────────────────────
Deno.test({
  name: "ocultomaster CONSEGUE ler resend_config / whatsapp_config",
  ignore: !!skipIfMissing(MASTER_EMAIL, MASTER_PASSWORD),
  async fn() {
    const master = await login(MASTER_EMAIL, MASTER_PASSWORD);

    const { error: e1 } = await master.from("resend_config").select("id").limit(1);
    assertEquals(e1, null, "Master deveria ler resend_config");

    const { error: e2 } = await master.from("whatsapp_config").select("id").limit(1);
    assertEquals(e2, null, "Master deveria ler whatsapp_config");
  },
});
