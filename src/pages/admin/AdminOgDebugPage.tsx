/**
 * AdminOgDebugPage — /admin/og-debug
 * Ferramenta interna para conferir as OG tags geradas pela edge function
 * `og-leitura` antes de compartilhar um link.
 *
 * Uso: cole o ID do post (UUID) ou um link /leitura/<id> e clique em "Inspecionar".
 * Mostra preview de cartão (estilo WhatsApp), JSON com meta tags e HTML cru.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, ExternalLink, Copy, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FN_URL = "https://bpmeahyvubewqmmdxsll.supabase.co/functions/v1/og-leitura";

function extractId(input: string): string {
  const v = (input || "").trim();
  if (!v) return "";
  const m = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : v;
}

type DebugPayload = {
  id: string;
  url: string;
  cacheControl: string;
  etag: string;
  meta: {
    title: string;
    description: string;
    image: string;
    author: string | null;
    section: string | null;
  };
  post: Record<string, unknown>;
  html: string;
};

export default function AdminOgDebugPage() {
  const [search, setSearch] = useSearchParams();
  const initialId = extractId(search.get("id") || "");
  const [input, setInput] = useState(initialId);
  const [postId, setPostId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DebugPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState<string>("");
  const { toast } = useToast();

  const debugUrl = useMemo(() => {
    if (!postId) return "";
    const u = new URL(FN_URL);
    u.searchParams.set("id", postId);
    u.searchParams.set("debug", "1");
    if (bust) u.searchParams.set("v", bust);
    return u.toString();
  }, [postId, bust]);

  const rawUrl = useMemo(() => {
    if (!postId) return "";
    const u = new URL(FN_URL);
    u.searchParams.set("id", postId);
    if (bust) u.searchParams.set("v", bust);
    return u.toString();
  }, [postId, bust]);

  const shareUrl = useMemo(() => {
    if (!postId) return "";
    const base = "https://ocultoswing.com.br/leitura/" + postId;
    return bust ? `${base}?v=${encodeURIComponent(bust)}` : base;
  }, [postId, bust]);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(debugUrl, { headers: { accept: "application/json" } })
      .then(async (r) => {
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Resposta inválida (${r.status}): ${text.slice(0, 200)}`);
        }
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debugUrl, postId]);

  const handleInspect = () => {
    const id = extractId(input);
    if (!id) return;
    setPostId(id);
    setSearch({ id });
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copiado", description: label });
    } catch {
      toast({ title: "Falha ao copiar", description: value });
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">OG Debug — /leitura/:id</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cole o ID do post (ou um link <code className="text-xs bg-muted px-1 rounded">/leitura/&lt;id&gt;</code>) e veja exatamente
          como WhatsApp, Telegram, Facebook e Twitter exibirão a prévia.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInspect()}
            placeholder="UUID do post ou URL /leitura/..."
            className="font-mono text-sm"
          />
          <Button onClick={handleInspect} disabled={!extractId(input)}>
            Inspecionar
          </Button>
        </div>

        {postId ? (
          <div className="flex flex-col sm:flex-row gap-2 text-xs text-muted-foreground">
            <Input
              value={bust}
              onChange={(e) => setBust(e.target.value)}
              placeholder="cache-bust (ex: 2)"
              className="font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBust(String(Date.now()))}
              className="gap-2 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Forçar nova versão
            </Button>
          </div>
        ) : null}
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando OG…
        </div>
      ) : null}

      {error ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive whitespace-pre-wrap">{error}</div>
        </Card>
      ) : null}

      {data ? (
        <>
          {/* Preview estilo WhatsApp */}
          <Card className="overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prévia (estilo WhatsApp)
            </div>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="block bg-[#dcf8c6] dark:bg-[#1f3a2e] p-4"
            >
              <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 rounded-lg overflow-hidden shadow-sm">
                <div className="aspect-[1200/630] bg-muted">
                  <img
                    src={data.meta.image}
                    alt={data.meta.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/og-default.jpg"; }}
                  />
                </div>
                <div className="p-3">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-tight line-clamp-2">
                    {data.meta.title}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 line-clamp-2">
                    {data.meta.description}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2 uppercase">ocultoswing.com.br</p>
                </div>
              </div>
            </a>
          </Card>

          {/* Resumo */}
          <Card className="p-4 space-y-2 text-sm">
            <Row label="Título" value={data.meta.title} onCopy={copyToClipboard} />
            <Row label="Descrição" value={data.meta.description} onCopy={copyToClipboard} />
            <Row label="Imagem" value={data.meta.image} onCopy={copyToClipboard} mono />
            <Row label="Autor" value={data.meta.author || "—"} onCopy={copyToClipboard} />
            <Row label="Seção" value={data.meta.section || "—"} onCopy={copyToClipboard} />
            <Row label="ETag" value={data.etag} onCopy={copyToClipboard} mono />
            <Row label="Cache-Control" value={data.cacheControl} onCopy={copyToClipboard} mono />
            <Row label="Link para compartilhar" value={shareUrl} onCopy={copyToClipboard} mono />
            <Row label="OG endpoint" value={rawUrl} onCopy={copyToClipboard} mono />
          </Card>

          {/* Campos brutos do post */}
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Campos do post utilizados
            </p>
            <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto">
              {JSON.stringify(data.post, null, 2)}
            </pre>
          </Card>

          {/* HTML cru */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                HTML servido aos crawlers
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => copyToClipboard(data.html, "HTML")}>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
                <a href={rawUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-2">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </Button>
                </a>
              </div>
            </div>
            <pre className="text-[11px] bg-muted/40 rounded p-3 overflow-auto max-h-96">{data.html}</pre>
          </Card>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>Dica:</strong> WhatsApp e Facebook cacheiam previews por URL. Use o botão
              "Forçar nova versão" para anexar <code className="bg-muted px-1 rounded">?v=…</code> ao link
              compartilhado e quebrar o cache.
            </p>
            <p>
              Validadores externos:{" "}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(shareUrl)}`}>
                Facebook Debugger
              </a>{" · "}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://cards-dev.twitter.com/validator?url=${encodeURIComponent(shareUrl)}`}>
                Twitter Card Validator
              </a>{" · "}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(shareUrl)}`}>
                LinkedIn Inspector
              </a>
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  onCopy: (v: string, label: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_auto] gap-2 items-start">
      <span className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">{label}</span>
      <span className={`text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onCopy(value, label)}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
