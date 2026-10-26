import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleResetCache = () => {
    if (window.confirm('Önbellek temizlenip sayfa yenilenecek. Emin misiniz?')) {
      localStorage.removeItem('businessDays')
      window.location.reload()
    }
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
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-left text-[11px] font-mono text-stone-700 break-words max-h-32 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
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
                onClick={this.handleResetCache}
                className="w-full py-2.5 px-4 rounded-xl border border-[#dfd5cc] hover:bg-stone-50 text-[#8a6d57] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Günü Sıfırla & Yeniden Dene</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

