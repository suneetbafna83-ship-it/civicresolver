import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering error occurred.',
    };
  }

  private readonly handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900"
        >
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <h1 className="text-base font-bold">
                CivicResolve Recovered from an Error
              </h1>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#11131a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
