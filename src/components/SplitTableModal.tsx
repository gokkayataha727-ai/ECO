import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Split,
  X,
  Check,
  ArrowRight,
  AlertTriangle,
  Minus,
  Plus,
  ArrowLeft,
} from 'lucide-react'
import {
  calculateTotals,
  deriveLinePaymentStates,
  formatCurrency,
  getEffectivePrice,
  isTableOccupied,
  type SplitItemSelection,
} from '../lib/format'
import type { Table } from '../types'

interface SplitTableModalProps {
  sourceTable: Table
  tables: Table[]
  onClose: () => void
  onConfirmSplit: (targetTableId: string, splitItems: SplitItemSelection[]) => void
}

export function SplitTableModal({
  sourceTable,
  tables,
  onClose,
  onConfirmSplit,
}: SplitTableModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [targetTableId, setTargetTableId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)

  // Kaynak masadaki ürünlerin ödeme durumlarını hesapla (ödenen ürünler ayrılamaz)
  const lineStates = useMemo(
    () =>
      deriveLinePaymentStates(
        sourceTable.cart,
        sourceTable.discountRate || 0,
        sourceTable.payments,
      ),
    [sourceTable.cart, sourceTable.discountRate, sourceTable.payments],
  )

  const lineStateMap = useMemo(
    () => new Map(lineStates.map((ls) => [ls.cartItemId, ls])),
    [lineStates],
  )

  // Ayrılabilir (ödenmemiş adedi olan) ürünler
  const selectableItems = useMemo(
    () =>
      sourceTable.cart.filter((item) => {
        const ls = lineStateMap.get(item.cartItemId)
        return ls ? ls.unpaidQty > 0 : item.quantity > 0
      }),
    [sourceTable.cart, lineStateMap],
  )

  // Seçilen toplam adet ve toplam tutar
  const { totalSelectedUnits, totalSelectedAmount } = useMemo(() => {
    let units = 0
    let amount = 0
    for (const item of selectableItems) {
      const qty = selectedQuantities[item.cartItemId] || 0
      if (qty > 0) {
        units += qty
        amount += getEffectivePrice(item) * qty
      }
    }
    return { totalSelectedUnits: units, totalSelectedAmount: amount }
  }, [selectableItems, selectedQuantities])

  // Masadaki tüm ayrılabilir ürünlerin tamamı seçildi mi kontrolü
  const isAllSelected = useMemo(() => {
    if (selectableItems.length === 0) return false
    return selectableItems.every((item) => {
      const ls = lineStateMap.get(item.cartItemId)
      const maxUnpaid = ls ? ls.unpaidQty : item.quantity
      return (selectedQuantities[item.cartItemId] || 0) === maxUnpaid
    })
  }, [selectableItems, lineStateMap, selectedQuantities])

  // Tümünü seç durumu (checkbox için)
  const isAllChecked = useMemo(() => {
    if (selectableItems.length === 0) return false
    return selectableItems.every((item) => (selectedQuantities[item.cartItemId] || 0) > 0)
  }, [selectableItems, selectedQuantities])

  // Tümünü Seç / Kaldır
  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedQuantities({})
    } else {
      const next: Record<string, number> = {}
      for (const item of selectableItems) {
        const ls = lineStateMap.get(item.cartItemId)
        next[item.cartItemId] = ls ? ls.unpaidQty : item.quantity
      }
      setSelectedQuantities(next)
    }
  }, [isAllSelected, selectableItems, lineStateMap])

  // Tekil satır seçimi / kaldırma
  const handleToggleItem = useCallback(
    (cartItemId: string, maxQty: number) => {
      setSelectedQuantities((prev) => {
        const current = prev[cartItemId] || 0
        if (current > 0) {
          const updated = { ...prev }
          delete updated[cartItemId]
          return updated
        }
        return { ...prev, [cartItemId]: maxQty }
      })
    },
    [],
  )

  // Miktar artırma / azaltma
  const handleQuantityChange = useCallback(
    (cartItemId: string, delta: number, maxQty: number) => {
      setSelectedQuantities((prev) => {
        const current = prev[cartItemId] || 0
        const next = Math.max(0, Math.min(maxQty, current + delta))
        const updated = { ...prev }
        if (next === 0) {
          delete updated[cartItemId]
        } else {
          updated[cartItemId] = next
        }
        return updated
      })
    },
    [],
  )

  // Hedef olabilecek diğer masalar (kaynak masa hariç)
  const candidateTables = useMemo(
    () => tables.filter((t) => t.id !== sourceTable.id),
    [tables, sourceTable.id],
  )

  const selectedTargetTable = useMemo(
    () => (targetTableId ? candidateTables.find((t) => t.id === targetTableId) || null : null),
    [candidateTables, targetTableId],
  )

  // Bölme işlemini onayla ve çalıştır
  const handleConfirm = useCallback(() => {
    if (!targetTableId || isSubmitting) return

    // Doğrulama: Kaynak masanın güncel verisi hala uygun mu?
    const freshSource = tables.find((t) => t.id === sourceTable.id)
    if (!freshSource) {
      setConflictError('Kaynak masa bulunamadı. Lütfen sayfayı yenileyin.')
      return
    }

    const splitItems: SplitItemSelection[] = []
    for (const [cartItemId, quantity] of Object.entries(selectedQuantities)) {
      if (quantity > 0) {
        const sourceItem = freshSource.cart.find((i) => i.cartItemId === cartItemId)
        if (!sourceItem || sourceItem.quantity < quantity) {
          setConflictError(
            'Masa siparişi başka bir işlemde güncellendi. Lütfen işlemi tekrar deneyin.',
          )
          return
        }
        splitItems.push({ cartItemId, quantity })
      }
    }

    if (splitItems.length === 0) {
      setConflictError('Lütfen ayrılacak en az bir ürün seçin.')
      return
    }

    setIsSubmitting(true)
    setConflictError(null)
    onConfirmSplit(targetTableId, splitItems)
  }, [targetTableId, isSubmitting, tables, sourceTable.id, selectedQuantities, onConfirmSplit])

  // Klavye yönetimi: Esc ile kapat, Enter ile ilerle/onayla
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter') {
        if (step === 1 && totalSelectedUnits > 0) {
          e.preventDefault()
          setStep(2)
        } else if (step === 2 && targetTableId && !isSubmitting) {
          e.preventDefault()
          handleConfirm()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [step, totalSelectedUnits, targetTableId, isSubmitting, onClose, handleConfirm])

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Masayı Ayır"
      onClick={onClose}
    >
      <div
        className="modal max-w-2xl w-[95vw] sm:w-[580px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Başlığı */}
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1.5 text-xs font-bold text-[#8a6d57]">
              <Split size={14} /> Masa İşlemleri
            </p>
            <h2 className="section-title text-xl font-bold text-[#3b291f] mt-0.5">Masayı Ayır</h2>
            <p className="muted text-xs text-[#8c7a6e] mt-0.5">
              {step === 1
                ? `${sourceTable.name} masasından ayrılacak ürünleri ve adetleri seçin.`
                : 'Ayrılan ürünlerin aktarılacağı hedef masayı seçin.'}
            </p>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Adım Göstergesi */}
        <div className="px-6 pt-3 pb-1 border-b border-[#dfd5cc]/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 ${
                step === 1
                  ? 'bg-[#8a6d57] text-white shadow-xs'
                  : 'bg-[#ede3da] text-[#6d5545]'
              }`}
            >
              1. Ayrılacak Ürünler
            </span>
            <ArrowRight size={13} className="text-[#a89587]" />
            <span
              className={`px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 ${
                step === 2
                  ? 'bg-[#8a6d57] text-white shadow-xs'
                  : 'bg-[#ede3da] text-[#6d5545]'
              }`}
            >
              2. Hedef Masa
            </span>
          </div>
          <span className="text-[11px] font-semibold text-[#8a6d57]">
            {sourceTable.name}
          </span>
        </div>

        <div className="payment-body">
          {conflictError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{conflictError}</span>
            </div>
          )}

          {/* ADIM 1: ÜRÜN SEÇİMİ */}
          {step === 1 && (
            <div className="space-y-3">
              {selectableItems.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm font-semibold text-[#6d5545]">
                    Bu masada ayrılabilecek ödenmemiş ürün bulunmuyor.
                  </p>
                  <p className="text-xs text-[#a08e82] mt-1">
                    Ödenmiş siparişler başka masaya aktarılamaz.
                  </p>
                </div>
              ) : (
                <>
                  {/* Tümünü Seç Barı */}
                  <div className="flex items-center justify-between px-3 py-2 bg-[#f4ebe3] rounded-xl border border-[#dfd5cc] text-xs font-bold text-[#4a3528]">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isAllChecked}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded text-[#8a6d57] focus:ring-[#8a6d57] border-gray-300 cursor-pointer accent-[#8a6d57]"
                      />
                      <span>Tümünü Seç ({selectableItems.length} ürün)</span>
                    </label>
                    <span className="text-[11px] text-[#8a6d57] font-semibold">
                      {isAllSelected ? 'Tümü seçili' : `${totalSelectedUnits} adet seçildi`}
                    </span>
                  </div>

                  {/* Ürün Listesi */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {sourceTable.cart.map((item) => {
                      const lineState = lineStateMap.get(item.cartItemId)
                      const maxUnpaid = lineState ? lineState.unpaidQty : item.quantity
                      const isPaid = maxUnpaid <= 0
                      const selectedQty = selectedQuantities[item.cartItemId] || 0
                      const isSelected = selectedQty > 0
                      const unitPrice = getEffectivePrice(item)

                      if (isPaid) {
                        return (
                          <div
                            key={item.cartItemId}
                            className="p-3 rounded-xl border border-[#e6ddd4] bg-[#f9f7f4] opacity-60 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-bold text-[#6d5545] line-through">
                                {item.name}
                              </div>
                              <div className="text-[11px] text-[#a08e82]">
                                {item.quantity} adet · {formatCurrency(unitPrice)}
                              </div>
                            </div>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Ödendi (Ayrılamaz)
                            </span>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={item.cartItemId}
                          className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between gap-2.5 ${
                            isSelected
                              ? 'border-[#8a6d57] bg-[#fdfaf7] shadow-xs'
                              : 'border-[#dfd5cc] bg-white hover:border-[#c9bdb3]'
                          }`}
                        >
                          {/* Sol: Checkbox + Ürün Bilgisi */}
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleItem(item.cartItemId, maxUnpaid)}
                              className="w-4 h-4 mt-0.5 rounded text-[#8a6d57] focus:ring-[#8a6d57] border-gray-300 cursor-pointer accent-[#8a6d57]"
                            />
                            <div
                              className="min-w-0 cursor-pointer select-none"
                              onClick={() => handleToggleItem(item.cartItemId, maxUnpaid)}
                            >
                              <div className="font-bold text-sm text-[#3b291f] truncate">
                                {item.name}
                              </div>
                              {item.selectedOptions && item.selectedOptions.length > 0 && (
                                <div className="text-[11px] text-[#8a6d57] font-medium truncate mt-0.5">
                                  {item.selectedOptions.map((o) => o.optionName).join(', ')}
                                </div>
                              )}
                              <div className="text-xs text-[#8c7a6e] font-semibold mt-0.5">
                                Birim: {formatCurrency(unitPrice)} · Toplam: {maxUnpaid} adet
                              </div>
                            </div>
                          </div>

                          {/* Sağ: Miktar Seçici (- / +) ve Seçilen Tutar */}
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Miktar Stepper */}
                            <div className="flex items-center border border-[#dfd5cc] rounded-lg bg-[#faf6f1] p-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleQuantityChange(item.cartItemId, -1, maxUnpaid)
                                }}
                                disabled={selectedQty === 0}
                                className="w-7 h-7 rounded-md grid place-items-center text-[#5c493d] hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Azalt"
                                aria-label={`${item.name} adedini azalt`}
                              >
                                <Minus size={13} />
                              </button>
                              <span className="w-8 text-center text-xs font-extrabold text-[#3b291f]">
                                {selectedQty}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleQuantityChange(item.cartItemId, 1, maxUnpaid)
                                }}
                                disabled={selectedQty >= maxUnpaid}
                                className="w-7 h-7 rounded-md grid place-items-center text-[#5c493d] hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Artır"
                                aria-label={`${item.name} adedini artır`}
                              >
                                <Plus size={13} />
                              </button>
                            </div>

                            {/* Satır Tutarı */}
                            <div className="w-20 text-right">
                              <div className="text-xs font-extrabold text-[#3b291f]">
                                {formatCurrency(unitPrice * (selectedQty || 1))}
                              </div>
                              {selectedQty > 0 && (
                                <div className="text-[10px] text-[#8a6d57] font-semibold">
                                  {selectedQty} adet seçili
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Tüm Ürünler Seçildi Uyarısı */}
                  {isAllSelected && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2 animate-in fade-in duration-200">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold">Bilgi:</strong> Masadaki tüm ürünler seçildi.
                        Bu işlem masayı tamamen taşımak ile aynı sonucu doğuracaktır.
                      </div>
                    </div>
                  )}

                  {/* Canlı Özet Çubuğu */}
                  <div className="p-3.5 rounded-xl bg-[#f4ebe3] border border-[#dfd5cc] flex items-center justify-between text-xs font-bold text-[#3b291f]">
                    <span>Ayrılıyor:</span>
                    <span className="text-[#8a6d57] text-sm font-extrabold">
                      {totalSelectedUnits} ürün · {formatCurrency(totalSelectedAmount)}
                    </span>
                  </div>
                </>
              )}

              {/* Butonlar */}
              <div className="success-actions mt-4">
                <button type="button" className="outline-action" onClick={onClose}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="solid-action disabled:opacity-45"
                  disabled={totalSelectedUnits === 0}
                  onClick={() => setStep(2)}
                >
                  <span>Devam Et</span>
                  <ArrowRight size={15} className="ml-1 inline" />
                </button>
              </div>
            </div>
          )}

          {/* ADIM 2: HEDEF MASA SEÇİMİ */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="text-xs text-[#6d5545] font-semibold mb-1">
                <strong>{totalSelectedUnits} ürün</strong> ({formatCurrency(totalSelectedAmount)})
                hangi masaya aktarılsın?
              </div>

              {candidateTables.length === 0 ? (
                <p className="muted text-center py-6">Aktarılabilecek başka masa bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {candidateTables.map((target) => {
                    const isSelected = targetTableId === target.id
                    const isOccupied = isTableOccupied(target)
                    const { total: candTotal } = calculateTotals(
                      target.cart,
                      target.discountRate || 0,
                    )
                    const itemCount = target.cart.reduce((s, i) => s + i.quantity, 0)

                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => setTargetTableId(target.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-1.5 ${
                          isSelected
                            ? 'border-[#8a6d57] bg-[#f4ebe3] text-[#3a2a20] shadow-sm'
                            : 'border-[#dfd5cc] bg-[#fcfaf7] text-[#5c493d] hover:border-[#c9bdb3] hover:bg-[#f9f5f0]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">{target.name}</div>
                          {isOccupied ? (
                            <div className="text-[11px] font-semibold text-[#8a6d57] mt-0.5 truncate">
                              Dolu · {itemCount} ürün · {formatCurrency(candTotal)}
                            </div>
                          ) : (
                            <div className="text-[11px] font-semibold text-[#a08e82] mt-0.5">
                              Boş
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-[#8a6d57] text-white grid place-items-center shrink-0">
                            <Check size={12} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Seçilen Hedef Masa Bilgilendirme Kutusu */}
              {selectedTargetTable && (
                <div className="p-3.5 rounded-xl bg-[#f4ebe3] border border-[#dfd5cc] text-xs text-[#5c493d] space-y-1 animate-in fade-in duration-150">
                  <div className="font-bold text-[#3b291f] flex items-center gap-1.5">
                    <Split size={14} className="text-[#8a6d57] shrink-0" />
                    <span>
                      {sourceTable.name} → {selectedTargetTable.name}
                    </span>
                  </div>
                  {isTableOccupied(selectedTargetTable) ? (
                    <div className="font-semibold text-[#6d5a4e]">
                      <strong>{selectedTargetTable.name}</strong> şu an dolu. Seçilen {totalSelectedUnits} ürün bu masanın mevcut siparişine eklenecektir. (Aynı ürünler varsa miktarları birleştirilir).
                    </div>
                  ) : (
                    <div className="font-semibold text-[#6d5a4e]">
                      <strong>{selectedTargetTable.name}</strong> masası boş. Seçilen {totalSelectedUnits} ürün ({formatCurrency(totalSelectedAmount)}) bu masada yeni bir adisyon olarak açılacaktır.
                    </div>
                  )}
                </div>
              )}

              {/* Butonlar */}
              <div className="success-actions mt-4">
                <button
                  type="button"
                  className="outline-action flex items-center justify-center gap-1.5"
                  onClick={() => setStep(1)}
                  disabled={isSubmitting}
                >
                  <ArrowLeft size={15} />
                  <span>Geri</span>
                </button>
                <button
                  type="button"
                  className="solid-action disabled:opacity-45"
                  disabled={!targetTableId || isSubmitting}
                  onClick={handleConfirm}
                >
                  {isSubmitting ? 'İşleniyor...' : 'Ayır'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

