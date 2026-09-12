import { memo, useCallback, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ProductExplorer } from './ProductExplorer'
import { CartPanel } from './CartPanel'
import type { CartItem, OrderTotals, Product, ItemDiscount } from '../types'

interface TableOrderViewProps {
  tableName: string
  cart: CartItem[]
  confirmClear: boolean
  note: string
  customerName: string
  totals: OrderTotals
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
}

export const TableOrderView = memo(function TableOrderView({
  tableName,
  cart,
  confirmClear,
  note,
  customerName,
  totals,
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
}: TableOrderViewProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tümü')
  const searchRef = useRef<HTMLInputElement>(null)

  const handleBack = useCallback(() => {
    onBack()
  }, [onBack])

  return (
    <div className="table-order-view">
      <div className="table-order-header">
        <button type="button" className="table-order-back" onClick={handleBack}>
          <ArrowLeft size={18} strokeWidth={2.2} />
          <span>Masalara Dön</span>
        </button>
        <div className="table-order-title">
          <span className="table-order-badge">{tableName}</span>
          <span className="table-order-subtitle">Sipariş Oluştur</span>
        </div>
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
        />
      </section>
    </div>
  )
})
