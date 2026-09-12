import { formatCurrency } from '../../lib/format'

interface SalesTrendChartProps {
  data: {
    trend: Array<{ date: string, revenue: number, orders: number }>
    payment_distribution: Array<{ name: string, value: number }>
  } | undefined
  isLoading: boolean
}

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444']

export function SalesTrendChart({ data, isLoading }: SalesTrendChartProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-96 animate-pulse">
          <div className="h-6 w-48 bg-gray-200 rounded mb-6"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-96 animate-pulse flex flex-col items-center justify-center">
          <div className="w-48 h-48 rounded-full bg-gray-200 mb-6"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  // Calculate max revenue to scale the simple bar chart
  const maxRevenue = Math.max(...data.trend.map(d => d.revenue), 1)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-900 mb-6">30 Günlük Satış Trendi</h3>
        
        <div className="h-72 w-full flex items-end space-x-1 pb-4 border-b border-gray-100 relative">
          {data.trend.map((item, index) => {
            const height = (item.revenue / maxRevenue) * 100
            const displayDate = new Date(item.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
            return (
              <div key={index} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                {/* Tooltip */}
                <div className="opacity-0 group-hover:opacity-100 absolute -top-12 bg-gray-800 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                  {formatCurrency(item.revenue)}<br/>
                  <span className="text-gray-300">{displayDate}</span>
                </div>
                
                <div 
                  className="w-full bg-emerald-400 rounded-t-sm hover:bg-emerald-500 transition-colors"
                  style={{ height: `${height}%`, minHeight: '4px' }}
                ></div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{new Date(data.trend[0]?.date).toLocaleDateString('tr-TR')}</span>
          <span>{new Date(data.trend[data.trend.length - 1]?.date).toLocaleDateString('tr-TR')}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
        <h3 className="text-lg font-bold text-gray-900 mb-6">Ödeme Dağılımı</h3>
        <div className="flex-1 flex flex-col justify-center items-center">
           {data.payment_distribution.map((entry, index) => (
              <div key={entry.name} className="w-full mb-4">
                <div className="flex justify-between text-sm mb-1 font-medium">
                  <span>{entry.name}</span>
                  <span className="text-gray-900">{formatCurrency(entry.value)}</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                   <div 
                     className="h-full rounded-full" 
                     style={{ 
                       backgroundColor: COLORS[index % COLORS.length],
                       width: `${(entry.value / Math.max(0.001, data.payment_distribution.reduce((acc, curr) => acc + curr.value, 0))) * 100}%`
                     }}
                   ></div>
                </div>
              </div>
           ))}
        </div>
      </div>
    </div>
  )
}
