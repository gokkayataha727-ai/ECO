import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { AdisyonModal } from './components/AdisyonModal'
import { ReportsModal } from './components/ReportsModal'
import { KeyboardHelpModal } from './components/KeyboardHelpModal'
import { PaymentModal } from './components/PaymentModal'
import { ProductExplorer } from './components/ProductExplorer'
import { TopBar } from './components/TopBar'
import { LogoSettingsModal } from './components/LogoSettingsModal'
import { SettingsModal } from './components/SettingsModal'
import { SplashScreen } from './components/SplashScreen'
import {
  calculateTotals,
  formatCurrency,
  getEffectivePrice,
  isTableOccupied,
  mergeTablesOrder,
  moveTableOrder,
  roundCurrency,
  splitTableOrder,
  type SplitItemSelection,
} from './lib/format'
import { getProducts, saveProduct as apiSaveProduct, deleteProductApi, updateCustomerDisplay, isElectronEnvironment } from './lib/api'
import type {
  CartItem,
  PaymentMethod,
  PartialPayment,
  Product,
  Table,
  CompletedOrder,
  SelectedOption,
  AppSettings,
  BusinessDay,
  Refund,
} from './types'
import { ProductManager } from './components/ProductManager'
import { ProductOptionModal } from './components/ProductOptionModal'
import { ProductDetailModal } from './components/ProductDetailModal'
import { TableManager } from './components/TableManager'
import { TableLayout } from './components/TableLayout'
import { HomePage } from './components/HomePage'
import { TableOrderView } from './components/TableOrderView'
import { OpenDayModal, type OpenDayParams } from './components/OpenDayModal'
import { CloseDayModal } from './components/CloseDayModal'
import { saveStoredRefund } from './lib/businessDay'
import {
  logActivity,
  migrateActivityLogsUsers,
  backfillCartItemsTime,
  cleanupSpuriousDiscountLogs,
  verifyChainAndReport,
} from './lib/activityLog'
import {
  recordSystemLog,
} from './lib/systemHealth'
import { ActivityLogsView } from './components/ActivityLogsView'
import { RefundModal } from './components/RefundModal'
import { ReopenOrderModal } from './components/ReopenOrderModal'
import { PermissionDeniedModal } from './components/PermissionDeniedModal'
import { LoginScreen } from './components/LoginScreen'
import { ForceChangePasswordModal } from './components/ForceChangePasswordModal'
import { AdminExitModal } from './components/AdminExitModal'
import { getActiveSession, touchSession, logoutUser, getAllUsers } from './lib/auth'
import { can, logUnauthorizedAttempt } from './lib/permissions'
import { generateUUID } from './lib/uuid'
import {
  getTablesSafe,
  saveTablesSafe,
  getCompletedOrdersSafe,
  saveCompletedOrdersSafe,
  getBusinessDaysSafe,
  saveBusinessDaysSafe,
  getMenuProductsSafe,
  saveMenuProductsSafe,
  getSettingsSafe,
  saveSettingsSafe,
  createFullBackupFile,
  triggerAutomatedBackup,
  listDiskBackups,
  readDiskBackupForRestore,
  restoreFromBackup,
  getPreRestoreBackup,
  isSqliteActive,
  getSqliteDatabaseStatus,
  migrateLocalStorageToSqliteIfNeeded,
} from './lib/storage'
import { Sun, X, Clock, AlertTriangle } from 'lucide-react'
import type { Session, User, UserRole } from './types'

const ORDER_NUMBER = 'EC-1042'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [view, setView] = useState<'home' | 'tables' | 'pos' | 'logs'>('home')

  // Authentication & Session State
  const [session, setSession] = useState<Session | null>(() => getActiveSession())
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const s = getActiveSession()
    if (!s) return null
    return getAllUsers().find((u) => u.id === s.userId) || null
  })
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => {
    const s = getActiveSession()
    if (!s) return false
    const u = getAllUsers().find((user) => user.id === s.userId)
    return Boolean(u?.mustChangePassword)
  })
  const [timeoutWarningSeconds, setTimeoutWarningSeconds] = useState<number | null>(null)
  const [backupWarning, setBackupWarning] = useState<string | null>(null)
  const [criticalStorageError, setCriticalStorageError] = useState<{
    message: string
    suggestedBackup?: { fileName: string; filePath?: string; createdAt?: string } | null
  } | null>(null)
  const [recoveringFromBackup, setRecoveringFromBackup] = useState(false)
  const [crashRecoveryBanner, setCrashRecoveryBanner] = useState<string | null>(null)

  const [settings, setSettings] = useState<AppSettings>(() => getSettingsSafe())

  useEffect(() => {
    saveSettingsSafe(settings)
    document.documentElement.classList.remove('dark', 'warm')
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (settings.theme === 'warm') {
      document.documentElement.classList.add('warm')
    }
  }, [settings])

  // Synchronize auth state across components/events
  useEffect(() => {
    const handleSessionChanged = (e: any) => {
      const sess = e.detail as Session | null
      setSession(sess)
      if (sess) {
        const u = getAllUsers().find((user) => user.id === sess.userId) || null
        setCurrentUser(u)
      } else {
        setCurrentUser(null)
      }
    }
    window.addEventListener('auth-session-changed', handleSessionChanged)
    return () => window.removeEventListener('auth-session-changed', handleSessionChanged)
  }, [])

  // React immediately to permission updates without relogin
  const [, setPermissionVersion] = useState(0)
  useEffect(() => {
    const handlePermissionsUpdated = () => {
      setPermissionVersion((v) => v + 1)
    }
    window.addEventListener('permissions-updated', handlePermissionsUpdated)
    return () => window.removeEventListener('permissions-updated', handlePermissionsUpdated)
  }, [])

  // İŞ 1 & İŞ 3: Sayfa ilk açıldığında eski loglardaki eksik kullanıcı ID eşlemesini yap ve sepetlerdeki eksik zamanları tamamla
  useEffect(() => {
    try {
      const allUsers = getAllUsers()
      if (allUsers.length > 0) {
        migrateActivityLogsUsers(allUsers)
      }
      setTables((prev) => {
        const { updatedTables, changed } = backfillCartItemsTime(prev)
        return changed ? updatedTables : prev
      })
      cleanupSpuriousDiscountLogs()
      verifyChainAndReport({ logIfBroken: true })
    } catch (e) {
      console.error('Initialization migration error', e)
    }
  }, [])

  useEffect(() => {
    const handleWindowError = (ev: ErrorEvent) => {
      recordSystemLog('error', 'WINDOW_ERROR', ev.message || 'Unhandled window error')
    }
    const handleRejection = (ev: PromiseRejectionEvent) => {
      recordSystemLog('error', 'UNHANDLED_REJECTION', String(ev.reason || 'Promise rejection'))
    }
    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleRejection)

    // Check Electron startup crash recovery status (Adım 5.1)
    const api = (window as any).electronAPI
    if (api && typeof api.getStartupRecoveryStatus === 'function') {
      api
        .getStartupRecoveryStatus()
        .then((res: any) => {
          if (res && res.success && res.data && res.data.recovered) {
            const msg =
              res.data.message || 'Uygulama beklenmedik şekilde kapandı, veriler kontrol edildi'
            setCrashRecoveryBanner(msg)
            logActivity({
              type: 'crash_recovery',
              userName: 'Sistem',
              userRole: 'Sistem',
              details: msg,
            })
          }
        })
        .catch(() => {})
    }

    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  // Otomatik Yedekleme Zamanlayıcıları: Açılış, Saat Başları, Kapanış ve İkinci Klasör Uyarıları
  useEffect(() => {
    const handleBackupWarning = (e: Event) => {
      const customEvent = e as CustomEvent<{ warning?: string }>
      if (customEvent.detail?.warning) {
        setBackupWarning(customEvent.detail.warning)
      }
    }
    const handleStorageError = (e: Event) => {
      const customEvent = e as CustomEvent<{
        message?: string
        suggestedBackup?: { fileName: string; filePath?: string; createdAt?: string } | null
      }>
      if (customEvent.detail?.message) {
        setCriticalStorageError({
          message: customEvent.detail.message,
          suggestedBackup: customEvent.detail.suggestedBackup || null,
        })
      }
    }
    window.addEventListener('pos-backup-warning', handleBackupWarning)
    window.addEventListener('pos-storage-error', handleStorageError)

    // SQLite bütünlük kontrolü ve ilk açılış migrasyonu
    if (isSqliteActive()) {
      const dbStatus = getSqliteDatabaseStatus()
      if (dbStatus?.corruptReplaced) {
        setCriticalStorageError({
          message:
            dbStatus.integrityMessage ||
            'Veritabanı dosyasında bozulma tespit edildi ve karantinaya alındı. Son geçerli otomatik yedekten verilerinizi geri yükleyebilirsiniz.',
          suggestedBackup: dbStatus.suggestedBackup || null,
        })
      }
      migrateLocalStorageToSqliteIfNeeded()
        .then((res) => {
          if (res.success && !res.alreadyMigrated && !res.skipped) {
            setTables(getTablesSafe())
            setCompletedOrders(getCompletedOrdersSafe())
            setBusinessDays(getBusinessDaysSafe())
            setMenuProducts(getMenuProductsSafe())
            setSettings(getSettingsSafe())
          } else if (!res.success && res.error) {
            setCriticalStorageError({
              message: res.error,
              suggestedBackup: dbStatus?.suggestedBackup || null,
            })
          }
        })
        .catch(() => {})
    }

    // 1. Uygulama açılış yedeği
    triggerAutomatedBackup('acilis')
      .then((res) => {
        if (res.success) {
          const ts = new Date().toISOString()
          try {
            localStorage.setItem('pos_last_backup_at', ts)
          } catch {}
        }
      })
      .catch(() => {})

    // 2. Her saat başı "saatlik" yedek (ilk saat başına hizalanır, ardından her 60 dakikada bir çalışır)
    let hourlyInterval: ReturnType<typeof setInterval> | null = null
    const now = new Date()
    const msUntilNextHour =
      (60 - now.getMinutes()) * 60 * 1000 -
      now.getSeconds() * 1000 -
      now.getMilliseconds()

    const alignTimeout = setTimeout(() => {
      triggerAutomatedBackup('saatlik').catch(() => {})
      hourlyInterval = setInterval(() => {
        triggerAutomatedBackup('saatlik').catch(() => {})
      }, 60 * 60 * 1000)
    }, Math.max(1000, msUntilNextHour))

    // 3. Uygulama kapanırken yedek (Electron main close sinyali ve beforeunload)
    let shutdownBackupTriggered = false
    const runShutdownBackup = () => {
      if (shutdownBackupTriggered) return
      shutdownBackupTriggered = true
      triggerAutomatedBackup('kapanis').catch(() => {})
    }

    window.addEventListener('beforeunload', runShutdownBackup)
    const cleanupElectronBeforeQuit =
      typeof window !== 'undefined' &&
      typeof (window as any).electronAPI?.onBeforeQuit === 'function'
        ? (window as any).electronAPI.onBeforeQuit(runShutdownBackup)
        : null

    return () => {
      window.removeEventListener('pos-backup-warning', handleBackupWarning)
      window.removeEventListener('pos-storage-error', handleStorageError)
      window.removeEventListener('beforeunload', runShutdownBackup)
      if (cleanupElectronBeforeQuit) cleanupElectronBeforeQuit()
      clearTimeout(alignTimeout)
      if (hourlyInterval) clearInterval(hourlyInterval)
    }
  }, [])

  // Inactivity / Idle timeout tracker with 60-second warning countdown & single active session
  useEffect(() => {
    if (!session) {
      setTimeoutWarningSeconds(null)
      return
    }

    let lastTouched = 0
    const handleUserActivity = () => {
      const now = Date.now()
      if (now - lastTouched > 2000) {
        touchSession()
        lastTouched = now
      }
      setTimeoutWarningSeconds(null)
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll']
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }))

    // Single active session storage sync across tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userActiveSession_' + session.userId) {
        if (e.newValue && e.newValue !== session.id) {
          setSession(null)
          setCurrentUser(null)
          setTimeoutWarningSeconds(null)
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)

    const timeoutMinutes = session.role === 'waiter'
      ? (settings.waiterSessionTimeoutMinutes ?? 5)
      : (settings.adminSessionTimeoutMinutes ?? settings.sessionTimeoutMinutes ?? 30)

    if (timeoutMinutes <= 0) {
      setTimeoutWarningSeconds(null)
      return () => {
        events.forEach((ev) => window.removeEventListener(ev, handleUserActivity))
        window.removeEventListener('storage', handleStorageChange)
      }
    }

    const interval = setInterval(() => {
      // 1. Check single active session in same storage
      const currentActiveSessionId = localStorage.getItem('userActiveSession_' + session.userId)
      if (currentActiveSessionId && currentActiveSessionId !== session.id) {
        setSession(null)
        setCurrentUser(null)
        setTimeoutWarningSeconds(null)
        return
      }

      // 2. Check inactivity elapsed time
      const rawSession = localStorage.getItem('appSession')
      if (!rawSession) {
        setSession(null)
        setCurrentUser(null)
        setTimeoutWarningSeconds(null)
        return
      }

      try {
        const sess: Session = JSON.parse(rawSession)
        const lastActivity = new Date(sess.lastActivityAt || sess.createdAt).getTime()
        const timeoutMs = timeoutMinutes * 60 * 1000
        const elapsed = Date.now() - lastActivity
        const remainingMs = timeoutMs - elapsed
        const remainingSec = Math.ceil(remainingMs / 1000)

        if (remainingSec <= 0) {
          logoutUser('timeout')
          setSession(null)
          setCurrentUser(null)
          setTimeoutWarningSeconds(null)
        } else if (remainingSec <= 60) {
          setTimeoutWarningSeconds(remainingSec)
        } else {
          setTimeoutWarningSeconds(null)
        }
      } catch {
        setSession(null)
        setCurrentUser(null)
        setTimeoutWarningSeconds(null)
      }
    }, 1000)

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity))
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [session, settings.waiterSessionTimeoutMinutes, settings.adminSessionTimeoutMinutes, settings.sessionTimeoutMinutes])

  const handleLogout = useCallback(() => {
    logoutUser()
    setSession(null)
    setCurrentUser(null)
    setMustChangePassword(false)
  }, [])

  // User identity derivations
  const currentRole: UserRole = session?.role || (settings.currentUserRole === 'cashier' ? 'waiter' : settings.currentUserRole || 'admin')
  const activeUserName = session?.fullName || settings.cashierName || 'LEMOON'
  const activeUserRole = currentRole === 'admin' ? 'Yönetici' : 'Garson'
  const activeUserId = session?.userId

  // Enforce permission-based view restrictions: cannot stay on activity logs if not permitted
  useEffect(() => {
    if (view === 'logs' && !can(session || currentUser, 'view_logs', settings)) {
      setView('tables')
    }
  }, [view, session, currentUser, settings])

  const [tables, setTables] = useState<Table[]>(() => getTablesSafe())
  
  useEffect(() => {
    saveTablesSafe(tables)
  }, [tables])

  const [activeTableId, setActiveTableId] = useState<string | null>(null)

  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>(() => getCompletedOrdersSafe())

  useEffect(() => {
    saveCompletedOrdersSafe(completedOrders)
  }, [completedOrders])

  const [businessDays, setBusinessDays] = useState<BusinessDay[]>(() => getBusinessDaysSafe())

  useEffect(() => {
    saveBusinessDaysSafe(businessDays)
  }, [businessDays])

  const openBusinessDay = useMemo(
    () => businessDays.find((d) => d.status === 'open') || null,
    [businessDays],
  )
  
  const [directCart, setDirectCart] = useState<CartItem[]>([])
  const [directDiscountRate, setDirectDiscountRate] = useState(0)
  const [directDiscountAmount, setDirectDiscountAmount] = useState(0)
  const [directNote, setDirectNote] = useState('')
  const [directPayments, setDirectPayments] = useState<PartialPayment[]>([])

  // Batch / Tur tracking per table or direct cart
  const [tableBatches, setTableBatches] = useState<
    Record<string, { currentBatchId: string; currentBatchNumber: number }>
  >({})

  // Kasa search state (read-only catalog)
  const [kasaSearch, setKasaSearch] = useState('')
  const [kasaCategory, setKasaCategory] = useState('Tümü')
  const kasaSearchRef = useRef<HTMLInputElement>(null)

  const [menuProducts, setMenuProducts] = useState<Product[]>(() => getMenuProductsSafe())

  useEffect(() => {
    saveMenuProductsSafe(menuProducts)
  }, [menuProducts])

  useEffect(() => {
    getProducts()
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMenuProducts(data)
        }
      })
      .catch(err => console.error("Error fetching products:", err))
  }, [])

  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isProductsOpen, setIsProductsOpen] = useState(false)
  const [isAdisyonOpen, setIsAdisyonOpen] = useState(false)
  const [isTableManagerOpen, setIsTableManagerOpen] = useState(false)
  const [isLogoSettingsOpen, setIsLogoSettingsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isOpenDayModalOpen, setIsOpenDayModalOpen] = useState(false)
  const [isCloseDayModalOpen, setIsCloseDayModalOpen] = useState(false)
  const [dayBlockedPromptOpen, setDayBlockedPromptOpen] = useState(false)
  const [reportSelectedDayId, setReportSelectedDayId] = useState<string | null>(null)
  const [optionModalProduct, setOptionModalProduct] = useState<Product | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [paidMethod, setPaidMethod] = useState<PaymentMethod | null>(null)

  // Refund state
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundItemTarget, setRefundItemTarget] = useState<CartItem | null>(null)
  const [refundTableTarget, setRefundTableTarget] = useState<Table | null>(null)

  // Reopen Order state
  const [reopenModalOrder, setReopenModalOrder] = useState<CompletedOrder | null>(null)

  // Permission denied state
  const [permissionDeniedModalOpen, setPermissionDeniedModalOpen] = useState(false)
  const [deniedActionName, setDeniedActionName] = useState('')
  const [isAdminExitOpen, setIsAdminExitOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  const { previousDayCarryOut, hasPreviousClosedDay, previousDayNeverClosed } = useMemo(() => {
    if (businessDays.length === 0) {
      return { previousDayCarryOut: 0, hasPreviousClosedDay: false, previousDayNeverClosed: false }
    }
    const sorted = [...businessDays].sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    const lastDay = sorted[0]
    if (lastDay.status === 'closed') {
      return {
        previousDayCarryOut: 0,
        hasPreviousClosedDay: true,
        previousDayNeverClosed: false,
      }
    } else {
      return {
        previousDayCarryOut: 0,
        hasPreviousClosedDay: false,
        previousDayNeverClosed: true,
      }
    }
  }, [businessDays])

  const handleOpenDay = useCallback(
    (params: OpenDayParams) => {
      if (!can(session || currentUser, 'day_open', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'day_open', 'İş günü açma engellendi')
        setDeniedActionName('İş Günü Açma')
        setPermissionDeniedModalOpen(true)
        return
      }
      const nowIso = new Date().toISOString()
      const cashierName = activeUserName
      const userRole = activeUserRole

      setBusinessDays((prev) => {
        if (prev.some((d) => d.status === 'open')) return prev
        const newDay: BusinessDay = {
          id: generateUUID(),
          status: 'open',
          openedAt: nowIso,
          openedBy: cashierName,
          openingCash: params.openingCash,
          note: params.note,
        }

        logActivity({
          businessDayId: newDay.id,
          type: 'day_open',
          amount: params.openingCash,
          reason: params.note,
          userName: cashierName,
          userRole,
          userId: activeUserId,
          details: `İş günü açıldı. Açılış Nakit: ${formatCurrency(params.openingCash)}`,
        })

        return [newDay, ...prev]
      })
      setDayBlockedPromptOpen(false)
    },
    [activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const handleCloseDay = useCallback(
    (closedDay: BusinessDay) => {
      if (!can(session || currentUser, 'day_close', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'day_close', 'İş günü kapatma engellendi')
        setDeniedActionName('İş Günü Kapatma')
        setPermissionDeniedModalOpen(true)
        return
      }
      const cashierName = activeUserName
      const userRole = activeUserRole

      setBusinessDays((prev) => {
        const updated = prev.map((d) => (d.id === closedDay.id && d.status === 'open' ? closedDay : d))
        saveBusinessDaysSafe(updated)
        return updated
      })

      logActivity({
        businessDayId: closedDay.id,
        type: 'day_close',
        amount: closedDay.closingCash,
        reason: closedDay.note,
        userName: cashierName,
        userRole,
        userId: activeUserId,
        details: `İş günü kapatıldı. Kapanış Nakit: ${formatCurrency(closedDay.closingCash || 0)}, POS Z: ${formatCurrency(closedDay.enteredZ || 0)}`,
      })

      // Gün sonu kapatılırken otomatik "günlük" yedek al
      triggerAutomatedBackup('gunluk').catch(() => {})
    },
    [activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const handleEditProduct = useCallback((product: Product) => {
    if (!can(session || currentUser, 'product_manage', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'product_manage', 'Ürün düzenleme engellendi')
      setDeniedActionName('Ürün Düzenleme')
      setPermissionDeniedModalOpen(true)
      return
    }
    setEditProductId(product.id)
    setIsProductsOpen(true)
  }, [session, currentUser, settings])

  const handleViewDetail = useCallback((product: Product) => {
    setDetailProduct(product)
  }, [])

  const handleDeleteProduct = useCallback((id: string) => {
    if (!can(session || currentUser, 'product_delete', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'product_delete', 'Ürün silme engellendi')
      setDeniedActionName('Ürün Silme')
      setPermissionDeniedModalOpen(true)
      return
    }
    const deletedProd = menuProducts.find((item) => item.id === id)
    if (deletedProd) {
      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'product_delete',
        productName: deletedProd.name,
        amount: deletedProd.price,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: `${deletedProd.name} (${deletedProd.category}) menüden silindi`,
      })
    }
    setMenuProducts((current) => current.filter((item) => item.id !== id))
    setTables((current) => current.map(t => ({ ...t, cart: t.cart.filter(item => item.id !== id) })))
    setDirectCart((current) => current.filter((item) => item.id !== id))
    deleteProductApi(id)
      .catch(err => console.warn("Backend delete skipped or failed:", err))
  }, [session, currentUser, settings, menuProducts, openBusinessDay, activeUserName, activeUserRole, activeUserId])

  const handleOpenProductsTrigger = useCallback(() => {
    if (!can(session || currentUser, 'product_manage', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'product_manage', 'Ürün yönetimi engellendi')
      setDeniedActionName('Ürün Yönetimi')
      setPermissionDeniedModalOpen(true)
      return
    }
    setEditProductId(null)
    setIsProductsOpen(true)
  }, [session, currentUser, settings])

  const handleOpenTableManagerTrigger = useCallback(() => {
    if (!can(session || currentUser, 'table_manage', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'table_manage', 'Masa planı yönetimi engellendi')
      setDeniedActionName('Masa Planı Yönetimi')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsTableManagerOpen(true)
  }, [session, currentUser, settings])

  const handleOpenLogoSettingsTrigger = useCallback(() => {
    if (!can(session || currentUser, 'manage_settings', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'manage_settings', 'Logo ayarları engellendi')
      setDeniedActionName('Logo Ayarları')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsLogoSettingsOpen(true)
  }, [session, currentUser, settings])

  const handleOpenSettings = useCallback(() => {
    if (!can(session || currentUser, 'manage_settings', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'manage_settings', 'Sistem ayarları engellendi')
      setDeniedActionName('Sistem Ayarları')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsSettingsOpen(true)
  }, [session, currentUser, settings])

  const handleOpenSummary = useCallback(() => {
    if (!can(session || currentUser, 'reports_view_general', settings) && !can(session || currentUser, 'reports_view_own', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'reports_view_general', 'Rapor görüntüleme engellendi')
      setDeniedActionName('Gün Özeti ve Raporlar')
      setPermissionDeniedModalOpen(true)
      return
    }
    setReportSelectedDayId(null)
    setIsSummaryOpen(true)
  }, [session, currentUser, settings])

  const handleOpenDayModalTrigger = useCallback(() => {
    if (!can(session || currentUser, 'day_open', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'day_open', 'İş günü açma penceresi engellendi')
      setDeniedActionName('İş Günü Açma')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsOpenDayModalOpen(true)
  }, [session, currentUser, settings])

  const handleCloseDayModalTrigger = useCallback(() => {
    if (!can(session || currentUser, 'day_close', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'day_close', 'İş günü kapatma penceresi engellendi')
      setDeniedActionName('İş Günü Kapatma')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsCloseDayModalOpen(true)
  }, [session, currentUser, settings])

  const handleResetData = useCallback(() => {
    try {
      const backup = createFullBackupFile('Sıfırlama öncesi otomatik güvenlik yedeği')
      localStorage.setItem('storage_pre_reset_backup', JSON.stringify(backup))
    } catch {}
    localStorage.removeItem('tables')
    localStorage.removeItem('completedOrders')
    localStorage.removeItem('businessDays')
    localStorage.removeItem('menuProducts')
    localStorage.removeItem('appSettings')
    localStorage.removeItem('activityLogs')
    localStorage.removeItem('refunds')
    localStorage.removeItem('demoTables')
    localStorage.removeItem('demoCompletedOrders')
    localStorage.removeItem('demoMenuProducts')
    localStorage.removeItem('demoAppSettings')
    window.location.reload()
  }, [])

  const activeTable = useMemo(() => tables.find(t => t.id === activeTableId), [tables, activeTableId])
  const cart = activeTable ? activeTable.cart : directCart
  const activeCartRef = useRef<CartItem[]>(cart)
  useEffect(() => {
    activeCartRef.current = cart
  }, [cart])

  const tableBatchesRef = useRef(tableBatches)
  useEffect(() => {
    tableBatchesRef.current = tableBatches
  }, [tableBatches])

  const discountRate = activeTable ? (activeTable.discountRate || 0) : directDiscountRate
  const discountAmount = activeTable ? (activeTable.discountAmount || 0) : directDiscountAmount
  const note = activeTable ? (activeTable.note || '') : directNote
  const customerName = activeTable ? (activeTable.customerName || '') : ''
  const payments = activeTable ? (activeTable.payments || []) : directPayments
  const orderNumber = activeTable ? activeTable.name : ORDER_NUMBER

  const totals = useMemo(() => calculateTotals(cart, discountRate, discountAmount), [cart, discountRate, discountAmount])

  const currentBatchNumber = useMemo(() => {
    const key = activeTableId || '__direct__'
    if (tableBatches[key]) {
      return tableBatches[key].currentBatchNumber
    }
    const targetCart = activeTable ? activeTable.cart : directCart
    if (targetCart.length === 0) return 1
    return Math.max(1, ...targetCart.map((i) => i.batchNumber || 1))
  }, [activeTableId, tableBatches, activeTable, directCart])

  const handleStartNewBatch = useCallback(() => {
    if (!can(session || currentUser, 'order_new_batch', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'order_new_batch', 'Yeni sipariş turu başlatma engellendi')
      setDeniedActionName('Yeni Tur Başlatma')
      setPermissionDeniedModalOpen(true)
      return
    }
    const key = activeTableId || '__direct__'
    const current = tableBatchesRef.current[key]
    const curNum = current ? current.currentBatchNumber : currentBatchNumber
    const newBatch = {
      currentBatchId: generateUUID(),
      currentBatchNumber: curNum + 1,
    }
    tableBatchesRef.current = { ...tableBatchesRef.current, [key]: newBatch }
    setTableBatches((prev) => ({
      ...prev,
      [key]: newBatch,
    }))
  }, [activeTableId, currentBatchNumber, session, currentUser, settings])

  // Sync cart with customer display window (Electron only)
  useEffect(() => {
    if (isElectronEnvironment()) {
      const displayData = {
        items: cart
          .filter((item) => item.status !== 'refunded')
          .map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            selectedOptions: item.selectedOptions?.map((o) => ({
              optionName: o.optionName,
              priceDelta: o.priceDelta,
            })),
          })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        storeName: settings.storeName,
        storeSub: settings.storeSub,
      }
      updateCustomerDisplay(JSON.stringify(displayData)).catch(() => {})
    }
  }, [cart, totals, settings.storeName, settings.storeSub])

  const updateActiveCart = useCallback((updater: (current: CartItem[]) => CartItem[]) => {
    if (activeTableId) {
      setTables((current) =>
        current.map((t) => {
          if (t.id !== activeTableId) return t
          const newCart = updater(t.cart)
          activeCartRef.current = newCart
          return {
            ...t,
            cart: newCart,
            status: newCart.some((i) => i.status !== 'refunded') ? 'occupied' : 'empty',
          }
        })
      )
    } else {
      setDirectCart((current) => {
        const newCart = updater(current)
        activeCartRef.current = newCart
        return newCart
      })
    }
  }, [activeTableId])

  const setDiscountRate = useCallback((rate: number) => {
    if (rate > 0) {
      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'order_discount',
        tableName: activeTable?.name,
        tableId: activeTable?.id,
        newValue: rate,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: `%${rate} masa indirimi uygulandı`,
      })
    }

    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, discountRate: rate } : t))
    } else {
      setDirectDiscountRate(rate)
    }
  }, [activeTableId, activeTable, openBusinessDay, activeUserName, activeUserRole, activeUserId])

  const setDiscountAmount = useCallback((amount: number) => {
    const cleanAmount = Math.max(0, roundCurrency(amount))
    if (cleanAmount > 0) {
      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'order_discount',
        tableName: activeTable?.name,
        tableId: activeTable?.id,
        amount: cleanAmount,
        newValue: cleanAmount,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: `${formatCurrency(cleanAmount)} ödeme indirimi uygulandı`,
      })
    }

    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, discountAmount: cleanAmount } : t))
    } else {
      setDirectDiscountAmount(cleanAmount)
    }
  }, [activeTableId, activeTable, openBusinessDay, activeUserName, activeUserRole, activeUserId])

  const setNote = useCallback((n: string) => {
    if (!can(session || currentUser, 'order_edit_note_customer', settings)) {
      return
    }
    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, note: n } : t))
    } else {
      setDirectNote(n)
    }
  }, [activeTableId, session, currentUser, settings])

  const setCustomerName = useCallback((name: string) => {
    if (!can(session || currentUser, 'order_edit_note_customer', settings)) {
      return
    }
    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, customerName: name } : t))
    }
  }, [activeTableId, session, currentUser, settings])

  const addProduct = useCallback(
    (productId: string) => {
      if (!openBusinessDay) {
        setDayBlockedPromptOpen(true)
        return
      }
      if (!can(session || currentUser, 'order_create_add', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'order_create_add', 'Siparişe ürün ekleme engellendi')
        setDeniedActionName('Siparişe Ürün Ekleme')
        setPermissionDeniedModalOpen(true)
        return
      }
      const product = menuProducts.find((item) => item.id === productId)
      if (!product) return

      if (product.optionGroups && product.optionGroups.length > 0) {
        setOptionModalProduct(product)
        return
      }

      const key = activeTableId || '__direct__'
      let curBatch = tableBatchesRef.current[key]
      if (!curBatch) {
        const targetCart = activeCartRef.current
        const curNum = targetCart.length > 0
          ? Math.max(1, ...targetCart.map((i) => i.batchNumber || 1)) + 1
          : 1
        curBatch = {
          currentBatchId: generateUUID(),
          currentBatchNumber: curNum,
        }
        tableBatchesRef.current = { ...tableBatchesRef.current, [key]: curBatch }
        setTableBatches((prev) => ({ ...prev, [key]: curBatch }))
      }

      const addedBy = activeUserName
      const nowIso = new Date().toISOString()
      const currentCart = activeCartRef.current

      const existingIndex = currentCart.findIndex(
        (item) =>
          item.id === productId &&
          (!item.selectedOptions || item.selectedOptions.length === 0) &&
          item.batchId === curBatch.currentBatchId &&
          item.status !== 'refunded',
      )

      if (existingIndex >= 0) {
        const existing = currentCart[existingIndex]
        const updatedItem: CartItem = {
          ...existing,
          quantity: existing.quantity + 1,
          updatedAt: nowIso,
        }
        const nextCart = currentCart.map((it, idx) => (idx === existingIndex ? updatedItem : it))
        activeCartRef.current = nextCart

        logActivity({
          businessDayId: openBusinessDay.id,
          type: 'item_increase',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: product.name,
          oldValue: existing.quantity,
          newValue: existing.quantity + 1,
          amount: product.price,
          userName: activeUserName,
          userRole: activeUserRole,
          userId: activeUserId,
          details: `${product.name} adedi ${existing.quantity} -> ${existing.quantity + 1} artırıldı`,
        })

        updateActiveCart(() => nextCart)
        setLastAddedId(existing.cartItemId)
      } else {
        const newCartItemId = generateUUID()
        const newItem: CartItem = {
          ...product,
          cartItemId: newCartItemId,
          quantity: 1,
          batchId: curBatch.currentBatchId,
          batchNumber: curBatch.currentBatchNumber,
          addedAt: nowIso,
          addedBy,
          status: 'active',
        }
        const nextCart = [...currentCart, newItem]
        activeCartRef.current = nextCart

        logActivity({
          businessDayId: openBusinessDay.id,
          type: 'item_add',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: product.name,
          newValue: 1,
          amount: product.price,
          userName: activeUserName,
          userRole: activeUserRole,
          userId: activeUserId,
          details: `${product.name} (${curBatch.currentBatchNumber}. Tur) sepete eklendi`,
        })

        updateActiveCart(() => nextCart)
        setLastAddedId(newCartItemId)
      }
    },
    [menuProducts, updateActiveCart, openBusinessDay, activeTableId, activeTable, activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const handleConfirmOption = useCallback(
    (productId: string, quantity: number, selectedOptions: SelectedOption[]) => {
      if (!openBusinessDay) {
        setOptionModalProduct(null)
        setDayBlockedPromptOpen(true)
        return
      }
      if (!can(session || currentUser, 'order_create_add', settings)) {
        setOptionModalProduct(null)
        logUnauthorizedAttempt(session || currentUser, 'order_create_add', 'Siparişe opsiyonlu ürün ekleme engellendi')
        setDeniedActionName('Siparişe Ürün Ekleme')
        setPermissionDeniedModalOpen(true)
        return
      }
      const product = menuProducts.find((item) => item.id === productId)
      if (!product) return

      const key = activeTableId || '__direct__'
      let curBatch = tableBatchesRef.current[key]
      if (!curBatch) {
        const targetCart = activeCartRef.current
        const curNum = targetCart.length > 0
          ? Math.max(1, ...targetCart.map((i) => i.batchNumber || 1)) + 1
          : 1
        curBatch = {
          currentBatchId: generateUUID(),
          currentBatchNumber: curNum,
        }
        tableBatchesRef.current = { ...tableBatchesRef.current, [key]: curBatch }
        setTableBatches((prev) => ({ ...prev, [key]: curBatch }))
      }

      const addedBy = activeUserName
      const nowIso = new Date().toISOString()
      const optionSignature = selectedOptions
        .map((o) => `${o.groupName}:${o.optionName}`)
        .sort()
        .join('|')
      const currentCart = activeCartRef.current

      const existingIndex = currentCart.findIndex((item) => {
        if (
          item.id !== productId ||
          item.batchId !== curBatch.currentBatchId ||
          item.status === 'refunded'
        ) {
          return false
        }
        const itemSig = (item.selectedOptions || [])
          .map((o) => `${o.groupName}:${o.optionName}`)
          .sort()
          .join('|')
        return itemSig === optionSignature
      })

      if (existingIndex >= 0) {
        const existing = currentCart[existingIndex]
        const updatedItem: CartItem = {
          ...existing,
          quantity: existing.quantity + quantity,
          updatedAt: nowIso,
        }
        const nextCart = currentCart.map((it, idx) => (idx === existingIndex ? updatedItem : it))
        activeCartRef.current = nextCart

        logActivity({
          businessDayId: openBusinessDay.id,
          type: 'item_increase',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: product.name,
          oldValue: existing.quantity,
          newValue: existing.quantity + quantity,
          userName: activeUserName,
          userRole: activeUserRole,
          userId: activeUserId,
          details: `${product.name} adedi ${existing.quantity} -> ${existing.quantity + quantity} artırıldı`,
        })

        updateActiveCart(() => nextCart)
        setLastAddedId(existing.cartItemId)
      } else {
        const newCartItemId = generateUUID()
        const newItem: CartItem = {
          ...product,
          cartItemId: newCartItemId,
          quantity,
          selectedOptions,
          batchId: curBatch.currentBatchId,
          batchNumber: curBatch.currentBatchNumber,
          addedAt: nowIso,
          addedBy,
          status: 'active',
        }
        const nextCart = [...currentCart, newItem]
        activeCartRef.current = nextCart

        logActivity({
          businessDayId: openBusinessDay.id,
          type: 'item_add',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: product.name,
          newValue: quantity,
          userName: activeUserName,
          userRole: activeUserRole,
          userId: activeUserId,
          details: `${product.name} (${curBatch.currentBatchNumber}. Tur) sepete eklendi`,
        })

        updateActiveCart(() => nextCart)
        setLastAddedId(newCartItemId)
      }

      setOptionModalProduct(null)
    },
    [menuProducts, updateActiveCart, openBusinessDay, activeTableId, activeTable, activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const updateQuantity = useCallback(
    (cartItemId: string, change: number) => {
      if (change > 0 && !openBusinessDay) {
        setDayBlockedPromptOpen(true)
        return
      }
      const targetItem = cart.find((i) => i.cartItemId === cartItemId)
      if (targetItem) {
        const nextQty = targetItem.quantity + change
        if (change > 0) {
          logActivity({
            businessDayId: openBusinessDay?.id,
            type: 'item_increase',
            tableName: activeTable?.name,
            tableId: activeTable?.id,
            productName: targetItem.name,
            oldValue: targetItem.quantity,
            newValue: nextQty,
            userName: activeUserName,
            userRole: activeUserRole,
            userId: activeUserId,
            details: `${targetItem.name} adedi artırıldı: ${targetItem.quantity} -> ${nextQty}`,
          })
        } else if (nextQty > 0) {
          logActivity({
            businessDayId: openBusinessDay?.id,
            type: 'item_decrease',
            tableName: activeTable?.name,
            tableId: activeTable?.id,
            productName: targetItem.name,
            oldValue: targetItem.quantity,
            newValue: nextQty,
            userName: activeUserName,
            userRole: activeUserRole,
            userId: activeUserId,
            details: `${targetItem.name} adedi azaltıldı: ${targetItem.quantity} -> ${nextQty}`,
          })
        } else {
          logActivity({
            businessDayId: openBusinessDay?.id,
            type: 'item_remove',
            tableName: activeTable?.name,
            tableId: activeTable?.id,
            productName: targetItem.name,
            oldValue: targetItem.quantity,
            newValue: 0,
            userName: activeUserName,
            userRole: activeUserRole,
            userId: activeUserId,
            details: `${targetItem.name} sepetten silindi`,
          })
        }
      }

      updateActiveCart((current) =>
        current
          .map((item) =>
            item.cartItemId === cartItemId
              ? {
                  ...item,
                  quantity: item.quantity + change,
                  ...(change > 0 ? { updatedAt: new Date().toISOString() } : {}),
                }
              : item,
          )
          .filter((item) => item.quantity > 0),
      )
    },
    [cart, updateActiveCart, openBusinessDay, activeTable, activeUserName, activeUserRole, activeUserId],
  )

  const removeItem = useCallback(
    (cartItemId: string) => {
      const targetItem = cart.find((i) => i.cartItemId === cartItemId)
      if (targetItem) {
        logActivity({
          businessDayId: openBusinessDay?.id,
          type: 'item_remove',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: targetItem.name,
          oldValue: targetItem.quantity,
          newValue: 0,
          userName: activeUserName,
          userRole: activeUserRole,
          userId: activeUserId,
          details: `${targetItem.name} sepetten silindi`,
        })
      }
      updateActiveCart((current) => current.filter((item) => item.cartItemId !== cartItemId))
    },
    [cart, updateActiveCart, openBusinessDay, activeTable, activeUserName, activeUserRole, activeUserId],
  )

  const applyItemDiscount = useCallback(
    (cartItemId: string, discount?: { type: 'percentage' | 'amount'; value: number }) => {
      const targetItem = cart.find((i) => i.cartItemId === cartItemId)
      if (targetItem) {
        logActivity({
          businessDayId: openBusinessDay?.id,
          type: 'item_discount',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: targetItem.name,
          userName: activeUserName,
          userRole: activeUserRole,
          userId: activeUserId,
          details: discount
            ? `${targetItem.name} ürününe ${discount.type === 'percentage' ? `%${discount.value}` : `${discount.value} ₺`} indirim uygulandı`
            : `${targetItem.name} ürününün indirimi kaldırıldı`,
        })
      }
      updateActiveCart((current) =>
        current.map((item) =>
          item.cartItemId === cartItemId ? { ...item, itemDiscount: discount } : item,
        ),
      )
    },
    [cart, updateActiveCart, openBusinessDay, activeTable, activeUserName, activeUserRole, activeUserId],
  )

  const resetOrderState = useCallback(() => {
    updateActiveCart(() => [])
    activeCartRef.current = []
    setDiscountRate(0)
    setDiscountAmount(0)
    setNote('')
    setCustomerName('')
    if (activeTableId) {
      setTables((current) =>
        current.map((t) =>
          t.id === activeTableId
            ? { ...t, payments: [], status: 'empty' }
            : t
        )
      )
    } else {
      setDirectPayments([])
    }
    setLastAddedId(null)
    setConfirmClear(false)
  }, [updateActiveCart, setDiscountRate, setDiscountAmount, setNote, setCustomerName, activeTableId])

  const clearCart = useCallback(() => {
    if (!can(session || currentUser, 'order_clear_cart', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'order_clear_cart', 'Sepeti temizleme engellendi')
      setDeniedActionName('Sepeti Temizleme')
      setPermissionDeniedModalOpen(true)
      return
    }
    resetOrderState()
  }, [session, currentUser, settings, resetOrderState])

  const handleCompleteOrder = useCallback(() => {
    setActiveTableId(null)
  }, [])

  const handleOpenPayment = useCallback(() => {
    if (!openBusinessDay) {
      setDayBlockedPromptOpen(true)
      return
    }
    if (!can(session || currentUser, 'payment_take', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'payment_take', 'Ödeme alma engellendi')
      setDeniedActionName('Ödeme Alma')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsPaymentOpen(true)
  }, [openBusinessDay, session, currentUser, settings])

  const handleOpenAdisyon = useCallback(() => {
    if (!can(session || currentUser, 'order_view_adisyon', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'order_view_adisyon', 'Adisyon görüntüleme engellendi')
      setDeniedActionName('Adisyon Görüntüleme')
      setPermissionDeniedModalOpen(true)
      return
    }
    setIsAdisyonOpen(true)
  }, [session, currentUser, settings])

  const handleBackToTables = useCallback(() => {
    setActiveTableId(null)
  }, [])

  const handleViewChange = useCallback((nextView: 'home' | 'tables' | 'pos' | 'logs') => {
    if (nextView === 'logs' && !can(session || currentUser, 'view_logs', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'view_logs', 'İşlem logları görüntüleme engellendi')
      setDeniedActionName('İşlem Logu Ekranı')
      setPermissionDeniedModalOpen(true)
      return
    }
    setView((current) => {
      if (current !== nextView) {
        window.history.pushState({ view: nextView }, '')
      }
      return nextView
    })
    if (nextView === 'tables' || nextView === 'home' || nextView === 'logs') {
      setActiveTableId(null)
    }
  }, [session, currentUser, settings])

  useEffect(() => {
    if (!window.history.state || !window.history.state.view) {
      window.history.replaceState({ view: 'home' }, '')
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextView = (event.state?.view as 'home' | 'tables' | 'pos' | 'logs') || 'home'
      if (nextView === 'logs' && !can(session || currentUser, 'view_logs', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'view_logs', 'İşlem logları görüntüleme engellendi')
        setView('tables')
        setDeniedActionName('İşlem Logu Ekranı')
        setPermissionDeniedModalOpen(true)
        setActiveTableId(null)
        return
      }
      setView(nextView)
      if (nextView === 'tables' || nextView === 'home' || nextView === 'logs') {
        setActiveTableId(null)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [session, currentUser, settings])

  // Route guard: Cannot stay on logs view if unauthorized
  useEffect(() => {
    if (view === 'logs' && !can(session || currentUser, 'view_logs', settings)) {
      setView('tables')
    }
  }, [view, session, currentUser, settings])

  const handleCloseTable = useCallback((tableId: string) => {
    setTables((current) =>
      current.map((t) =>
        t.id === tableId
          ? { ...t, cart: [], discountRate: 0, discountAmount: 0, note: '', customerName: '', payments: [], status: 'empty' }
          : t
      )
    )
  }, [])

  const handleCancelOrderForTable = useCallback((tableId: string) => {
    const targetTable = tables.find((t) => t.id === tableId)
    if (targetTable && targetTable.cart.length > 0) {
      const tableTotals = calculateTotals(targetTable.cart, targetTable.discountRate || 0, targetTable.discountAmount || 0)
      const cancelledOrder: CompletedOrder = {
        id: generateUUID(),
        orderNumber: targetTable.name,
        tableId: targetTable.id,
        tableName: targetTable.name,
        items: [...targetTable.cart],
        totals: { ...tableTotals },
        discountRate: targetTable.discountRate || 0,
        discountAmount: targetTable.discountAmount || 0,
        taxRate: settings.taxRate,
        paymentMethod: 'cash',
        date: new Date().toISOString(),
        cancelled: true,
        cancelledAt: new Date().toISOString(),
        businessDayId: openBusinessDay?.id,
        note: targetTable.note || undefined,
        customerName: targetTable.customerName || undefined,
        cashier: activeUserName,
      }
      setCompletedOrders((prev) => [cancelledOrder, ...prev])
    }
    setTables((current) =>
      current.map((t) =>
        t.id === tableId
          ? { ...t, cart: [], discountRate: 0, discountAmount: 0, note: '', customerName: '', payments: [], status: 'empty' }
          : t
      )
    )
  }, [tables, settings.taxRate, activeUserName, openBusinessDay?.id])

  const handleCompleteOrderForTable = useCallback((tableId: string) => {
    if (!openBusinessDay) {
      setDayBlockedPromptOpen(true)
      return
    }
    if (!can(session || currentUser, 'payment_take', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'payment_take', 'Ödeme alma engellendi')
      setDeniedActionName('Ödeme Alma')
      setPermissionDeniedModalOpen(true)
      return
    }
    setActiveTableId(tableId)
    setIsPaymentOpen(true)
  }, [openBusinessDay, session, currentUser, settings])

  const handleViewAdisyonForTable = useCallback((tableId: string) => {
    if (!can(session || currentUser, 'order_view_adisyon', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'order_view_adisyon', 'Adisyon görüntüleme engellendi')
      setDeniedActionName('Adisyon Görüntüleme')
      setPermissionDeniedModalOpen(true)
      return
    }
    setActiveTableId(tableId)
    setIsAdisyonOpen(true)
  }, [session, currentUser, settings])

  const handleMoveTable = useCallback(
    (sourceTableId: string, targetTableId: string) => {
      if (!can(session || currentUser, 'table_transfer_merge', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'table_transfer_merge', 'Masa taşıma engellendi')
        setDeniedActionName('Masa Taşıma')
        setPermissionDeniedModalOpen(true)
        return
      }
      const sourceTable = tables.find((t) => t.id === sourceTableId)
      const targetTable = tables.find((t) => t.id === targetTableId)
      setTables((current) => moveTableOrder(current, sourceTableId, targetTableId))
      setActiveTableId((currentActive) =>
        currentActive === sourceTableId ? targetTableId : currentActive,
      )
      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'table_move',
        tableName: sourceTable?.name,
        tableId: sourceTableId,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: `${sourceTable?.name || sourceTableId} masası ${targetTable?.name || targetTableId} masasına taşındı`,
      })
    },
    [tables, openBusinessDay, activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const handleMergeTables = useCallback(
    (mainTableId: string, sourceTableId: string) => {
      if (!can(session || currentUser, 'table_transfer_merge', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'table_transfer_merge', 'Masa birleştirme engellendi')
        setDeniedActionName('Masa Birleştirme')
        setPermissionDeniedModalOpen(true)
        return
      }
      const sourceTable = tables.find((t) => t.id === sourceTableId)
      const mainTable = tables.find((t) => t.id === mainTableId)
      setTables((current) => mergeTablesOrder(current, mainTableId, sourceTableId))
      setActiveTableId((currentActive) =>
        currentActive === sourceTableId ? mainTableId : currentActive,
      )
      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'table_merge',
        tableName: mainTable?.name,
        tableId: mainTableId,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: `${sourceTable?.name || sourceTableId} masası ${mainTable?.name || mainTableId} masası ile birleştirildi`,
      })
    },
    [tables, openBusinessDay, activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const handleSplitTable = useCallback(
    (
      sourceTableId: string,
      targetTableId: string,
      splitItems: SplitItemSelection[],
    ) => {
      if (!can(session || currentUser, 'table_transfer_merge', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'table_transfer_merge', 'Masa ayırma/aktarma engellendi')
        setDeniedActionName('Masa Aktarma')
        setPermissionDeniedModalOpen(true)
        return
      }
      const sourceTable = tables.find((t) => t.id === sourceTableId)
      const targetTable = tables.find((t) => t.id === targetTableId)
      setTables((current) => {
        const updated = splitTableOrder(current, sourceTableId, targetTableId, splitItems)
        const updatedSource = updated.find((t) => t.id === sourceTableId)
        if (updatedSource && !isTableOccupied(updatedSource)) {
          setActiveTableId((currentActive) => (currentActive === sourceTableId ? null : currentActive))
        }
        return updated
      })
      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'table_split',
        tableName: sourceTable?.name,
        tableId: sourceTableId,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: `${sourceTable?.name || sourceTableId} masasından ${targetTable?.name || targetTableId} masasına ürün aktarıldı`,
      })
    },
    [tables, openBusinessDay, activeUserName, activeUserRole, activeUserId, session, currentUser, settings],
  )

  const handleClearReports = useCallback(() => {
    if (!can(session || currentUser, 'manage_settings', settings)) {
      logUnauthorizedAttempt(session || currentUser, 'manage_settings', 'Rapor sıfırlama engellendi')
      setDeniedActionName('Rapor ve Veri Sıfırlama')
      setPermissionDeniedModalOpen(true)
      return
    }
    // Otomatik güvenlik yedeği al
    try {
      const backup = createFullBackupFile('Rapor sıfırlama öncesi otomatik güvenlik yedeği')
      localStorage.setItem('storage_pre_clear_reports_backup', JSON.stringify(backup))
    } catch {}

    // 1. Satış ve sipariş geçmişini temizle
    setCompletedOrders([])
    localStorage.removeItem('completedOrders')
    localStorage.removeItem('demoCompletedOrders')

    // 2. Geçmiş iş günlerini ve Z raporlarını temizle
    setBusinessDays([])
    localStorage.removeItem('businessDays')

    // 3. Masalardaki açık siparişleri ve bakiyeleri temizle
    setTables((current) =>
      current.map((t) => ({
        ...t,
        status: 'empty' as const,
        cart: [],
        discountRate: 0,
        note: '',
        payments: [],
        customerName: '',
      }))
    )

    // 4. Sepet ve aktif seçimleri sıfırla
    setDirectCart([])
    setDirectDiscountRate(0)
    setDirectNote('')
    setDirectPayments([])
    setActiveTableId(null)
    setReportSelectedDayId(null)
  }, [session, currentUser, settings])

  const finishPayment = (method: PaymentMethod) => {
    setPaidMethod(method)
  }

  const handleAddPayment = useCallback(
    (payment: PartialPayment, isComplete: boolean, finalMethod: PaymentMethod) => {
      const paymentWithDay: PartialPayment = {
        ...payment,
        businessDayId: openBusinessDay?.id,
        cashier: activeUserName,
        userId: activeUserId,
      }

      let paymentDetails = `${payment.method.toUpperCase()} ile ${formatCurrency(payment.amount)} ara ödeme alındı`
      if (payment.isManualAmount && payment.selectedItemsTotal) {
        const methodLabel = payment.method === 'card' ? 'Kart' : payment.method === 'cash' ? 'Nakit' : 'IBAN'
        paymentDetails = `${methodLabel} · ${formatCurrency(payment.amount)} · manuel tutar · seçili ürün toplamı ${formatCurrency(payment.selectedItemsTotal)}`
      }

      logActivity({
        businessDayId: openBusinessDay?.id,
        type: 'payment',
        tableName: activeTable?.name,
        tableId: activeTable?.id,
        amount: payment.amount,
        userName: activeUserName,
        userRole: activeUserRole,
        userId: activeUserId,
        details: paymentDetails,
      })

      if (activeTableId) {
        setTables((current) =>
          current.map((t) =>
            t.id === activeTableId
              ? { ...t, payments: [...(t.payments || []), paymentWithDay] }
              : t,
          ),
        )
      } else {
        setDirectPayments((current) => [...current, paymentWithDay])
      }
      if (isComplete) {
        setPaidMethod(finalMethod)
      }
    },
    [activeTableId, activeTable, openBusinessDay, activeUserName, activeUserRole, activeUserId],
  )

  const handleUndoLastPayment = useCallback(() => {
    if (activeTableId) {
      setTables((current) =>
        current.map((t) =>
          t.id === activeTableId
            ? { ...t, payments: (t.payments || []).slice(0, -1) }
            : t
        )
      )
    } else {
      setDirectPayments((current) => current.slice(0, -1))
    }
  }, [activeTableId])

  // Refund Handlers
  const handleOpenItemRefund = useCallback(
    (item: CartItem) => {
      if (!can(session || currentUser, 'refund_item', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'refund_item', 'Ürün iadesi engellendi')
        setDeniedActionName('Ürün İadesi')
        setPermissionDeniedModalOpen(true)
        return
      }
      setRefundItemTarget(item)
      setRefundTableTarget(null)
      setRefundModalOpen(true)
    },
    [session, currentUser, settings],
  )

  const handleOpenTableRefund = useCallback(
    (tableId?: string) => {
      if (!can(session || currentUser, 'refund_table', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'refund_table', 'Masa iadesi engellendi')
        setDeniedActionName('Masa İadesi')
        setPermissionDeniedModalOpen(true)
        return
      }
      const target = tableId ? tables.find((t) => t.id === tableId) : activeTable
      if (!target || target.cart.length === 0) return
      setRefundItemTarget(null)
      setRefundTableTarget(target)
      setRefundModalOpen(true)
    },
    [session, currentUser, settings, tables, activeTable],
  )

  const handleConfirmRefund = useCallback(
    (params: {
      qty: number
      reason: string
      paymentMethod: PaymentMethod
      isTableRefund: boolean
    }) => {
      const userName = activeUserName
      const userRole = activeUserRole
      const userId = activeUserId
      const nowIso = new Date().toISOString()

      if (params.isTableRefund) {
        const targetTable = refundTableTarget || activeTable
        if (!targetTable) return

        const activeItems = targetTable.cart.filter((i) => i.status !== 'refunded')
        const totalAmount = activeItems.reduce(
          (sum, i) => sum + getEffectivePrice(i) * (i.quantity - (i.refundedQty || 0)),
          0,
        )

        const refundRecord: Refund = {
          id: generateUUID(),
          businessDayId: openBusinessDay?.id,
          tableId: targetTable.id,
          tableName: targetTable.name,
          amount: roundCurrency(totalAmount),
          reason: params.reason,
          paymentMethod: params.paymentMethod,
          refundedAt: nowIso,
          refundedBy: userName,
          items: activeItems.map((i) => ({
            productId: i.id,
            name: i.name,
            quantity: i.quantity - (i.refundedQty || 0),
            unitPrice: getEffectivePrice(i),
            totalPrice: roundCurrency(getEffectivePrice(i) * (i.quantity - (i.refundedQty || 0))),
          })),
        }
        saveStoredRefund(refundRecord)

        logActivity({
          businessDayId: openBusinessDay?.id,
          type: 'table_refund',
          tableName: targetTable.name,
          tableId: targetTable.id,
          amount: roundCurrency(totalAmount),
          reason: params.reason,
          userName,
          userRole,
          userId,
          details: `${targetTable.name} masası tamamen iade edildi. Tutar: ${formatCurrency(totalAmount)}. Neden: ${params.reason}`,
        })

        // Mark table items as refunded and clear table
        setTables((current) =>
          current.map((t) =>
            t.id === targetTable.id
              ? {
                  ...t,
                  cart: t.cart.map((i) => ({
                    ...i,
                    status: 'refunded' as const,
                    refundedQty: i.quantity,
                    refundReason: params.reason,
                    refundedAt: nowIso,
                    refundedBy: userName,
                  })),
                  payments: [],
                  status: 'empty' as const,
                }
              : t,
          ),
        )

        if (activeTableId === targetTable.id) {
          setActiveTableId(null)
        }
      } else if (refundItemTarget) {
        const item = refundItemTarget
        const unitPrice = getEffectivePrice(item)
        const refundAmount = roundCurrency(unitPrice * params.qty)

        const refundRecord: Refund = {
          id: generateUUID(),
          businessDayId: openBusinessDay?.id,
          tableId: activeTable?.id,
          tableName: activeTable?.name,
          amount: refundAmount,
          reason: params.reason,
          paymentMethod: params.paymentMethod,
          refundedAt: nowIso,
          refundedBy: userName,
          items: [
            {
              productId: item.id,
              name: item.name,
              quantity: params.qty,
              unitPrice,
              totalPrice: refundAmount,
            },
          ],
        }
        saveStoredRefund(refundRecord)

        logActivity({
          businessDayId: openBusinessDay?.id,
          type: 'item_refund',
          tableName: activeTable?.name,
          tableId: activeTable?.id,
          productName: item.name,
          amount: refundAmount,
          reason: params.reason,
          userName,
          userRole,
          userId,
          details: `${item.name} (${params.qty} adet) iade edildi. Tutar: ${formatCurrency(refundAmount)}. Neden: ${params.reason}`,
        })

        updateActiveCart((current) => {
          return current.flatMap((cartItem) => {
            if (cartItem.cartItemId !== item.cartItemId) {
              return [cartItem]
            }
            if (params.qty >= cartItem.quantity) {
              return [
                {
                  ...cartItem,
                  status: 'refunded' as const,
                  refundedQty: cartItem.quantity,
                  refundReason: params.reason,
                  refundedAt: nowIso,
                  refundedBy: userName,
                },
              ]
            }
            const remainingItem: CartItem = {
              ...cartItem,
              quantity: cartItem.quantity - params.qty,
            }
            const refundedPortion: CartItem = {
              ...cartItem,
              cartItemId: generateUUID(),
              quantity: params.qty,
              status: 'refunded' as const,
              refundedQty: params.qty,
              refundReason: params.reason,
              refundedAt: nowIso,
              refundedBy: userName,
            }
            return [remainingItem, refundedPortion]
          })
        })
      }

      setRefundModalOpen(false)
      setRefundItemTarget(null)
      setRefundTableTarget(null)
    },
    [
      refundTableTarget,
      refundItemTarget,
      activeTable,
      activeTableId,
      openBusinessDay,
      activeUserName,
      activeUserRole,
      activeUserId,
      updateActiveCart,
    ],
  )

  // Reopen Order Handlers
  const handleRequestReopenOrder = useCallback(
    (orderId: string) => {
      if (!can(session || currentUser, 'reopen_order', settings)) {
        logUnauthorizedAttempt(session || currentUser, 'reopen_order', 'Adisyon geri açma engellendi')
        setDeniedActionName('Adisyon Geri Açma')
        setPermissionDeniedModalOpen(true)
        return
      }
      const order = completedOrders.find((o) => o.id === orderId)
      if (order) {
        setReopenModalOrder(order)
      }
    },
    [completedOrders, session, currentUser, settings],
  )

  const handleConfirmReopen = useCallback(
    (params: {
      orderId: string
      reason: string
      paymentAction: 'keep' | 'cancel'
      targetTableId: string
    }) => {
      const targetOrder = completedOrders.find((o) => o.id === params.orderId)
      if (!targetOrder) return

      if (!openBusinessDay || targetOrder.businessDayId !== openBusinessDay.id) {
        alert('Yalnızca açık olan iş gününe ait adisyonlar geri açılabilir.')
        return
      }

      const userName = activeUserName
      const userRole = activeUserRole
      const userId = activeUserId
      const nowIso = new Date().toISOString()

      // Mark order as reopened
      setCompletedOrders((prev) =>
        prev.map((o) =>
          o.id === params.orderId
            ? {
                ...o,
                reopened: true,
                reopenedAt: nowIso,
                reopenedBy: userName,
                reopenReason: params.reason,
              }
            : o,
        ),
      )

      // Restore to target table
      setTables((prev) =>
        prev.map((t) => {
          if (t.id === params.targetTableId) {
            const restoredCart = [...t.cart, ...targetOrder.items]
            const restoredPayments =
              params.paymentAction === 'keep'
                ? [...(t.payments || []), ...(targetOrder.payments || [])]
                : t.payments || []
            return {
              ...t,
              cart: restoredCart,
              payments: restoredPayments,
              note: targetOrder.note || t.note,
              customerName: targetOrder.customerName || t.customerName,
              discountRate: targetOrder.discountRate ?? t.discountRate,
              status: 'occupied' as const,
            }
          }
          return t
        }),
      )

      logActivity({
        businessDayId: openBusinessDay.id,
        type: 'order_reopen',
        orderId: targetOrder.id,
        tableName: targetOrder.tableName || targetOrder.orderNumber,
        tableId: params.targetTableId,
        amount: targetOrder.totals.total,
        reason: params.reason,
        userName,
        userRole,
        userId,
        details: `${targetOrder.orderNumber} nolu adisyon ${targetOrder.tableName || ''} masasına geri açıldı (${params.paymentAction === 'keep' ? 'Ödemeler Korundu' : 'Ödemeler İptal Edildi'}). Neden: ${params.reason}`,
      })

      setIsSummaryOpen(false)
      setReopenModalOrder(null)
      handleViewChange('tables')
      setActiveTableId(params.targetTableId)
    },
    [completedOrders, openBusinessDay, activeUserName, activeUserRole, activeUserId, handleViewChange],
  )

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (import.meta.env.PROD) {
        event.preventDefault()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const upperKey = event.key.toUpperCase()
      const ctrlOrCmd = event.ctrlKey || event.metaKey

      // Secret Administrator Exit Shortcut: Ctrl+Shift+Q (or Cmd+Shift+Q)
      if (ctrlOrCmd && event.shiftKey && !event.altKey && upperKey === 'Q') {
        event.preventDefault()
        setIsAdminExitOpen(true)
        return
      }

      // Defense-in-depth shortcut blocking in production
      if (import.meta.env.PROD) {
        if (
          event.key === 'F12' ||
          event.key === 'F5' ||
          event.key === 'F11' ||
          (event.altKey && event.key === 'F4') ||
          (ctrlOrCmd && event.shiftKey && (upperKey === 'I' || upperKey === 'J' || upperKey === 'C')) ||
          (ctrlOrCmd && (upperKey === 'R' || upperKey === 'W' || upperKey === 'U'))
        ) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
      }

      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (isTyping && event.key !== 'Escape') return

      if (event.key === 'F2') {
        event.preventDefault()
        searchRef.current?.focus()
        kasaSearchRef.current?.focus()
      }
      if (event.key === 'F4' && cart.length > 0 && activeTableId) {
        event.preventDefault()
        if (!openBusinessDay) {
          setDayBlockedPromptOpen(true)
        } else if (!can(session || currentUser, 'payment_take', settings)) {
          logUnauthorizedAttempt(session || currentUser, 'payment_take', 'Ödeme alma engellendi (F4)')
          setDeniedActionName('Ödeme Alma')
          setPermissionDeniedModalOpen(true)
        } else {
          setIsPaymentOpen(true)
        }
      }
      if (event.key === 'Escape') {
        setIsPaymentOpen(false)
        setIsSummaryOpen(false)
        setIsHelpOpen(false)
        setConfirmClear(false)
        setDayBlockedPromptOpen(false)
        setIsAdminExitOpen(false)
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Backspace' && cart.length > 0 && activeTableId) {
        event.preventDefault()
        if (!can(session || currentUser, 'order_clear_cart', settings)) {
          logUnauthorizedAttempt(session || currentUser, 'order_clear_cart', 'Sepeti temizleme engellendi (Kısayol)')
          setDeniedActionName('Sepeti Temizleme')
          setPermissionDeniedModalOpen(true)
        } else {
          setConfirmClear(true)
        }
      }
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [cart.length, lastAddedId, menuProducts, activeTableId, openBusinessDay, session, currentUser, settings])

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  // ── ROUTE GUARD: If no active session, show LoginScreen ──
  if (!session) {
    return (
      <>
        <LoginScreen
          onLoginSuccess={(newSession, loggedInUser, mustChange) => {
            setSession(newSession)
            setCurrentUser(loggedInUser)
            setMustChangePassword(Boolean(mustChange))
          }}
          storeName={settings.storeName}
          storeSub={settings.storeSub}
          onRequestAdminExit={() => setIsAdminExitOpen(true)}
        />
        <AdminExitModal
          isOpen={isAdminExitOpen}
          onClose={() => setIsAdminExitOpen(false)}
          currentSession={null}
        />
      </>
    )
  }

  // ── MANDATORY FIRST-LOGIN PASSWORD CHANGE GUARD ──
  if (mustChangePassword && currentUser) {
    return (
      <>
        <ForceChangePasswordModal
          user={currentUser}
          onSuccess={() => {
            setMustChangePassword(false)
          }}
        />
        <AdminExitModal
          isOpen={isAdminExitOpen}
          onClose={() => setIsAdminExitOpen(false)}
          currentSession={session}
        />
      </>
    )
  }

  return (
      <main className="app-shell">
        <TopBar
          view={view}
          onViewChange={handleViewChange}
          onOpenSummary={handleOpenSummary}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenProducts={handleOpenProductsTrigger}
          onOpenLogoSettings={handleOpenLogoSettingsTrigger}
          onOpenSettings={handleOpenSettings}
          onOpenDayModal={handleOpenDayModalTrigger}
          onCloseDayModal={handleCloseDayModalTrigger}
          openBusinessDay={openBusinessDay}
          settings={settings}
          currentSession={session}
          onLogout={handleLogout}
          onRequestAdminExit={() => setIsAdminExitOpen(true)}
        />

        {crashRecoveryBanner && (
          <div
            role="status"
            aria-live="polite"
            data-testid="crash-recovery-banner"
            className="mx-4 mt-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 flex items-center justify-between gap-3 text-xs font-semibold shadow-sm"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{crashRecoveryBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setCrashRecoveryBanner(null)}
              className="p-1 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-900/50 text-blue-800 dark:text-blue-300 shrink-0"
              aria-label="Kurtarma bildirimini kapat"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {criticalStorageError && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="critical-storage-error-banner"
            className="mx-4 mt-2 px-4 py-3 rounded-xl bg-red-600 text-white border-2 border-red-800 flex flex-wrap items-center justify-between gap-3 text-xs font-bold shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-white shrink-0" />
              <span>
                <strong>KRİTİK VERİTABANI UYARISI:</strong> {criticalStorageError.message}
                {criticalStorageError.suggestedBackup?.fileName
                  ? ` (Önerilen otomatik yedek: ${criticalStorageError.suggestedBackup.fileName})`
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={recoveringFromBackup}
                onClick={async () => {
                  setRecoveringFromBackup(true)
                  try {
                    let targetFileName = criticalStorageError.suggestedBackup?.fileName
                    if (!targetFileName) {
                      const listRes = await listDiskBackups()
                      if (listRes.success && listRes.backups.length > 0) {
                        targetFileName = listRes.backups[0].fileName
                      }
                    }
                    if (targetFileName) {
                      const readRes = await readDiskBackupForRestore(targetFileName)
                      if (readRes.success && readRes.backup) {
                        const res = restoreFromBackup(readRes.backup)
                        if (res.success) {
                          setTables(getTablesSafe())
                          setCompletedOrders(getCompletedOrdersSafe())
                          setBusinessDays(getBusinessDaysSafe())
                          setMenuProducts(getMenuProductsSafe())
                          setSettings(getSettingsSafe())
                          setCriticalStorageError(null)
                          return
                        }
                      }
                    }
                    const preRestore = getPreRestoreBackup()
                    if (preRestore) {
                      const res = restoreFromBackup(preRestore, { skipPreRestoreBackup: true })
                      if (res.success) {
                        setTables(getTablesSafe())
                        setCompletedOrders(getCompletedOrdersSafe())
                        setBusinessDays(getBusinessDaysSafe())
                        setMenuProducts(getMenuProductsSafe())
                        setSettings(getSettingsSafe())
                        setCriticalStorageError(null)
                      }
                    }
                  } finally {
                    setRecoveringFromBackup(false)
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-white text-red-700 hover:bg-red-50 font-extrabold transition shadow-sm cursor-pointer"
              >
                {recoveringFromBackup ? 'Kurtarılıyor...' : 'Otomatik Yedekten Kurtar'}
              </button>
              <button
                type="button"
                onClick={() => setCriticalStorageError(null)}
                className="p-1 rounded-lg hover:bg-red-700 text-white"
                aria-label="Kritik veritabanı uyarısını kapat"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {backupWarning && (
          <div
            role="status"
            aria-live="polite"
            className="mx-4 mt-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-xs font-semibold shadow-sm"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Yedekleme Uyarısı:</strong> {backupWarning} (Ana yedek Documents\LemoonYedek klasörüne güvenle kaydedildi, çalışma devam ediyor.)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBackupWarning(null)}
              className="p-1 rounded-lg hover:bg-amber-200/60 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 shrink-0"
              aria-label="Yedekleme uyarısını kapat"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {view === 'home' ? (
          <HomePage
            completedOrders={completedOrders}
            tables={tables}
            openBusinessDay={openBusinessDay}
            onOpenDayModal={handleOpenDayModalTrigger}
            onCloseDayModal={handleCloseDayModalTrigger}
            onViewChange={handleViewChange}
            onOpenSummary={handleOpenSummary}
            onOpenProducts={handleOpenProductsTrigger}
            settings={settings}
            currentSession={session}
          />
        ) : view === 'tables' ? (
          activeTableId && activeTable ? (
            <TableOrderView
              tableName={activeTable.name}
              cart={cart}
              confirmClear={confirmClear}
              note={note}
              customerName={customerName}
              totals={totals}
              payments={payments}
              products={menuProducts}
              onAddProduct={addProduct}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeItem}
              onApplyItemDiscount={applyItemDiscount}
              onClear={clearCart}
              onConfirmClearChange={setConfirmClear}
              onNoteChange={setNote}
              onCustomerNameChange={setCustomerName}
              onCompleteOrder={handleCompleteOrder}
              onOpenPayment={handleOpenPayment}
              onOpenAdisyon={handleOpenAdisyon}
              onOpenProducts={handleOpenProductsTrigger}
              onBack={handleBackToTables}
              onEditProduct={handleEditProduct}
              onViewDetail={handleViewDetail}
              onDeleteProduct={handleDeleteProduct}
              isDayOpen={Boolean(openBusinessDay)}
              onOpenDayModal={handleOpenDayModalTrigger}
              onRefundItem={handleOpenItemRefund}
              onRefundTable={() => handleOpenTableRefund(activeTable.id)}
              onStartNewBatch={handleStartNewBatch}
              currentBatchNumber={currentBatchNumber}
              canClearCart={can(session || currentUser, 'order_clear_cart', settings)}
              canViewAdisyon={can(session || currentUser, 'order_view_adisyon', settings)}
              canRefundItem={can(session || currentUser, 'refund_item', settings)}
              canRefundTable={can(session || currentUser, 'refund_table', settings)}
              canStartNewBatch={can(session || currentUser, 'order_new_batch', settings)}
              canEditNoteCustomer={can(session || currentUser, 'order_edit_note_customer', settings)}
              canTakePayment={can(session || currentUser, 'payment_take', settings)}
            />
          ) : (
            <TableLayout
              tables={tables}
              onSelectTable={(id) => {
                const target = tables.find((t) => t.id === id)
                if (!openBusinessDay && (!target || !isTableOccupied(target))) {
                  setDayBlockedPromptOpen(true)
                  return
                }
                setActiveTableId(id)
                setTableBatches((prev) => {
                  const targetCart = target?.cart || []
                  if (targetCart.length === 0) {
                    const nextBatch = { currentBatchId: generateUUID(), currentBatchNumber: 1 }
                    tableBatchesRef.current = { ...tableBatchesRef.current, [id]: nextBatch }
                    return {
                      ...prev,
                      [id]: nextBatch,
                    }
                  }
                  const maxBatch = Math.max(1, ...targetCart.map((i) => i.batchNumber || 1))
                  const nextBatch = { currentBatchId: generateUUID(), currentBatchNumber: maxBatch + 1 }
                  tableBatchesRef.current = { ...tableBatchesRef.current, [id]: nextBatch }
                  return {
                    ...prev,
                    [id]: nextBatch,
                  }
                })
              }}
              onOpenTableManager={handleOpenTableManagerTrigger}
              onCloseTable={handleCloseTable}
              onCancelOrder={handleCancelOrderForTable}
              onRefundTable={handleOpenTableRefund}
              onCompleteOrder={handleCompleteOrderForTable}
              onViewAdisyon={handleViewAdisyonForTable}
              onMoveTable={handleMoveTable}
              onMergeTables={handleMergeTables}
              onSplitTable={handleSplitTable}
              isDayOpen={Boolean(openBusinessDay)}
              onOpenDayModal={handleOpenDayModalTrigger}
              canManageTables={can(session || currentUser, 'table_manage', settings)}
              canTransferMerge={can(session || currentUser, 'table_transfer_merge', settings)}
              canRefundTable={can(session || currentUser, 'refund_table', settings)}
              canViewAdisyon={can(session || currentUser, 'order_view_adisyon', settings)}
              canReopenOrder={can(session || currentUser, 'reopen_order', settings)}
              onRequestReopenOrder={handleRequestReopenOrder}
              completedOrders={completedOrders}
              openBusinessDayId={openBusinessDay?.id}
            />
          )
        ) : view === 'logs' ? (
          <ActivityLogsView
            businessDays={businessDays}
            openBusinessDay={openBusinessDay}
            tables={tables}
            currentSession={session}
            onNavigateHome={() => handleViewChange('tables')}
          />
        ) : (
          <section className="kasa-catalog-layout" aria-label="LEMOON KAFE ürün kataloğu">
            <ProductExplorer
              category={kasaCategory}
              onCategoryChange={setKasaCategory}
              search={kasaSearch}
              onSearchChange={setKasaSearch}
              searchRef={kasaSearchRef}
              products={menuProducts}
              onOpenProducts={handleOpenProductsTrigger}
              onEditProduct={handleEditProduct}
              onViewDetail={handleViewDetail}
              onDeleteProduct={handleDeleteProduct}
              readOnly
            />
          </section>
        )}

        <PaymentModal
          cart={cart}
          discountRate={discountRate}
          discountAmount={discountAmount}
          onApplyDiscountAmount={setDiscountAmount}
          isOpen={isPaymentOpen}
          note={note}
          customerName={customerName}
          onClose={() => {
            if (paidMethod) {
              const orderDate = new Date().toISOString()
              const effectivePayments: PartialPayment[] =
                payments.length > 0
                  ? [...payments]
                  : [
                      {
                        id: generateUUID(),
                        method: paidMethod === 'mixed' ? 'cash' : paidMethod,
                        amount: totals.total,
                        createdAt: orderDate,
                        businessDayId: openBusinessDay?.id,
                        cashier: activeUserName,
                        userId: activeUserId,
                      },
                    ]

              const newOrder: CompletedOrder = {
                id: generateUUID(),
                orderNumber: orderNumber,
                tableId: activeTable?.id,
                tableName: activeTable?.name,
                items: [...cart],
                totals: { ...totals },
                discountRate: discountRate,
                discountAmount: discountAmount,
                taxRate: settings.taxRate,
                paymentMethod: paidMethod,
                payments: effectivePayments,
                date: orderDate,
                note: note,
                customerName: customerName || undefined,
                cashier: activeUserName,
                businessDayId: openBusinessDay?.id,
              }
              setCompletedOrders(prev => [newOrder, ...prev])

              logActivity({
                businessDayId: openBusinessDay?.id,
                type: 'payment',
                tableName: activeTable?.name,
                tableId: activeTable?.id,
                amount: totals.total,
                userName: activeUserName,
                userRole: activeUserRole,
                userId: activeUserId,
                details: `${orderNumber} nolu sipariş tamamlandı (${paidMethod.toUpperCase()}). Toplam: ${formatCurrency(totals.total)}`,
              })

              resetOrderState()
              setPaidMethod(null)
              setActiveTableId(null)
            }
            setIsPaymentOpen(false)
          }}
          onNewOrder={() => {
            if (paidMethod) {
              const orderDate = new Date().toISOString()
              const effectivePayments: PartialPayment[] =
                payments.length > 0
                  ? [...payments]
                  : [
                      {
                        id: generateUUID(),
                        method: paidMethod === 'mixed' ? 'cash' : paidMethod,
                        amount: totals.total,
                        createdAt: orderDate,
                        businessDayId: openBusinessDay?.id,
                        cashier: activeUserName,
                        userId: activeUserId,
                      },
                    ]

              const newOrder: CompletedOrder = {
                id: generateUUID(),
                orderNumber: orderNumber,
                tableId: activeTable?.id,
                tableName: activeTable?.name,
                items: [...cart],
                totals: { ...totals },
                discountRate: discountRate,
                discountAmount: discountAmount,
                taxRate: settings.taxRate,
                paymentMethod: paidMethod,
                payments: effectivePayments,
                date: orderDate,
                note: note,
                customerName: customerName || undefined,
                cashier: activeUserName,
                businessDayId: openBusinessDay?.id,
              }
              setCompletedOrders(prev => [newOrder, ...prev])

              logActivity({
                businessDayId: openBusinessDay?.id,
                type: 'payment',
                tableName: activeTable?.name,
                tableId: activeTable?.id,
                amount: totals.total,
                userName: activeUserName,
                userRole: activeUserRole,
                userId: activeUserId,
                details: `${orderNumber} nolu sipariş tamamlandı (${paidMethod.toUpperCase()}). Toplam: ${formatCurrency(totals.total)}`,
              })
            }
            resetOrderState()
            setPaidMethod(null)
            setActiveTableId(null)
            setIsPaymentOpen(false)
          }}
          onPaid={finishPayment}
          onAddPayment={handleAddPayment}
          onUndoLastPayment={handleUndoLastPayment}
          orderNumber={orderNumber}
          paidMethod={paidMethod}
          payments={payments}
          settings={settings}
          totals={totals}
          currentSession={session}
        />

        <ReportsModal
          isOpen={isSummaryOpen}
          onClose={() => {
            setIsSummaryOpen(false)
            setReportSelectedDayId(null)
          }}
          completedOrders={completedOrders}
          businessDays={businessDays}
          openBusinessDay={openBusinessDay}
          initialSelectedDayId={reportSelectedDayId}
          tables={tables}
          settings={settings}
          onClearReports={handleClearReports}
          onOpenDayModal={handleOpenDayModalTrigger}
          onCloseDayModal={handleCloseDayModalTrigger}
          onReopenOrder={handleRequestReopenOrder}
          currentSession={session}
        />

        {isOpenDayModalOpen && (
          <OpenDayModal
            isOpen={isOpenDayModalOpen}
            cashierName={activeUserName}
            previousDayCarryOut={previousDayCarryOut}
            hasPreviousClosedDay={hasPreviousClosedDay}
            previousDayNeverClosed={previousDayNeverClosed}
            onClose={() => setIsOpenDayModalOpen(false)}
            onOpenDay={handleOpenDay}
          />
        )}

        <CloseDayModal
          isOpen={isCloseDayModalOpen}
          openDay={openBusinessDay}
          orders={completedOrders}
          tables={tables}
          settings={settings}
          onClose={() => setIsCloseDayModalOpen(false)}
          onCloseDay={handleCloseDay}
          onGoToTables={() => {
            handleViewChange('tables')
          }}
          onViewReport={(dayId) => {
            setReportSelectedDayId(dayId)
            setIsSummaryOpen(true)
          }}
        />

        <RefundModal
          isOpen={refundModalOpen}
          onClose={() => {
            setRefundModalOpen(false)
            setRefundItemTarget(null)
            setRefundTableTarget(null)
          }}
          item={refundItemTarget}
          table={refundTableTarget}
          hasPaymentReceived={
            refundTableTarget
              ? Boolean(refundTableTarget.payments && refundTableTarget.payments.length > 0)
              : Boolean(payments && payments.length > 0)
          }
          onConfirmRefund={handleConfirmRefund}
        />

        <ReopenOrderModal
          isOpen={Boolean(reopenModalOrder)}
          onClose={() => setReopenModalOrder(null)}
          order={reopenModalOrder}
          openBusinessDayId={openBusinessDay?.id}
          tables={tables}
          onConfirmReopen={handleConfirmReopen}
        />

        <PermissionDeniedModal
          isOpen={permissionDeniedModalOpen}
          onClose={() => setPermissionDeniedModalOpen(false)}
          actionName={deniedActionName}
          onSwitchUser={handleLogout}
        />

        {dayBlockedPromptOpen && !openBusinessDay && (
          <div
            className="overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Gün Kapalı"
            onClick={() => setDayBlockedPromptOpen(false)}
          >
            <div
              className="modal"
              style={{ width: 'min(440px, 92vw)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 grid place-items-center shrink-0">
                    <Sun size={18} />
                  </div>
                  <div>
                    <p className="section-kicker">GÜN KAPALI</p>
                    <h2 className="section-title text-lg">Sipariş Alınamıyor</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className="close-button"
                  onClick={() => setDayBlockedPromptOpen(false)}
                  aria-label="Kapat"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="payment-body text-center space-y-4">
                <p className="text-sm font-bold text-[#3b291f]">
                  Sipariş almak için önce günü açın
                </p>
                <p className="text-xs text-[#6d5a4e]">
                  Yeni sipariş oluşturmak, sepete ürün eklemek veya ödeme almak için önce kasa açılış tutarını girerek iş gününü başlatmalısınız.
                </p>
                <div className="success-actions mt-4">
                  <button
                    type="button"
                    className="outline-action"
                    onClick={() => setDayBlockedPromptOpen(false)}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="solid-action flex items-center justify-center gap-1.5"
                    onClick={() => {
                      setDayBlockedPromptOpen(false)
                      handleOpenDayModalTrigger()
                    }}
                  >
                    <Sun size={15} />
                    <span>Günü Aç</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        <AdisyonModal cart={cart} discountRate={discountRate} isOpen={isAdisyonOpen} note={note} customerName={customerName} onClose={() => setIsAdisyonOpen(false)} orderNumber={orderNumber} totals={totals} />
        <ProductManager
          isOpen={isProductsOpen}
          initialEditId={editProductId}
          onClose={() => {
            setIsProductsOpen(false)
            setEditProductId(null)
          }}
          products={menuProducts}
          onSave={(product, imageFile) => {
            let localImageUrl = product.image_url
            if (imageFile) {
              localImageUrl = URL.createObjectURL(imageFile)
            }

            const productToSave: Product = {
              ...product,
              image_url: localImageUrl,
            }

            setMenuProducts((current) => {
              const existingIndex = current.findIndex((item) => item.id === productToSave.id)
              if (existingIndex >= 0) {
                const copy = [...current]
                copy[existingIndex] = productToSave
                return copy
              }
              return [...current, productToSave]
            })

            apiSaveProduct(product, imageFile)
              .then(savedProduct => {
                if (savedProduct && savedProduct.id) {
                  setMenuProducts((current) => current.map((item) => {
                    if (item.id === productToSave.id) {
                      return {
                        ...item,
                        id: savedProduct.id,
                        image_url: savedProduct.image_url || item.image_url
                      }
                    }
                    return item
                  }))
                }
              })
              .catch(err => console.warn("Backend save skipped or failed, product kept in local store:", err))
          }}
          onDelete={handleDeleteProduct}
        />
        <ProductDetailModal
          product={detailProduct}
          isOpen={!!detailProduct}
          onClose={() => setDetailProduct(null)}
          onEditProduct={handleEditProduct}
          onAddProduct={view === 'tables' && activeTableId ? addProduct : undefined}
        />
        {optionModalProduct && (
          <ProductOptionModal
            product={optionModalProduct}
            isOpen={true}
            onClose={() => setOptionModalProduct(null)}
            onConfirm={handleConfirmOption}
          />
        )}
        <TableManager
          isOpen={isTableManagerOpen}
          onClose={() => setIsTableManagerOpen(false)}
          tables={tables}
          onSave={(table) => setTables((current) => {
            const existing = current.some((t) => t.id === table.id)
            return existing 
              ? current.map((t) => t.id === table.id ? { ...t, name: table.name } : t)
              : [...current, { ...table, status: 'empty', cart: [], discountRate: 0, note: '' }]
          })}
          onDelete={(id) => {
            setTables((current) => current.filter((t) => t.id !== id))
            if (activeTableId === id) {
              handleViewChange('tables')
            }
          }}
        />
        <LogoSettingsModal
          isOpen={isLogoSettingsOpen}
          onClose={() => setIsLogoSettingsOpen(false)}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={setSettings}
          currentSession={session}
          onOpenProducts={handleOpenProductsTrigger}
          onOpenTableManager={handleOpenTableManagerTrigger}
          onOpenLogoSettings={handleOpenLogoSettingsTrigger}
          onResetData={handleResetData}
        />

        <AdminExitModal
          isOpen={isAdminExitOpen}
          onClose={() => setIsAdminExitOpen(false)}
          currentSession={session}
        />

        {/* Hareketsizlik Zaman Aşımı Geri Sayım Uyarısı */}
        {timeoutWarningSeconds !== null && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="timeout-dialog-title"
          >
            <div className="bg-[#FFFDF9] dark:bg-stone-900 border border-[#E6DCCF] dark:border-stone-800 rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <Clock className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 id="timeout-dialog-title" className="text-xl font-bold text-stone-900 dark:text-stone-100">
                  Oturum Zaman Aşımı Uyarısı
                </h3>
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  Hareketsizlik nedeniyle <span className="font-bold text-amber-600 dark:text-amber-400 text-base">{timeoutWarningSeconds}</span> saniye içinde oturumunuz otomatik olarak kapatılacaktır.
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Çalışmaya devam etmek için butona dokunun veya fareyi hareket ettirin.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    touchSession()
                    setTimeoutWarningSeconds(null)
                  }}
                  className="w-full py-3.5 px-4 bg-[#8C7A6B] hover:bg-[#786658] text-white font-semibold rounded-xl shadow-md transition-all active:scale-98 text-base flex items-center justify-center gap-2 cursor-pointer"
                >
                  Oturumu Açık Tut
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
  )
}

export default App
