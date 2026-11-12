import { memo } from 'react'
import { Clock, RotateCcw } from 'lucide-react'
import { formatCurrency, formatTime, getEffectivePrice } from '../../lib/format'
import type { CartItem, ItemDiscount } from '../../types'

interface CartItemRowProps {
  item: CartItem
  onUpdateQuantity?: (id: string, change: number) => void
  onRemoveItem?: (id: string) => void
  onApplyDiscount?: (id: string, discount?: ItemDiscount) => void
  onRefundItem?: (item: CartItem) => void
  canRefund?: boolean
}

export const CartItemRow = memo(function CartItemRow({
  item,
  onRefundItem,
  canRefund = true,
}: CartItemRowProps) {
  const isRefunded = item.status === 'refunded'
  const effectiveUnitPrice = getEffectivePrice(item)
  const itemTotal = effectiveUnitPrice * item.quantity

  // Calculate discount amount for historical display
  const discountAmount = item.itemDiscount
    ? item.itemDiscount.type === 'amount'
      ? item.itemDiscount.value
      : itemTotal * (item.itemDiscount.value / 100)
    : 0

  const timeStr = formatTime(item.addedAt)
  const refundedTimeStr = formatTime(item.refundedAt)

  return (
    <div
      className={`mb-2 rounded-xl border transition-all ${
        isRefunded
          ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
          : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 shadow-xs'
      }`}
      style={{ display: 'block', overflow: 'hidden' }}
    >
      <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {/* Satır 1: [× 2] Ürün Adı ----------------------- ₺280,00 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 auto' }}>
            {/* Adet Kutusu */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '32px',
                height: '24px',
                padding: '0 6px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 800,
                fontFamily: 'monospace',
                backgroundColor: isRefunded ? '#ffe4e6' : '#f5f5f4',
                color: isRefunded ? '#be123c' : '#1c1917',
                border: '1px solid',
                borderColor: isRefunded ? '#fecdd3' : '#e7e5e4',
                flexShrink: 0,
              }}
            >
              × {item.quantity}
            </span>

            {/* Ürün İsmi */}
            <span
              style={{
                fontSize: '14.5px',
                fontWeight: 800,
                color: isRefunded ? '#a8a29e' : '#1c1917',
                textDecoration: isRefunded ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={item.name}
            >
              {item.name}
            </span>

            {item.badge && !isRefunded && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  flexShrink: 0,
                }}
              >
                {item.badge}
              </span>
            )}

            {isRefunded && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  backgroundColor: '#fecdd3',
                  color: '#9f1239',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  flexShrink: 0,
                }}
              >
                İade
              </span>
            )}
          </div>

          {/* Toplam Tutar (Sağda) */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {isRefunded ? (
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#a8a29e', textDecoration: 'line-through', fontFamily: 'monospace' }}>
                {formatCurrency(itemTotal)}
              </span>
            ) : item.itemDiscount ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', color: '#a8a29e', textDecoration: 'line-through', fontFamily: 'monospace' }}>
                  {formatCurrency(itemTotal)}
                </span>
                <span style={{ fontSize: '15px', fontWeight: 900, color: '#059669', fontFamily: 'monospace' }}>
                  {formatCurrency(itemTotal - discountAmount)}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '15px', fontWeight: 900, color: '#1c1917', fontFamily: 'monospace' }}>
                {formatCurrency(itemTotal)}
              </span>
            )}
          </div>
        </div>

        {/* Seçenekler (varsa) */}
        {item.selectedOptions && item.selectedOptions.length > 0 && (
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#78716c', marginTop: '-2px' }}>
            {item.selectedOptions
              .map((o) =>
                o.priceDelta !== 0
                  ? `${o.optionName} (${o.priceDelta > 0 ? '+' : ''}${o.priceDelta}₺)`
                  : o.optionName,
              )
              .join(', ')}
          </div>
        )}

        {/* Satır 2: Birim: ₺140,00 | Saat | Ekleyen | Tur Rozeti | [İade Butonu] */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            paddingTop: '6px',
            borderTop: '1px solid #f5f5f4',
            fontSize: '11.5px',
            color: '#78716c',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
            {!isRefunded && (
              <span>
                Birim: <strong style={{ fontFamily: 'monospace', fontWeight: 800, color: '#292524' }}>{formatCurrency(effectiveUnitPrice)}</strong>
              </span>
            )}

            {timeStr && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#8a6d57', fontWeight: 600 }}>
                <Clock size={12} strokeWidth={2.2} />
                {timeStr}
              </span>
            )}

            {item.addedBy && (
              <span style={{ color: '#78716c', fontWeight: 600 }} title={item.addedBy}>
                · {item.addedBy}
              </span>
            )}

            {item.batchNumber && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  fontWeight: 800,
                  fontSize: '10.5px',
                  border: '1px solid #fde68a',
                }}
              >
                {item.batchNumber}. Tur
              </span>
            )}

            {item.itemDiscount && !isRefunded && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#d1fae5',
                  color: '#065f46',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                {item.itemDiscount.type === 'percentage'
                  ? `-%${item.itemDiscount.value}`
                  : `-${formatCurrency(item.itemDiscount.value)}`}
              </span>
            )}
          </div>

          {/* İade Butonu */}
          {!isRefunded && onRefundItem && canRefund && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRefundItem(item)
              }}
              title="Ürünü İade Et"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800,
                color: '#be123c',
                backgroundColor: '#fff1f2',
                border: '1px solid #fecdd3',
                cursor: 'pointer',
                marginLeft: 'auto',
                flexShrink: 0,
                transition: 'background-color 0.15s',
              }}
            >
              <RotateCcw size={12} strokeWidth={2.2} />
              <span>İade</span>
            </button>
          )}
        </div>

        {/* İade Edilmiş Ürün Detay Satırı */}
        {isRefunded && (
          <div
            style={{
              marginTop: '2px',
              padding: '5px 7px',
              borderRadius: '6px',
              backgroundColor: '#fff1f2',
              border: '1px solid #ffe4e6',
              fontSize: '10.5px',
              color: '#9f1239',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              İade: <span style={{ fontWeight: 400 }}>{item.refundReason || 'İade edildi'}</span>
              {refundedTimeStr && (
                <span style={{ color: '#a8a29e', fontSize: '10px', marginLeft: '4px' }}>({refundedTimeStr})</span>
              )}
            </span>
            {item.refundedBy && (
              <span style={{ fontSize: '10px', color: '#a8a29e' }}>
                İade eden: {item.refundedBy}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
