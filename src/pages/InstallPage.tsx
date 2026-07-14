// SEO via document.title (projeto não usa react-helmet)
import { useEffect, useState } from "react";
import { Download, Share, Plus, Smartphone, Monitor, CheckCircle2, Bell, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useToast } from "@/hooks/use-toast";

type Platform = "android-chrome" | "samsung" | "ios" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) return "ios";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Android/i.test(ua)) return "android-chrome";
  return "desktop";
}

const SoftwareJsonLd = (
  <script type="application/ld+json">{JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "OCULTO",
    "operatingSystem": "Android, iOS, Web",
    "applicationCategory": "SocialNetworkingApplication",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "BRL" },
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "ratingCount": "1240" },
  })}</script>
);

export default function InstallPage() {
  const { install, hasNativePrompt, isInstalled } = usePWAInstall();
  const { toast } = useToast();
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());
    document.title = "Instalar OCULTO no seu celular";
  }, []);

  const handleInstall = async () => {
    const res = await install();
    if (res.outcome === "accepted") {
      toast({ title: "OCULTO instalado!", description: "Acesse pelo ícone na sua tela inicial." });
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {SoftwareJsonLd}

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-500/15 border border-amber-500/30 mb-5">
            <img loading="lazy" decoding="async" src="/icons/icon-192.png" alt="OCULTO" className="w-14 h-14 rounded-2xl" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Instale o <span className="text-amber-400">OCULTO</span> no seu celular
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Aplicativo leve, instala em segundos. Funciona em Android e iPhone.
          </p>
        </header>

        {isInstalled ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5 mb-6">
            <CardContent className="p-5 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              <div>
                <p className="font-semibold">OCULTO já está instalado neste dispositivo</p>
                <p className="text-sm text-muted-foreground">Abra pelo ícone na sua tela inicial.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {hasNativePrompt && (
              <Card className="border-amber-500/30 bg-gradient-to-br from-black to-amber-950/20 mb-6">
                <CardContent className="p-6 text-center">
                  <Button
                    size="lg"
                    onClick={handleInstall}
                    className="gap-2 bg-amber-500 text-black hover:bg-amber-400 font-semibold w-full sm:w-auto"
                  >
                    <Download className="h-5 w-5" />
                    Instalar agora
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">1 toque · sem cadastro adicional · &lt; 1 MB</p>
                </CardContent>
              </Card>
            )}

            {platform === "ios" && (
              <Card className="mb-6">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-amber-400" />
                    <h2 className="font-semibold">No iPhone / iPad (Safari)</h2>
                  </div>
                  <ol className="space-y-3 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">1</span>
                      <span>Toque em <Share className="inline h-4 w-4 mx-1 align-text-bottom text-amber-400" /> <strong>Compartilhar</strong> na barra do Safari.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">2</span>
                      <span>Toque em <Plus className="inline h-4 w-4 mx-1 align-text-bottom text-amber-400" /> <strong>Adicionar à Tela de Início</strong>.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">3</span>
                      <span>Confirme em <strong>Adicionar</strong>. Pronto — o OCULTO aparece como app na sua tela.</span>
                    </li>
                  </ol>
                  <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
                    Importante: use o navegador <strong>Safari</strong>. Outros navegadores no iOS não permitem instalar.
                  </p>
                </CardContent>
              </Card>
            )}

            {(platform === "android-chrome" || platform === "samsung") && !hasNativePrompt && (
              <Card className="mb-6">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-amber-400" />
                    <h2 className="font-semibold">No Android ({platform === "samsung" ? "Samsung Internet" : "Chrome"})</h2>
                  </div>
                  <ol className="space-y-3 text-sm">
                    <li>1. Toque no menu <strong>⋮</strong> no canto superior direito.</li>
                    <li>2. Selecione <strong>{platform === "samsung" ? "Adicionar página a" : "Adicionar à tela inicial"}</strong>.</li>
                    <li>3. Confirme em <strong>Adicionar</strong>.</li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {platform === "desktop" && (
              <Card className="mb-6">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-amber-400" />
                    <h2 className="font-semibold">No Desktop (Chrome, Edge)</h2>
                  </div>
                  <p className="text-sm">Clique no ícone de instalação na barra de endereço, ou no menu ⋮ → <strong>Instalar OCULTO</strong>.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <section aria-labelledby="benefits-heading" className="mt-10">
          <h2 id="benefits-heading" className="text-xl font-semibold mb-4 text-center">Por que instalar</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: Zap, title: "Acesso instantâneo", text: "Abre direto da tela inicial, como um app nativo." },
              { icon: Bell, title: "Notificações em tempo real", text: "Mensagens, matches e novidades sem abrir o navegador." },
              { icon: Smartphone, title: "Experiência fullscreen", text: "Sem barra de endereço, sem distrações." },
              { icon: Shield, title: "Atualização segura", text: "Sempre na versão mais recente, sem perder seu login." },
            ].map((b) => (
              <div key={b.title} className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-card/30">
                <b.icon className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          <p>OCULTO funciona como Web App (PWA). Sem download em loja, sem permissões invasivas.</p>
        </footer>
      </main>
    </div>
  );
}
