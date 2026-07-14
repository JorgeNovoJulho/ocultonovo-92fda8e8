/**
 * useAdAi — assistência de IA via OpenAI (edge function openai-chat).
 * NUNCA usa Lovable AI.
 *
 * Recursos:
 *  • Erros padronizados via AdStructuredError ({ code, title, message, actions })
 *  • Cancelamento em andamento via AbortController + flag cancelled
 */
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { toStructuredError, type AdStructuredError } from "@/lib/adErrors";

export interface AdCopySuggestion {
  title: string;
  description: string;
  cta_text: string;
}

export interface AdExtractedFromImage {
  title: string;
  description: string;
  cta_text: string;
  accent_color: string;
  dominant_palette: string[];
}

const CANCELLED_ERROR: AdStructuredError = {
  code: "AI_CANCELLED",
  title: "Operação cancelada",
  message: "Você interrompeu a geração antes da conclusão.",
  actions: ["retry", "cancel"],
};

export function useAdAi() {
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<AdStructuredError | null>(null);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function cancel() {
    if (!loading) return;
    cancelledRef.current = true;
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    setLoading(false);
    setLastError(CANCELLED_ERROR);
    toast.message("Geração cancelada", { description: "Você interrompeu a chamada à IA." });
  }

  /** Executa uma promise verificando cancelamento; retorna null se cancelada. */
  async function runCancellable<T>(p: Promise<T>): Promise<T | null> {
    return await Promise.race<T | null>([
      p,
      new Promise<null>((resolve) => {
        const ctrl = abortRef.current!;
        ctrl.signal.addEventListener("abort", () => resolve(null), { once: true });
      }),
    ]);
  }

  async function suggestCopy(opts: {
    product: string;
    audience?: string;
    tone?: string;
  }): Promise<AdCopySuggestion | null> {
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setLoading(true);
    setLastError(null);
    try {
      const system = `Você é um especialista em copy de anúncios para uma plataforma social adulta brasileira (Oculto).
Responda APENAS em JSON válido no formato:
{"title": "...", "description": "...", "cta_text": "..."}
Título: máximo 60 caracteres, cativante.
Descrição: máximo 140 caracteres, persuasiva e adequada para plataforma +18.
CTA: máximo 22 caracteres, verbo de ação (ex: "Quero conhecer", "Garantir agora").
Não use emojis em excesso (máximo 1). Linguagem brasileira natural.`;

      const user = `Produto/oferta: ${opts.product}
Público-alvo: ${opts.audience || "adultos no Brasil interessados em encontros e relacionamentos discretos"}
Tom: ${opts.tone || "misterioso e elegante"}`;

      const invocation = supabase.functions.invoke("openai-chat", {
        body: {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
      });

      const result = await runCancellable(invocation);
      if (cancelledRef.current || !result) return null;

      const { data, error } = result as any;
      if (error) throw error;
      const content = data?.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: String(parsed.title || "").slice(0, 60),
        description: String(parsed.description || "").slice(0, 140),
        cta_text: String(parsed.cta_text || "Saiba mais").slice(0, 22),
      };
    } catch (e: any) {
      if (cancelledRef.current) return null;
      const err = toStructuredError("ai_copy", e);
      setLastError(err);
      toast.error(`${err.title} · ${err.code}`, { description: err.message });
      return null;
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }

  async function extractFromImage(imageUrl: string): Promise<AdExtractedFromImage | null> {
    if (!imageUrl) {
      const err: AdStructuredError = {
        code: "AI_VISION_NO_INPUT",
        title: "Sem imagem",
        message: "Envie ou cole uma imagem antes de extrair com IA.",
        actions: ["cancel"],
      };
      setLastError(err);
      toast.error(err.title, { description: err.message });
      return null;
    }
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setLoading(true);
    setLastError(null);
    try {
      const system = `Você é um diretor de criação especializado em anúncios para plataforma social adulta brasileira (Oculto).
Analise a imagem enviada e responda APENAS em JSON válido:
{"title":"...","description":"...","cta_text":"...","accent_color":"#RRGGBB","dominant_palette":["#...","#...","#..."]}
- title: máx 60 caracteres, cativante, em pt-BR
- description: máx 140 caracteres, persuasiva, +18 elegante
- cta_text: máx 22 caracteres, verbo de ação
- accent_color: cor que melhor contrasta com a imagem para botão CTA
- dominant_palette: 3 cores predominantes em hex`;

      const invocation = supabase.functions.invoke("openai-chat", {
        body: {
          model: "gpt-4o",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                { type: "text", text: "Analise esta imagem e gere o copy do anúncio." },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
        },
      });

      const result = await runCancellable(invocation);
      if (cancelledRef.current || !result) return null;

      const { data, error } = result as any;
      if (error) throw error;
      const content = data?.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: String(parsed.title || "").slice(0, 60),
        description: String(parsed.description || "").slice(0, 140),
        cta_text: String(parsed.cta_text || "Saiba mais").slice(0, 22),
        accent_color: String(parsed.accent_color || "#ec4899").slice(0, 7),
        dominant_palette: Array.isArray(parsed.dominant_palette)
          ? parsed.dominant_palette.slice(0, 5).map((c: any) => String(c).slice(0, 7))
          : [],
      };
    } catch (e: any) {
      if (cancelledRef.current) return null;
      const err = toStructuredError("ai_vision", e);
      setLastError(err);
      toast.error(`${err.title} · ${err.code}`, { description: err.message });
      return null;
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }

  async function generateImage(opts: {
    prompt: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024";
    quality?: "low" | "medium" | "high";
  }): Promise<{ dataUrl: string; size: string } | null> {
    const prompt = (opts.prompt || "").trim();
    if (!prompt) {
      const err: AdStructuredError = {
        code: "AI_IMG_NO_PROMPT",
        title: "Sem descrição",
        message: "Descreva a imagem que você quer gerar.",
        actions: ["cancel"],
      };
      setLastError(err);
      toast.error(err.title, { description: err.message });
      return null;
    }
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setLoading(true);
    setLastError(null);
    try {
      const invocation = supabase.functions.invoke("openai-image", {
        body: {
          prompt,
          size: opts.size ?? "1024x1024",
          quality: opts.quality ?? "medium",
          model: "gpt-image-1",
        },
      });
      const result = await runCancellable(invocation);
      if (cancelledRef.current || !result) return null;
      const { data, error } = result as any;
      if (error) throw error;
      const dataUrl: string | undefined = data?.dataUrl || data?.url;
      if (!dataUrl) throw new Error(data?.error || "Sem imagem retornada");
      return { dataUrl, size: String(data?.size || opts.size || "1024x1024") };
    } catch (e: any) {
      if (cancelledRef.current) return null;
      const err = toStructuredError("ai_image", e);
      setLastError(err);
      toast.error(`${err.title} · ${err.code}`, { description: err.message });
      return null;
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }

  return {
    loading,
    lastError,
    cancel,
    clearError: () => setLastError(null),
    suggestCopy,
    extractFromImage,
    generateImage,
  };
}

