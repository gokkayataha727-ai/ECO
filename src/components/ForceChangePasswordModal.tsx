import { useState } from 'react'
import { KeyRound, ShieldAlert, Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { checkPasswordStrength, validateStrongPassword } from '../lib/crypto'
import { forceChangePassword } from '../lib/auth'
import type { User } from '../types'

interface ForceChangePasswordModalProps {
  user: User
  onSuccess: () => void
}

export function ForceChangePasswordModal({ user, onSuccess }: ForceChangePasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const strength = checkPasswordStrength(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const validation = validateStrongPassword(password)
    if (!validation.valid) {
      setError(validation.error || 'Şifre kriterleri karşılanmıyor.')
      return
    }

    if (password !== confirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle eşleşmiyor.')
      return
    }

    setLoading(true)
    try {
      const res = await forceChangePassword(user.id, password)
      if (res.success) {
        onSuccess()
      } else {
        setError(res.error || 'Şifre güncellenirken bir hata oluştu.')
      }
    } catch {
      setError('Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-change-title"
    >
      <div className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 grid place-items-center shrink-0">
            <KeyRound size={22} />
          </div>
          <div>
            <h2 id="force-change-title" className="text-base font-black text-[#3b291f] dark:text-stone-100">
              Yeni Şifre Belirleyin
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              İlk giriş veya yönetici sıfırlaması nedeniyle şifrenizi güncellemeniz gerekmektedir.
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <ShieldAlert size={16} className="shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
          <span>
            Hesap güvenliğiniz için lütfen tahmin edilmesi güç bir şifre belirleyin. Şifre değiştirilmeden sisteme erişilemez.
          </span>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Yeni Şifre
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 10 karakter (harf + rakam)"
                className="w-full px-3.5 pr-10 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Password strength bar */}
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-stone-500 dark:text-stone-400">Şifre Gücü:</span>
                  <span className={strength.color.split(' ')[0]}>{strength.label}</span>
                </div>
                <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 rounded-full transition-all ${
                        step <= strength.score ? strength.color.split(' ')[1] : 'bg-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Yeni Şifre (Tekrar)
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Şifreyi tekrar yazın"
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading || password.length < 10 || password !== confirmPassword}
            className="w-full py-3 px-4 rounded-xl text-xs font-extrabold text-white bg-amber-800 hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Şifreyi Kaydet ve Devam Et</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

