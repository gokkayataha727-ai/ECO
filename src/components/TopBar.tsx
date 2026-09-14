import { BarChart3, CircleHelp, MapPin, Settings, Image as ImageIcon, Monitor, Power, Minus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppLogo } from './AppLogo'
import { openCustomerDisplay, isElectronEnvironment, quitApp, minimizeApp } from '../lib/api'
import type { AppSettings } from '../types'

interface TopBarProps {
  view: 'home' | 'tables' | 'pos'
  onViewChange: (view: 'home' | 'tables' | 'pos') => void
  onOpenSummary: () => void
  onOpenHelp: () => void
  onOpenProducts: () => void
  onOpenLogoSettings?: () => void
  onOpenSettings?: () => void
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
  settings,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const storeName = settings?.storeName || 'ECO COFFEE'
  const storeSub = settings?.storeSub || 'Kahvenin iyi hali'
  const cashierName = settings?.cashierName || 'ECO'
  const location = settings?.location || 'Eco Coffee · Nurdağı'

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
        <div className="status-pill hidden sm:inline-flex"><span className="live-dot" /> Vardiya Açık</div>
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

