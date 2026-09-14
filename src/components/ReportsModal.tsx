import { useState, useMemo } from 'react'
import { X, BarChart3, Trash2 } from 'lucide-react'
import { SummaryCards } from './reports/SummaryCards'
import { SalesTrendChart } from './reports/SalesTrendChart'
import { ReceiptsTable } from './reports/ReceiptsTable'
import type { CompletedOrder } from '../types'

interface ReportsModalProps {
  isOpen: boolean
  onClose: () => void
  completedOrders?: CompletedOrder[]
  onClearReports?: () => void
}

export function ReportsModal({ isOpen, onClose, completedOrders = [], onClearReports }: ReportsModalProps) {
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const [confirmClear, setConfirmClear] = useState(false)

  const { summaryData, trendData, receiptsData } = useMemo(() => {
    const now = new Date()
    let currentPeriodStart: Date
    let previousPeriodStart: Date

    if (days === 1) {
      // Today (from 00:00)
      currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      previousPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    } else {
      currentPeriodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      previousPeriodStart = new Date(currentPeriodStart.getTime() - days * 24 * 60 * 60 * 1000)
    }

    const currentOrders = completedOrders.filter(o => new Date(o.date) >= currentPeriodStart)
    const previousOrders = completedOrders.filter(o => {
      const d = new Date(o.date)
      return d >= previousPeriodStart && d < currentPeriodStart
    })

    // Summary calculation
    const currentRevenue = currentOrders.reduce((sum, o) => sum + o.totals.total, 0)
    const previousRevenue = previousOrders.reduce((sum, o) => sum + o.totals.total, 0)
    
    const revenueGrowth = previousRevenue === 0 ? 100 : ((currentRevenue - previousRevenue) / previousRevenue) * 100
    const ordersGrowth = previousOrders.length === 0 ? 100 : ((currentOrders.length - previousOrders.length) / previousOrders.length) * 100
    
    const currentAvgBasket = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0
    const previousAvgBasket = previousOrders.length > 0 ? previousRevenue / previousOrders.length : 0
    const avgBasketGrowth = previousAvgBasket === 0 ? 100 : ((currentAvgBasket - previousAvgBasket) / previousAvgBasket) * 100

    // Trend calculation
    const trendMap = new Map<string, { revenue: number, orders: number }>()
    
    // Initialize trend with empty days to ensure continuous chart
    const trendDays = days === 1 ? 1 : days
    for (let i = 0; i < trendDays; i++) {
        const d = new Date(now.getTime() - (trendDays - 1 - i) * 24 * 60 * 60 * 1000)
        trendMap.set(d.toISOString().split('T')[0], { revenue: 0, orders: 0 })
    }

    let cashTotal = 0
    let cardTotal = 0

    currentOrders.forEach(o => {
      const d = new Date(o.date).toISOString().split('T')[0]
      if (trendMap.has(d)) {
         const t = trendMap.get(d)!
         t.revenue += o.totals.total
         t.orders += 1
      }
      if (o.paymentMethod === 'cash') cashTotal += o.totals.total
      else cardTotal += o.totals.total
    })

    const trend = Array.from(trendMap.entries()).map(([date, data]) => ({ date, ...data }))

    // Format for Receipt Table
    const formattedReceipts = currentOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(o => ({
      id: o.id,
      created_at: o.date,
      total_amount: o.totals.total,
      payment_type: o.paymentMethod === 'cash' ? 'Nakit' : 'Kredi Kartı',
      cashier: o.cashier || 'Kasiyer',
      customerName: o.customerName,
      orderNumber: o.orderNumber,
      status: 'completed',
      items: o.items.map(i => ({
        id: i.id,
        product: { name: i.name, category: i.category },
        quantity: i.quantity,
        unit_price: i.price,
        line_total: i.price * i.quantity
      }))
    }))

    const itemsPerPage = 20
    const paginatedReceipts = formattedReceipts.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    return {
      summaryData: {
        total_revenue: currentRevenue,
        total_orders: currentOrders.length,
        avg_basket: currentAvgBasket,
        revenue_growth: revenueGrowth,
        orders_growth: ordersGrowth,
        avg_basket_growth: avgBasketGrowth
      },
      trendData: {
        trend,
        payment_distribution: [
          { name: 'Nakit', value: cashTotal },
          { name: 'Kredi Kartı', value: cardTotal }
        ]
      },
      receiptsData: {
        items: paginatedReceipts,
        total: formattedReceipts.length,
        page: page
      }
    }

  }, [completedOrders, days, page])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 my-auto" role="dialog">
      <div className="bg-[#f8f9fa] w-full max-w-7xl max-h-[88vh] h-full my-auto rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="bg-white px-8 py-5 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-100 rounded-xl">
              <BarChart3 className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Kapsamlı Rapor & Analiz</h2>
              <p className="text-sm text-gray-500">İşletmenizin detaylı performans ve finansal özetleri</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {onClearReports && (
              confirmClear ? (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700">
                  <span>Tüm geçmiş silinsin mi?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearReports()
                      setConfirmClear(false)
                    }}
                    className="px-2 py-0.5 bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors"
                  >
                    Evet, Sil
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  >
                    İptal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
                  title="Geçmiş deneme sipariş kayıtlarını temizler"
                >
                  <Trash2 size={16} />
                  <span>Raporları Temizle</span>
                </button>
              )
            )}

            <select 
              value={days} 
              onChange={(e) => {
                 setDays(Number(e.target.value))
                 setPage(1)
              }}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option value={1}>Bugün (Günlük)</option>
              <option value={7}>Son 7 Gün</option>
              <option value={30}>Son 30 Gün</option>
              <option value={90}>Son 90 Gün</option>
            </select>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Kapat"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-2">
            <SummaryCards data={summaryData} isLoading={false} />
            <SalesTrendChart data={trendData} isLoading={false} />
            <ReceiptsTable data={receiptsData} isLoading={false} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  )
}
