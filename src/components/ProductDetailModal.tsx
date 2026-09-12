import { CakeSlice, Coffee, Croissant, CupSoda, Edit3, Leaf, Plus, X, Layers, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '../lib/format'
import type { Product, ProductCategory } from '../types'

interface ProductDetailModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  onEditProduct?: (product: Product) => void
  onAddProduct?: (productId: string) => void
}

const categoryVisual = (category: ProductCategory) => {
  const props = { size: 48, strokeWidth: 1.5 }
  if (category === 'Sıcak Kahveler') return { icon: <Coffee {...props} />, className: 'hot' }
  if (category === 'Soğuk İçecekler') return { icon: <CupSoda {...props} />, className: 'cold' }
  if (category === 'Tatlılar') return { icon: <CakeSlice {...props} />, className: 'sweet' }
  if (category === 'Atıştırmalıklar') return { icon: <Croissant {...props} />, className: 'snack' }
  return { icon: <Leaf {...props} />, className: 'tea' }
}

const getImageUrl = (url?: string) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  const cleanPath = url.startsWith('/') ? url : `/${url}`
  return `http://localhost:8000${cleanPath}`
}

export function ProductDetailModal({ product, isOpen, onClose, onEditProduct, onAddProduct }: ProductDetailModalProps) {
  if (!isOpen || !product) return null

  const visual = categoryVisual(product.category)
  const imageUrl = getImageUrl(product.image_url)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Ürün Detayları" onClick={onClose}>
      <div className="modal product-detail-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', borderRadius: '24px', overflow: 'hidden' }}>
        
        {/* Top Hero / Header Section */}
        <div style={{ position: 'relative', width: '100%', height: '200px', background: 'linear-gradient(135deg, #f4ebe3 0%, #e9ded4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className={`product-visual ${visual.className}`} style={{ width: '90px', height: '90px', borderRadius: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
              {visual.icon}
            </div>
          )}

          {/* Close Button */}
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Kapat"
            style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)' }}
          >
            <X size={18} />
          </button>

          {/* Badge */}
          {product.badge && (
            <span
              className="product-badge"
              style={{ position: 'absolute', top: '16px', left: '16px', fontSize: '11px', padding: '5px 10px', borderRadius: '8px' }}
            >
              {product.badge}
            </span>
          )}
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <span className="section-kicker" style={{ display: 'inline-block', marginBottom: '4px' }}>
                {product.category}
              </span>
              <h2 className="section-title" style={{ fontSize: '24px', lineHeight: '1.2' }}>
                {product.name}
              </h2>
            </div>
            <div className="product-price" style={{ fontSize: '22px', fontWeight: '850', color: '#5c493d', marginTop: '0', whiteSpace: 'nowrap' }}>
              {formatCurrency(product.price)}
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <p style={{ marginTop: '12px', fontSize: '14px', color: '#7a6759', lineHeight: '1.5' }}>
              {product.description}
            </p>
          )}

          {/* Option Groups Preview */}
          {product.optionGroups && product.optionGroups.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e9e1d8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '750', color: '#5c493d', marginBottom: '12px' }}>
                <Layers size={15} style={{ color: '#8a6d57' }} />
                <span>Ürün Seçenekleri & Varyasyonlar</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {product.optionGroups.map((group) => (
                  <div key={group.id} style={{ background: '#faf6f1', padding: '12px 14px', borderRadius: '12px', border: '1px solid #dfd5cc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#4d382c' }}>{group.name}</span>
                      <span style={{ fontSize: '11px', color: '#9b8a7f', background: '#f4ebe3', padding: '2px 8px', borderRadius: '6px' }}>
                        {group.selectionType === 'single' ? 'Tek Seçim' : 'Çoklu Seçim'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {group.options.map((opt) => (
                        <div
                          key={opt.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            background: '#ffffff',
                            border: '1px solid #e9e1d8',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#5c493d'
                          }}
                        >
                          {opt.isDefault && <CheckCircle2 size={12} style={{ color: '#8a6d57' }} />}
                          <span>{opt.name}</span>
                          {opt.priceDelta > 0 && (
                            <span style={{ fontWeight: '700', color: '#8a6d57' }}>+{formatCurrency(opt.priceDelta)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {onEditProduct && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onEditProduct(product)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  border: '1px solid #dfd5cc',
                  background: '#faf6f1',
                  color: '#5c493d',
                  fontSize: '13px',
                  fontWeight: '750',
                  transition: '.18s'
                }}
                className="hover:bg-stone-200"
              >
                <Edit3 size={16} />
                <span>Ürünü Düzenle</span>
              </button>
            )}

            {onAddProduct ? (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onAddProduct(product.id)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: '0',
                  background: '#8a6d57',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '800',
                  transition: '.18s'
                }}
                className="hover:bg-stone-900"
              >
                <Plus size={16} strokeWidth={2.5} />
                <span>Sepete Ekle</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: '0',
                  background: '#8a6d57',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '800'
                }}
              >
                Tamam
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
