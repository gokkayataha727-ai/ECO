import { useState, useMemo } from 'react'
import { X, BarChart3 } from 'lucide-react'
import { SummaryCards } from './reports/SummaryCards'
import { SalesTrendChart } from './reports/SalesTrendChart'
import { ReceiptsTable } from './reports/ReceiptsTable'
import type { CompletedOrder } from '../types'

interface ReportsModalProps {
  isOpen: boolean
  onClose: () => void
  completedOrders?: CompletedOrder[]
}

export function ReportsModal({ isOpen, onClose, completedOrders = [] }: ReportsModalProps) {
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)

  const { summaryData, trendData, receiptsData } = useMemo(() => {
    const now = new Date()
    const currentPeriodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const previousPeriodStart = new Date(currentPeriodStart.getTime() - days * 24 * 60 * 60 * 1000)

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
    for (let i = 0; i < days; i++) {
        const d = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000)
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" role="dialog">
      <div className="bg-[#f8f9fa] w-full max-w-7xl h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="bg-white px-8 py-5 flex items-center justify-between border-b border-gray-100 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-100 rounded-xl">
              <BarChart3 className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Kapsamlı Rapor & Analiz</h2>
              <p className="text-sm text-gray-500">İşletmenizin detaylı performans ve finansal özetleri (Gerçek Veri)</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <select 
              value={days} 
              onChange={(e) => {
                 setDays(Number(e.target.value))
                 setPage(1)
              }}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
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
