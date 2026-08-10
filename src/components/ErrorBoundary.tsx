import * as React from "react";

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleClearStorageAndReload = () => {
    try {
      localStorage.removeItem("toonflow_projects");
      localStorage.removeItem("toonflow_active_project_id");
    } catch (e) {}
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto text-xl font-bold">
              ⚠️
            </div>
            <h1 className="text-lg font-bold text-slate-100">應用程式載入時發生異常</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              系統捕捉到未預期的執行階段錯誤，請點擊下方按鈕重新載入。若問題持續存在，可重置本地快取。
            </p>
            {this.state.error && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-left text-[11px] font-mono text-red-300 overflow-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition"
              >
                🔄 重新載入應用程式
              </button>
              <button
                onClick={this.handleClearStorageAndReload}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition"
              >
                🧹 清理本地暫存並重試
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
