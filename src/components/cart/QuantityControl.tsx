import { memo } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'

interface QuantityControlProps {
  id: string
  name: string
  quantity: number
  onUpdateQuantity: (id: string, change: number) => void
  onRemoveItem: (id: string) => void
}

export const QuantityControl = memo(function QuantityControl({
  id,
  name,
  quantity,
  onUpdateQuantity,
  onRemoveItem,
}: QuantityControlProps) {
  return (
    <div className="quantity-control" aria-label={`${name} adet kontrolü`}>
      {quantity === 1 ? (
        <button
          type="button"
          className="quantity-button text-red-500 hover:bg-red-50"
          onClick={() => onRemoveItem(id)}
          aria-label={`${name} ürününü sil`}
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <button
          type="button"
          className="quantity-button"
          onClick={() => onUpdateQuantity(id, -1)}
          aria-label={`${name} adedini azalt`}
        >
          <Minus size={14} />
        </button>
      )}
      <span className="quantity-number">{quantity}</span>
      <button
        type="button"
        className="quantity-button"
        onClick={() => onUpdateQuantity(id, 1)}
        aria-label={`${name} adedini artır`}
      >
        <Plus size={14} />
      </button>
    </div>
  )
})
