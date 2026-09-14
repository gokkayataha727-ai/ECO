import { memo, useState } from 'react'
import { ClipboardList, Coffee, CreditCard, Keyboard, User } from 'lucide-react'
import { formatCurrency } from '../lib/format'
import { CartItemRow } from './cart/CartItemRow'
import { VirtualKeyboard } from './VirtualKeyboard'
import type { CartItem, OrderTotals, ItemDiscount } from '../types'

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
  onRemoveItem: (id: string) => void
  onUpdateQuantity: (id: string, change: number) => void
  onApplyItemDiscount: (id: string, discount?: ItemDiscount) => void
  orderNumber: string
  totals: OrderTotals
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
  orderNumber,
  totals,
}: CartPanelProps) {
  const cartIsEmpty = cart.length === 0
  const [activeKb, setActiveKb] = useState<'name' | 'note' | null>(null)

  return (
    <aside className="cart-panel surface" aria-label="Aktif sipariş sepeti">
      <div className="cart-head">
        <div>
          <p className="section-kicker">Masa Siparişi</p>
          <h2 className="section-title text-[21px]">Aktif Sipariş</h2>
          <span className="order-code">#{orderNumber}</span>
        </div>
        {!cartIsEmpty && <div className="flex items-center gap-3"><button type="button" className="adisyon-link" onClick={onOpenAdisyon}><ClipboardList size={14} /> Adisyon</button><button type="button" className="clear-button" onClick={() => onConfirmClearChange(true)}>Tümünü temizle</button></div>}
      </div>

      {cartIsEmpty ? (
        <div className="cart-empty">
          <div>
            <div className="cart-empty-illustration"><Coffee size={38} strokeWidth={1.4} /></div>
            <h3 className="m-0 text-[17px] font-extrabold text-stone-800">Sepetiniz boş</h3>
            <p className="muted mx-auto mt-2 max-w-[220px]">Menüden ürün seçerek siparişinizi oluşturmaya başlayın.</p>
          </div>
        </div>
      ) : (
        <div className="cart-items">
          {cart.map((item) => (
            <CartItemRow
              key={item.cartItemId}
              item={item}
              onUpdateQuantity={onUpdateQuantity}
              onRemoveItem={onRemoveItem}
              onApplyDiscount={onApplyItemDiscount}
            />
          ))}
        </div>
      )}

      <div className="cart-bottom">
        {confirmClear && (
          <div className="clear-confirm" role="alert">
            Sepetteki tüm ürünler kaldırılsın mı?
            <div><button type="button" onClick={onClear}>Evet, temizle</button><button type="button" onClick={() => onConfirmClearChange(false)}>Vazgeç</button></div>
          </div>
        )}
        <div className="customer-name-row flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <User size={14} className="customer-name-icon" />
            <input
              type="text"
              className="customer-name-input"
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              onClick={() => setActiveKb('name')}
              placeholder="Müşteri Adı (örn. Ahmet Bey, Masa'daki kız)"
              maxLength={40}
              aria-label="Müşteri adı"
            />
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors ml-1"
            onClick={() => setActiveKb('name')}
            title="Sanal Klavye Aç"
          >
            <Keyboard size={15} />
          </button>
        </div>
        <div className="relative mt-2">
          <textarea
            className="note-area pr-8"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            onClick={() => setActiveKb('note')}
            placeholder="Sipariş Notu (örn. yulaf sütü, şekersiz)"
            aria-label="Sipariş notu"
          />
          <button
            type="button"
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
            onClick={() => setActiveKb('note')}
            title="Sanal Klavye Aç"
          >
            <Keyboard size={14} />
          </button>
        </div>
        <div className="totals">
          <div className="total-row"><span>Ara Toplam</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
          <div className="total-row discount"><span>İndirim</span><strong>-{formatCurrency(totals.discount)}</strong></div>
          <div className="total-row"><span>KDV dahil</span><strong>%10</strong></div>
          <div className="grand-total"><span>Genel Toplam</span><strong>{formatCurrency(totals.total)}</strong></div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="pay-button" style={{ background: '#059669', flex: 1 }} disabled={cartIsEmpty} onClick={onCompleteOrder}>Siparişi Tamamla</button>
          <button type="button" className="pay-button" style={{ flex: 1 }} disabled={cartIsEmpty} onClick={onOpenPayment}><CreditCard size={19} /> Ödeme <span className="shortcut ml-1 bg-white/10 text-white/75">F4</span></button>
        </div>
      </div>

      {/* Virtual Keyboard Component */}
      <VirtualKeyboard
        isOpen={activeKb !== null}
        onClose={() => setActiveKb(null)}
        title={activeKb === 'name' ? 'Müşteri Adı Girin' : 'Sipariş Notu Girin'}
        value={activeKb === 'name' ? customerName : note}
        onChange={(val) => {
          if (activeKb === 'name') onCustomerNameChange(val)
          if (activeKb === 'note') onNoteChange(val)
        }}
      />
    </aside>
  )
})

