import { Component, type ReactNode } from "react";
import { AlertTriangle, Download } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("AD-PathTracker crashed:", error, info.componentStack);
  }

  handleExportAndReset = () => {
    try {
      const raw = localStorage.getItem("ad-pathtracker-session");
      if (raw) {
        const blob = new Blob([raw], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ad-pathtracker-crash-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      localStorage.removeItem("ad-pathtracker-session");
      window.location.reload();
    }
  };

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#0b0e14] px-6 text-center text-gray-200">
        <AlertTriangle size={40} color="#ef4444" />
        <h1 className="text-lg font-semibold">Something went wrong rendering your session</h1>
        <p className="max-w-md text-sm text-gray-400">
          This is usually a one-off rendering bug, not data loss. Try reloading first — if it keeps
          happening, you can back up the raw session file and reset.
        </p>
        <pre className="max-w-lg overflow-auto rounded border border-gray-700 bg-[#11141c] p-2 text-left text-[11px] text-red-300">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={this.handleReload}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Reload
          </button>
          <button
            onClick={this.handleExportAndReset}
            className="flex items-center gap-1 rounded border border-red-900 bg-[#2a1416] px-3 py-1.5 text-xs text-red-300 hover:bg-[#3a1a1d]"
          >
            <Download size={13} /> Back Up & Reset Session
          </button>
        </div>
      </div>
    );
  }
}
