import { memo, useMemo } from 'react'
import { ClipboardList, Coffee, CreditCard, User, Layers, PlusCircle, RotateCcw } from 'lucide-react'
import { derivePaymentState, formatCurrency, formatTime } from '../lib/format'
import { CartItemRow } from './cart/CartItemRow'
import type { CartItem, OrderTotals, ItemDiscount, PartialPayment } from '../types'

interface CartPanelProps {
  cart: CartItem[]
  confirmClear: boolean
  note: string
  customerName: string
  onClear: () => void
  onConfirmClearChange: (value: boolean) => void
  onNoteChange: (value: string) => void
  onCustomerNameChange: (value: string) => void
  onCompleteOrder: () => void
  onOpenPayment: () => void
  onOpenAdisyon: () => void
  onRemoveItem?: (id: string) => void
  onUpdateQuantity?: (id: string, change: number) => void
  onApplyItemDiscount?: (id: string, discount?: ItemDiscount) => void
  onRefundItem?: (item: CartItem) => void
  onRefundTable?: () => void
  onStartNewBatch?: () => void
  currentBatchNumber?: number
  orderNumber: string
  totals: OrderTotals
  payments?: PartialPayment[]
  canClearCart?: boolean
  canViewAdisyon?: boolean
  canRefundItem?: boolean
  canRefundTable?: boolean
  canStartNewBatch?: boolean
  canEditNoteCustomer?: boolean
  canTakePayment?: boolean
}

export const CartPanel = memo(function CartPanel({
  cart,
  confirmClear,
  note,
  customerName,
  onClear,
  onConfirmClearChange,
  onNoteChange,
  onCustomerNameChange,
  onCompleteOrder,
  onOpenPayment,
  onOpenAdisyon,
  onRemoveItem,
  onUpdateQuantity,
  onApplyItemDiscount,
  onRefundItem,
  onRefundTable,
  onStartNewBatch,
  currentBatchNumber = 1,
  orderNumber,
  totals,
  payments = [],
  canClearCart = true,
  canViewAdisyon = true,
  canRefundItem = true,
  canRefundTable = true,
  canStartNewBatch = true,
  canEditNoteCustomer = true,
  canTakePayment = true,
}: CartPanelProps) {
  const cartIsEmpty = cart.length === 0
  const { paidTotal, remaining } = derivePaymentState(totals.total, payments)

  // Group cart items by batch (tur)
  const groupedBatches = useMemo(() => {
    const batches: {
      batchKey: string
      batchNumber: number
      addedAt?: string
      addedBy?: string
      items: CartItem[]
    }[] = []
    const map = new Map<string, (typeof batches)[0]>()

    cart.forEach((item) => {
      const batchKey = item.batchId || `batch-${item.batchNumber || 1}`
      let group = map.get(batchKey)
      if (!group) {
        group = {
          batchKey,
          batchNumber: item.batchNumber || 1,
          addedAt: item.addedAt,
          addedBy: item.addedBy,
          items: [],
        }
        map.set(batchKey, group)
        batches.push(group)
      } else if (!group.addedAt && item.addedAt) {
        group.addedAt = item.addedAt
      }
      group.items.push(item)
    })

    return batches
  }, [cart])

  return (
    <aside className="cart-panel" aria-label="Aktif sipariş sepeti">
      <div className="cart-head">
        <div>
          <p className="section-kicker">MASA SİPARİŞİ</p>
          <h2 className="section-title cart-title">Aktif Sipariş</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="order-code">#{orderNumber}</span>
            {currentBatchNumber > 1 && (
              <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-stone-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                {currentBatchNumber}. Tur Aktif
              </span>
            )}
          </div>
        </div>
        {!cartIsEmpty && (
          <div className="cart-head-actions flex items-center gap-1.5 flex-wrap justify-end">
            {canViewAdisyon && (
              <button type="button" className="adisyon-link" onClick={onOpenAdisyon}>
                <ClipboardList size={13} /> Adisyon
              </button>
            )}
            {onRefundTable && canRefundTable && (
              <button
                type="button"
                onClick={onRefundTable}
                className="px-2 py-1 rounded-md text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 transition-colors inline-flex items-center gap-1 cursor-pointer"
                title="Masanın tüm siparişini iade et"
              >
                <RotateCcw size={12} />
                <span>Masa İadesi</span>
              </button>
            )}
            {canClearCart && (
              <button
                type="button"
                className="clear-button cursor-pointer"
                onClick={() => onConfirmClearChange(true)}
              >
                Temizle
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sepet Ürünleri - Asıl Kaydırılabilir Alan */}
      <div
        className="cart-items-scroll flex-1 min-h-0 overflow-y-auto px-3 py-2"
        style={{ scrollbarGutter: 'stable' }}
      >
        {cartIsEmpty ? (
          <div className="cart-empty">
            <div>
              <div className="cart-empty-illustration">
                <Coffee size={36} strokeWidth={1.4} />
              </div>
              <h3 className="cart-empty-title">Sepetiniz boş</h3>
              <p className="muted cart-empty-text">
                Menüden ürün seçerek siparişinizi oluşturmaya başlayın.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {groupedBatches.map((batch, batchIdx) => (
              <div key={batch.batchKey} className="cart-batch-group mb-2">
                {/* Tur Ayrımı Çizgisi ve Başlığı */}
                <div
                  className={`cart-batch-divider flex items-center justify-between py-1 px-1 ${
                    batchIdx > 0
                      ? 'mt-2 pt-2 border-t-2 border-[#dfd5cc] dark:border-stone-700'
                      : 'mb-1'
                  }`}
                >
                  <span className="text-[11px] font-extrabold text-[#8a6d57] dark:text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Layers size={12} />
                    {batch.batchNumber}. Tur
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-stone-500 font-semibold">
                    {formatTime(batch.addedAt) && <span>{formatTime(batch.addedAt)}</span>}
                    {batch.addedBy && <span>· {batch.addedBy}</span>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {batch.items.map((item) => (
                    <CartItemRow
                      key={item.cartItemId}
                      item={item}
                      onUpdateQuantity={onUpdateQuantity}
                      onRemoveItem={onRemoveItem}
                      onApplyDiscount={onApplyItemDiscount}
                      onRefundItem={onRefundItem}
                      canRefund={canRefundItem}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Yeni Tur Butonu */}
            {onStartNewBatch && canStartNewBatch && (
              <div className="pt-1 pb-1">
                <button
                  type="button"
                  onClick={onStartNewBatch}
                  className="w-full py-1.5 px-3 rounded-lg border border-dashed border-[#cbbbb0] dark:border-stone-700 text-[#8a6d57] dark:text-stone-400 hover:bg-amber-50/50 dark:hover:bg-stone-800/60 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <PlusCircle size={13} />
                  <span>+ Yeni Sipariş Turu Başlat</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kompakt Masa / Müşteri Bilgi Girişi (Masaüstü PC Optimize) */}
      <div className="cart-extra-inputs shrink-0 px-3 py-1.5 border-t border-[#dfd5cc] dark:border-stone-700 bg-[#faf6f1]/60 dark:bg-stone-900/40">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#dfd5cc] dark:border-stone-700 bg-white dark:bg-stone-800 text-xs shadow-xs focus-within:border-[#8a6d57] focus-within:ring-1 focus-within:ring-[#8a6d57]/30 transition-all">
            <User size={13} className="text-stone-400 shrink-0" />
            <input
              type="text"
              className={`w-full bg-transparent outline-none text-xs text-stone-700 dark:text-stone-200 placeholder:text-stone-400 ${!canEditNoteCustomer ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={customerName}
              onChange={(event) => canEditNoteCustomer && onCustomerNameChange(event.target.value)}
              readOnly={!canEditNoteCustomer}
              placeholder={canEditNoteCustomer ? "Müşteri Adı..." : "Yetki yok"}
              maxLength={40}
              aria-label="Müşteri adı"
              title={!canEditNoteCustomer ? "Müşteri adı düzenleme yetkiniz yok" : undefined}
            />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#dfd5cc] dark:border-stone-700 bg-white dark:bg-stone-800 text-xs shadow-xs focus-within:border-[#8a6d57] focus-within:ring-1 focus-within:ring-[#8a6d57]/30 transition-all">
            <ClipboardList size={13} className="text-stone-400 shrink-0" />
            <input
              type="text"
              className={`w-full bg-transparent outline-none text-xs text-stone-700 dark:text-stone-200 placeholder:text-stone-400 ${!canEditNoteCustomer ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={note}
              onChange={(event) => canEditNoteCustomer && onNoteChange(event.target.value)}
              readOnly={!canEditNoteCustomer}
              placeholder={canEditNoteCustomer ? "Sipariş Notu..." : "Yetki yok"}
              aria-label="Sipariş notu"
              title={!canEditNoteCustomer ? "Sipariş notu düzenleme yetkiniz yok" : undefined}
            />
          </div>
        </div>
      </div>

      <div className="cart-bottom shrink-0 pt-2 pb-3 px-3.5 border-t border-[#dfd5cc] dark:border-stone-800 bg-[#fdfbf7] dark:bg-stone-900">
        {confirmClear && (
          <div className="clear-confirm mb-2" role="alert">
            Sepetteki tüm ürünler kaldırılsın mı?
            <div>
              <button type="button" onClick={onClear}>
                Evet, temizle
              </button>
              <button type="button" onClick={() => onConfirmClearChange(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        )}
        <div className="totals my-2 space-y-1 text-xs">
          {totals.discount > 0 ? (
            <>
              <div className="total-row flex justify-between text-stone-600 dark:text-stone-400">
                <span>Ara Toplam</span>
                <strong>{formatCurrency(totals.subtotal)}</strong>
              </div>
              <div className="total-row discount flex justify-between text-rose-600 dark:text-rose-400 font-bold">
                <span>İndirim</span>
                <strong>-{formatCurrency(totals.discount)}</strong>
              </div>
            </>
          ) : (
            <div className="total-row flex justify-between text-stone-600 dark:text-stone-400">
              <span>Ara Toplam</span>
              <strong>{formatCurrency(totals.subtotal)}</strong>
            </div>
          )}
          <div className="total-row flex justify-between text-[11px] text-stone-500 dark:text-stone-500">
            <span>KDV dahil</span>
            <strong>%10</strong>
          </div>
          {paidTotal > 0 && (
            <>
              <div className="total-row flex justify-between text-stone-600 dark:text-stone-400">
                <span>Genel Toplam</span>
                <strong>{formatCurrency(totals.total)}</strong>
              </div>
              <div className="total-row discount flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                <span>Ödenen</span>
                <strong>-{formatCurrency(paidTotal)}</strong>
              </div>
              <div className="grand-total flex justify-between items-baseline pt-1 border-t border-[#e2d8ce] dark:border-stone-800 text-stone-900 dark:text-stone-100">
                <span className="text-base font-black">Kalan Tutar</span>
                <strong className="text-2xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(remaining)}</strong>
              </div>
            </>
          )}
          {paidTotal === 0 && (
            <div className="grand-total flex justify-between items-baseline pt-1 border-t border-[#e2d8ce] dark:border-stone-800 text-stone-900 dark:text-stone-100">
              <span className="text-base font-black">Genel Toplam</span>
              <strong className="text-2xl font-black text-[#8a6d57] dark:text-amber-300">{formatCurrency(totals.total)}</strong>
            </div>
          )}
        </div>
        <div className="cart-actions grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            className="pay-button pay-button--complete cursor-pointer py-2.5 px-3 rounded-xl font-black text-sm flex items-center justify-center transition-all shadow-xs"
            disabled={cartIsEmpty}
            onClick={onCompleteOrder}
          >
            Siparişi Tamamla
          </button>
          <button
            type="button"
            className={`pay-button pay-button--payment py-2.5 px-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-all shadow-xs ${!canTakePayment ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            disabled={cartIsEmpty || !canTakePayment}
            title={!canTakePayment ? 'Ödeme alma yetkiniz bulunmamaktadır' : undefined}
            onClick={onOpenPayment}
          >
            <CreditCard size={17} /> Ödeme <span className="shortcut pay-shortcut text-xs px-1.5 py-0.5 rounded bg-black/15 font-mono font-bold">F4</span>
          </button>
        </div>
      </div>
    </aside>
  )
})
