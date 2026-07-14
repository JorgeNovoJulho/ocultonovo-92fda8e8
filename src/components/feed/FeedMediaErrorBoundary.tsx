import { Component, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { logMediaError } from "@/lib/postMediaUtils";

interface Props {
  post: any;
  children: ReactNode;
  /** Se true (posts de bots/seed), some silenciosamente em vez de mostrar o aviso. */
  silent?: boolean;
}

interface State {
  hasError: boolean;
}

/**
 * Cerca o bloco de mídia de um post para que nenhum tipo de conteúdo
 * (texto, imagem, vídeo, link, gif) quebre o feed inteiro. Loga o erro
 * com o id/autor do post e mostra uma mensagem amigável.
 */
export class FeedMediaErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    logMediaError("render-boundary", this.props.post, error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.silent) return null;

    return (
      <div
        role="alert"
        className="mb-4 flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground"
      >
        <ImageOff className="h-4 w-4 shrink-0 text-amber-500" />
        <span>Não foi possível exibir esta mídia. Já registramos o problema.</span>
      </div>
    );
  }
}
