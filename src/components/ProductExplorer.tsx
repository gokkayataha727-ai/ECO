import { CakeSlice, Coffee, Croissant, CupSoda, Edit3, Eye, Keyboard as KeyboardIcon, Leaf, MoreVertical, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { categories } from '../data/products'
import { formatCurrency } from '../lib/format'
import { VirtualKeyboard } from './VirtualKeyboard'
import type { Product, ProductCategory } from '../types'

interface ProductExplorerProps {
  category: string
  onCategoryChange: (category: string) => void
  onAddProduct?: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  products: Product[]
  onOpenProducts: () => void
  readOnly?: boolean
  onEditProduct?: (product: Product) => void
  onViewDetail?: (product: Product) => void
  onDeleteProduct?: (id: string) => void
}

const categoryVisual = (category: ProductCategory) => {
  const props = { size: 27, strokeWidth: 1.7 }
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

const ProductCard = memo(({ 
  product, 
  onAddProduct, 
  readOnly,
  onEditProduct,
  onViewDetail,
  onDeleteProduct
}: { 
  product: Product
  onAddProduct?: (id: string) => void
  readOnly?: boolean
  onEditProduct?: (product: Product) => void
  onViewDetail?: (product: Product) => void
  onDeleteProduct?: (id: string) => void
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const visual = categoryVisual(product.category)
  const isInteractive = !readOnly && !!onAddProduct
  const imageUrl = getImageUrl(product.image_url)

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleCardClick = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false)
      return
    }
    if (isInteractive && onAddProduct) {
      onAddProduct(product.id)
    } else if (onViewDetail) {
      onViewDetail(product)
    }
  }

  return (
    <article
      className={`product-card${readOnly ? ' product-card--readonly' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${product.name} detaylarını gör`}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleCardClick()
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* 3-Dots Action Menu Button */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
        <button
          type="button"
          className="product-options-trigger"
          aria-label="Ürün Seçenekleri"
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen((prev) => !prev)
          }}
        >
          <MoreVertical size={16} />
        </button>

        {isMenuOpen && (
          <div 
            ref={menuRef} 
            className="product-card-menu"
            onClick={(e) => e.stopPropagation()}
          >
            {onViewDetail && (
              <button
                type="button"
                className="product-card-menu-item"
                onClick={() => {
                  setIsMenuOpen(false)
                  onViewDetail(product)
                }}
              >
                <Eye size={14} />
                <span>Detaylar</span>
              </button>
            )}
            {onEditProduct && (
              <button
                type="button"
                className="product-card-menu-item"
                onClick={() => {
                  setIsMenuOpen(false)
                  onEditProduct(product)
                }}
              >
                <Edit3 size={14} />
                <span>Ürünü Düzenle</span>
              </button>
            )}
            {onDeleteProduct && (
              <button
                type="button"
                className="product-card-menu-item danger"
                onClick={() => {
                  setIsMenuOpen(false)
                  if (window.confirm(`"${product.name}" ürününü silmek istediğinize emin misiniz?`)) {
                    onDeleteProduct(product.id)
                  }
                }}
              >
                <Trash2 size={14} />
                <span>Ürünü Sil</span>
              </button>
            )}
          </div>
        )}
      </div>

      {imageUrl ? (
        <div className="product-visual image-visual" style={{ padding: 0, overflow: 'hidden' }}>
          <img
            src={imageUrl}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className={`product-visual ${visual.className}`}>{visual.icon}</div>
      )}

      {product.badge && <span className="product-badge">{product.badge}</span>}

      <h2 className="product-name">{product.name}</h2>
      <span className="product-meta">{product.description}</span>
      <div className="product-price">{formatCurrency(product.price)}</div>

      {isInteractive && (
        <button
          type="button"
          className="add-button"
          aria-label={`${product.name} ekle`}
          onClick={(event) => {
            event.stopPropagation()
            onAddProduct(product.id)
          }}
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      )}
    </article>
  )
})

export const ProductExplorer = memo(function ProductExplorer({
  category,
  onCategoryChange,
  onAddProduct,
  search,
  onSearchChange,
  searchRef,
  products,
  onOpenProducts,
  readOnly = false,
  onEditProduct,
  onViewDetail,
  onDeleteProduct,
}: ProductExplorerProps) {
  const [isKbOpen, setIsKbOpen] = useState(false)

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')
    return products.filter((product) => {
      const inCategory = category === 'Tümü' || product.category === category
      const inSearch = !normalizedSearch || `${product.name} ${product.category}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch)
      return inCategory && inSearch
    })
  }, [products, category, search])

  return (
    <section className="catalog surface">
      <div className="catalog-header flex items-end justify-between gap-3">
        <div>
          <p className="section-kicker">{readOnly ? 'Ürün kataloğu' : 'Hızlı satış'}</p>
          <h1 className="section-title">{readOnly ? 'Menü & Fiyat Listesi' : 'Menüden seçin'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={onOpenProducts}
            className="hidden items-center gap-1.5 rounded-xl bg-stone-100 px-4 py-2 text-[12px] font-bold text-stone-700 md:flex border border-stone-200 hover:bg-stone-200 hover:text-stone-800 transition-colors shadow-sm"
          >
            <Plus size={15} />
            Ürün Ekle / Düzenle
          </button>
          <div className="hidden items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 md:flex">
            <Sparkles size={14} /> Favorileriniz hazır
          </div>
        </div>
      </div>

      <label className="search-box search-box-animated flex items-center justify-between" aria-label="Ürün ara">
        <div className="flex items-center gap-2 flex-1">
          <Search size={19} aria-hidden="true" />
          <input ref={searchRef} value={search} onChange={(event) => onSearchChange(event.target.value)} onClick={() => setIsKbOpen(true)} placeholder="Ürün ara..." />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setIsKbOpen(true)
            }}
            title="Sanal Klavye Aç"
          >
            <KeyboardIcon size={16} />
          </button>
          <span className="shortcut">F2</span>
        </div>
      </label>

      <VirtualKeyboard
        isOpen={isKbOpen}
        onClose={() => setIsKbOpen(false)}
        title="Ürün Ara"
        value={search}
        onChange={onSearchChange}
      />

      <div className="category-tabs category-tabs-animated" role="tablist" aria-label="Ürün kategorileri">
        {categories.map((item) => (
          <button
            type="button"
            className={`category-button ${category === item ? 'selected' : ''}`}
            key={item}
            role="tab"
            aria-selected={category === item}
            onClick={() => onCategoryChange(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredProducts.length > 0 ? (
        <div className="product-grid product-grid-animated" aria-live="polite">
          {filteredProducts.map((product) => (
            <ProductCard 
              key={product.id} 
              product={product} 
              onAddProduct={onAddProduct}
              readOnly={readOnly}
              onEditProduct={onEditProduct}
              onViewDetail={onViewDetail}
              onDeleteProduct={onDeleteProduct}
            />
          ))}
        </div>
      ) : (
        <div className="empty-results">
          <div>
            <div className="empty-icon"><Search size={28} /></div>
            <h2 className="section-title text-[18px]">Sonuç bulunamadı</h2>
            <p className="muted mt-2">Aramanızı veya kategori seçiminizi değiştirin.</p>
          </div>
        </div>
      )}
    </section>
  )
})
