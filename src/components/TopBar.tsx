import { BarChart3, CircleHelp, MapPin, Settings, Image as ImageIcon, Monitor, Power, ChevronDown, Moon, Sun, LogOut } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppLogo } from './AppLogo'
import { openCustomerDisplay, isElectronEnvironment } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { can } from '../lib/permissions'
import type { AppSettings, BusinessDay, Session } from '../types'

interface TopBarProps {
  view: 'home' | 'tables' | 'pos' | 'logs'
  onViewChange: (view: 'home' | 'tables' | 'pos' | 'logs') => void
  onOpenSummary: () => void
  onOpenHelp: () => void
  onOpenProducts: () => void
  onOpenLogoSettings?: () => void
  onOpenSettings?: () => void
  onOpenDayModal?: () => void
  onCloseDayModal?: () => void
  openBusinessDay?: BusinessDay | null
  settings?: AppSettings
  currentSession?: Session | null
  onLogout?: () => void
  onRequestAdminExit?: () => void
}

const formatDateTime = (date: Date) => {
  const dateText = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date)
  const timeText = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(date)
  return `${dateText.charAt(0).toLocaleUpperCase('tr-TR')}${dateText.slice(1)} · ${timeText}`
}

export function TopBar({
  view,
  onViewChange,
  onOpenSummary,
  onOpenHelp,
  onOpenLogoSettings,
  onOpenSettings,
  onOpenDayModal,
  onCloseDayModal,
  openBusinessDay,
  settings,
  currentSession,
  onLogout,
  onRequestAdminExit,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date())
  const [dayMenuOpen, setDayMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const badgeRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const updateMenuPosition = useCallback(() => {
    if (!badgeRef.current) return
    const rect = badgeRef.current.getBoundingClientRect()
    const menuWidth = 224 // w-56 is 14rem = 224px
    const padding = 8
    const top = rect.bottom + 6

    let right = window.innerWidth - rect.right
    if (window.innerWidth - right - menuWidth < padding) {
      right = window.innerWidth - menuWidth - padding
    }
    right = Math.max(padding, right)

    setMenuPos({ top, right })
  }, [])

  // Close when view changes (navigation between tabs)
  const [prevView, setPrevView] = useState(view)
  if (prevView !== view) {
    setPrevView(view)
    if (dayMenuOpen) {
      setDayMenuOpen(false)
    }
  }

  // Close if business day is closed
  const [prevOpenBusinessDay, setPrevOpenBusinessDay] = useState(openBusinessDay)
  if (prevOpenBusinessDay !== openBusinessDay) {
    setPrevOpenBusinessDay(openBusinessDay)
    if (!openBusinessDay && dayMenuOpen) {
      setDayMenuOpen(false)
    }
  }

  // Handle outside click, escape key, and close on scroll / resize
  useEffect(() => {
    if (!dayMenuOpen) return

    updateMenuPosition()

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (badgeRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setDayMenuOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setDayMenuOpen(false)
        badgeRef.current?.focus()
      }
    }

    const handleScrollOrResize = () => {
      setDayMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [dayMenuOpen, updateMenuPosition])

  const storeName = settings?.storeName || 'LEMOON KAFE'
  const storeSub = settings?.storeSub || 'Kahvenin iyi hali'
  const cashierName = settings?.cashierName || 'LEMOON'
  const location = settings?.location || 'LEMOON KAFE · SIMAV'

  const displayName = currentSession?.fullName || cashierName
  const userRole = currentSession?.role || (settings?.currentUserRole === 'cashier' ? 'waiter' : settings?.currentUserRole || 'admin')
  const roleLabel = userRole === 'admin' ? 'Yönetici' : 'Garson'

  const [, setPermTick] = useState(0)
  useEffect(() => {
    const handlePermUpdate = () => setPermTick((t) => t + 1)
    window.addEventListener('permissions-updated', handlePermUpdate)
    return () => window.removeEventListener('permissions-updated', handlePermUpdate)
  }, [])

  const canViewLogs = can(currentSession, 'view_logs', settings)
  const canViewReports = can(currentSession, 'reports_view_general', settings) || can(currentSession, 'reports_view_own', settings)
  const canManageSettings = can(currentSession, 'manage_settings', settings)
  const canOpenDay = can(currentSession, 'day_open', settings)
  const canCloseDay = can(currentSession, 'day_close', settings)
  const canManageDay = canOpenDay || canCloseDay

  const openedTimeText = openBusinessDay
    ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(openBusinessDay.openedAt),
      )
    : null

  return (
    <header className="topbar flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {canManageSettings ? (
          <button
            type="button"
            onClick={onOpenLogoSettings}
            title="Logoyu Değiştir / Yükle"
            className="brand-mark group relative cursor-pointer hover:ring-2 hover:ring-amber-500 rounded-xl transition-all p-0.5"
          >
            <AppLogo className="w-10 h-10 object-contain" />
            <span className="absolute -bottom-1 -right-1 bg-stone-800 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ImageIcon size={10} />
            </span>
          </button>
        ) : (
          <div className="brand-mark p-0.5 select-none" onClick={handleSecretBrandTap}>
            <AppLogo className="w-10 h-10 object-contain" />
          </div>
        )}
        <div className="select-none" onClick={handleSecretBrandTap}>
          <div className="brand-name">{storeName}</div>
          <div className="brand-sub">{storeSub}</div>
        </div>
        <div className="welcome-copy ml-4 hidden items-center gap-3 border-l border-stone-200 dark:border-stone-800 pl-4 lg:flex">
          <span className="avatar">{displayName.charAt(0).toUpperCase()}</span>
          <div>
            <div className="text-sm font-black text-stone-900 dark:text-stone-100">Merhaba, {displayName}</div>
            <span className={`role-pill ${userRole === 'admin' ? 'role-pill--admin' : ''}`}>
              {roleLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
        <button
          onClick={() => onViewChange('home')}
          className={`px-4 sm:px-5 py-2 rounded-lg text-base font-extrabold transition-colors ${
            view === 'home' 
              ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Ana Sayfa
        </button>
        <button
          onClick={() => onViewChange('tables')}
          className={`px-4 sm:px-5 py-2 rounded-lg text-base font-extrabold transition-colors ${
            view === 'tables' 
              ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Masalar
        </button>
        <button
          onClick={() => onViewChange('pos')}
          className={`px-4 sm:px-5 py-2 rounded-lg text-base font-extrabold transition-colors ${
            view === 'pos' 
              ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Ürünler
        </button>
        {canViewLogs && (
          <button
            onClick={() => onViewChange('logs')}
            className={`px-4 sm:px-5 py-2 rounded-lg text-base font-extrabold transition-colors ${
              view === 'logs' 
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
            }`}
          >
            İşlem Logu
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="clock-info hidden text-right xl:block">
          <div className="text-sm font-extrabold text-stone-800 dark:text-stone-200">{formatDateTime(now)}</div>
          <div className="location-info mt-1 flex items-center justify-end gap-1 text-xs font-bold text-stone-500 dark:text-stone-400"><MapPin size={12} /> {location}</div>
        </div>
        {openBusinessDay ? (
          <div>
            <button
              ref={badgeRef}
              type="button"
              onClick={() => {
                if (!dayMenuOpen) {
                  updateMenuPosition()
                  setDayMenuOpen(true)
                } else {
                  setDayMenuOpen(false)
                }
              }}
              aria-haspopup="menu"
              aria-expanded={dayMenuOpen}
              aria-controls={dayMenuOpen ? 'active-business-day-menu' : undefined}
              title={`Gün Açık · Açılış: ${openedTimeText} (${openBusinessDay.openedBy})`}
              className="status-pill inline-flex items-center gap-1.5 cursor-pointer hover:brightness-95 transition-all"
            >
              <span className="live-dot" />
              <span>Gün Açık</span>
              {openedTimeText && (
                <span className="text-[10px] font-semibold opacity-75">· {openedTimeText}</span>
              )}
              {canManageDay && <ChevronDown size={13} className="opacity-70" />}
            </button>

            {dayMenuOpen && menuPos && canManageDay && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                id="active-business-day-menu"
                role="menu"
                aria-label="Aktif İş Günü Menüsü"
                className="day-status-menu fixed w-56 rounded-2xl bg-white dark:bg-stone-900 border border-[#dfd5cc] dark:border-stone-700 shadow-xl py-2 z-40 text-xs"
                style={{
                  top: `${menuPos.top}px`,
                  right: `${menuPos.right}px`,
                }}
              >
                <div className="px-3.5 py-2 border-b border-[#f0e8e0] dark:border-stone-800">
                  <div className="font-extrabold text-[#3b291f] dark:text-stone-100">
                    Aktif İş Günü
                  </div>
                  <div className="text-[11px] text-[#8a6d57] font-semibold mt-0.5">
                    Açılış: {openedTimeText} · {openBusinessDay.openedBy}
                  </div>
                  <div className="text-[11px] text-[#6d5a4e] dark:text-stone-400 font-semibold mt-0.5">
                    Açılış Nakiti: {formatCurrency(openBusinessDay.openingCash)}
                  </div>
                  {typeof openBusinessDay.cardCarryIn === 'number' && openBusinessDay.cardCarryIn > 0 && (
                    <div className="text-[11px] text-[#8a6d57] dark:text-amber-400 font-semibold mt-0.5">
                      Kart Devir: {formatCurrency(openBusinessDay.cardCarryIn)}
                    </div>
                  )}
                </div>
                {canViewReports && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDayMenuOpen(false)
                      onOpenSummary()
                    }}
                    className="w-full text-left px-3.5 py-2.5 font-bold text-[#3b291f] dark:text-stone-200 hover:bg-[#f4ebe3] dark:hover:bg-stone-800 flex items-center gap-2 transition-colors focus:outline-none focus:bg-[#f4ebe3] dark:focus:bg-stone-800"
                  >
                    <BarChart3 size={15} className="text-[#8a6d57]" />
                    <span>Gün Özeti</span>
                  </button>
                )}
                {canCloseDay && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDayMenuOpen(false)
                      onCloseDayModal?.()
                    }}
                    className="w-full text-left px-3.5 py-2.5 font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors focus:outline-none focus:bg-rose-50 dark:focus:bg-rose-950/40"
                  >
                    <Moon size={15} />
                    <span>Günü Kapat</span>
                  </button>
                )}
              </div>,
              document.body,
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={canOpenDay ? onOpenDayModal : undefined}
            title={canOpenDay ? 'İş gününü başlatmak için tıklayın' : 'İş günü kapalı (Açma yetkiniz yok)'}
            className={`status-pill status-pill--closed inline-flex items-center gap-1.5 transition-all ${
              canOpenDay ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <span className="live-dot live-dot--closed" />
            <span>Gün Kapalı</span>
            {canOpenDay && <Sun size={12} className="ml-0.5 opacity-80" />}
          </button>
        )}
        {canViewReports && (
          <button type="button" className="header-icon" onClick={onOpenSummary} title="Gün Özeti ve Raporlar" aria-label="Gün özetini aç"><BarChart3 size={18} /></button>
        )}
        <button type="button" className="header-icon hidden sm:grid" onClick={onOpenHelp} title="Klavye Kısayolları" aria-label="Klavye kısayollarını göster"><CircleHelp size={18} /></button>
        {canManageSettings && (
          <button type="button" className="header-icon hidden md:grid" onClick={onOpenLogoSettings} title="Logo Ayarları"><ImageIcon size={18} /></button>
        )}
        {isElectronEnvironment() && (
          <>
            <button type="button" className="header-icon hidden md:grid" onClick={() => openCustomerDisplay()} title="Müşteri Ekranı" aria-label="Müşteri ekranını aç"><Monitor size={18} /></button>
            {userRole === 'admin' && onRequestAdminExit && (
              <button
                type="button"
                className="header-icon hidden md:grid hover:bg-rose-500/10 hover:text-rose-600"
                onClick={onRequestAdminExit}
                title="Uygulamadan Çık (Yönetici Şifresi Gerektirir)"
                aria-label="Uygulamadan çık"
              >
                <Power size={18} />
              </button>
            )}
          </>
        )}
        {canManageSettings && (
          <button type="button" className="header-icon hidden md:grid" onClick={onOpenSettings} title="Sistem Ayarları" aria-label="Sistem ayarlarını aç"><Settings size={18} /></button>
        )}
        {currentSession && (
          <div className="flex items-center gap-2 pl-2 border-l border-stone-200 dark:border-stone-800">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-black text-stone-900 dark:text-stone-100 leading-tight">
                {currentSession.fullName}
              </span>
              <span className="text-xs font-extrabold text-amber-800 dark:text-amber-400">
                {currentSession.role === 'admin' ? 'Yönetici' : 'Garson'}
              </span>
            </div>
            {onLogout && (
              <button
                type="button"
                className="header-icon text-rose-700 dark:text-rose-400 hover:bg-rose-100/60 dark:hover:bg-rose-950/50 hover:text-rose-800 transition-colors"
                onClick={onLogout}
                title={`Oturumu Kapat (${currentSession.fullName} · ${currentSession.role === 'admin' ? 'Yönetici' : 'Garson'})`}
                aria-label="Çıkış yap"
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

