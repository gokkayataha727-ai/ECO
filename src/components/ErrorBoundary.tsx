import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: null,
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo)
    this.setState({ componentStack: errorInfo.componentStack || null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleSafeRecovery = () => {
    // Non-destructive safe recovery: Reload the application without deleting historical business days or orders
    try {
      // Clear temporary session tokens or view flags if needed, but NEVER touch business records
      sessionStorage.clear()
    } catch {
      // Ignore
    }
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#f6f3ee] flex items-center justify-center p-6 text-[#5c493d]">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-[#dfd5cc] text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle size={32} />
            </div>

            <div>
              <h1 className="text-xl font-black text-[#3b291f]">Bir Hata Oluştu</h1>
              <p className="text-xs text-[#8a6d57] mt-1.5 leading-relaxed">
                Uygulama çalışırken beklenmeyen bir hata ile karşılaşıldı.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-left text-[11px] font-mono text-stone-700 break-words max-h-40 overflow-y-auto space-y-1">
                <div>{this.state.error.message || String(this.state.error)}</div>
                {this.state.componentStack && (
                  <pre className="text-[10px] text-stone-500 whitespace-pre-wrap pt-1 border-t border-stone-200">
                    {this.state.componentStack.trim().split('\n').slice(0, 6).join('\n')}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl bg-[#8a6d57] hover:bg-[#3b291f] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw size={15} />
                <span>Sayfayı Yenile</span>
              </button>

              <button
                type="button"
                onClick={this.handleSafeRecovery}
                className="w-full py-2.5 px-4 rounded-xl border border-[#dfd5cc] hover:bg-stone-50 text-[#8a6d57] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>Güvenli Kurtarma (Veriler Korunur)</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

