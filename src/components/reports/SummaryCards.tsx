import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Receipt } from 'lucide-react'
import { formatCurrency } from '../../lib/format'

interface SummaryCardsProps {
  data: {
    total_revenue: number
    total_orders: number
    avg_basket: number
    revenue_growth: number
    orders_growth: number
    avg_basket_growth: number
  } | undefined
  isLoading: boolean
}

export function SummaryCards({ data, isLoading }: SummaryCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm animate-pulse border border-gray-100">
            <div className="h-10 w-10 bg-gray-200 rounded-full mb-4"></div>
            <div className="h-6 w-32 bg-gray-200 rounded mb-2"></div>
            <div className="h-8 w-24 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: 'Toplam Ciro (30 Gün)',
      value: formatCurrency(data.total_revenue),
      growth: data.revenue_growth,
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Sipariş Sayısı',
      value: data.total_orders.toString(),
      growth: data.orders_growth,
      icon: Receipt,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      title: 'Ortalama Sepet',
      value: formatCurrency(data.avg_basket),
      growth: data.avg_basket_growth,
      icon: ShoppingBag,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((card, i) => (
        <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${card.bgColor}`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            
            <div className={`flex items-center space-x-1 text-sm font-medium px-2 py-1 rounded-full ${
              card.growth >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
            }`}>
              {card.growth >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(card.growth).toFixed(1)}%</span>
            </div>
          </div>
          
          <h3 className="text-gray-500 font-medium text-sm mb-1">{card.title}</h3>
          <p className="text-2xl font-bold text-gray-900">{card.value}</p>
        </div>
      ))}
    </div>
  )
}
