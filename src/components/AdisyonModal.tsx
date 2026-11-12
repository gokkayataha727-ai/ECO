import { useMemo } from 'react'
import { ClipboardList, Printer, X } from 'lucide-react'
import { formatCurrency, formatTime, getEffectivePrice } from '../lib/format'
import type { CartItem, OrderTotals } from '../types'
import { AppLogo } from './AppLogo'

interface AdisyonModalProps {
  cart: CartItem[]
  customerName?: string
  discountRate: number
  isOpen: boolean
  note: string
  onClose: () => void
  orderNumber: string
  totals: OrderTotals
}

export function AdisyonModal({
  cart,
  customerName,
  discountRate,
  isOpen,
  note,
  onClose,
  orderNumber,
  totals,
}: AdisyonModalProps) {
  // Group cart items by batch (tur)
  const groupedBatches = useMemo(() => {
    const batches: {
      batchKey: string
      batchNumber: number
      addedAt?: string
      addedBy?: string
      items: CartItem[]
    }[] = []
    const map = new Map<string, typeof batches[0]>()

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
      }
      group.items.push(item)
    })

    return batches
  }, [cart])

  if (!isOpen) return null

  const now = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Adisyon">
      <div className="modal adisyon-modal">
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1">
              <ClipboardList size={13} /> Masa adisyonu
            </p>
            <h2 className="section-title">Adisyon · #{orderNumber}</h2>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Adisyonu kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="adisyon-sheet">
          <div className="adisyon-top flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AppLogo className="w-9 h-9 object-contain" />
              <div>
                <strong>LEMOON KAFE</strong>
                <span>SIMAV</span>
              </div>
            </div>
            <div className="adisyon-status">
              AÇIK
              <br />
              <small>{now}</small>
            </div>
          </div>

          <div className="adisyon-info">
            <span>{orderNumber}</span>
            {customerName && <span>Müşteri: {customerName}</span>}
            <span>Kasa: LEMOON</span>
            <span>#{orderNumber}</span>
          </div>

          <div className="adisyon-columns">
            <span>Ürün</span>
            <span>Adet</span>
            <span style={{ textAlign: 'right' }}>Tutar</span>
          </div>

          {cart.length === 0 ? (
            <div className="adisyon-empty">Adisyon için sepete ürün ekleyin.</div>
          ) : (
            <div className="adisyon-batches-container">
              {groupedBatches.map((batch, batchIdx) => (
                <div key={batch.batchKey} className="adisyon-batch">
                  {/* Tur Divider line between batches */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      marginTop: batchIdx > 0 ? '8px' : '0',
                      borderTop: batchIdx > 0 ? '1px dashed #d6c6b8' : 'none',
                      fontSize: '12px',
                      fontWeight: 850,
                      color: '#8a6d57',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span>{batch.batchNumber}. Tur</span>
                    <span>
                      {formatTime(batch.addedAt)}
                      {batch.addedBy ? ` · ${batch.addedBy}` : ''}
                    </span>
                  </div>

                  {batch.items.map((item) => {
                    const isRefunded = item.status === 'refunded'
                    const itemPrice = getEffectivePrice(item)
                    const lineTotal = itemPrice * item.quantity
                    const timeStr = formatTime(item.addedAt, batch.addedAt)

                    return (
                      <div
                        className={`adisyon-item ${isRefunded ? 'adisyon-item-refunded' : ''}`}
                        key={item.cartItemId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 45px 74px',
                          gap: '9px',
                          padding: '7px 0',
                          borderBottom: '1px solid #f0e8e0',
                          opacity: isRefunded ? 0.6 : 1,
                        }}
                      >
                        <span>
                          <strong
                            style={{
                              display: 'block',
                              color: isRefunded ? '#999' : '#3b2a20',
                              fontSize: '15px',
                              fontWeight: 850,
                              textDecoration: isRefunded ? 'line-through' : 'none',
                            }}
                          >
                            {item.name}
                          </strong>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <small style={{ color: '#685447', fontSize: '12px', fontWeight: 600 }}>
                              {formatCurrency(itemPrice)} / adet
                            </small>
                            {timeStr && (
                              <small style={{ color: '#8a6d57', fontSize: '12px', fontWeight: 750 }}>
                                · {timeStr}
                              </small>
                            )}
                            {item.addedBy && (
                              <small style={{ color: '#685447', fontSize: '12px', fontWeight: 600 }}>
                                · {item.addedBy}
                              </small>
                            )}
                          </div>
                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                            <div className="adisyon-item-options">
                              {item.selectedOptions
                                .map((o) =>
                                  o.priceDelta !== 0
                                    ? `${o.optionName} (${o.priceDelta > 0 ? '+' : ''}${o.priceDelta}₺)`
                                    : o.optionName,
                                )
                                .join(', ')}
                            </div>
                          )}
                          {isRefunded && (
                            <div
                              style={{
                                color: '#b91c1c',
                                fontSize: '12px',
                                fontWeight: 800,
                                marginTop: '2px',
                              }}
                            >
                              İade Edildi (-{item.refundedQty || item.quantity} adet)
                              {item.refundReason ? ` · ${item.refundReason}` : ''}
                            </div>
                          )}
                        </span>

                        <b
                          style={{
                            color: isRefunded ? '#999' : '#3b2a20',
                            fontSize: '14.5px',
                            fontWeight: 850,
                            textDecoration: isRefunded ? 'line-through' : 'none',
                          }}
                        >
                          {item.quantity}
                        </b>

                        <b
                          style={{
                            color: isRefunded ? '#b91c1c' : '#3b2a20',
                            fontSize: '14.5px',
                            fontWeight: 850,
                            textAlign: 'right',
                            textDecoration: isRefunded ? 'line-through' : 'none',
                          }}
                        >
                          {formatCurrency(lineTotal)}
                        </b>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="adisyon-divider" />
          <div className="adisyon-total">
            <span>Ara toplam</span>
            <b>{formatCurrency(totals.subtotal)}</b>
          </div>
          {totals.discount > 0 && (
            <div className="adisyon-total discount">
              <span>İndirim{discountRate > 0 ? ` (%${discountRate * 100})` : ''}</span>
              <b>-{formatCurrency(totals.discount)}</b>
            </div>
          )}
          <div className="adisyon-grand">
            <span>TOPLAM</span>
            <strong>{formatCurrency(totals.total)}</strong>
          </div>
          {note && (
            <div className="adisyon-note">
              <b>Sipariş notu</b>
              <span>{note}</span>
            </div>
          )}
          <div className="adisyon-footer">Ödeme bekleniyor</div>
        </div>

        <div className="receipt-actions">
          <button type="button" className="outline-action flex-1" onClick={onClose}>
            Kapat
          </button>
          <button
            type="button"
            className="solid-action flex-1"
            onClick={() => {
              window.print()
            }}
          >
            <Printer size={15} className="mr-2 inline" />
            Adisyonu Yazdır
          </button>
        </div>
      </div>
    </div>
  )
}
