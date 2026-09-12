import React, { useState } from 'react'
import { formatCurrency } from '../../lib/format'
import { ChevronDown, ChevronRight, Receipt } from 'lucide-react'

interface OrderItem {
  id: string
  product: { name: string, category: string }
  quantity: number
  unit_price: number
  line_total: number
}

interface Order {
  id: string
  created_at: string
  total_amount: number
  payment_type: string
  cashier: string
  customerName?: string
  orderNumber?: string
  status: string
  items?: OrderItem[]
}

interface ReceiptsTableProps {
  data: {
    items: Order[]
    total: number
    page: number
  } | undefined
  isLoading: boolean
  onPageChange: (page: number) => void
}

export function ReceiptsTable({ data, isLoading, onPageChange }: ReceiptsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedRows(next)
  }

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mt-6 overflow-hidden animate-pulse">
        <div className="h-16 bg-gray-50 border-b border-gray-100 px-6 py-4"></div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-16 border-b border-gray-50"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mt-6 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div className="flex items-center space-x-2 text-emerald-800">
          <Receipt className="w-5 h-5" />
          <h3 className="text-lg font-bold">Son İşlemler (Fiş Geçmişi)</h3>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-gray-100 text-sm text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-4 font-medium w-10"></th>
              <th className="px-6 py-4 font-medium">Tarih</th>
              <th className="px-6 py-4 font-medium">Sipariş</th>
              <th className="px-6 py-4 font-medium">Kasiyer</th>
              <th className="px-6 py-4 font-medium">Ödeme</th>
              <th className="px-6 py-4 font-medium text-right">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.items.map(order => (
              <React.Fragment key={order.id}>
                <tr 
                  className="hover:bg-emerald-50/30 transition-colors cursor-pointer"
                  onClick={() => toggleRow(order.id)}
                >
                  <td className="px-6 py-4">
                    {expandedRows.has(order.id) ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {new Date(order.created_at).toLocaleString('tr-TR', { 
                       day: '2-digit', month: 'short', year: 'numeric', 
                       hour: '2-digit', minute:'2-digit' 
                    })}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <span className="font-medium">{order.orderNumber || '—'}</span>
                    {order.customerName && <span className="ml-1.5 text-xs text-gray-400 font-normal">· {order.customerName}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {order.cashier}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      order.payment_type === 'Nakit' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {order.payment_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                    {formatCurrency(order.total_amount)}
                  </td>
                </tr>
                {expandedRows.has(order.id) && (
                  <tr className="bg-gray-50/50">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="pl-10">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Sipariş Detayları</h4>
                        <table className="w-full max-w-2xl text-sm">
                          <tbody className="divide-y divide-gray-200 border-t border-b border-gray-200">
                            {order.items?.map(item => (
                              <tr key={item.id}>
                                <td className="py-2 text-gray-900 font-medium">{item.product.name}</td>
                                <td className="py-2 text-gray-500">{item.quantity} x {formatCurrency(item.unit_price)}</td>
                                <td className="py-2 text-gray-900 text-right font-medium">{formatCurrency(item.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Toplam <b>{data.total}</b> kayıttan <b>{(data.page - 1) * 20 + 1} - {Math.min(data.page * 20, data.total)}</b> arası gösteriliyor
        </span>
        <div className="flex space-x-2">
          <button 
            disabled={data.page === 1}
            onClick={() => onPageChange(data.page - 1)}
            className="px-3 py-1 border border-gray-200 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
          >
            Önceki
          </button>
          <button 
            disabled={data.page * 20 >= data.total}
            onClick={() => onPageChange(data.page + 1)}
            className="px-3 py-1 border border-gray-200 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  )
}
