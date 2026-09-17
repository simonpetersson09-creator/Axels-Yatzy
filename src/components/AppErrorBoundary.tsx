import { Component, type ErrorInfo, type ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time errors so a single broken component never leaves the
 * player on a blank screen. Also reports the error through analytics so
 * production issues become visible instead of silent white screens.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
    try {
      trackEvent('app_render_error', {
        message: error.message?.slice(0, 300),
        stack: error.stack?.slice(0, 500),
      });
    } catch {
      /* analytics must never mask the original error */
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8 text-center bg-background text-foreground">
        <span className="text-4xl" aria-hidden="true">
          🎲
        </span>
        <h1 className="font-display text-xl font-bold">Något gick fel</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Appen stötte på ett oväntat fel. Starta om så fortsätter spelet där du var.
        </p>
        <button
          onClick={this.handleReload}
          className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold"
        >
          Starta om
        </button>
      </div>
    );
  }
}
