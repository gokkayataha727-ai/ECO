import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useVirtualKeyboard } from '../../context/VirtualKeyboardContext'
import type { ItemDiscount } from '../../types'

interface DiscountPopoverProps {
  itemTotal: number
  currentDiscount?: ItemDiscount
  onApply: (discount?: ItemDiscount) => void
  onClose: () => void
}

export function DiscountPopover({ itemTotal, currentDiscount, onApply, onClose }: DiscountPopoverProps) {
  const { openKeyboard } = useVirtualKeyboard()
  const [type, setType] = useState<'percentage' | 'amount'>(currentDiscount?.type || 'percentage')
  const [value, setValue] = useState(currentDiscount?.value ? String(currentDiscount.value) : '')
  const [error, setError] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleOpenKb = () => {
    openKeyboard({
      value,
      onChange: (val) => {
        setValue(val)
        setError('')
      },
      mode: 'number',
      title: type === 'percentage' ? 'İndirim Oranı (%)' : 'İndirim Tutarı (₺)',
    })
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleApply = () => {
    const numValue = parseFloat(value)
    
    if (!value || isNaN(numValue) || numValue <= 0) {
      setError('Geçerli bir değer girin')
      return
    }

    if (type === 'percentage' && numValue > 100) {
      setError('%100 den büyük olamaz')
      return
    }

    if (type === 'amount' && numValue > itemTotal) {
      setError('Tutar aşılıyor')
      return
    }

    onApply({ type, value: numValue })
    onClose()
  }

  const handleRemove = () => {
    onApply(undefined)
    onClose()
  }

  return (
    <div 
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-stone-200 p-3 w-64"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm text-stone-700">Ürün İndirimi</h4>
        <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-600">
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-1 bg-stone-100 p-1 rounded-lg mb-3">
        <button
          type="button"
          className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${type === 'percentage' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}
          onClick={() => { setType('percentage'); setError(''); }}
        >
          Oran (%)
        </button>
        <button
          type="button"
          className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${type === 'amount' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}
          onClick={() => { setType('amount'); setError(''); }}
        >
          Tutar (₺)
        </button>
      </div>

      <div className="mb-3">
        <div className="relative">
          <input
            type="number"
            className={`w-full bg-stone-50 border ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'} rounded-lg px-3 py-2 text-sm outline-none transition-all`}
            placeholder="0"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            onFocus={handleOpenKb}
            onClick={handleOpenKb}
            onTouchEnd={handleOpenKb}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply()
            }}
            min="0"
            step={type === 'percentage' ? "1" : "0.5"}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
            {type === 'percentage' ? '%' : '₺'}
          </span>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>

      <div className="flex gap-2">
        {currentDiscount && (
          <button 
            type="button" 
            onClick={handleRemove}
            className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
          >
            Kaldır
          </button>
        )}
        <button 
          type="button"
          onClick={handleApply}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Uygula
        </button>
      </div>
    </div>
  )
}
