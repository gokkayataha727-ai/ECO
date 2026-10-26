import {
  TrendingUp,
  ShoppingBag,
  Users,
  ArrowRight,
  CreditCard,
  LayoutGrid,
  Package,
  Coffee,
  MapPin,
  Clock,
  Sun,
  Moon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppLogo } from './AppLogo'
import { useHomeStats } from '../hooks/useHomeStats'
import { formatCurrency, paymentMethodLabel } from '../lib/format'
import type { AppSettings, BusinessDay, CompletedOrder, Table } from '../types'

interface HomePageProps {
  completedOrders: CompletedOrder[]
  tables: Table[]
  openBusinessDay?: BusinessDay | null
  onOpenDayModal?: () => void
  onCloseDayModal?: () => void
  onViewChange: (view: 'tables' | 'pos' | 'home') => void
  onOpenSummary: () => void
  onOpenProducts: () => void
  settings?: AppSettings
}

const formatDateTime = (date: Date) => {
  const dateText = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date)
  const timeText = new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `${dateText.charAt(0).toLocaleUpperCase('tr-TR')}${dateText.slice(1)} · ${timeText}`
}

const formatTimeAgo = (dateStr: string) => {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMin = Math.round((now - then) / 60000)
  if (diffMin < 1) return 'Az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} saat önce`
  return `${Math.floor(diffHr / 24)} gün önce`
}

export function HomePage({
  completedOrders,
  tables,
  openBusinessDay,
  onOpenDayModal,
  onCloseDayModal,
  onViewChange,
  onOpenSummary,
  onOpenProducts,
  settings,
}: HomePageProps) {
  const stats = useHomeStats(completedOrders, tables, openBusinessDay?.id)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const recentOrders = completedOrders.filter((o) => !o.cancelled).slice(0, 5)

  const kpis = [
    {
      icon: TrendingUp,
      value: stats.todayRevenueFormatted,
      label: 'Bugünkü Ciro',
      color: 'kpi-green',
    },
    {
      icon: ShoppingBag,
      value: String(stats.todayOrderCount),
      label: 'Sipariş Adedi',
      color: 'kpi-blue',
    },
    {
      icon: Users,
      value: `${stats.occupiedTableCount} / ${stats.totalTableCount}`,
      label: 'Dolu Masa',
      color: 'kpi-rose',
    },
  ]

  const quickCards = [
    {
      icon: CreditCard,
      title: 'Kasa',
      desc: 'Masa seç, sipariş al',
      action: () => onViewChange('tables'),
    },
    {
      icon: LayoutGrid,
      title: 'Masalar',
      desc: 'Masa durumlarını gör',
      action: () => onViewChange('tables'),
    },
    {
      icon: Package,
      title: 'Ürün Yönetimi',
      desc: 'Menüyü düzenle',
      action: () => onOpenProducts(),
    },
  ]

  return (
    <div className="home-container">
      {/* ── Welcome Card ── */}
      <div className="welcome-card surface" style={{ animationDelay: '0s' }}>
        <div className="welcome-left">
          <div className="welcome-logo">
            <AppLogo className="w-24 h-24 object-contain" />
          </div>
          <div className="welcome-info">
            <h1 className="welcome-title">
              Hoş geldin, <span>{settings?.cashierName || 'LEMOON'}</span>
            </h1>
            <div className="welcome-meta">
              <span className="welcome-location">
                <MapPin size={13} />
                {settings?.location || 'LEMOON KAFE · SIMAV'}
              </span>
              <span className="welcome-date">
                <Clock size={13} />
                {formatDateTime(now)}
              </span>
            </div>
          </div>
        </div>
        <div className="welcome-right flex items-center gap-2">
          {openBusinessDay ? (
            <>
              <div className="status-pill">
                <span className="live-dot" /> Gün Açık
              </div>
              {onCloseDayModal && (
                <button
                  type="button"
                  onClick={onCloseDayModal}
                  className="px-3 py-1.5 rounded-full text-[11px] font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-1 transition-colors"
                >
                  <Moon size={12} />
                  <span>Günü Kapat</span>
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenDayModal}
              className="status-pill status-pill--closed inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="live-dot live-dot--closed" /> Gün Kapalı · Günü Aç
              <Sun size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Report ── */}
      <div className="home-report surface" style={{ animationDelay: '.06s' }}>
        <div className="report-head">
          <div>
            <p className="section-kicker">İstatistikler</p>
            <h2 className="report-title">Bugünün Özeti</h2>
          </div>
          <button
            type="button"
            className="report-link"
            onClick={onOpenSummary}
          >
            Detaylı Rapor <ArrowRight size={14} />
          </button>
        </div>

        <div className="kpi-grid">
          {kpis.map((kpi) => (
            <div className="kpi-card" key={kpi.label}>
              <div className={`kpi-icon ${kpi.color}`}>
                <kpi.icon size={20} />
              </div>
              <div className="kpi-value">{kpi.value}</div>
              <div className="kpi-label">{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Access ── */}
      <div className="quick-grid" style={{ animationDelay: '.12s' }}>
        {quickCards.map((card) => (
          <button
            key={card.title}
            type="button"
            className="quick-card surface"
            onClick={card.action}
          >
            <div className="quick-card-icon">
              <card.icon size={26} />
            </div>
            <div className="quick-card-text">
              <strong>{card.title}</strong>
              <span>{card.desc}</span>
            </div>
            <ArrowRight size={18} className="quick-card-arrow" />
          </button>
        ))}
      </div>

      {/* ── Recent Orders ── */}
      {recentOrders.length > 0 && (
        <div
          className="home-recent surface"
          style={{ animationDelay: '.18s' }}
        >
          <div className="report-head">
            <div>
              <p className="section-kicker">Son İşlemler</p>
              <h2 className="report-title">Son Siparişler</h2>
            </div>
            <button
              type="button"
              className="report-link"
              onClick={onOpenSummary}
            >
              Tüm İşlemler <ArrowRight size={14} />
            </button>
          </div>

          <div className="recent-list">
            {recentOrders.map((order) => (
              <div className="recent-item" key={order.id}>
                <div className="recent-item-left">
                  <div className="recent-icon">
                    <Coffee size={16} />
                  </div>
                  <div>
                    <div className="recent-order-no">{order.orderNumber}</div>
                    <div className="recent-time">
                      {formatTimeAgo(order.date)} ·{' '}
                      {paymentMethodLabel(order.paymentMethod)}
                    </div>
                  </div>
                </div>
                <div className="recent-amount">
                  {formatCurrency(order.totals.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
