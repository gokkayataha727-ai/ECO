import React, { useState, useMemo } from 'react'
import {
  AlertCircle,
  ArrowDownUp,
  Ban,
  Banknote,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  FileDown,
  FileText,
  Landmark,
  Layers,
  Lock,
  Moon,
  Package,
  Percent,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  Sun,
  Trash2,
  TrendingUp,
  User,
  Wallet,
  X,
} from 'lucide-react'
import {
  buildReportFromOrders,
  formatDayShortLabel,
  getReportForBusinessDay,
} from '../lib/businessDay'
import { formatCurrency, roundCurrency } from '../lib/format'
import type {
  AppSettings,
  BusinessDay,
  CompletedOrder,
  Table,
} from '../types'
import { ZReportPrintView } from './ZReportPrintView'
import { ReceiptsTable } from './reports/ReceiptsTable'

type FilterMode = 'day' | 'today' | 'yesterday' | 'last7' | 'custom'
type ProductSortField = 'quantity' | 'revenue'
type SortDirection = 'asc' | 'desc'

interface ReportsModalProps {
  isOpen: boolean
  onClose: () => void
  completedOrders?: CompletedOrder[]
  businessDays?: BusinessDay[]
  openBusinessDay?: BusinessDay | null
  initialSelectedDayId?: string | null
  tables?: Table[]
  settings?: AppSettings
  onClearReports?: () => void
  onOpenDayModal?: () => void
  onCloseDayModal?: () => void
}

const LEGACY_DAY_ID = '__legacy__'

export function ReportsModal({
  isOpen,
  onClose,
  completedOrders = [],
  businessDays = [],
  openBusinessDay = null,
  initialSelectedDayId = null,
  tables = [],
  settings,
  onClearReports,
  onOpenDayModal,
  onCloseDayModal,
}: ReportsModalProps) {
  const sortedDays = useMemo(
    () =>
      [...businessDays].sort(
        (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
      ),
    [businessDays],
  )

  const legacyOrders = useMemo(
    () => completedOrders.filter((o) => !o.businessDayId),
    [completedOrders],
  )

  const defaultDayId = useMemo(() => {
    if (initialSelectedDayId) return initialSelectedDayId
    if (openBusinessDay) return openBusinessDay.id
    if (sortedDays.length > 0) return sortedDays[0].id
    if (legacyOrders.length > 0) return LEGACY_DAY_ID
    return ''
  }, [initialSelectedDayId, openBusinessDay, sortedDays, legacyOrders.length])

  const [filterMode, setFilterMode] = useState<FilterMode>('day')
  const [userSelectedDayId, setUserSelectedDayId] = useState<string | null>(null)
  const selectedDayId = initialSelectedDayId || userSelectedDayId || defaultDayId
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [customEnd, setCustomEnd] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  )

  const [productSearch, setProductSearch] = useState('')
  const [sortField, setSortField] = useState<ProductSortField>('quantity')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [receiptPage, setReceiptPage] = useState(1)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [printMode, setPrintMode] = useState<'receipt' | 'a4'>('a4')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const selectedBusinessDay = useMemo(() => {
    if (filterMode !== 'day' || !selectedDayId || selectedDayId === LEGACY_DAY_ID) {
      return null
    }
    return businessDays.find((d) => d.id === selectedDayId) || null
  }, [filterMode, selectedDayId, businessDays])

  const taxRate = settings?.taxRate ?? 10

  // Determine orders and report snapshot for the current filter
  const { activeReport, filteredOrders, periodTitle } = useMemo(() => {
    if (filterMode === 'day') {
      if (selectedDayId === LEGACY_DAY_ID) {
        const rep = buildReportFromOrders(legacyOrders, taxRate)
        return {
          activeReport: rep,
          filteredOrders: legacyOrders,
          periodTitle: 'Gün Dışı / Eski Kayıtlar',
        }
      }
      if (selectedBusinessDay) {
        const dayOrders = completedOrders.filter(
          (o) => o.businessDayId === selectedBusinessDay.id,
        )
        const rep = getReportForBusinessDay(
          selectedBusinessDay,
          completedOrders,
          taxRate,
          tables,
        )
        return {
          activeReport: rep,
          filteredOrders: dayOrders,
          periodTitle: formatDayShortLabel(selectedBusinessDay),
        }
      }
      const emptyRep = buildReportFromOrders([], taxRate)
      return {
        activeReport: emptyRep,
        filteredOrders: [],
        periodTitle: 'Seçili Gün Yok',
      }
    }

    const now = new Date()
    let start: Date
    let end: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    let label = ''

    if (filterMode === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      label = 'Bugün'
    } else if (filterMode === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      label = 'Dün'
    } else if (filterMode === 'last7') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
      label = 'Son 7 Gün'
    } else {
      start = customStart
        ? new Date(`${customStart}T00:00:00`)
        : new Date(now.getTime() - 7 * 86400000)
      end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : end
      label = `${customStart || '—'} / ${customEnd || '—'}`
    }

    const rangeOrders = completedOrders.filter((o) => {
      const d = new Date(o.date)
      return d >= start && d <= end
    })

    return {
      activeReport: buildReportFromOrders(rangeOrders, taxRate),
      filteredOrders: rangeOrders,
      periodTitle: label,
    }
  }, [
    filterMode,
    selectedDayId,
    selectedBusinessDay,
    legacyOrders,
    completedOrders,
    taxRate,
    tables,
    customStart,
    customEnd,
  ])

  const handleDownloadPdf = () => {
    setPrintMode('a4')

    const safeDate = new Date().toISOString().slice(0, 10)
    const sanitizedPeriod = (periodTitle || 'Z_Raporu')
      .replace(/[^\w\s\u00C0-\u017F-]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
    const pdfTitle = `LEMOON_KAFE_Z_Raporu_${sanitizedPeriod}_${safeDate}`
    const prevTitle = document.title
    document.title = pdfTitle

    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.title = prevTitle
      }, 1000)
    }, 50)
  }

  const filteredAndSortedProducts = useMemo(() => {
    const q = productSearch.trim().toLocaleLowerCase('tr-TR')
    const base = q
      ? activeReport.soldProducts.filter(
          (p) =>
            p.name.toLocaleLowerCase('tr-TR').includes(q) ||
            p.category.toLocaleLowerCase('tr-TR').includes(q),
        )
      : [...activeReport.soldProducts]

    base.sort((a, b) => {
      const primary =
        sortField === 'quantity' ? a.quantity - b.quantity : a.revenue - b.revenue
      const secondary =
        sortField === 'quantity' ? a.revenue - b.revenue : a.quantity - b.quantity
      const result = primary !== 0 ? primary : secondary
      return sortDir === 'desc' ? -result : result
    })

    return base
  }, [activeReport.soldProducts, productSearch, sortField, sortDir])

  const handleSortClick = (field: ProductSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const toggleProductExpand = (productKey: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productKey)) next.delete(productKey)
      else next.add(productKey)
      return next
    })
  }

  const receiptsData = useMemo(() => {
    const validOrders = filteredOrders.filter((o) => !o.cancelled)
    const formatted = validOrders
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((o) => ({
        id: o.id,
        created_at: o.date,
        total_amount: o.totals.total,
        payment_type:
          o.paymentMethod === 'cash'
            ? 'Nakit'
            : o.paymentMethod === 'iban'
              ? 'IBAN'
              : o.paymentMethod === 'mixed'
                ? 'Karışık Ödeme'
                : 'Kredi Kartı',
        cashier: o.cashier || 'Kasiyer',
        customerName: o.customerName,
        orderNumber: o.orderNumber,
        status: 'completed',
        items: o.items.map((i) => ({
          id: i.cartItemId || i.id,
          product: { name: i.name, category: i.category },
          quantity: i.quantity,
          unit_price: i.price,
          line_total: i.price * i.quantity,
        })),
      }))

    const itemsPerPage = 20
    return {
      items: formatted.slice(
        (receiptPage - 1) * itemsPerPage,
        receiptPage * itemsPerPage,
      ),
      total: formatted.length,
      page: receiptPage,
    }
  }, [filteredOrders, receiptPage])

  if (!isOpen) return null

  const paymentMethodsList = [
    {
      key: 'card',
      label: 'Kredi Kartı',
      icon: CreditCard,
      amount: activeReport.paymentDistribution.card,
      color: 'bg-indigo-600',
      badgeBg: 'bg-indigo-50 text-indigo-700',
    },
    {
      key: 'cash',
      label: 'Nakit',
      icon: Banknote,
      amount: activeReport.paymentDistribution.cash,
      color: 'bg-emerald-600',
      badgeBg: 'bg-emerald-50 text-emerald-700',
    },
    {
      key: 'iban',
      label: 'IBAN / Havale',
      icon: Landmark,
      amount: activeReport.paymentDistribution.iban,
      color: 'bg-amber-600',
      badgeBg: 'bg-amber-50 text-amber-800',
    },
  ]

  const maxHourlyRevenue = Math.max(
    ...activeReport.hourlySales.map((h) => h.revenue),
    1,
  )

  return (
    <div
      className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Raporlar ve Gün Sonu Özeti"
    >
      <div className="bg-[#f8f6f2] w-full max-w-7xl max-h-[92vh] h-full rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#dfd5cc]">
        {/* Top Header */}
        <div className="bg-white px-5 sm:px-7 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ddd4] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#f4ebe3] rounded-xl text-[#8a6d57]">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[#3b291f]">
                Raporlar & Gün Sonu (Z Raporu)
              </h2>
              <p className="text-xs font-semibold text-[#8c7a6e]">
                Gün bazlı satışlar, ürün kırılımı, ödeme dağılımı ve kasa mutabakatı
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {onClearReports && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-400 text-xs font-extrabold flex items-center gap-1.5 transition-colors"
                title="Geçmiş rapor, satış ve deneme masa verilerini temizle"
              >
                <Trash2 size={15} />
                <span>Raporu Temizle</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 rounded-xl border border-[#dfd5cc] bg-[#fcfaf7] hover:bg-[#f4ebe3] text-[#5c493d] text-xs font-extrabold flex items-center gap-1.5 transition-colors"
              title="Z Raporunu ve satış özetini A4 PDF olarak kaydet / indir"
            >
              <FileDown size={15} />
              <span>PDF Olarak İndir</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPrintPreview((v) => !v)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors ${
                showPrintPreview
                  ? 'bg-[#8a6d57] text-white'
                  : 'bg-[#3b2b21] hover:bg-[#5c493d] text-white'
              }`}
            >
              <Printer size={15} />
              <span>{showPrintPreview ? 'Rapora Dön' : 'Yazdır / Z Raporu'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-stone-100 rounded-xl transition-colors text-stone-500"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar: Business Day Selector & Quick Date Filters */}
        <div className="bg-[#fcfaf7] px-5 sm:px-7 py-3.5 border-b border-[#e6ddd4] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar size={15} className="text-[#8a6d57]" />
              <span className="text-xs font-extrabold text-[#5c493d]">İnceleme Dönemi:</span>
            </div>

            <select
              aria-label="İş günü seçin"
              value={filterMode === 'day' ? selectedDayId : '__range__'}
              onChange={(e) => {
                const val = e.target.value
                if (val !== '__range__') {
                  setFilterMode('day')
                  setUserSelectedDayId(val)
                  setReceiptPage(1)
                }
              }}
              className="px-3 py-1.5 rounded-xl border border-[#dfd5cc] bg-white text-xs font-bold text-[#3b291f] focus:outline-none focus:border-[#8a6d57]"
            >
              {sortedDays.length === 0 && legacyOrders.length === 0 && (
                <option value="">Henüz açılmış iş günü yok</option>
              )}
              {sortedDays.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDayShortLabel(d)}
                </option>
              ))}
              {legacyOrders.length > 0 && (
                <option value={LEGACY_DAY_ID}>
                  Gün Dışı / Eski Kayıtlar ({legacyOrders.length} sipariş)
                </option>
              )}
              {filterMode !== 'day' && (
                <option value="__range__">Tarih Aralığı: {periodTitle}</option>
              )}
            </select>

            <div className="flex items-center bg-[#efe8e0] p-1 rounded-xl gap-1">
              {(
                [
                  { id: 'day', label: 'İş Günü' },
                  { id: 'today', label: 'Bugün' },
                  { id: 'yesterday', label: 'Dün' },
                  { id: 'last7', label: 'Son 7 gün' },
                  { id: 'custom', label: 'Özel tarih aralığı' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilterMode(tab.id)
                    if (tab.id === 'day' && !selectedDayId && defaultDayId) {
                      setUserSelectedDayId(defaultDayId)
                    }
                    setReceiptPage(1)
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                    filterMode === tab.id
                      ? 'bg-white text-[#3b291f] shadow-xs'
                      : 'text-[#6d5a4e] hover:text-[#3b291f]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filterMode === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                aria-label="Başlangıç tarihi"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-[#dfd5cc] bg-white font-bold text-[#3b291f]"
              />
              <span className="text-[#8a6d57] font-bold">—</span>
              <input
                type="date"
                aria-label="Bitiş tarihi"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-[#dfd5cc] bg-white font-bold text-[#3b291f]"
              />
            </div>
          )}
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {/* Yazdırma ve PDF için her zaman hazır A4 Z-Raporu (ekranda gizli, baskıda görünür) */}
          {!showPrintPreview && (
            <div className="print-only">
              <ZReportPrintView
                report={activeReport}
                day={selectedBusinessDay}
                titleLabel={periodTitle}
                settings={settings}
                mode="a4"
              />
            </div>
          )}

          {showPrintPreview ? (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-[#dfd5cc] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[#3b291f]">
                    Yazdırma Önizlemesi ({periodTitle})
                  </h3>
                  <p className="text-xs text-[#8c7a6e]">
                    A4 sayfa veya 80mm termal fiş formatını seçip yazdırabilirsiniz.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-[#f4ebe3] p-1 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setPrintMode('a4')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        printMode === 'a4'
                          ? 'bg-[#8a6d57] text-white'
                          : 'text-[#5c493d]'
                      }`}
                    >
                      A4 Rapor Düzeni
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintMode('receipt')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        printMode === 'receipt'
                          ? 'bg-[#8a6d57] text-white'
                          : 'text-[#5c493d]'
                      }`}
                    >
                      80mm Termal Fiş
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 rounded-xl bg-[#3b2b21] hover:bg-[#5c493d] text-white text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Printer size={15} />
                    <span>Şimdi Yazdır</span>
                  </button>
                </div>
              </div>

              <ZReportPrintView
                report={activeReport}
                day={selectedBusinessDay}
                titleLabel={periodTitle}
                settings={settings}
                mode={printMode}
              />
            </div>
          ) : sortedDays.length === 0 &&
            legacyOrders.length === 0 &&
            filterMode === 'day' ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-[#e6ddd4] max-w-xl mx-auto my-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#f4ebe3] text-[#8a6d57] grid place-items-center mx-auto">
                <Sun size={28} />
              </div>
              <h3 className="text-lg font-extrabold text-[#3b291f]">
                Henüz Açılmış veya Kapatılmış Bir İş Günü Yok
              </h3>
              <p className="text-xs font-medium text-[#8c7a6e] leading-relaxed">
                Satışları kaydetmeye ve günlük Z raporu oluşturmaya başlamak için önce günü açın.
              </p>
              {onOpenDayModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenDayModal()
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#8a6d57] hover:bg-[#3b291f] text-white text-xs font-extrabold inline-flex items-center gap-2 transition-colors"
                >
                  <Sun size={15} />
                  <span>Günü Aç</span>
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Day Info & Cash Summary Card (when viewing a specific BusinessDay) */}
              {selectedBusinessDay && (
                <div className="bg-white rounded-2xl p-5 border border-[#e6ddd4] shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e8e0] pb-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${
                          selectedBusinessDay.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-200 text-stone-700'
                        }`}
                      >
                        {selectedBusinessDay.status === 'open' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                            Gün Açık (Canlı Rapor)
                          </>
                        ) : (
                          <>
                            <Lock size={12} />
                            Kapalı Gün · Salt Okunur Z Raporu
                          </>
                        )}
                      </span>
                      <span className="text-xs font-bold text-[#6d5a4e]">
                        {formatDayShortLabel(selectedBusinessDay)}
                      </span>
                    </div>

                    {selectedBusinessDay.status === 'open' && onCloseDayModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose()
                          onCloseDayModal()
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors"
                      >
                        <Moon size={14} />
                        <span>Günü Kapat (Gün Sonu Al)</span>
                      </button>
                    )}
                  </div>

                  {/* Day Metadata & Cash Summary Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#fcfaf7] border border-[#ebe2d9] text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-[#8a6d57] uppercase flex items-center gap-1">
                          <Clock size={11} /> Açılış Zamanı
                        </span>
                        <strong className="text-[#3b291f] font-extrabold block mt-0.5">
                          {new Date(selectedBusinessDay.openedAt).toLocaleString(
                            'tr-TR',
                            {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          )}
                        </strong>
                        <span className="text-[11px] text-[#6d5a4e] flex items-center gap-1 mt-0.5">
                          <User size={11} /> Açan: {selectedBusinessDay.openedBy}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-[#8a6d57] uppercase flex items-center gap-1">
                          <Clock size={11} /> Kapanış Zamanı
                        </span>
                        <strong className="text-[#3b291f] font-extrabold block mt-0.5">
                          {selectedBusinessDay.closedAt
                            ? new Date(
                                selectedBusinessDay.closedAt,
                              ).toLocaleString('tr-TR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Devam Ediyor (Açık)'}
                        </strong>
                        {selectedBusinessDay.closedBy && (
                          <span className="text-[11px] text-[#6d5a4e] flex items-center gap-1 mt-0.5">
                            <User size={11} /> Kapatan:{' '}
                            {selectedBusinessDay.closedBy}
                          </span>
                        )}
                      </div>

                      {(selectedBusinessDay.note ||
                        selectedBusinessDay.closeNote) && (
                        <div className="col-span-2 pt-2 border-t border-[#ebe2d9] space-y-1">
                          {selectedBusinessDay.note && (
                            <div className="text-[11px] text-[#5c493d]">
                              <strong className="text-[#8a6d57]">
                                Açılış Notu:
                              </strong>{' '}
                              {selectedBusinessDay.note}
                            </div>
                          )}
                          {selectedBusinessDay.closeNote && (
                            <div className="text-[11px] text-[#5c493d]">
                              <strong className="text-[#8a6d57]">
                                Kapanış Notu:
                              </strong>{' '}
                              {selectedBusinessDay.closeNote}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Kasa Özeti */}
                    {(() => {
                      const expected =
                        selectedBusinessDay.expectedCash ??
                        roundCurrency(
                          selectedBusinessDay.openingCash +
                            activeReport.paymentDistribution.cash,
                        )
                      const counted = selectedBusinessDay.countedCash
                      const diff =
                        typeof counted === 'number'
                          ? (selectedBusinessDay.cashDifference ??
                            roundCurrency(counted - expected))
                          : null

                      return (
                        <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#ebe2d9] flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-extrabold text-[#5c493d] uppercase flex items-center gap-1.5">
                              <Wallet size={14} className="text-[#8a6d57]" />
                              Kasa Özeti
                            </span>
                            {diff !== null && (
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                  diff === 0
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : diff > 0
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {diff === 0
                                  ? 'Kasa Tam (₺0,00)'
                                  : diff > 0
                                    ? `+${formatCurrency(diff)} Fazla`
                                    : `${formatCurrency(diff)} Eksik`}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Açılış Nakiti
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {formatCurrency(selectedBusinessDay.openingCash)}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Nakit Satış
                              </span>
                              <strong className="font-extrabold text-emerald-700">
                                {formatCurrency(
                                  activeReport.paymentDistribution.cash,
                                )}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Beklenen Nakit
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {formatCurrency(expected)}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Sayılan Nakit
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {typeof counted === 'number'
                                  ? formatCurrency(counted)
                                  : 'Açık Vardiya'}
                              </strong>
                            </div>
                          </div>

                          {activeReport.openTablePaymentsTotal !== undefined &&
                            activeReport.openTablePaymentsTotal > 0 && (
                              <div className="mt-2 pt-2 border-t border-[#ebe2d9] flex items-center justify-between text-[11px] font-bold text-amber-800">
                                <span>
                                  Açık masalarda alınan ödemeler:
                                </span>
                                <strong>
                                  {formatCurrency(
                                    activeReport.openTablePaymentsTotal,
                                  )}
                                </strong>
                              </div>
                            )}
                        </div>
                      )
                    })()}

                    {/* POS Z Raporu Özeti */}
                    {(() => {
                      const cutoffTime =
                        selectedBusinessDay.posZCutoffTime ||
                        activeReport.posZCutoffTime ||
                        settings?.posZCutoffTime ||
                        '23:57'
                      const carryIn =
                        activeReport.cardCarryIn ?? selectedBusinessDay.cardCarryIn ?? 0
                      const beforeCutoff =
                        activeReport.cardBeforeCutoff ??
                        selectedBusinessDay.cardBeforeCutoff ??
                        activeReport.paymentDistribution.card
                      const afterCutoff =
                        activeReport.cardAfterCutoff ?? selectedBusinessDay.cardAfterCutoff ?? 0
                      const expectedZ =
                        activeReport.expectedZ ??
                        selectedBusinessDay.expectedZ ??
                        roundCurrency(carryIn + beforeCutoff)
                      const enteredZ =
                        activeReport.enteredZ ?? selectedBusinessDay.enteredZ
                      const zDiff =
                        typeof enteredZ === 'number'
                          ? (activeReport.zDifference ??
                            selectedBusinessDay.zDifference ??
                            roundCurrency(enteredZ - expectedZ))
                          : null
                      const carryOut =
                        activeReport.cardCarryOut ??
                        selectedBusinessDay.cardCarryOut ??
                        afterCutoff

                      return (
                        <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#ebe2d9] flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-extrabold text-[#5c493d] uppercase flex items-center gap-1.5">
                              <CreditCard size={14} className="text-[#8a6d57]" />
                              POS Z & Kart Devir ({cutoffTime})
                            </span>
                            {zDiff !== null ? (
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                  zDiff === 0
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : zDiff > 0
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {zDiff === 0
                                  ? 'Z Denk (₺0,00)'
                                  : zDiff > 0
                                    ? `+${formatCurrency(zDiff)} Fazla`
                                    : `${formatCurrency(zDiff)} Eksik`}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600">
                                {selectedBusinessDay.status === 'open' ? 'Açık Gün' : 'Fiş Girilmedi'}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Önceki Günden Devir
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {formatCurrency(carryIn)}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Kart Satışı (Toplam)
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {formatCurrency(activeReport.paymentDistribution.card)}
                              </strong>
                              <span className="text-[10px] text-stone-500 block truncate">
                                ↳ {cutoffTime} öncesi: {formatCurrency(beforeCutoff)}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Beklenen POS Z
                              </span>
                              <strong className="font-extrabold text-indigo-700">
                                {formatCurrency(expectedZ)}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#ebe2d9]">
                              <span className="text-[10px] text-[#8c7a6e] font-bold block">
                                Fişteki POS Z
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {typeof enteredZ === 'number'
                                  ? formatCurrency(enteredZ)
                                  : selectedBusinessDay.status === 'closed'
                                    ? 'Girilmedi'
                                    : 'Açık Vardiya'}
                              </strong>
                            </div>
                          </div>

                          <div className="mt-2 pt-2 border-t border-[#ebe2d9] flex items-center justify-between text-[11px] font-bold text-amber-900">
                            <span>Yarına Devreden ({cutoffTime} sonrası):</span>
                            <strong className="text-amber-800">{formatCurrency(carryOut)}</strong>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* 6 Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                <div className="bg-white rounded-2xl p-4 border border-[#e6ddd4] shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center mb-2.5">
                    <TrendingUp size={18} />
                  </div>
                  <div className="text-xs font-bold text-[#8c7a6e]">
                    Toplam Ciro
                  </div>
                  <div className="text-xl font-extrabold text-[#3b291f] mt-0.5">
                    {formatCurrency(activeReport.totalRevenue)}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-[#e6ddd4] shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 grid place-items-center mb-2.5">
                    <Receipt size={18} />
                  </div>
                  <div className="text-xs font-bold text-[#8c7a6e]">
                    Sipariş Sayısı
                  </div>
                  <div className="text-xl font-extrabold text-[#3b291f] mt-0.5">
                    {activeReport.orderCount}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-[#e6ddd4] shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 grid place-items-center mb-2.5">
                    <ShoppingBag size={18} />
                  </div>
                  <div className="text-xs font-bold text-[#8c7a6e]">
                    Ortalama Adisyon
                  </div>
                  <div className="text-xl font-extrabold text-[#3b291f] mt-0.5">
                    {formatCurrency(activeReport.averageBasket)}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-[#e6ddd4] shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 grid place-items-center mb-2.5">
                    <FileText size={18} />
                  </div>
                  <div className="text-xs font-bold text-[#8c7a6e]">
                    Toplam KDV (%{taxRate})
                  </div>
                  <div className="text-xl font-extrabold text-[#3b291f] mt-0.5">
                    {formatCurrency(activeReport.totalTax)}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-[#e6ddd4] shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 grid place-items-center mb-2.5">
                    <Percent size={18} />
                  </div>
                  <div className="text-xs font-bold text-[#8c7a6e]">
                    Toplam İndirim
                  </div>
                  <div className="text-xl font-extrabold text-[#3b291f] mt-0.5">
                    {formatCurrency(activeReport.totalDiscount)}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-[#e6ddd4] shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center mb-2.5">
                    <Ban size={18} />
                  </div>
                  <div className="text-xs font-bold text-[#8c7a6e]">
                    İptal Edilen ({activeReport.cancelledCount})
                  </div>
                  <div className="text-xl font-extrabold text-rose-700 mt-0.5">
                    {formatCurrency(activeReport.cancelledTotal)}
                  </div>
                </div>
              </div>

              {/* Payment Method Distribution + Category Sales */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Ödeme Yöntemlerine Göre Dağılım */}
                <div className="bg-white rounded-2xl p-5 border border-[#e6ddd4] shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-extrabold text-[#3b291f]">
                        Ödeme Yöntemlerine Göre Dağılım
                      </h3>
                      <p className="text-xs text-[#8c7a6e]">
                        Adisyonlara uygulanan net tahsilat tutarları
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    {paymentMethodsList.map((m) => {
                      const pct =
                        activeReport.totalRevenue > 0
                          ? roundCurrency(
                              (m.amount / activeReport.totalRevenue) * 100,
                            )
                          : 0
                      return (
                        <div key={m.key} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[#3b291f] flex items-center gap-2">
                              <span
                                className={`p-1.5 rounded-lg ${m.badgeBg}`}
                              >
                                <m.icon size={14} />
                              </span>
                              {m.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-bold text-[11px]">
                                %{pct}
                              </span>
                              <strong className="text-sm font-extrabold text-[#3b291f]">
                                {formatCurrency(m.amount)}
                              </strong>
                            </div>
                          </div>
                          <div className="w-full h-2.5 bg-[#f4ebe3] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${m.color}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          {m.key === 'card' && activeReport.cardBeforeCutoff !== undefined && (
                            <div className="flex flex-wrap items-center justify-between text-[11px] text-[#8a6d57] pl-7 pt-0.5 font-medium">
                              <span>
                                ↳ {activeReport.posZCutoffTime || '23:57'} öncesi (Z Dahil):{' '}
                                <strong className="text-emerald-700">
                                  {formatCurrency(activeReport.cardBeforeCutoff)}
                                </strong>
                              </span>
                              <span>
                                ↳ {activeReport.posZCutoffTime || '23:57'} sonrası (Devreden):{' '}
                                <strong className="text-amber-700">
                                  {formatCurrency(activeReport.cardAfterCutoff ?? 0)}
                                </strong>
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Kategori Bazlı Satış */}
                <div className="bg-white rounded-2xl p-5 border border-[#e6ddd4] shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-extrabold text-[#3b291f] flex items-center gap-2">
                        <Layers size={17} className="text-[#8a6d57]" />
                        Kategori Bazlı Satış
                      </h3>
                      <p className="text-xs text-[#8c7a6e]">
                        Ürün kategorilerine göre adet ve ciro dağılımı
                      </p>
                    </div>
                  </div>

                  {activeReport.categorySales.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-[#8c7a6e]">
                      Bu dönemde henüz kategori satışı bulunmuyor.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeReport.categorySales.map((cat) => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-extrabold text-[#3b291f]">
                              {cat.category}{' '}
                              <span className="text-[#8c7a6e] font-semibold">
                                ({cat.quantity} adet)
                              </span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-[#8a6d57]">
                                %{cat.share}
                              </span>
                              <strong className="font-extrabold text-[#3b291f]">
                                {formatCurrency(cat.revenue)}
                              </strong>
                            </div>
                          </div>
                          <div className="w-full h-2.5 bg-[#f4ebe3] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#8a6d57]"
                              style={{ width: `${Math.min(100, cat.share)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SATILAN ÜRÜNLER TABLE (Most Important Section) */}
              <div className="bg-white rounded-2xl border border-[#e6ddd4] shadow-xs overflow-hidden">
                <div className="p-5 border-b border-[#f0e8e0] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-extrabold text-[#3b291f] flex items-center gap-2">
                      <Package size={18} className="text-[#8a6d57]" />
                      Satılan Ürünler
                      <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#f4ebe3] text-[#5c493d]">
                        {activeReport.soldProducts.reduce(
                          (s, p) => s + p.quantity,
                          0,
                        )}{' '}
                        adet
                      </span>
                    </h3>
                    <p className="text-xs text-[#8c7a6e]">
                      Ürün bazlı satış adetleri, net ciro ve opsiyon kırılımları
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex items-center">
                      <Search
                        size={14}
                        className="absolute left-3 text-[#8c7a6e] pointer-events-none"
                      />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Ürün veya kategori ara..."
                        aria-label="Satılan ürünlerde ara"
                        className="pl-8 pr-3 py-1.5 rounded-xl border border-[#dfd5cc] bg-[#fcfaf7] text-xs font-semibold text-[#3b291f] focus:outline-none focus:border-[#8a6d57]"
                      />
                    </div>

                    <div className="flex items-center bg-[#f4ebe3] p-1 rounded-xl text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => handleSortClick('quantity')}
                        className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors ${
                          sortField === 'quantity'
                            ? 'bg-white text-[#3b291f] shadow-xs'
                            : 'text-[#6d5a4e]'
                        }`}
                      >
                        <ArrowDownUp size={12} />
                        <span>
                          Adet {sortField === 'quantity' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSortClick('revenue')}
                        className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors ${
                          sortField === 'revenue'
                            ? 'bg-white text-[#3b291f] shadow-xs'
                            : 'text-[#6d5a4e]'
                        }`}
                      >
                        <ArrowDownUp size={12} />
                        <span>
                          Ciro {sortField === 'revenue' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {filteredAndSortedProducts.length === 0 ? (
                  <div className="p-10 text-center text-xs font-semibold text-[#8c7a6e]">
                    {productSearch.trim()
                      ? 'Aramanızla eşleşen satılmış ürün bulunamadı.'
                      : 'Bu dönemde henüz ürün satışı yapılmamış.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#fcfaf7] border-b border-[#ebe2d9] text-[11px] font-extrabold text-[#8a6d57] uppercase tracking-wider">
                          <th className="py-3 px-4 w-10"></th>
                          <th className="py-3 px-4">Ürün Adı</th>
                          <th className="py-3 px-4">Kategori</th>
                          <th
                            className="py-3 px-4 text-right cursor-pointer select-none hover:text-[#3b291f]"
                            onClick={() => handleSortClick('quantity')}
                          >
                            Satılan Adet{' '}
                            {sortField === 'quantity'
                              ? sortDir === 'desc'
                                ? '↓'
                                : '↑'
                              : ''}
                          </th>
                          <th
                            className="py-3 px-4 text-right cursor-pointer select-none hover:text-[#3b291f]"
                            onClick={() => handleSortClick('revenue')}
                          >
                            Toplam Ciro{' '}
                            {sortField === 'revenue'
                              ? sortDir === 'desc'
                                ? '↓'
                                : '↑'
                              : ''}
                          </th>
                          <th className="py-3 px-4 text-right w-40">
                            Ciro Payı
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2ece6] text-xs">
                        {filteredAndSortedProducts.map((prod) => {
                          const hasOptionsBreakdown =
                            prod.optionBreakdown.length > 1 ||
                            (prod.optionBreakdown.length === 1 &&
                              prod.optionBreakdown[0].optionsLabel !==
                                'Standart')
                          const isExpanded = expandedProducts.has(
                            prod.productKey,
                          )

                          return (
                            <React.Fragment key={prod.productKey}>
                              <tr
                                onClick={() => {
                                  if (hasOptionsBreakdown) {
                                    toggleProductExpand(prod.productKey)
                                  }
                                }}
                                className={`transition-colors ${
                                  hasOptionsBreakdown
                                    ? 'cursor-pointer hover:bg-[#fcfaf7]'
                                    : 'hover:bg-[#fcfaf7]/60'
                                }`}
                              >
                                <td className="py-3.5 px-4 text-[#8a6d57]">
                                  {hasOptionsBreakdown ? (
                                    isExpanded ? (
                                      <ChevronDown size={15} />
                                    ) : (
                                      <ChevronRight size={15} />
                                    )
                                  ) : null}
                                </td>
                                <td className="py-3.5 px-4 font-extrabold text-[#3b291f]">
                                  <div className="flex items-center gap-2">
                                    <span>{prod.name}</span>
                                    {hasOptionsBreakdown && (
                                      <span className="px-2 py-0.5 rounded-md bg-[#f4ebe3] text-[#8a6d57] text-[10px] font-bold">
                                        {prod.optionBreakdown.length} varyant
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-[#5c493d] font-bold text-[11px]">
                                    {prod.category}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right font-extrabold text-[#3b291f] text-sm">
                                  {prod.quantity} adet
                                </td>
                                <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 text-sm">
                                  {formatCurrency(prod.revenue)}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-2 bg-[#f4ebe3] rounded-full overflow-hidden hidden sm:block">
                                      <div
                                        className="h-full bg-[#8a6d57] rounded-full"
                                        style={{
                                          width: `${Math.min(100, prod.share)}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="font-bold text-[#5c493d] w-11 text-right">
                                      %{prod.share}
                                    </span>
                                  </div>
                                </td>
                              </tr>

                              {hasOptionsBreakdown &&
                                isExpanded &&
                                prod.optionBreakdown.map((opt) => (
                                  <tr
                                    key={`${prod.productKey}-${opt.optionsLabel}`}
                                    className="bg-[#fcfaf7] text-[11px] text-[#6d5a4e]"
                                  >
                                    <td className="py-2 px-4"></td>
                                    <td
                                      colSpan={2}
                                      className="py-2 px-4 pl-8 font-semibold"
                                    >
                                      ↳ Opsiyon: <strong>{opt.optionsLabel}</strong>
                                    </td>
                                    <td className="py-2 px-4 text-right font-bold">
                                      {opt.quantity} adet
                                    </td>
                                    <td className="py-2 px-4 text-right font-bold">
                                      {formatCurrency(opt.revenue)}
                                    </td>
                                    <td className="py-2 px-4"></td>
                                  </tr>
                                ))}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Saatlik Satış Yoğunluğu */}
              <div className="bg-white rounded-2xl p-5 border border-[#e6ddd4] shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-extrabold text-[#3b291f] flex items-center gap-2">
                      <Clock size={17} className="text-[#8a6d57]" />
                      Saatlik Satış Yoğunluğu
                    </h3>
                    <p className="text-xs text-[#8c7a6e]">
                      Saat dilimlerine göre sipariş ve ciro dağılımı
                    </p>
                  </div>
                </div>

                <div className="h-44 flex items-end gap-1.5 pt-6 pb-2 border-b border-[#ebe2d9]">
                  {activeReport.hourlySales.map((h) => {
                    const heightPct =
                      h.revenue > 0
                        ? Math.max(8, (h.revenue / maxHourlyRevenue) * 100)
                        : 3
                    return (
                      <div
                        key={h.hour}
                        className="flex-1 flex flex-col justify-end items-center h-full group relative"
                      >
                        {h.orders > 0 && (
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-12 bg-[#3b291f] text-white text-[10px] font-bold rounded-lg px-2 py-1 pointer-events-none whitespace-nowrap z-10 shadow-md transition-opacity">
                            {h.label} · {h.orders} sipariş
                            <br />
                            {formatCurrency(h.revenue)}
                          </div>
                        )}
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            h.revenue > 0
                              ? 'bg-[#8a6d57] group-hover:bg-[#3b291f]'
                              : 'bg-[#f4ebe3]'
                          }`}
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between text-[10px] font-bold text-[#8c7a6e] mt-2">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:00</span>
                </div>
              </div>

              {/* İptal Edilen Siparişler Section (Excluded from revenue) */}
              <div className="bg-white rounded-2xl p-5 border border-[#e6ddd4] shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
                      <Ban size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-[#3b291f]">
                        İptal Edilen Siparişler (Ciroya Dahil Değildir)
                      </h3>
                      <p className="text-xs text-[#8c7a6e]">
                        Toplam {activeReport.cancelledCount} iptal ·{' '}
                        {formatCurrency(activeReport.cancelledTotal)}
                      </p>
                    </div>
                  </div>
                </div>

                {activeReport.cancelledOrders.length === 0 ? (
                  <p className="text-xs text-[#8c7a6e] font-medium">
                    Bu dönemde iptal edilen sipariş bulunmuyor.
                  </p>
                ) : (
                  <div className="divide-y divide-[#f2ece6] border-t border-[#f2ece6] text-xs">
                    {activeReport.cancelledOrders.map((co) => (
                      <div
                        key={co.id}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-extrabold text-[#3b291f]">
                            {co.orderNumber}
                            {co.customerName ? ` · ${co.customerName}` : ''}
                            <span className="ml-2 text-[11px] font-semibold text-[#8c7a6e]">
                              {new Date(co.date).toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6d5a4e]">
                            {co.itemsSummary}
                          </div>
                        </div>
                        <strong className="font-extrabold text-rose-700 shrink-0">
                          {formatCurrency(co.total)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fiş Geçmişi (Individual Completed Orders) */}
              {receiptsData.total > 0 && (
                <ReceiptsTable
                  data={receiptsData}
                  isLoading={false}
                  onPageChange={setReceiptPage}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Onay Modalı: Rapor ve Satış Verilerini Temizleme */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-stone-700 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#3b291f] dark:text-stone-100">
                  Rapor ve Satış Verilerini Temizle
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Deneme amacıyla oluşturulan tüm veriler sıfırlanacaktır.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle size={14} className="shrink-0 text-amber-600" />
                <span>Bu işlem neleri temizleyecek?</span>
              </div>
              <ul className="list-disc list-inside text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5 pl-1">
                <li>Tüm geçmiş tamamlanan siparişler ve ciro kayıtları</li>
                <li>Geçmiş Z raporları ve iş günü geçmişi</li>
                <li>Masalardaki açık deneme siparişleri ve bakiyeler</li>
              </ul>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold pt-1">
                Ürünleriniz, kategorileriniz ve sistem ayarlarınız korunacaktır.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearReports?.()
                  setUserSelectedDayId(null)
                  setShowClearConfirm(false)
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 size={14} />
                <span>Evet, Tümünü Temizle</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
