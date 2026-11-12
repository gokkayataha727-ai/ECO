import { useState, useEffect, useRef } from 'react'
import { Lock, Power, X, Eye, EyeOff, AlertCircle, Loader2, ShieldAlert } from 'lucide-react'
import { verifyAdminPasswordForExit, getLoginAttemptState } from '../lib/auth'
import { quitApp } from '../lib/api'
import type { Session } from '../types'

interface AdminExitModalProps {
  isOpen: boolean
  onClose: () => void
  currentSession?: Session | null
}

export function AdminExitModal({ isOpen, onClose, currentSession }: AdminExitModalProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockRemaining, setLockRemaining] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setPassword('')
      setShowPassword(false)
      setError(null)
      setLoading(false)
      return
    }

    setTimeout(() => inputRef.current?.focus(), 60)

    const updateLock = () => {
      const state = getLoginAttemptState('__kiosk_admin_exit__')
      const now = Date.now()
      if (state.lockedUntil && state.lockedUntil > now) {
        setLockRemaining(Math.ceil((state.lockedUntil - now) / 1000))
      } else {
        setLockRemaining(0)
      }
    }

    updateLock()
    const timer = setInterval(updateLock, 1000)
    return () => clearInterval(timer)
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || lockRemaining > 0) return

    setError(null)
    setLoading(true)

    try {
      const res = await verifyAdminPasswordForExit(password, currentSession)
      if (!res.success || !res.adminUser) {
        setError(res.error || 'Yönetici şifresi doğrulanamadı.')
        setPassword('')
        if (res.lockRemainingSeconds) {
          setLockRemaining(res.lockRemainingSeconds)
        }
        return
      }

      const quitRes = await quitApp(res.adminUser.username)
      if (!quitRes.success) {
        setError(quitRes.error || 'Çıkış işlemi tamamlanamadı.')
      } else {
        onClose()
      }
    } catch {
      setError('Çıkış doğrulaması sırasında beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Yönetici Onaylı Uygulamadan Çıkış"
    >
      <div className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 grid place-items-center shrink-0">
              <Power size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">
                Uygulamadan Çıkış (Yönetici Onayı)
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Kiosk kilidini açıp masaüstüne dönmek için yönetici şifresi girin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="close-button"
            aria-label="Çıkış penceresini kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <ShieldAlert size={16} className="shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
          <span>
            Kasa güvenliği nedeniyle uygulamadan çıkış yalnızca <strong>Yönetici Şifresi</strong> ile yapılabilir. Çıkış öncesinde otomatik kapanış yedeği alınacaktır.
          </span>
        </div>

        {lockRemaining > 0 && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 flex items-center gap-2 text-xs font-semibold">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>Çok sayıda hatalı deneme yapıldı. {lockRemaining} saniye bekleyin.</span>
          </div>
        )}

        {error && lockRemaining === 0 && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2 text-xs font-semibold">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Yönetici Şifresi
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                <Lock size={16} />
              </span>
              <input
                ref={inputRef}
                type="text"
                name="lemoon_kiosk_exit_secret"
                autoComplete="off"
                required
                disabled={loading || lockRemaining > 0}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Yönetici şifrenizi girin"
                className={`w-full pl-10 pr-11 py-2.5 text-sm font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-600 shadow-sm disabled:opacity-60 ${
                  !showPassword ? 'masked-text-security' : ''
                }`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={loading || lockRemaining > 0 || !password.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-rose-700 hover:bg-rose-800 text-white shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Doğrulanıyor...</span>
                </>
              ) : (
                <>
                  <Power size={15} />
                  <span>Yedek Al ve Uygulamadan Çık</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
