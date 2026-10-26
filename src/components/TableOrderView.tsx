import { memo, useCallback, useRef, useState } from 'react'
import { ArrowLeft, Sun } from 'lucide-react'
import { ProductExplorer } from './ProductExplorer'
import { CartPanel } from './CartPanel'
import type { CartItem, OrderTotals, Product, ItemDiscount, PartialPayment } from '../types'

interface TableOrderViewProps {
  tableName: string
  cart: CartItem[]
  confirmClear: boolean
  note: string
  customerName: string
  totals: OrderTotals
  payments?: PartialPayment[]
  products: Product[]
  onAddProduct: (id: string) => void
  onUpdateQuantity: (id: string, change: number) => void
  onRemoveItem: (id: string) => void
  onApplyItemDiscount: (id: string, discount?: ItemDiscount) => void
  onClear: () => void
  onConfirmClearChange: (value: boolean) => void
  onNoteChange: (value: string) => void
  onCustomerNameChange: (value: string) => void
  onCompleteOrder: () => void
  onOpenPayment: () => void
  onOpenAdisyon: () => void
  onOpenProducts: () => void
  onBack: () => void
  onEditProduct?: (product: Product) => void
  onViewDetail?: (product: Product) => void
  onDeleteProduct?: (id: string) => void
  isDayOpen?: boolean
  onOpenDayModal?: () => void
}

export const TableOrderView = memo(function TableOrderView({
  tableName,
  cart,
  confirmClear,
  note,
  customerName,
  totals,
  payments,
  products,
  onAddProduct,
  onUpdateQuantity,
  onRemoveItem,
  onApplyItemDiscount,
  onClear,
  onConfirmClearChange,
  onNoteChange,
  onCustomerNameChange,
  onCompleteOrder,
  onOpenPayment,
  onOpenAdisyon,
  onOpenProducts,
  onBack,
  onEditProduct,
  onViewDetail,
  onDeleteProduct,
  isDayOpen = true,
  onOpenDayModal,
}: TableOrderViewProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tümü')
  const searchRef = useRef<HTMLInputElement>(null)

  const handleBack = useCallback(() => {
    onBack()
  }, [onBack])

  return (
    <div className="table-order-view">
      <div className="table-order-header justify-between">
        <div className="flex items-center gap-4">
          <button type="button" className="table-order-back" onClick={handleBack}>
            <ArrowLeft size={18} strokeWidth={2.2} />
            <span>Masalara Dön</span>
          </button>
          <div className="table-order-title">
            <span className="table-order-badge">{tableName}</span>
            <span className="table-order-subtitle">Sipariş Oluştur</span>
          </div>
        </div>

        {!isDayOpen && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-extrabold">
            <span>Sipariş almak için önce günü açın</span>
            {onOpenDayModal && (
              <button
                type="button"
                onClick={onOpenDayModal}
                className="px-2.5 py-1 rounded-lg bg-[#8a6d57] hover:bg-[#3b291f] text-white text-[11px] font-extrabold inline-flex items-center gap-1 transition-colors"
              >
                <Sun size={12} />
                <span>Günü Aç</span>
              </button>
            )}
          </div>
        )}
      </div>

      <section className="pos-layout table-order-body" aria-label={`${tableName} sipariş ekranı`}>
        <ProductExplorer
          category={category}
          onCategoryChange={setCategory}
          onAddProduct={onAddProduct}
          search={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
          products={products}
          onOpenProducts={onOpenProducts}
          onEditProduct={onEditProduct}
          onViewDetail={onViewDetail}
          onDeleteProduct={onDeleteProduct}
        />

        <CartPanel
          cart={cart}
          confirmClear={confirmClear}
          note={note}
          customerName={customerName}
          onClear={onClear}
          onConfirmClearChange={onConfirmClearChange}
          onNoteChange={onNoteChange}
          onCustomerNameChange={onCustomerNameChange}
          onCompleteOrder={onCompleteOrder}
          onOpenPayment={onOpenPayment}
          onOpenAdisyon={onOpenAdisyon}
          onRemoveItem={onRemoveItem}
          onUpdateQuantity={onUpdateQuantity}
          onApplyItemDiscount={onApplyItemDiscount}
          orderNumber={tableName}
          totals={totals}
          payments={payments}
        />
      </section>
    </div>
  )
})
