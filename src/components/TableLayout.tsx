import { useState, useEffect, useRef } from 'react'
import { Settings, User, MoreVertical, CheckCircle2, Ban, LogOut, Receipt } from 'lucide-react'
import { calculateTotals, formatCurrency } from '../lib/format'
import type { Table } from '../types'

interface TableLayoutProps {
  tables: Table[]
  onSelectTable: (id: string) => void
  onOpenTableManager: () => void
  onCloseTable?: (id: string) => void
  onCancelOrder?: (id: string) => void
  onCompleteOrder?: (id: string) => void
  onViewAdisyon?: (id: string) => void
}

export function TableLayout({
  tables,
  onSelectTable,
  onOpenTableManager,
  onCloseTable,
  onCancelOrder,
  onCompleteOrder,
  onViewAdisyon,
}: TableLayoutProps) {
  const [openMenuTableId, setOpenMenuTableId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuTableId(null)
      }
    }
    if (openMenuTableId) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuTableId])

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
          const isMenuOpen = openMenuTableId === table.id

          return (
            <div
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className={`relative p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between min-h-[120px] cursor-pointer group ${
                isMenuOpen ? 'z-30' : 'z-0'
              } ${
                isOccupied
                  ? 'border-[#a67658] bg-[#f9f3ec] hover:border-[#8c5c3d] shadow-sm'
                  : 'border-[#eee6df] bg-white hover:border-[#d7bca6]'
              }`}
            >
              {/* Header area with Table name and 3-dots Menu Button */}
              <div className="flex items-start justify-between gap-1">
                <div className="pr-6">
                  <div className="font-bold text-[#3a2a20] text-lg leading-snug">{table.name}</div>
                  {hasCustomer && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6e4933] bg-[#ebdcd0] px-2 py-0.5 rounded-md max-w-full truncate">
                      <User size={12} className="shrink-0" />
                      <span className="truncate">{table.customerName}</span>
                    </div>
                  )}
                </div>

                {/* 3-dots Action Menu Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuTableId(isMenuOpen ? null : table.id)
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:bg-black/10 hover:text-gray-800 transition-colors z-10"
                  title="Masa İşlemleri"
                  aria-label={`${table.name} için masa menüsü`}
                >
                  <MoreVertical size={18} />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-11 right-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 text-sm font-medium text-gray-700"
                  >
                    {isOccupied && table.cart.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onCompleteOrder?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 transition-colors"
                        >
                          <CheckCircle2 size={16} />
                          <span>Siparişi Tamamla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onViewAdisyon?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-amber-50 text-amber-800 flex items-center gap-2 transition-colors"
                        >
                          <Receipt size={16} />
                          <span>Adisyon Fişi Gör</span>
                        </button>
                        <div className="my-1 border-t border-gray-100" />
                      </>
                    )}

                    {isOccupied && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onCancelOrder?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 transition-colors"
                        >
                          <Ban size={16} />
                          <span>Siparişi İptal Et</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onCloseTable?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2 transition-colors"
                        >
                          <LogOut size={16} />
                          <span>Masayı Kapat</span>
                        </button>
                      </>
                    )}

                    {!isOccupied && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuTableId(null)
                          onSelectTable(table.id)
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2 transition-colors"
                      >
                        <User size={16} />
                        <span>Sipariş Al</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer */}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}


