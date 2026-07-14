import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

const OG_BASE = `${EXTERNAL_SUPABASE_URL}/functions/v1/og-canal`;

type DebugPayload = {
  id?: string;
  ref?: string;
  redirectTo?: string;
  versionedUrl?: string;
  effectiveVersion?: string;
  meta?: { title?: string; description?: string; image?: string };
  profile?: any;
  plan?: any;
  status?: string;
};

export default function OgCanalPreviewPage() {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [id, setId] = useState(search.get("id") || "");
  const [ref, setRef] = useState(search.get("ref") || "");
  const [data, setData] = useState<DebugPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-preenche com o próprio canal do usuário se vazio
  useEffect(() => {
    if (!id && profile?.user_id) setId(profile.user_id);
  }, [profile?.user_id, id]);

  const shareUrl = id
    ? `${OG_BASE}?id=${encodeURIComponent(id)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`
    : "";

  const fetchPreview = async () => {
    if (!id) return;
    setLoading(true); setErr(null); setData(null);
    try {
      const url = `${shareUrl}&debug=1&t=${Date.now()}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as DebugPayload;
      setData(json);
      setSearch(ref ? { id, ref } : { id }, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Falha ao copiar"); }
  };

  return (
    <div className="container max-w-3xl mx-auto p-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prévia OG do canal</h1>
          <p className="text-sm text-muted-foreground">
            Inspecione o preview que WhatsApp, Telegram, Facebook e X vão mostrar antes de compartilhar.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>Voltar</Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <div className="space-y-2">
            <label className="text-xs font-medium">ID do criador (profile.user_id ou profile.id)</label>
            <Input value={id} onChange={(e) => setId(e.target.value.trim())} placeholder="ex: 606652f7-bd83-..." />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Ref (opcional)</label>
            <Input value={ref} onChange={(e) => setRef(e.target.value.trim())} placeholder="AFF4EBB7832" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={fetchPreview} disabled={!id || loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Gerar prévia
          </Button>
          {shareUrl && (
            <>
              <Button onClick={copy} size="sm" variant="outline">
                {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                Copiar link de compartilhamento
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir no navegador
                </a>
              </Button>
            </>
          )}
        </div>
        {shareUrl && (
          <p className="text-[11px] text-muted-foreground break-all border-t border-border/40 pt-2">
            {shareUrl}
          </p>
        )}
      </Card>

      {err && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <p className="text-sm text-destructive font-medium">Erro: {err}</p>
        </Card>
      )}

      {data && (
        <>
          {/* Cartão visual simulando WhatsApp */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Pré-visualização (estilo WhatsApp/Telegram)</h2>
            <Card className="overflow-hidden border-border/60">
              {data.meta?.image && (
                <div className="aspect-[1200/630] bg-muted overflow-hidden">
                  <img
                    src={data.meta.image}
                    alt={data.meta?.title || "preview"}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
              <div className="p-3 space-y-1">
                <p className="text-sm font-semibold line-clamp-2">{data.meta?.title || "—"}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">{data.meta?.description || "—"}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 pt-1">ocultoswing.com.br</p>
              </div>
            </Card>
          </div>

          {/* Inspeção técnica */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Meta-tags geradas</h2>
            <dl className="text-xs space-y-2">
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-muted-foreground">og:title</dt>
                <dd className="break-words">{data.meta?.title || <span className="text-amber-400">vazio · usa fallback</span>}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-muted-foreground">og:description</dt>
                <dd className="break-words">{data.meta?.description || <span className="text-amber-400">vazio · usa fallback</span>}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-muted-foreground">og:image</dt>
                <dd className="break-all">{data.meta?.image || <span className="text-amber-400">vazio · usa default</span>}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-muted-foreground">og:url</dt>
                <dd className="break-all">{data.versionedUrl}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-muted-foreground">redirect</dt>
                <dd className="break-all">{data.redirectTo}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-muted-foreground">version</dt>
                <dd>{data.effectiveVersion}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
              <Badge variant="outline" className={data.profile?.has_avatar ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}>
                avatar {data.profile?.has_avatar ? "ok" : "ausente"}
              </Badge>
              <Badge variant="outline" className={data.profile?.has_cover ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}>
                cover {data.profile?.has_cover ? "ok" : "ausente"}
              </Badge>
              <Badge variant="outline" className={data.plan?.has_banner ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}>
                banner do plano {data.plan?.has_banner ? "ok" : "ausente"}
              </Badge>
              <Badge variant="outline" className={data.plan ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}>
                plano {data.plan ? "ativo" : "não encontrado"}
              </Badge>
            </div>
          </Card>

          {/* Validadores externos */}
          <Card className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Validar nos crawlers oficiais</h2>
            <p className="text-xs text-muted-foreground">
              Force a re-leitura do preview pelas plataformas:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">
                  Facebook / WhatsApp <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`https://cards-dev.twitter.com/validator?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">
                  X (Twitter) Card <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">
                  LinkedIn Inspector <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Dica: se editar capa/título/descrição do canal, adicione <code className="px-1 bg-muted rounded">&amp;v={Date.now()}</code> ao link para forçar o cache buster do WhatsApp.
            </p>
          </Card>

          {/* JSON cru */}
          <details className="bg-muted/40 rounded-md">
            <summary className="cursor-pointer text-xs font-medium p-3">Ver JSON completo (debug)</summary>
            <pre className="text-[10px] p-3 overflow-x-auto leading-tight">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}
