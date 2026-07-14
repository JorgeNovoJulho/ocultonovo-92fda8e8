import { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

/**
 * Lightweight Error Boundary to prevent a corrupt media file
 * from crashing the entire chat message list.
 */
export class ChatMediaErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[ChatMedia] Erro ao renderizar mídia:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-muted-foreground text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive/70" />
          <span>Mídia indisponível</span>
        </div>
      );
    }
    return this.props.children;
  }
}
