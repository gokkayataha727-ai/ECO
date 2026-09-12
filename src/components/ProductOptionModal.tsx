import { Coffee, Minus, Plus, ShoppingCart, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { formatCurrency } from '../lib/format'
import type { Product, SelectedOption } from '../types'

interface ProductOptionModalProps {
  product: Product
  isOpen: boolean
  onClose: () => void
  onConfirm: (productId: string, quantity: number, selectedOptions: SelectedOption[]) => void
}

const getImageUrl = (url?: string) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  const cleanPath = url.startsWith('/') ? url : `/${url}`
  return `http://localhost:8000${cleanPath}`
}

export function ProductOptionModal({ product, isOpen, onClose, onConfirm }: ProductOptionModalProps) {
  const [quantity, setQuantity] = useState(1)
  const [selections, setSelections] = useState<Record<string, string[]>>(() => buildDefaults(product))

  // Reset when product changes
  const resetState = useCallback(() => {
    setQuantity(1)
    setSelections(buildDefaults(product))
  }, [product])

  const optionGroups = useMemo(() => product.optionGroups ?? [], [product.optionGroups])

  // Calculate live price
  const livePrice = useMemo(() => {
    let delta = 0
    for (const group of optionGroups) {
      const selectedIds = selections[group.id] ?? []
      for (const opt of group.options) {
        if (selectedIds.includes(opt.id)) {
          delta += opt.priceDelta
        }
      }
    }
    return (product.price + delta) * quantity
  }, [product.price, selections, quantity, optionGroups])

  // Validation: all required groups must have at least one selection
  const missingRequired = useMemo(() => {
    return optionGroups
      .filter((g) => g.required && (!(selections[g.id]?.length) || selections[g.id].length === 0))
      .map((g) => g.name)
  }, [optionGroups, selections])

  const canAdd = missingRequired.length === 0

  const handleToggle = useCallback((groupId: string, optionId: string, selectionType: 'single' | 'multiple') => {
    setSelections((prev) => {
      const current = prev[groupId] ?? []
      if (selectionType === 'single') {
        return { ...prev, [groupId]: [optionId] }
      }
      // multiple
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) }
      }
      return { ...prev, [groupId]: [...current, optionId] }
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (!canAdd) return
    const selected: SelectedOption[] = []
    for (const group of optionGroups) {
      const selectedIds = selections[group.id] ?? []
      for (const opt of group.options) {
        if (selectedIds.includes(opt.id)) {
          selected.push({
            groupId: group.id,
            groupName: group.name,
            optionId: opt.id,
            optionName: opt.name,
            priceDelta: opt.priceDelta,
          })
        }
      }
    }
    onConfirm(product.id, quantity, selected)
    resetState()
  }, [canAdd, optionGroups, selections, product.id, quantity, onConfirm, resetState])

  if (!isOpen) return null

  const imageUrl = getImageUrl(product.image_url)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`${product.name} seçenekleri`}>
      <div className="modal product-option-modal">
        {/* Header */}
        <div className="product-option-modal-header">
          <div className="modal-head">
            <div>
              <p className="section-kicker">Ürün seçenekleri</p>
              <h2 className="section-title">Siparişinizi özelleştirin</h2>
            </div>
            <button type="button" className="close-button" onClick={() => { resetState(); onClose() }} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          <div className="product-option-product-info">
            {imageUrl ? (
              <img className="product-option-img" src={imageUrl} alt={product.name} />
            ) : (
              <div className="product-option-icon"><Coffee size={28} strokeWidth={1.5} /></div>
            )}
            <div className="product-option-details">
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="base-price">{formatCurrency(product.price)}</div>
            </div>
          </div>
        </div>

        {/* Option Groups */}
        <div className="option-modal-groups">
          {optionGroups.map((group) => {
            const selectedIds = selections[group.id] ?? []
            return (
              <div className="option-modal-group" key={group.id}>
                <div className="option-modal-group-head">
                  <h4>{group.name}</h4>
                  {group.required ? (
                    <span className="option-modal-required-badge">Zorunlu</span>
                  ) : (
                    <span className="option-modal-optional-badge">Opsiyonel</span>
                  )}
                </div>
                <div className="option-modal-choices">
                  {group.options.map((opt) => {
                    const isSelected = selectedIds.includes(opt.id)
                    return (
                      <label
                        key={opt.id}
                        className={`option-modal-choice${isSelected ? ' selected' : ''}`}
                      >
                        <input
                          type={group.selectionType === 'single' ? 'radio' : 'checkbox'}
                          name={`group-${group.id}`}
                          checked={isSelected}
                          onChange={() => handleToggle(group.id, opt.id, group.selectionType)}
                        />
                        <span className="option-modal-choice-label">{opt.name}</span>
                        <span className={`option-modal-choice-price${opt.priceDelta === 0 ? ' free' : ''}`}>
                          {opt.priceDelta === 0
                            ? 'Ücretsiz'
                            : opt.priceDelta > 0
                            ? `+${formatCurrency(opt.priceDelta)}`
                            : formatCurrency(opt.priceDelta)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="option-modal-footer">
          <div className="option-modal-quantity">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Azalt">
              <Minus size={16} />
            </button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Artır">
              <Plus size={16} />
            </button>
          </div>

          <div className="option-modal-live-price">
            <span>Toplam</span>
            <strong>{formatCurrency(livePrice)}</strong>
          </div>

          <button
            type="button"
            className="option-modal-add-btn"
            disabled={!canAdd}
            onClick={handleConfirm}
          >
            <ShoppingCart size={18} />
            Sepete Ekle
          </button>

          {!canAdd && (
            <p className="option-modal-validation">
              Lütfen zorunlu seçimleri yapın: {missingRequired.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function buildDefaults(product: Product): Record<string, string[]> {
  const defaults: Record<string, string[]> = {}
  for (const group of product.optionGroups ?? []) {
    const defaultOpts = group.options.filter((o) => o.isDefault).map((o) => o.id)
    if (defaultOpts.length > 0) {
      defaults[group.id] = group.selectionType === 'single' ? [defaultOpts[0]] : defaultOpts
    } else {
      defaults[group.id] = []
    }
  }
  return defaults
}
