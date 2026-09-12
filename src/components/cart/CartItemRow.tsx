import { useState, useRef, memo } from 'react'
import { Percent, Trash2 } from 'lucide-react'
import { QuantityControl } from './QuantityControl'
import { DiscountPopover } from './DiscountPopover'
import { formatCurrency, getEffectivePrice } from '../../lib/format'
import type { CartItem, ItemDiscount } from '../../types'

interface CartItemRowProps {
  item: CartItem
  onUpdateQuantity: (id: string, change: number) => void
  onRemoveItem: (id: string) => void
  onApplyDiscount: (id: string, discount?: ItemDiscount) => void
}

export const CartItemRow = memo(function CartItemRow({ item, onUpdateQuantity, onRemoveItem, onApplyDiscount }: CartItemRowProps) {
  const [isDiscountOpen, setIsDiscountOpen] = useState(false)
  const itemTotal = getEffectivePrice(item) * item.quantity

  // Swipe to delete logic (Native React)
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef<number | null>(null)

  const handlePointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    // Ignore if clicking on a button or interactive element
    if ((e.target as HTMLElement).closest('button, input')) return
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    startXRef.current = clientX
    setIsDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || startXRef.current === null) return
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const diff = clientX - startXRef.current
    
    if (diff < 0) {
      setTranslateX(Math.max(diff, -100)) // Max swipe left distance
    } else {
      setTranslateX(0)
    }
  }

  const handlePointerUp = () => {
    if (!isDragging) return
    setIsDragging(false)
    startXRef.current = null
    
    if (translateX < -60) {
      // Threshold met -> slide out and remove
      setTranslateX(-500)
      setTimeout(() => {
        onRemoveItem(item.cartItemId)
      }, 300)
    } else {
      // Snap back
      setTranslateX(0)
    }
  }

  const handlePointerLeave = () => {
    if (isDragging) {
      handlePointerUp()
    }
  }

  // Calculate discount amount for display
  const discountAmount = item.itemDiscount 
    ? (item.itemDiscount.type === 'amount' 
        ? item.itemDiscount.value 
        : itemTotal * (item.itemDiscount.value / 100))
    : 0

  return (
    <div className="relative mb-2 overflow-hidden rounded-xl bg-red-500">
      {/* Background Trash Icon */}
      <div 
        className="absolute inset-y-0 right-0 flex items-center pr-6 text-white transition-opacity duration-200"
        style={{ opacity: translateX < -20 ? 1 : 0.5 }}
      >
        <div style={{ transform: `scale(${translateX < -60 ? 1.2 : 1})`, transition: 'transform 0.2s' }}>
          <Trash2 size={24} />
        </div>
      </div>

      {/* Foreground Content */}
      <div 
        className="relative bg-white z-10 cart-row flex justify-between select-none"
        style={{ 
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerLeave}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="cart-item-name">{item.name}</p>
            {item.badge && <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-sm">{item.badge}</span>}
          </div>
          
          {item.selectedOptions && item.selectedOptions.length > 0 && (
            <div className="cart-item-options">
              {item.selectedOptions.map(o => o.priceDelta !== 0 
                ? `${o.optionName} (${o.priceDelta > 0 ? '+' : ''}${o.priceDelta}₺)` 
                : o.optionName).join(', ')}
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-1">
            <span className="cart-unit">{formatCurrency(getEffectivePrice(item))} / adet</span>
            <div className="relative">
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); setIsDiscountOpen(!isDiscountOpen); }}
                className={`p-1 rounded-md transition-colors ${item.itemDiscount ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                aria-label="İndirim uygula"
              >
                <Percent size={12} />
              </button>
              {isDiscountOpen && (
                <DiscountPopover 
                  itemTotal={itemTotal}
                  currentDiscount={item.itemDiscount}
                  onApply={(discount) => {
                    onApplyDiscount(item.cartItemId, discount)
                    setIsDiscountOpen(false)
                  }}
                  onClose={() => setIsDiscountOpen(false)}
                />
              )}
            </div>
          </div>
          
          {item.itemDiscount && (
            <div className="mt-1 text-xs text-emerald-600 font-medium bg-emerald-50 inline-block px-2 py-0.5 rounded-md">
              İndirim Uygulandı: {item.itemDiscount.type === 'percentage' ? `%${item.itemDiscount.value}` : `-${formatCurrency(item.itemDiscount.value)}`}
            </div>
          )}

          <div className="mt-2">
            <QuantityControl 
              id={item.cartItemId}
              name={item.name}
              quantity={item.quantity}
              onUpdateQuantity={onUpdateQuantity}
              onRemoveItem={onRemoveItem}
            />
          </div>
        </div>
        
        <div className="text-right pl-4">
          {item.itemDiscount ? (
            <div className="flex flex-col items-end">
              <span className="text-xs text-stone-400 line-through mb-0.5">{formatCurrency(itemTotal)}</span>
              <span className="line-total text-emerald-600">{formatCurrency(itemTotal - discountAmount)}</span>
            </div>
          ) : (
            <div className="line-total">{formatCurrency(itemTotal)}</div>
          )}
        </div>
      </div>
    </div>
  )
})

