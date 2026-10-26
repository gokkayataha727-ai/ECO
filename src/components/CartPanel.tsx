import { memo } from 'react'
import { ClipboardList, Coffee, CreditCard, User } from 'lucide-react'
import { derivePaymentState, formatCurrency } from '../lib/format'
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
  onRemoveItem: (id: string) => void
  onUpdateQuantity: (id: string, change: number) => void
  onApplyItemDiscount: (id: string, discount?: ItemDiscount) => void
  orderNumber: string
  totals: OrderTotals
  payments?: PartialPayment[]
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
  payments = [],
}: CartPanelProps) {
  const cartIsEmpty = cart.length === 0
  const { paidTotal, remaining } = derivePaymentState(totals.total, payments)

  return (
    <aside className="cart-panel" aria-label="Aktif sipariş sepeti">
      <div className="cart-head">
        <div>
          <p className="section-kicker">MASA SİPARİŞİ</p>
          <h2 className="section-title cart-title">Aktif Sipariş</h2>
          <span className="order-code">#{orderNumber}</span>
        </div>
        {!cartIsEmpty && <div className="cart-head-actions"><button type="button" className="adisyon-link" onClick={onOpenAdisyon}><ClipboardList size={14} /> Adisyon</button><button type="button" className="clear-button" onClick={() => onConfirmClearChange(true)}>Tümünü temizle</button></div>}
      </div>

      <div className="cart-scrollable-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {cartIsEmpty ? (
          <div className="cart-empty">
            <div>
              <div className="cart-empty-illustration"><Coffee size={38} strokeWidth={1.4} /></div>
              <h3 className="cart-empty-title">Sepetiniz boş</h3>
              <p className="muted cart-empty-text">Menüden ürün seçerek siparişinizi oluşturmaya başlayın.</p>
            </div>
          </div>
        ) : (
          <div className="cart-items" style={{ flex: '1 0 auto' }}>
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

        <div className="cart-extra-inputs" style={{ padding: '0 16px 12px', flexShrink: 0 }}>
          <div className="customer-name-row" style={{ marginTop: 0 }}>
            <div className="customer-name-row-inner">
              <User size={14} className="customer-name-icon" />
              <input
                type="text"
                className="customer-name-input"
                value={customerName}
                onChange={(event) => onCustomerNameChange(event.target.value)}
                placeholder="Müşteri Adı (örn. Ahmet Bey, Masa'daki kız)"
                maxLength={40}
                aria-label="Müşteri adı"
              />
            </div>
          </div>
          <div className="note-area-wrap">
            <textarea
              className="note-area"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Sipariş Notu (örn. yulaf sütü, şekersiz)"
              aria-label="Sipariş notu"
            />
          </div>
        </div>
      </div>

      <div className="cart-bottom" style={{ paddingTop: '10px' }}>
        {confirmClear && (
          <div className="clear-confirm" role="alert">
            Sepetteki tüm ürünler kaldırılsın mı?
            <div><button type="button" onClick={onClear}>Evet, temizle</button><button type="button" onClick={() => onConfirmClearChange(false)}>Vazgeç</button></div>
          </div>
        )}
        <div className="totals">
          <div className="total-row"><span>Ara Toplam</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
          <div className="total-row discount"><span>İndirim</span><strong>-{formatCurrency(totals.discount)}</strong></div>
          <div className="total-row"><span>KDV dahil</span><strong>%10</strong></div>
          {paidTotal > 0 && (
            <>
              <div className="total-row"><span>Genel Toplam</span><strong>{formatCurrency(totals.total)}</strong></div>
              <div className="total-row discount"><span>Ödenen</span><strong>-{formatCurrency(paidTotal)}</strong></div>
              <div className="grand-total"><span>Kalan Tutar</span><strong>{formatCurrency(remaining)}</strong></div>
            </>
          )}
          {paidTotal === 0 && (
            <div className="grand-total"><span>Genel Toplam</span><strong>{formatCurrency(totals.total)}</strong></div>
          )}
        </div>
        <div className="cart-actions">
          <button type="button" className="pay-button pay-button--complete" disabled={cartIsEmpty} onClick={onCompleteOrder}>Siparişi Tamamla</button>
          <button type="button" className="pay-button pay-button--payment" disabled={cartIsEmpty} onClick={onOpenPayment}><CreditCard size={19} /> Ödeme <span className="shortcut pay-shortcut">F4</span></button>
        </div>
      </div>
    </aside>
  )
})

