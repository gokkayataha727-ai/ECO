import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ShieldCheck,
  Coffee,
  AlertCircle,
  Delete,
  Loader2,
  CheckCircle2,
  Copy,
  Sparkles,
  ShieldAlert,
} from 'lucide-react'
import { AppLogo } from './AppLogo'
import {
  getLoginAttemptState,
  loginWithPassword,
  loginWithPin,
  getAllUsers,
  initializeAuthSystem,
  hasAnyAdmin,
  createInitialAdmin,
  clearInitialWaitstaffPins,
  type WaitstaffPinRecord,
  type LoginResult,
} from '../lib/auth'
import { checkPasswordStrength, validateStrongPassword } from '../lib/crypto'
import type { Session, User } from '../types'

interface LoginScreenProps {
  onLoginSuccess: (session: Session, user: User, mustChangePassword?: boolean) => void
  storeName?: string
  storeSub?: string
  onRequestAdminExit?: () => void
}

export function LoginScreen({
  onLoginSuccess,
  storeName = 'LEMOON KAFE',
  storeSub = 'Kahvenin iyi hali',
  onRequestAdminExit,
}: LoginScreenProps) {
  const [roleTab, setRoleTab] = useState<'admin' | 'waiter'>('waiter')
  const secretTapTimestampsRef = useRef<number[]>([])

  const handleSecretBrandTap = useCallback(() => {
    if (!onRequestAdminExit) return
    const currentTs = Date.now()
    const recent = secretTapTimestampsRef.current.filter((ts) => currentTs - ts < 2500)
    recent.push(currentTs)
    secretTapTimestampsRef.current = recent
    if (recent.length >= 5) {
      secretTapTimestampsRef.current = []
      onRequestAdminExit()
    }
  }, [onRequestAdminExit])

  // Initial setup state (if no admin exists at all)
  const [isInitialSetup, setIsInitialSetup] = useState<boolean>(() => !hasAnyAdmin())
  const [setupFullName, setSetupFullName] = useState('')
  const [setupUsername, setSetupUsername] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('')
  const [setupShowPassword, setSetupShowPassword] = useState(false)

  // Credentials state (Admin)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Waiter Card Selection & PIN state
  const [selectedWaiterId, setSelectedWaiterId] = useState<string | null>(null)
  const [pin, setPin] = useState('')

  // UI status
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lockRemaining, setLockRemaining] = useState<number>(0)

  // Initial PINs modal (shown after initial setup or when generated)
  const [initialPinsModal, setInitialPinsModal] = useState<WaitstaffPinRecord[] | null>(null)
  const [copiedPins, setCopiedPins] = useState(false)

  const usernameInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  const [waitersList, setWaitersList] = useState<User[]>(() =>
    getAllUsers().filter((u) => !u.isDeleted && u.status === 'active' && u.role === 'waiter'),
  )

  // Initialize and migrate auth system on mount
  useEffect(() => {
    initializeAuthSystem()
      .then((res) => {
        const currentWaiters = getAllUsers().filter(
          (u) => !u.isDeleted && u.status === 'active' && u.role === 'waiter',
        )
        setWaitersList(currentWaiters)
        const hasAdm = hasAnyAdmin()
        setIsInitialSetup(!hasAdm)
        if (res.initialPins && res.initialPins.length > 0) {
          setInitialPinsModal(res.initialPins)
        }
      })
      .catch(console.error)
  }, [])

  // Check rate limit status for current context (admin or selected waiter)
  useEffect(() => {
    const checkLock = () => {
      const targetUser = roleTab === 'waiter' && selectedWaiterId ? selectedWaiterId : undefined
      const state = getLoginAttemptState(targetUser)
      const now = Date.now()
      if (state.lockedUntil && state.lockedUntil > now) {
        setLockRemaining(Math.ceil((state.lockedUntil - now) / 1000))
      } else {
        setLockRemaining(0)
      }
    }

    checkLock()
    const timer = setInterval(checkLock, 1000)
    return () => clearInterval(timer)
  }, [roleTab, selectedWaiterId])

  // Focus input when tab changes
  useEffect(() => {
    setErrorMessage(null)
    setPin('')
    if (roleTab === 'admin') {
      setTimeout(() => usernameInputRef.current?.focus(), 50)
    }
  }, [roleTab])

  // Password strength for initial setup
  const setupStrength = checkPasswordStrength(setupPassword)

  // Initial Admin Setup Handler
  const handleInitialSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setErrorMessage(null)

    if (setupPassword !== setupConfirmPassword) {
      setErrorMessage('Girdiğiniz şifreler birbiriyle eşleşmiyor.')
      return
    }

    const val = validateStrongPassword(setupPassword, storeName)
    if (!val.valid) {
      setErrorMessage(val.error || 'Şifre kriterleri karşılanmıyor.')
      return
    }

    setLoading(true)
    try {
      const res = await createInitialAdmin({
        fullName: setupFullName,
        username: setupUsername,
        password: setupPassword,
      })

      if (res.success && res.user) {
        setIsInitialSetup(false)
        setWaitersList(
          getAllUsers().filter((u) => !u.isDeleted && u.status === 'active' && u.role === 'waiter'),
        )
        if (res.initialPins && res.initialPins.length > 0) {
          setInitialPinsModal(res.initialPins)
        }
      } else {
        setErrorMessage(res.error || 'Yönetici hesabı oluşturulamadı.')
      }
    } catch {
      setErrorMessage('Kurulum sırasında beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Admin Password Login
  const handlePasswordLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (lockRemaining > 0 || loading) return

    setErrorMessage(null)
    setLoading(true)

    try {
      const result: LoginResult = await loginWithPassword(username, password, 'admin')
      if (result.success && result.session && result.user) {
        onLoginSuccess(result.session, result.user, result.mustChangePassword)
      } else {
        setErrorMessage(result.error || 'Kullanıcı adı veya şifre hatalı.')
        if (result.lockRemainingSeconds) {
          setLockRemaining(result.lockRemainingSeconds)
        }
      }
    } catch {
      setErrorMessage('Giriş yapılırken beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Waiter PIN Login
  const handlePinLogin = useCallback(
    async (inputPin: string) => {
      if (!selectedWaiterId || lockRemaining > 0 || loading) return

      setErrorMessage(null)
      setLoading(true)

      try {
        const result: LoginResult = await loginWithPin(inputPin, selectedWaiterId)
        if (result.success && result.session && result.user) {
          onLoginSuccess(result.session, result.user, result.mustChangePassword)
        } else {
          setErrorMessage(result.error || 'Geçersiz PIN kodu.')
          setPin('')
          if (result.lockRemainingSeconds) {
            setLockRemaining(result.lockRemainingSeconds)
          }
        }
      } catch {
        setErrorMessage('PIN doğrulanırken bir hata oluştu.')
        setPin('')
      } finally {
        setLoading(false)
      }
    },
    [lockRemaining, loading, selectedWaiterId, onLoginSuccess],
  )

  const handlePinDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 6 || lockRemaining > 0 || loading || !selectedWaiterId) return
      const newPin = pin + digit
      setPin(newPin)
      if (newPin.length >= 4) {
        if (newPin.length === 4) {
          handlePinLogin(newPin)
        }
      }
    },
    [pin, lockRemaining, loading, selectedWaiterId, handlePinLogin],
  )

  const handlePinBackspace = useCallback(() => {
    if (pin.length > 0) {
      setPin((prev) => prev.slice(0, -1))
      setErrorMessage(null)
    }
  }, [pin.length])

  const handlePinClear = useCallback(() => {
    setPin('')
    setErrorMessage(null)
  }, [])

  // Keyboard navigation for PIN
  useEffect(() => {
    if (roleTab !== 'waiter' || !selectedWaiterId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        handlePinDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handlePinBackspace()
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault()
        handlePinClear()
      } else if (e.key === 'Enter' && pin.length >= 4) {
        e.preventDefault()
        handlePinLogin(pin)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [roleTab, selectedWaiterId, pin, handlePinDigit, handlePinBackspace, handlePinClear, handlePinLogin])

  const selectedWaiter = waitersList.find((w) => w.id === selectedWaiterId)

  // Copy initial PINs to clipboard
  const handleCopyInitialPins = () => {
    if (!initialPinsModal) return
    const text = initialPinsModal
      .map((p) => `${p.fullName} (@${p.username}): PIN ${p.pin}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopiedPins(true)
    setTimeout(() => setCopiedPins(false), 3000)
  }

  const handleDismissInitialPins = () => {
    clearInitialWaitstaffPins()
    setInitialPinsModal(null)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-[#f8f5f0] via-[#f3ede3] to-[#e8decb] dark:from-stone-950 dark:via-stone-900 dark:to-stone-950 text-stone-800 dark:text-stone-100 transition-colors">
      <div className="w-full max-w-md bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-3xl shadow-2xl border border-[#e6dbc9] dark:border-stone-800 p-7 sm:p-8 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2 select-none" onClick={handleSecretBrandTap}>
          <div className="inline-flex p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/40 shadow-sm">
            <AppLogo className="w-14 h-14 object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#3b291f] dark:text-stone-100">
              {storeName}
            </h1>
            <p className="text-xs font-semibold text-[#8a6d57] dark:text-amber-400/90 mt-0.5 flex items-center justify-center gap-1.5">
              <Coffee size={13} /> {storeSub}
            </p>
          </div>
        </div>

        {/* ─── İLK KURULUM EKRANI (Sistemde Yönetici Yoksa Açılır) ─── */}
        {isInitialSetup ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <Sparkles size={18} className="shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
              <div>
                <div className="font-black text-sm">İlk Sistem Kurulumu</div>
                <div className="mt-0.5 text-[11px] leading-relaxed">
                  Hoş geldiniz! Sisteme giriş yapabilmek için lütfen ilk yönetici hesabınızı ve güçlü şifrenizi belirleyin.
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2 text-xs font-semibold">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleInitialSetupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Yönetici Ad Soyad *
                </label>
                <input
                  type="text"
                  required
                  value={setupFullName}
                  onChange={(e) => setSetupFullName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Kullanıcı Adı *
                </label>
                <input
                  type="text"
                  required
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  placeholder="Kullanıcı Adı"
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Güçlü Yönetici Şifresi *
                </label>
                <div className="relative">
                  <input
                    type={setupShowPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="En az 10 karakter (harf + rakam)"
                    className="w-full px-3.5 pr-10 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setSetupShowPassword(!setupShowPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600"
                  >
                    {setupShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {setupPassword.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-stone-500 dark:text-stone-400">Şifre Gücü:</span>
                      <span className={setupStrength.color.split(' ')[0]}>{setupStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex gap-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-full flex-1 rounded-full transition-all ${
                            step <= setupStrength.score ? setupStrength.color.split(' ')[1] : 'bg-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Şifre (Tekrar) *
                </label>
                <input
                  type={setupShowPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  placeholder="Şifreyi tekrar yazın"
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !setupFullName || !setupUsername || setupPassword.length < 10 || setupPassword !== setupConfirmPassword}
                className="w-full py-3 px-4 rounded-xl text-xs font-extrabold text-white bg-amber-800 hover:bg-amber-900 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <span>Yöneticiyi Oluştur ve Başlat</span>}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Role Selection Tabs */}
            <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setRoleTab('waiter')
                  setErrorMessage(null)
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  roleTab === 'waiter'
                    ? 'bg-white dark:bg-stone-700 text-[#3b291f] dark:text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <UserIcon size={15} />
                Garson Girişi
              </button>

              <button
                type="button"
                onClick={() => {
                  setRoleTab('admin')
                  setErrorMessage(null)
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  roleTab === 'admin'
                    ? 'bg-amber-800 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <ShieldCheck size={15} />
                Yönetici Girişi
              </button>
            </div>

            {/* Lockout Warning */}
            {lockRemaining > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 flex items-start gap-2.5 text-xs animate-shake">
                <AlertCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div>
                  <div className="font-bold">Giriş Denemeleri Kilitlendi</div>
                  <div className="text-[11px] mt-0.5">
                    Art arda 5 hatalı deneme yapıldığı için sistem geçici olarak kilitlendi.{' '}
                    <strong className="underline">{lockRemaining} saniye</strong> sonra tekrar deneyebilirsiniz.
                  </div>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {errorMessage && lockRemaining === 0 && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2.5 text-xs">
                <AlertCircle size={16} className="shrink-0" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
            )}

            {/* ─── YÖNETİCİ GİRİŞİ (Kullanıcı Adı + Maskelenmiş Şifre) ─── */}
            {roleTab === 'admin' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    Kullanıcı Adı
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                      <UserIcon size={16} />
                    </span>
                    <input
                      ref={usernameInputRef}
                      type="text"
                      name="lemoon_adm_user"
                      autoComplete="off"
                      required
                      disabled={lockRemaining > 0 || loading}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Kullanıcı Adı"
                      className="w-full pl-10 pr-4 py-2.5 text-sm font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 dark:focus:ring-amber-500 shadow-sm disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      Şifre
                    </label>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                      <Lock size={16} />
                    </span>
                    {/* Chrome'un 'Şifrenizi değiştirin / veri ihlali' uyarısını ve agresif şifre kaydetme popup'ını engellemek amacıyla bilinçli olarak type="text" ve CSS -webkit-text-security: disc ile maskeleme tercih edilmiştir. */}
                    <input
                      ref={passwordInputRef}
                      type="text"
                      name="lemoon_adm_secret"
                      autoComplete="off"
                      required
                      disabled={lockRemaining > 0 || loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-11 py-2.5 text-sm font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 dark:focus:ring-amber-500 shadow-sm disabled:opacity-60 ${
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

                <button
                  type="submit"
                  disabled={lockRemaining > 0 || loading || !username || !password}
                  className="w-full py-3 px-4 rounded-xl text-sm font-extrabold text-white bg-amber-800 hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Doğrulanıyor...</span>
                    </>
                  ) : (
                    <span>Yönetici Girişi Yap</span>
                  )}
                </button>
              </form>
            )}

            {/* ─── GARSON GİRİŞİ: İSİM KARTLARI + PIN TUŞ TAKIMI (Kişiye Özel Akış) ─── */}
            {roleTab === 'waiter' && (
              <div className="space-y-4">
                {/* Personel İsim Kartları Grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-stone-600 dark:text-stone-400 uppercase tracking-wider">
                      Personel Seçin
                    </span>
                    {selectedWaiterId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWaiterId(null)
                          setPin('')
                          setErrorMessage(null)
                        }}
                        className="text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline"
                      >
                        Değiştir
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {waitersList.map((waiter) => {
                      const isSelected = selectedWaiterId === waiter.id
                      const waiterLock = getLoginAttemptState(waiter.id)
                      const isWaiterLocked = Boolean(waiterLock.lockedUntil && waiterLock.lockedUntil > Date.now())

                      return (
                        <button
                          key={waiter.id}
                          type="button"
                          onClick={() => {
                            setSelectedWaiterId(waiter.id)
                            setPin('')
                            setErrorMessage(null)
                          }}
                          className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 ring-2 ring-amber-700/50 shadow-sm'
                              : isWaiterLocked
                                ? 'border-rose-300 bg-rose-50/70 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900 opacity-70'
                                : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl grid place-items-center font-black text-xs shrink-0 ${
                              isSelected
                                ? 'bg-amber-800 text-white'
                                : isWaiterLocked
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'
                            }`}
                          >
                            {waiter.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs truncate">{waiter.fullName}</div>
                            <div className="text-[10px] text-stone-400 dark:text-stone-500 font-medium truncate">
                              {isWaiterLocked ? 'Kilitli (Bekleyin)' : 'Garson'}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* PIN Giriş Bölümü */}
                {selectedWaiterId ? (
                  <div className="pt-1 space-y-3">
                    <div className="py-1 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-2">
                        {selectedWaiter?.fullName} için PIN Kodunu Girin
                      </span>
                      <div className="flex items-center gap-3 h-9">
                        {[0, 1, 2, 3].map((index) => {
                          const hasDigit = index < pin.length
                          return (
                            <div
                              key={index}
                              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                                hasDigit
                                  ? 'bg-amber-800 dark:bg-amber-500 scale-110 shadow-sm ring-2 ring-amber-400/40'
                                  : 'bg-stone-200 dark:bg-stone-700'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Numeric Keypad (4x3 Grid) */}
                    <div className="grid grid-cols-3 gap-2 max-w-[270px] mx-auto">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          disabled={lockRemaining > 0 || loading || pin.length >= 6}
                          onClick={() => handlePinDigit(digit)}
                          className="h-13 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-lg font-black text-stone-900 dark:text-stone-100 shadow-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 cursor-pointer"
                        >
                          {digit}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={lockRemaining > 0 || loading || pin.length === 0}
                        onClick={handlePinClear}
                        className="h-13 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-bold text-stone-500 dark:text-stone-400 shadow-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        Temizle
                      </button>

                      <button
                        type="button"
                        disabled={lockRemaining > 0 || loading || pin.length >= 6}
                        onClick={() => handlePinDigit('0')}
                        className="h-13 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-lg font-black text-stone-900 dark:text-stone-100 shadow-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 cursor-pointer"
                      >
                        0
                      </button>

                      <button
                        type="button"
                        disabled={lockRemaining > 0 || loading || pin.length === 0}
                        onClick={handlePinBackspace}
                        className="h-13 rounded-2xl bg-stone-100 hover:bg-rose-100 dark:bg-stone-800 dark:hover:bg-rose-950/60 text-stone-600 hover:text-rose-700 dark:text-stone-300 dark:hover:text-rose-400 shadow-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        <Delete size={20} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs font-semibold text-stone-400 dark:text-stone-500 bg-stone-50/50 dark:bg-stone-850/50 rounded-2xl border border-dashed border-stone-200 dark:border-stone-800">
                    Giriş yapmak için yukarıdaki listeden kendi kartınıza dokunun.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer info (Varsayılan şifre kutusu tamamen kaldırıldı, yalnızca sistem versiyonu korundu) */}
        <div className="pt-2 text-center text-[11px] text-stone-400 dark:text-stone-500">
          LEMOON POS v1.4 · Güvenli Oturum Sistemi
        </div>
      </div>

      {/* ─── BAŞLANGIÇ GİRİŞ BİLGİLERİ MODALI (Yalnızca Yönetici Görür) ─── */}
      {initialPinsModal && initialPinsModal.length > 0 && (
        <div
          className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 grid place-items-center shrink-0">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">
                  Başlangıç Garson PIN Kodları
                </h3>
                <p className="text-[11px] text-stone-500">
                  Personelleriniz için üretilen benzersiz PIN kodları.
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-900 dark:text-amber-200">
              Güvenliğiniz için PIN kodları sistemde hash&apos;lenerek saklanır. Bu pencereyi kapattıktan sonra PIN&apos;ler tekrar açık metin olarak görüntülenemez, yalnızca sıfırlanabilir. Lütfen bu bilgileri not alınız veya personellerinize iletiniz.
            </div>

            <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden text-xs">
              {initialPinsModal.map((w) => (
                <div key={w.userId} className="p-3 flex items-center justify-between bg-stone-50 dark:bg-stone-850">
                  <div>
                    <span className="font-extrabold text-stone-900 dark:text-stone-100">{w.fullName}</span>
                    <span className="text-[11px] text-stone-400 ml-1.5 font-mono">(@{w.username})</span>
                  </div>
                  <div className="px-3 py-1 bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-800 rounded-lg font-mono font-black text-sm text-amber-800 dark:text-amber-300 tracking-widest">
                    {w.pin}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyInitialPins}
                className="outline-action flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
              >
                {copiedPins ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedPins ? 'Kopyalandı!' : 'Tümünü Kopyala'}</span>
              </button>

              <button
                type="button"
                onClick={handleDismissInitialPins}
                className="solid-action flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold py-2.5 text-xs"
              >
                Kaydettim / Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
