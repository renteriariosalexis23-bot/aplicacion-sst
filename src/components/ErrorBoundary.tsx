import React, { Component, ErrorInfo, ReactNode } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage =
        "Algo salió mal. Por favor, intenta recargar la página.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (
            parsed.error &&
            (parsed.error.includes("permission-denied") ||
              parsed.error.includes("Missing or insufficient permissions"))
          ) {
            errorMessage =
              "No tienes permisos suficientes para realizar esta acción o ver estos datos.";
            isFirestoreError = true;
          }
        }
      } catch (e) {
        // Not a JSON error message, use default
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-4 bg-red-100 text-red-600 rounded-full mb-6">
            <AlertCircle className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            ¡Ups! Ha ocurrido un error
          </h2>
          <p className="text-slate-600 mb-8 max-w-md">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            <RefreshCw className="w-5 h-5" />
            Recargar Aplicación
          </button>

          {isFirestoreError && (
            <p className="mt-8 text-xs text-slate-400">
              Si el problema persiste, contacta al administrador de SST.
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
