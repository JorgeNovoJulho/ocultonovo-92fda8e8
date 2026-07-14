import { describe, expect, it } from "vitest";
import { mapDiscoveryErrorMessage } from "@/hooks/useDiscoveryActions";

describe("hotfix discovery + retention", () => {
  it("traduz erros de schema/permissão do Aproximar para mensagem rastreável", () => {
    expect(mapDiscoveryErrorMessage(new Error('column "is_super_match" does not exist')))
      .toBe('A função de aproximação no banco está desatualizada.');

    expect(mapDiscoveryErrorMessage(new Error('new row violates row-level security policy')))
      .toBe('A aproximação foi bloqueada pelas permissões do banco.');
  });

  it("usa a chave nova da missão de entrar em sala", async () => {
    const mod = await import("@/lib/retentionMissionEvents");
    expect(String(mod.notifyEnterRoomMissionCompleted)).toContain('d1_enter_room');
  });
});