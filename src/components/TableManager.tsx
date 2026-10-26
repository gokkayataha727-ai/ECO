import { Edit3, Plus, Save, Search, Trash2, LayoutGrid } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Table } from '../types'
import { ManagementModalLayout } from './ManagementModalLayout'

interface TableManagerProps {
  isOpen: boolean
  onClose: () => void
  tables: Table[]
  onSave: (table: Pick<Table, 'id' | 'name'>) => void
  onDelete: (id: string) => void
}

type Draft = { name: string }
const blankDraft: Draft = { name: '' }

export function TableManager({ isOpen, onClose, tables, onSave, onDelete }: TableManagerProps) {
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | undefined>()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const visibleTables = useMemo(
    () =>
      tables.filter((t) =>
        t.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')),
      ),
    [tables, query],
  )

  const startNew = () => {
    setEditingId(undefined)
    setDraft(blankDraft)
  }

  const startEdit = (table: Table) => {
    setEditingId(table.id)
    setDraft({ name: table.name })
  }

  const save = () => {
    if (!draft.name.trim()) return
    const id = editingId ?? `table-${Date.now()}`
    onSave({ id, name: draft.name.trim() })
    startNew()
  }

  return (
    <ManagementModalLayout
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Masa yönetimi"
      kicker={
        <>
          <LayoutGrid size={13} /> Masa yönetimi
        </>
      }
      title="Masalar"
      subtitle="Mekanınızdaki masaları ekleyin veya düzenleyin."
      closeAriaLabel="Masa yönetimini kapat"
      rightPanelKey={editingId ?? 'new'}
      leftHeader={
        <>
          <div className="manager-list-head">
            <div className="manager-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Masa ara..."
                aria-label="Masa ara"
              />
            </div>
            <button type="button" className="new-product-button" onClick={startNew}>
              <Plus size={15} /> Yeni masa
            </button>
          </div>
          <div className="manager-count">{visibleTables.length} masa listeleniyor</div>
        </>
      }
      leftList={
        <div className="manager-products">
          {visibleTables.length === 0 ? (
            <div className="manager-empty">
              <span className="manager-product-icon">
                <LayoutGrid size={16} />
              </span>
              <strong>Eşleşen masa bulunamadı</strong>
              <small>Arama terimini değiştirin veya yeni masa ekleyin.</small>
            </div>
          ) : (
            visibleTables.map((table) => {
              const isOccupied = table.status === 'occupied' || table.cart.length > 0
              return (
                <div
                  className={`manager-product ${editingId === table.id ? 'active' : ''}`}
                  key={table.id}
                >
                  <div className="manager-product-main">
                    <span className="manager-product-icon">
                      <LayoutGrid size={15} />
                    </span>
                    <div>
                      <strong>{table.name}</strong>
                      <small>{isOccupied ? 'Dolu - Silinemez' : 'Boş'}</small>
                    </div>
                  </div>
                  <div className="manager-product-actions">
                    <button
                      type="button"
                      onClick={() => startEdit(table)}
                      aria-label={`${table.name} düzenle`}
                    >
                      <Edit3 size={15} />
                    </button>
                    {!isOccupied && (
                      <button
                        type="button"
                        onClick={() => setConfirmId(table.id)}
                        aria-label={`${table.name} sil`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  {confirmId === table.id && (
                    <div className="delete-confirm">
                      <span>Silinsin mi?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(table.id)
                          setConfirmId(null)
                          if (editingId === table.id) startNew()
                        }}
                      >
                        Sil
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)}>
                        Vazgeç
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      }
      rightPanel={
        <>
          <div className="product-form-body">
            <div className="form-heading">
              <div>
                <p className="section-kicker">{editingId ? 'Masa düzenle' : 'Yeni masa'}</p>
                <h3>{editingId ? 'Masa adını güncelle' : 'Yeni masa ekle'}</h3>
              </div>
              {editingId && (
                <button type="button" className="text-button" onClick={startNew}>
                  Yeniye geç
                </button>
              )}
            </div>
            <label>
              Masa adı
              <input
                value={draft.name}
                onChange={(e) => setDraft({ name: e.target.value })}
                placeholder="Örn. Masa 15, Bahçe 4 vb."
              />
            </label>
          </div>
          <div className="product-form-footer">
            <button
              type="button"
              className="save-product-button"
              disabled={!draft.name.trim()}
              onClick={save}
            >
              <Save size={17} /> {editingId ? 'Değişiklikleri kaydet' : 'Masayı ekle'}
            </button>
            <p className="form-hint">Değişiklikler anında yansır.</p>
          </div>
        </>
      }
    />
  )
}
