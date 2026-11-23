import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  scopeLabel?: string;
  inline?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'Error inesperado en la interfaz.';
    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed.error) {
        readable = `Error de permisos o conexión (${parsed.operationType || 'operación'} en ${
          parsed.path || 'base de datos'
        }): ${parsed.error}`;
      }
    } catch {
      // Conservar mensaje legible original
    }
    return { hasError: true, message: readable };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `ErrorBoundary${this.props.scopeLabel ? ` [${this.props.scopeLabel}]` : ''}:`,
      error,
      errorInfo
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      const containerClass = this.props.inline
        ? 'bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center max-w-lg mx-auto my-6'
        : 'min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6';

      const cardClass = this.props.inline
        ? 'space-y-3'
        : 'max-w-md w-full bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center';

      return (
        <div className={containerClass} role="alert">
          <div className={cardClass}>
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-[#0A1633]">
              {this.props.scopeLabel
                ? `Inconveniente en ${this.props.scopeLabel}`
                : 'Ocurrió un inconveniente'}
            </h2>
            <p className="mt-2 text-sm text-[#475569] break-words">{this.state.message}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A1633] text-white text-sm font-medium hover:bg-[#7C1FA2] transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-[#0A1633] text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
