import { Settings, User } from 'lucide-react'
import { calculateTotals, formatCurrency } from '../lib/format'
import type { Table } from '../types'

interface TableLayoutProps {
  tables: Table[]
  onSelectTable: (id: string) => void
  onOpenTableManager: () => void
}

export function TableLayout({ tables, onSelectTable, onOpenTableManager }: TableLayoutProps) {
  return (
    <div className="tables-container catalog">
      <div className="tables-header flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Masalar</h2>
          <p className="muted mt-1">Sipariş almak veya düzenlemek için bir masa seçin.</p>
        </div>
        <button type="button" onClick={onOpenTableManager} className="btn-secondary text-sm">
          <Settings className="w-4 h-4 mr-1.5" />
          Masa Yönetimi
        </button>
      </div>

      <div className="tables-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tables.map((table) => {
          const { total } = calculateTotals(table.cart, table.discountRate || 0)
          const hasCustomer = Boolean(table.customerName && table.customerName.trim().length > 0)
          const isOccupied = table.cart.length > 0 || table.status === 'occupied' || hasCustomer

          return (
            <button
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className={`relative p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between min-h-[110px] ${
                isOccupied
                  ? 'border-[#a67658] bg-[#f9f3ec] hover:border-[#8c5c3d] shadow-sm'
                  : 'border-[#eee6df] bg-white hover:border-[#d7bca6]'
                }`}
            >
              <div>
                <div className="font-bold text-[#3a2a20] text-lg leading-snug">{table.name}</div>
                {hasCustomer && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6e4933] bg-[#ebdcd0] px-2 py-0.5 rounded-md max-w-full truncate">
                    <User size={12} className="shrink-0" />
                    <span className="truncate">{table.customerName}</span>
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-between items-end">
                <span className={`text-xs font-semibold ${isOccupied ? 'text-[#a67658]' : 'text-[#a08e82]'}`}>
                  {isOccupied ? 'Dolu' : 'Boş'}
                </span>
                {isOccupied && table.cart.length > 0 && (
                  <span className="font-extrabold text-[#3b291f] text-sm">
                    {formatCurrency(total)}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

