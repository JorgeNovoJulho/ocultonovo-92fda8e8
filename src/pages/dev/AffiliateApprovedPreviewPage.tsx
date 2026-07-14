import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AffiliateApprovedModal, type AffiliateApprovedData } from "@/components/AffiliateApprovedModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Preview de DEV do AffiliateApprovedModal.
 * - /dev/preview/affiliate-approved          → mostra desktop + mobile lado a lado em iframes
 * - /dev/preview/affiliate-approved?solo=1   → renderiza apenas o modal aberto (consumido pelos iframes)
 *
 * Os controles permitem testar canal sem banner, nomes longos, ausência de @username
 * e link de afiliado, para conferir o layout em ambos os form factors sem precisar
 * disparar a notificação real.
 */
export default function AffiliateApprovedPreviewPage() {
  const [params, setParams] = useSearchParams();
  const solo = params.get("solo") === "1";

  const data: AffiliateApprovedData = useMemo(
    () => ({
      conversationId: params.get("c") ?? "preview-conv",
      channelName: params.get("name") ?? "Segredos de Canela",
      channelBanner: params.get("nobanner") === "1"
        ? null
        : (params.get("banner") ?? "/default-banner.jpg"),
      ownerUsername: params.get("nouser") === "1" ? null : (params.get("user") ?? "canela"),
      ownerAvatar: null,
      referralCode: "PREVIEW123",
      referralLink: params.get("nolink") === "1"
        ? null
        : "https://ocultoswing.com.br/?ref=PREVIEW123",
    }),
    [params],
  );

  // ── Modo "solo": apenas o modal, usado dentro dos iframes ──────────────────
  if (solo) {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex items-center justify-center p-2">
        <AffiliateApprovedModal open onOpenChange={() => {}} data={data} />
      </div>
    );
  }

  // ── Modo "comparação": desktop + mobile lado a lado ────────────────────────
  return <ComparisonView params={params} setParams={setParams} data={data} />;
}

function ComparisonView({
  params,
  setParams,
  data,
}: {
  params: URLSearchParams;
  setParams: (p: URLSearchParams) => void;
  data: AffiliateApprovedData;
}) {
  const [name, setName] = useState(data.channelName);
  const [user, setUser] = useState(data.ownerUsername ?? "");
  const [noBanner, setNoBanner] = useState(params.get("nobanner") === "1");
  const [noLink, setNoLink] = useState(params.get("nolink") === "1");
  const [noUser, setNoUser] = useState(params.get("nouser") === "1");

  const applyParams = () => {
    const next = new URLSearchParams();
    if (name) next.set("name", name);
    if (user) next.set("user", user);
    if (noBanner) next.set("nobanner", "1");
    if (noLink) next.set("nolink", "1");
    if (noUser) next.set("nouser", "1");
    setParams(next);
  };

  // URL do iframe (modo solo) — replica os params atuais
  const iframeUrl = (() => {
    const u = new URLSearchParams(params);
    u.set("solo", "1");
    return `/dev/preview/affiliate-approved?${u.toString()}`;
  })();

  // Bust para forçar reload do iframe quando o usuário aplicar mudanças
  const [reloadKey, setReloadKey] = useState(0);
  const handleApply = () => {
    applyParams();
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-muted/30 px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">
            Preview · Modal “Afiliado Aprovado”
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualização lado a lado para validar o modal em desktop e mobile sem
            precisar abrir em cada dispositivo.
          </p>
        </header>

        {/* Controles */}
        <section className="rounded-xl border bg-card p-4 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2 space-y-1">
            <Label htmlFor="prev-name">Nome do canal</Label>
            <Input
              id="prev-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Segredos de Canela"
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label htmlFor="prev-user">@username do criador</Label>
            <Input
              id="prev-user"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="canela"
              disabled={noUser}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleApply} className="w-full">
              Aplicar
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="nobanner" checked={noBanner} onCheckedChange={setNoBanner} />
            <Label htmlFor="nobanner" className="cursor-pointer">Sem banner</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="nolink" checked={noLink} onCheckedChange={setNoLink} />
            <Label htmlFor="nolink" className="cursor-pointer">Sem link de afiliado</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="nouser" checked={noUser} onCheckedChange={setNoUser} />
            <Label htmlFor="nouser" className="cursor-pointer">Sem @username</Label>
          </div>
          <div className="md:col-span-2 text-xs text-muted-foreground self-center">
            Clique em <strong>Aplicar</strong> para atualizar os dois previews.
          </div>
        </section>

        {/* Previews */}
        <section className="grid gap-6 lg:grid-cols-[1fr_auto]">
          {/* Desktop */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Desktop · 1280×800
              </h2>
            </div>
            <div className="rounded-lg overflow-hidden border bg-background shadow-sm">
              <iframe
                key={`desk-${reloadKey}`}
                src={iframeUrl}
                title="Desktop preview"
                className="w-full"
                style={{ height: 800, border: 0 }}
              />
            </div>
          </div>

          {/* Mobile */}
          <div className="space-y-2 lg:w-[400px]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Mobile · 375×812
            </h2>
            <div
              className="rounded-[2rem] overflow-hidden border-[8px] border-foreground/80 bg-background shadow-xl mx-auto"
              style={{ width: 391 }}
            >
              <iframe
                key={`mob-${reloadKey}`}
                src={iframeUrl}
                title="Mobile preview"
                className="block"
                style={{ width: 375, height: 812, border: 0 }}
              />
            </div>
          </div>
        </section>

        <footer className="text-xs text-muted-foreground pt-2">
          Rota interna de desenvolvimento — não exposta para usuários finais.
        </footer>
      </div>
    </div>
  );
}
