import { BarChart3, CircleHelp, MapPin, Settings, Image as ImageIcon, Monitor, Power, Minus, ChevronDown, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppLogo } from './AppLogo'
import { openCustomerDisplay, isElectronEnvironment, quitApp, minimizeApp } from '../lib/api'
import { formatCurrency } from '../lib/format'
import type { AppSettings, BusinessDay } from '../types'

interface TopBarProps {
  view: 'home' | 'tables' | 'pos'
  onViewChange: (view: 'home' | 'tables' | 'pos') => void
  onOpenSummary: () => void
  onOpenHelp: () => void
  onOpenProducts: () => void
  onOpenLogoSettings?: () => void
  onOpenSettings?: () => void
  onOpenDayModal?: () => void
  onCloseDayModal?: () => void
  openBusinessDay?: BusinessDay | null
  settings?: AppSettings
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
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date())
  const [dayMenuOpen, setDayMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const badgeRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

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

  const openedTimeText = openBusinessDay
    ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(openBusinessDay.openedAt),
      )
    : null

  return (
    <header className="topbar flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
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
        <div>
          <div className="brand-name">{storeName}</div>
          <div className="brand-sub">{storeSub}</div>
        </div>
        <div className="welcome-copy ml-4 hidden items-center gap-2 border-l border-stone-200 dark:border-stone-800 pl-4 lg:flex">
          <span className="avatar">{cashierName.charAt(0).toUpperCase()}</span>
          <div>
            <div className="text-[12px] font-extrabold text-stone-800 dark:text-stone-200">Merhaba, {cashierName}</div>
            <span className="role-pill">Kasiyer</span>
          </div>
        </div>
      </div>

      <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
        <button
          onClick={() => onViewChange('home')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
            view === 'home' 
              ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Ana Sayfa
        </button>
        <button
          onClick={() => onViewChange('tables')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
            view === 'tables' 
              ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Masalar
        </button>
        <button
          onClick={() => onViewChange('pos')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
            view === 'pos' 
              ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm' 
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          Ürünler
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="clock-info hidden text-right xl:block">
          <div className="text-[12px] font-bold text-stone-700 dark:text-stone-300">{formatDateTime(now)}</div>
          <div className="location-info mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-stone-400 dark:text-stone-500"><MapPin size={11} /> {location}</div>
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
              <ChevronDown size={13} className="opacity-70" />
            </button>

            {dayMenuOpen && menuPos && typeof document !== 'undefined' && createPortal(
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
              </div>,
              document.body,
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenDayModal}
            title="İş gününü başlatmak için tıklayın"
            className="status-pill status-pill--closed inline-flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <span className="live-dot live-dot--closed" />
            <span>Gün Kapalı</span>
            <Sun size={12} className="ml-0.5 opacity-80" />
          </button>
        )}
        <button type="button" className="header-icon" onClick={onOpenSummary} aria-label="Gün özetini aç"><BarChart3 size={18} /></button>
        <button type="button" className="header-icon hidden sm:grid" onClick={onOpenHelp} aria-label="Klavye kısayollarını göster"><CircleHelp size={18} /></button>
        <button type="button" className="header-icon hidden md:grid" onClick={onOpenLogoSettings} title="Logo Ayarları"><ImageIcon size={18} /></button>
        {isElectronEnvironment() && (
          <>
            <button type="button" className="header-icon hidden md:grid" onClick={() => openCustomerDisplay()} title="Müşteri Ekranı" aria-label="Müşteri ekranını aç"><Monitor size={18} /></button>
            <button type="button" className="header-icon hidden md:grid hover:bg-amber-500/10 hover:text-amber-600" onClick={() => minimizeApp()} title="Küçült" aria-label="Simge durumuna küçült"><Minus size={18} /></button>
            <button type="button" className="header-icon hidden md:grid hover:bg-rose-500/10 hover:text-rose-600" onClick={() => quitApp()} title="Uygulamadan Çık" aria-label="Uygulamadan çık"><Power size={18} /></button>
          </>
        )}
        <button type="button" className="header-icon hidden md:grid" onClick={onOpenSettings} title="Sistem Ayarları" aria-label="Sistem ayarlarını aç"><Settings size={18} /></button>
      </div>
    </header>
  )
}

