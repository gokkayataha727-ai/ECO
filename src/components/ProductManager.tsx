import { ArrowDown, ArrowUp, ChevronDown, Edit3, PackagePlus, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { categories } from '../data/products'
import type { OptionGroup, OptionItem, Product, ProductCategory } from '../types'
import { useVirtualKeyboard } from '../context/VirtualKeyboardContext'

interface ProductManagerProps { isOpen: boolean; onClose: () => void; products: Product[]; onSave: (product: Product, imageFile?: File | null) => void; onDelete: (id: string) => void; initialEditId?: string | null }
type Draft = Omit<Product, 'id'> & { id?: string }
const categoryOptions = categories.filter((item): item is ProductCategory => item !== 'Tümü')
const blankDraft: Draft = { name: '', description: '', price: 0, category: 'Sıcak Kahveler', optionGroups: [] }

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}


function createBlankOption(): OptionItem {
  return {
    id: generateId(),
    name: '',
    priceDelta: 0,
    isDefault: false,
  }
}

export function ProductManager({ isOpen, onClose, products, onSave, onDelete, initialEditId }: ProductManagerProps) {
  const { openKeyboard } = useVirtualKeyboard()
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | undefined>()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const visibleProducts = useMemo(() => products.filter((p) => p.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), [products, query])
  
  useEffect(() => {
    if (isOpen && initialEditId) {
      const p = products.find((prod) => prod.id === initialEditId)
      if (p) {
        setEditingId(p.id)
        setDraft({
          name: p.name,
          description: p.description,
          price: p.price,
          category: p.category,
          badge: p.badge,
          image_url: p.image_url,
          optionGroups: p.optionGroups ? JSON.parse(JSON.stringify(p.optionGroups)) : [],
        })
        setImageFile(null)
      }
    }
  }, [isOpen, initialEditId, products])

  if (!isOpen) return null

  const optionGroups = draft.optionGroups ?? []

  const updateGroups = (updater: (groups: OptionGroup[]) => OptionGroup[]) => {
    setDraft((d) => ({ ...d, optionGroups: updater(d.optionGroups ?? []) }))
  }

  const addGroup = (preset: 'size' | 'extra') => {
    updateGroups((gs) => [...gs, {
      id: generateId(),
      name: preset === 'size' ? 'Boyut' : 'Ekstra Özellikler',
      selectionType: preset === 'size' ? 'single' : 'multiple',
      required: preset === 'size',
      options: preset === 'size' 
        ? [
            { id: generateId(), name: 'Küçük', priceDelta: 0, isDefault: true },
            { id: generateId(), name: 'Orta', priceDelta: 0, isDefault: false },
            { id: generateId(), name: 'Büyük', priceDelta: 0, isDefault: false }
          ]
        : [
            { id: generateId(), name: 'Ekstra Shot', priceDelta: 15, isDefault: false },
            { id: generateId(), name: 'Yulaf Sütü', priceDelta: 10, isDefault: false },
            { id: generateId(), name: 'Vanilya Şurubu', priceDelta: 8, isDefault: false }
          ],
    }])
  }
  
  const removeGroup = (groupId: string) => updateGroups((gs) => gs.filter((g) => g.id !== groupId))
  
  const moveGroup = (groupId: string, direction: -1 | 1) => {
    updateGroups((gs) => {
      const idx = gs.findIndex((g) => g.id === groupId)
      if (idx < 0) return gs
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= gs.length) return gs
      const copy = [...gs]
      ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
      return copy
    })
  }

  const updateGroup = (groupId: string, updates: Partial<OptionGroup>) => {
    updateGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, ...updates } : g))
  }

  const addOption = (groupId: string) => {
    updateGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, options: [...g.options, createBlankOption()] } : g))
  }

  const removeOption = (groupId: string, optionId: string) => {
    updateGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g))
  }

  const updateOption = (groupId: string, optionId: string, updates: Partial<OptionItem>) => {
    updateGroups((gs) => gs.map((g) => {
      if (g.id !== groupId) return g
      let opts = g.options.map((o) => o.id === optionId ? { ...o, ...updates } : o)
      // If setting default on single selection, unset other defaults
      if (updates.isDefault && g.selectionType === 'single') {
        opts = opts.map((o) => o.id === optionId ? o : { ...o, isDefault: false })
      }
      return { ...g, options: opts }
    }))
  }

  const startNew = () => { setEditingId(undefined); setDraft(blankDraft); setImageFile(null) }
  const startEdit = (product: Product) => {
    setEditingId(product.id)
    setDraft({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      badge: product.badge,
      image_url: product.image_url,
      optionGroups: product.optionGroups ? JSON.parse(JSON.stringify(product.optionGroups)) : [],
    })
    setImageFile(null)
  }

  const save = () => {
    if (!draft.name.trim() || draft.price <= 0) return
    const id = editingId ?? `${draft.name.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]+/gi, '-').replace(/^-|-$/g, '')}-${Date.now()}`
    // Clean up empty option groups
    const cleanedGroups = (draft.optionGroups ?? [])
      .filter((g) => g.name.trim() && g.options.length > 0)
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.name.trim()),
      }))
      .filter((g) => g.options.length > 0)

    onSave({
      ...draft,
      id,
      name: draft.name.trim(),
      description: draft.description.trim() || 'Günün seçimi',
      price: Number(draft.price),
      optionGroups: cleanedGroups.length > 0 ? cleanedGroups : undefined,
    } as Product, imageFile)
    startNew()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Ürün yönetimi">
      <div className="modal product-manager">
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1"><PackagePlus size={13} /> Menü yönetimi</p>
            <h2 className="section-title">Ürünler & fiyatlar</h2>
            <p className="muted mt-1">Katalogdaki ürünleri anında güncelleyin.</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Ürün yönetimini kapat"><X size={18} /></button>
        </div>

        <div className="manager-layout">
          {/* Product List */}
          <div className="manager-list">
            <div className="manager-list-head">
              <div className="manager-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClick={() => openKeyboard({ value: query, onChange: setQuery, mode: 'text', title: 'Ürün Arama' })}
                  placeholder="Ürün ara..."
                  aria-label="Menüde ürün ara"
                />
              </div>
              <button type="button" className="new-product-button" onClick={startNew}><Plus size={15} /> Yeni ürün</button>
            </div>
            <div className="manager-count">{visibleProducts.length} ürün listeleniyor</div>
            <div className="manager-products">
              {visibleProducts.map((product) => (
                <div className={`manager-product ${editingId === product.id ? 'active' : ''}`} key={product.id}>
                  <div className="manager-product-main">
                    <span className="manager-product-icon"><PackagePlus size={15} /></span>
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.category} · {formatPrice(product.price)}
                        {product.optionGroups && product.optionGroups.length > 0 && (
                          <> · <span style={{ color: '#8a6d57', fontWeight: 700 }}>{product.optionGroups.length} seçenek</span></>
                        )}
                      </small>
                    </div>
                  </div>
                  <div className="manager-product-actions">
                    <button type="button" onClick={() => startEdit(product)} aria-label={`${product.name} düzenle`}><Edit3 size={15} /></button>
                    <button type="button" onClick={() => setConfirmId(product.id)} aria-label={`${product.name} sil`}><Trash2 size={15} /></button>
                  </div>
                  {confirmId === product.id && (
                    <div className="delete-confirm">
                      <span>Silinsin mi?</span>
                      <button type="button" onClick={() => { onDelete(product.id); setConfirmId(null); if (editingId === product.id) startNew() }}>Sil</button>
                      <button type="button" onClick={() => setConfirmId(null)}>Vazgeç</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Product Form */}
          <div className="product-form">
            <div className="form-heading">
              <div>
                <p className="section-kicker">{editingId ? 'Ürün düzenle' : 'Yeni ürün'}</p>
                <h3>{editingId ? 'Ürün bilgilerini güncelle' : 'Menüye ürün ekle'}</h3>
              </div>
              {editingId && <button type="button" className="text-button" onClick={startNew}>Yeniye geç</button>}
            </div>

            <label>
              Ürün adı
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onClick={() => openKeyboard({
                  value: draft.name,
                  onChange: (val) => setDraft((d) => ({ ...d, name: val })),
                  mode: 'text',
                  title: 'Ürün Adı Girin',
                })}
                placeholder="Örn. Vanilyalı Latte"
              />
            </label>
            <label>
              Açıklama
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onClick={() => openKeyboard({
                  value: draft.description,
                  onChange: (val) => setDraft((d) => ({ ...d, description: val })),
                  mode: 'text',
                  title: 'Açıklama Girin',
                })}
                placeholder="Örn. 350 ml · özel şurup"
              />
            </label>
            <div className="form-row">
              <label>
                Fiyat (₺)
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={draft.price || ''}
                  onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                  onClick={() => openKeyboard({
                    value: draft.price ? String(draft.price) : '',
                    onChange: (val) => setDraft((d) => ({ ...d, price: Number(val) || 0 })),
                    mode: 'number',
                    title: 'Ürün Fiyatı (₺)',
                  })}
                />
              </label>
              <label>Kategori<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductCategory })}>{categoryOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            </div>
            <label>Rozet <select value={draft.badge ?? ''} onChange={(e) => setDraft({ ...draft, badge: (e.target.value || undefined) as Product['badge'] })}><option value="">Rozet yok</option><option value="Yeni">Yeni</option><option value="Çok Satan">Çok Satan</option></select></label>
            <label>Ürün Görseli <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={{marginTop: '0.5rem'}} /></label>

            {/* === Option Groups Section === */}
            <div className="option-groups-section">
              <div className="option-groups-section-header">
                <div>
                  <h4>Seçenek Grupları</h4>
                  <p>Boyut, süt seçimi veya ekstra malzemeler tanımlayın.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="add-option-group-btn" onClick={() => addGroup('size')}>
                    <Plus size={13} /> Boyut Seçeneği
                  </button>
                  <button type="button" className="add-option-group-btn" onClick={() => addGroup('extra')}>
                    <Plus size={13} /> Ekstra Özellik
                  </button>
                </div>
              </div>

              {optionGroups.map((group, groupIdx) => (
                <div className="option-group-card" key={group.id}>
                  <div className="option-group-header">
                    <div className="option-group-header-inputs">
                      <input
                        style={{
                          flex: '1 1 auto',
                          minWidth: 0,
                          height: '36px',
                          minHeight: '36px',
                          background: '#ffffff',
                          border: '1px solid #dfd5cc',
                          borderRadius: '8px',
                          padding: '0 10px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#4d382c'
                        }}
                        value={group.name}
                        onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                        onClick={() => openKeyboard({
                          value: group.name,
                          onChange: (val) => updateGroup(group.id, { name: val }),
                          mode: 'text',
                          title: 'Grup Adı Girin',
                        })}
                        placeholder="Grup adı (örn. Boyut, Ekstra Özellikler)"
                      />
                      <div className="option-group-controls">
                        <button
                          type="button"
                          className="option-group-tag type-tag"
                          onClick={() => updateGroup(group.id, {
                            selectionType: group.selectionType === 'single' ? 'multiple' : 'single',
                          })}
                        >
                          <ChevronDown size={10} />
                          {group.selectionType === 'single' ? 'Tek Seçim' : 'Çoklu Seçim'}
                        </button>
                      </div>
                    </div>
                    <div className="option-group-actions">
                      {groupIdx > 0 && (
                        <button type="button" className="option-group-action-btn" onClick={() => moveGroup(group.id, -1)} aria-label="Yukarı taşı">
                          <ArrowUp size={13} />
                        </button>
                      )}
                      {groupIdx < optionGroups.length - 1 && (
                        <button type="button" className="option-group-action-btn" onClick={() => moveGroup(group.id, 1)} aria-label="Aşağı taşı">
                          <ArrowDown size={13} />
                        </button>
                      )}
                      <button type="button" className="option-group-action-btn delete" onClick={() => removeGroup(group.id)} aria-label="Grubu sil">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="options-list">
                    {group.options.map((opt) => (
                      <div
                        className="option-item-row"
                        key={opt.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '6px 8px',
                          background: '#faf6f1',
                          borderRadius: '8px'
                        }}
                      >
                        <div className="option-item-default" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
                          <input
                            type={group.selectionType === 'single' ? 'radio' : 'checkbox'}
                            name={`default-${group.id}`}
                            checked={opt.isDefault}
                            onChange={() => updateOption(group.id, opt.id, { isDefault: !opt.isDefault })}
                            title="Varsayılan"
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#8a6d57' }}
                          />
                        </div>
                        <input
                          className="option-item-name"
                          style={{
                            flex: '1 1 auto',
                            width: '100%',
                            minWidth: 0,
                            height: '36px',
                            minHeight: '36px',
                            background: '#ffffff',
                            border: '1px solid #dfd5cc',
                            borderRadius: '8px',
                            padding: '0 10px',
                            fontSize: '13px',
                            color: '#4d382c'
                          }}
                          value={opt.name}
                          onChange={(e) => updateOption(group.id, opt.id, { name: e.target.value })}
                          onClick={() => openKeyboard({
                            value: opt.name,
                            onChange: (val) => updateOption(group.id, opt.id, { name: val }),
                            mode: 'text',
                            title: 'Seçenek Adı Girin',
                          })}
                          placeholder="Seçenek adı (örn: Küçük, Ekstra Shot)"
                        />
                        <input
                          className="option-item-price"
                          style={{
                            flex: '0 0 100px',
                            width: '100px',
                            minWidth: '100px',
                            maxWidth: '100px',
                            height: '36px',
                            minHeight: '36px',
                            background: '#ffffff',
                            border: '1px solid #dfd5cc',
                            borderRadius: '8px',
                            padding: '0 8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#8a6d57'
                          }}
                          type="number"
                          step="0.5"
                          value={opt.priceDelta || ''}
                          onChange={(e) => updateOption(group.id, opt.id, { priceDelta: Number(e.target.value) || 0 })}
                          onClick={() => openKeyboard({
                            value: opt.priceDelta ? String(opt.priceDelta) : '',
                            onChange: (val) => updateOption(group.id, opt.id, { priceDelta: Number(val) || 0 }),
                            mode: 'number',
                            title: 'Fiyat Farkı (₺)',
                          })}
                          placeholder="+ Fiyat (₺)"
                          title="Fiyat Farkı"
                        />
                        <button
                          type="button"
                          className="option-item-delete"
                          onClick={() => removeOption(group.id, opt.id)}
                          aria-label="Seçeneği sil"
                          style={{ flex: '0 0 auto' }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="add-option-btn" onClick={() => addOption(group.id)}>
                      <Plus size={12} /> Seçenek Ekle
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="save-product-button" disabled={!draft.name.trim() || draft.price <= 0} onClick={save}>
              <Save size={17} /> {editingId ? 'Değişiklikleri kaydet' : 'Ürünü menüye ekle'}
            </button>
            <p className="form-hint">Değişiklikler anında menüye yansır ve veritabanına kaydedilir.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const formatPrice = (value: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value)
