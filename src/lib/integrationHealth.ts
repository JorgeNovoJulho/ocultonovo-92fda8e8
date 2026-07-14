import { supabase as externalClient } from "@/lib/supabaseExternal";

type IntegrationStatus = "OK" | "FAIL";

const SERVICE_LABELS: Record<string, string> = {
  pix: "Gateway PIX",
  resend: "Resend (Email)",
  whatsapp: "WhatsApp",
  asaas: "ASAAS — PIX, Cartão & Saques",
  openai: "OpenAI",
};

async function upsertSetting(key: string, value: string, description: string) {
  const { error } = await externalClient
    .from("system_settings")
    .upsert(
      { key, value, description, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) throw error;
}

export async function persistIntegrationReference(
  serviceId: string,
  message: string,
) {
  const label = SERVICE_LABELS[serviceId] || serviceId;
  await Promise.all([
    upsertSetting(
      `${serviceId}_configured`,
      "true",
      `${label} referenciado via painel`,
    ),
    upsertSetting(
      `${serviceId}_reference_status`,
      "referenced",
      `${label} salvo, ainda não validado`,
    ),
    upsertSetting(
      `${serviceId}_last_test_message`,
      message,
      `Última mensagem ${label}`,
    ),
  ]);
}

export async function persistIntegrationHealth(
  serviceId: string,
  status: IntegrationStatus,
  message: string,
) {
  const now = new Date().toISOString();
  const label = SERVICE_LABELS[serviceId] || serviceId;
  await Promise.all([
    upsertSetting(
      `${serviceId}_configured`,
      status === "OK" ? "true" : "false",
      `${label} validado via painel`,
    ),
    upsertSetting(
      `${serviceId}_last_test_status`,
      status,
      `Último status do teste ${label}`,
    ),
    upsertSetting(
      `${serviceId}_last_test_message`,
      message,
      `Última mensagem do teste ${label}`,
    ),
    upsertSetting(
      `${serviceId}_last_test_at`,
      now,
      `Data/hora do último teste ${label}`,
    ),
  ]);
}
