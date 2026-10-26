import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Settings,
  User,
  MoreVertical,
  CheckCircle2,
  Ban,
  LogOut,
  Receipt,
  ArrowRightLeft,
  GitMerge,
  X,
  ArrowRight,
  Check,
  Sun,
  Split,
} from 'lucide-react'
import {
  calculateTotals,
  derivePaymentState,
  formatCurrency,
  isTableOccupied,
  type SplitItemSelection,
} from '../lib/format'
import { SplitTableModal } from './SplitTableModal'
import type { Table } from '../types'

interface TableLayoutProps {
  tables: Table[]
  onSelectTable: (id: string) => void
  onOpenTableManager: () => void
  onCloseTable?: (id: string) => void
  onCancelOrder?: (id: string) => void
  onCompleteOrder?: (id: string) => void
  onViewAdisyon?: (id: string) => void
  onMoveTable?: (sourceTableId: string, targetTableId: string) => void
  onMergeTables?: (mainTableId: string, sourceTableId: string) => void
  onSplitTable?: (
    sourceTableId: string,
    targetTableId: string,
    splitItems: SplitItemSelection[],
  ) => void
  isDayOpen?: boolean
  onOpenDayModal?: () => void
}

const getItemCount = (table: Table): number =>
  table.cart.reduce((sum, item) => sum + item.quantity, 0)

export function TableLayout({
  tables,
  onSelectTable,
  onOpenTableManager,
  onCloseTable,
  onCancelOrder,
  onCompleteOrder,
  onViewAdisyon,
  onMoveTable,
  onMergeTables,
  onSplitTable,
  isDayOpen = true,
  onOpenDayModal,
}: TableLayoutProps) {
  const [openMenuTableId, setOpenMenuTableId] = useState<string | null>(null)
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null)
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState<string | null>(null)
  const [mergeMainId, setMergeMainId] = useState<string | null>(null)
  const [selectedMergeSourceId, setSelectedMergeSourceId] = useState<string | null>(null)
  const [splitSourceId, setSplitSourceId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null)
    }, 3200)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const emptyTables = useMemo(
    () => tables.filter((t) => !isTableOccupied(t)),
    [tables],
  )

  const moveSourceTable = useMemo(
    () => (moveSourceId ? tables.find((t) => t.id === moveSourceId) || null : null),
    [tables, moveSourceId],
  )

  const mergeMainTable = useMemo(
    () => (mergeMainId ? tables.find((t) => t.id === mergeMainId) || null : null),
    [tables, mergeMainId],
  )

  const splitSourceTable = useMemo(
    () => (splitSourceId ? tables.find((t) => t.id === splitSourceId) || null : null),
    [tables, splitSourceId],
  )

  const mergeCandidateTables = useMemo(
    () =>
      mergeMainId
        ? tables.filter((t) => t.id !== mergeMainId && isTableOccupied(t))
        : [],
    [tables, mergeMainId],
  )

  const closeMoveModal = useCallback(() => {
    setMoveSourceId(null)
    setSelectedMoveTargetId(null)
  }, [])

  const closeMergeModal = useCallback(() => {
    setMergeMainId(null)
    setSelectedMergeSourceId(null)
  }, [])

  const confirmMove = useCallback(() => {
    if (!moveSourceTable || !selectedMoveTargetId) return
    const targetTable = emptyTables.find((t) => t.id === selectedMoveTargetId)
    if (!targetTable) return
    onMoveTable?.(moveSourceTable.id, targetTable.id)
    showToast(`${moveSourceTable.name} → ${targetTable.name} taşındı`)
    closeMoveModal()
  }, [moveSourceTable, selectedMoveTargetId, emptyTables, onMoveTable, showToast, closeMoveModal])

  const confirmMerge = useCallback(() => {
    if (!mergeMainTable || !selectedMergeSourceId) return
    const sourceTable = mergeCandidateTables.find((t) => t.id === selectedMergeSourceId)
    if (!sourceTable || sourceTable.id === mergeMainTable.id) return
    onMergeTables?.(mergeMainTable.id, sourceTable.id)
    showToast(`${sourceTable.name}, ${mergeMainTable.name} ile birleştirildi`)
    closeMergeModal()
  }, [mergeMainTable, selectedMergeSourceId, mergeCandidateTables, onMergeTables, showToast, closeMergeModal])

  const handleConfirmSplit = useCallback(
    (targetTableId: string, splitItems: SplitItemSelection[]) => {
      if (!splitSourceTable) return
      const targetTable = tables.find((t) => t.id === targetTableId)
      if (!targetTable) return

      onSplitTable?.(splitSourceTable.id, targetTableId, splitItems)
      const totalUnits = splitItems.reduce((sum, item) => sum + item.quantity, 0)
      showToast(`${splitSourceTable.name}'den ${targetTable.name}'ye ${totalUnits} ürün ayrıldı`)
      setSplitSourceId(null)
    },
    [splitSourceTable, tables, onSplitTable, showToast],
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuTableId(null)
      }
    }
    if (openMenuTableId) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuTableId])

  useEffect(() => {
    if (!moveSourceId && !mergeMainId) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (moveSourceId) closeMoveModal()
        if (mergeMainId) closeMergeModal()
      } else if (event.key === 'Enter') {
        if (moveSourceId && selectedMoveTargetId) {
          event.preventDefault()
          confirmMove()
        } else if (mergeMainId && selectedMergeSourceId) {
          event.preventDefault()
          confirmMerge()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    moveSourceId,
    mergeMainId,
    selectedMoveTargetId,
    selectedMergeSourceId,
    closeMoveModal,
    closeMergeModal,
    confirmMove,
    confirmMerge,
  ])

  const selectedMergeSourceTable = useMemo(
    () =>
      selectedMergeSourceId
        ? mergeCandidateTables.find((t) => t.id === selectedMergeSourceId) || null
        : null,
    [mergeCandidateTables, selectedMergeSourceId],
  )

  const selectedMoveTargetTable = useMemo(
    () =>
      selectedMoveTargetId
        ? emptyTables.find((t) => t.id === selectedMoveTargetId) || null
        : null,
    [emptyTables, selectedMoveTargetId],
  )

  return (
    <div className="tables-container catalog">
      <div className="tables-header flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Masalar</h2>
          <p className="muted mt-1">Sipariş almak veya düzenlemek için bir masa seçin.</p>
        </div>
        <button type="button" onClick={onOpenTableManager} className="btn-secondary text-sm">
          <Settings className="w-4 h-4 mr-1.5" />
          Masa Yönetimi
        </button>
      </div>

      {!isDayOpen && (
        <div
          role="region"
          aria-label="Gün Kapalı Uyarısı"
          className="mb-4 p-4 rounded-2xl bg-[#fff8f5] border-2 border-[#e8c5b8] flex flex-wrap items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 grid place-items-center shrink-0">
              <Sun size={20} />
            </div>
            <div>
              <div className="text-sm font-extrabold text-[#3b291f]">
                Gün Kapalı — Sipariş almak için önce günü açın
              </div>
              <div className="text-xs font-semibold text-[#8c7a6e] mt-0.5">
                Yeni sipariş oluşturmak, ürün eklemek ve ödeme almak için iş gününü başlatmanız gerekmektedir.
              </div>
            </div>
          </div>
          {onOpenDayModal && (
            <button
              type="button"
              onClick={onOpenDayModal}
              className="px-4 py-2.5 rounded-xl bg-[#8a6d57] hover:bg-[#3b291f] text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Sun size={15} />
              <span>Günü Aç</span>
            </button>
          )}
        </div>
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#3b291f] text-[#fffdf9] text-sm font-bold shadow-xl border border-[#8a6d57]/40 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="tables-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tables.map((table) => {
          const { total } = calculateTotals(table.cart, table.discountRate || 0)
          const { paidTotal, remaining } = derivePaymentState(total, table.payments)
          const hasCustomer = Boolean(table.customerName && table.customerName.trim().length > 0)
          const isOccupied = isTableOccupied(table)
          const isMenuOpen = openMenuTableId === table.id
          const canMove = isOccupied && emptyTables.length > 0
          const canMerge =
            isOccupied && tables.some((t) => t.id !== table.id && isTableOccupied(t))
          const canSplit = isOccupied && table.cart.length > 0 && tables.length > 1
          const showTopSection =
            isOccupied && (table.cart.length > 0 || canMove || canMerge || canSplit)

          return (
            <div
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className={`relative p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between min-h-[120px] cursor-pointer group ${
                isMenuOpen ? 'z-30' : 'z-0'
              } ${
                isOccupied
                  ? 'border-[#a67658] bg-[#f9f3ec] hover:border-[#8c5c3d] shadow-sm'
                  : 'border-[#eee6df] bg-white hover:border-[#d7bca6]'
              }`}
            >
              {/* Header area with Table name and 3-dots Menu Button */}
              <div className="flex items-start justify-between gap-1">
                <div className="pr-6">
                  <div className="font-extrabold text-[#2d1e15] text-xl leading-snug tracking-tight">{table.name}</div>
                  {hasCustomer && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6e4933] bg-[#ebdcd0] px-2 py-0.5 rounded-md max-w-full truncate">
                      <User size={12} className="shrink-0" />
                      <span className="truncate">{table.customerName}</span>
                    </div>
                  )}
                </div>

                {/* 3-dots Action Menu Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuTableId(isMenuOpen ? null : table.id)
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:bg-black/10 hover:text-gray-800 transition-colors z-10"
                  title="Masa İşlemleri"
                  aria-label={`${table.name} için masa menüsü`}
                >
                  <MoreVertical size={18} />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-11 right-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 text-sm font-medium text-gray-700"
                  >
                    {showTopSection && (
                      <>
                        {table.cart.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuTableId(null)
                                onCompleteOrder?.(table.id)
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 transition-colors"
                            >
                              <CheckCircle2 size={16} />
                              <span>Siparişi Tamamla</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuTableId(null)
                                onViewAdisyon?.(table.id)
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-amber-50 text-amber-800 flex items-center gap-2 transition-colors"
                            >
                              <Receipt size={16} />
                              <span>Adisyon Fişi Gör</span>
                            </button>
                          </>
                        )}

                        {canMove && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null)
                              setSelectedMoveTargetId(null)
                              setMoveSourceId(table.id)
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-[#f4ebe3] text-[#5c493d] flex items-center gap-2 transition-colors"
                          >
                            <ArrowRightLeft size={16} />
                            <span>Masayı Taşı</span>
                          </button>
                        )}

                        {canMerge && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null)
                              setSelectedMergeSourceId(null)
                              setMergeMainId(table.id)
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-[#f4ebe3] text-[#5c493d] flex items-center gap-2 transition-colors"
                          >
                            <GitMerge size={16} />
                            <span>Masayı Birleştir</span>
                          </button>
                        )}

                        {canSplit && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null)
                              if (!isDayOpen) {
                                if (onOpenDayModal) onOpenDayModal()
                                else showToast('İşlem yapmak için önce günü açın.')
                                return
                              }
                              setSplitSourceId(table.id)
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-[#f4ebe3] text-[#5c493d] flex items-center gap-2 transition-colors"
                          >
                            <Split size={16} />
                            <span>Masayı Ayır</span>
                          </button>
                        )}

                        <div className="my-1 border-t border-gray-100" />
                      </>
                    )}

                    {isOccupied && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onCancelOrder?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 transition-colors"
                        >
                          <Ban size={16} />
                          <span>Siparişi İptal Et</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onCloseTable?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2 transition-colors"
                        >
                          <LogOut size={16} />
                          <span>Masayı Kapat</span>
                        </button>
                      </>
                    )}

                    {!isOccupied && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuTableId(null)
                          onSelectTable(table.id)
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2 transition-colors"
                      >
                        <User size={16} />
                        <span>Sipariş Al</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="mt-5 flex justify-between items-end">
                <span className={`text-xs font-semibold ${isOccupied ? 'text-[#a67658]' : 'text-[#a08e82]'}`}>
                  {isOccupied ? (paidTotal > 0 ? 'Kısmi Ödendi' : 'Dolu') : 'Boş'}
                </span>
                {isOccupied && table.cart.length > 0 && (
                  <span className="font-extrabold text-[#3b291f] text-sm">
                    {paidTotal > 0 ? `Kalan: ${formatCurrency(remaining)}` : formatCurrency(total)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Masayı Taşı Modal */}
      {moveSourceTable && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Masayı Taşı"
          onClick={closeMoveModal}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="section-kicker flex items-center gap-1.5">
                  <ArrowRightLeft size={13} /> Masa İşlemleri
                </p>
                <h2 className="section-title">Masayı Taşı</h2>
                <p className="muted mt-1">
                  {moveSourceTable.name} siparişini hangi masaya taşımak istiyorsunuz?
                </p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={closeMoveModal}
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            <div className="payment-body">
              {emptyTables.length === 0 ? (
                <p className="muted text-center py-6">Şu anda taşınabilecek boş masa bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {emptyTables.map((target) => {
                    const isSelected = selectedMoveTargetId === target.id
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => setSelectedMoveTargetId(target.id)}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-[#8a6d57] bg-[#f4ebe3] text-[#3a2a20] shadow-sm'
                            : 'border-[#dfd5cc] bg-[#fcfaf7] text-[#5c493d] hover:border-[#c9bdb3] hover:bg-[#f9f5f0]'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm">{target.name}</div>
                          <div className="text-[11px] font-semibold text-[#a08e82] mt-0.5">Boş</div>
                        </div>
                        {isSelected && (
                          <span className="w-6 h-6 rounded-full bg-[#8a6d57] text-white grid place-items-center shrink-0">
                            <Check size={14} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedMoveTargetTable && (
                <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-[#f4ebe3] border border-[#dfd5cc] text-xs font-semibold text-[#5c493d] flex items-center gap-2">
                  <ArrowRight size={15} className="text-[#8a6d57] shrink-0" />
                  <span>
                    <strong>{moveSourceTable.name}</strong> siparişi tüm içeriğiyle{' '}
                    <strong>{selectedMoveTargetTable.name}</strong> masasına taşınacak.
                  </span>
                </div>
              )}

              <div className="success-actions mt-5">
                <button type="button" className="outline-action" onClick={closeMoveModal}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="solid-action disabled:opacity-45"
                  disabled={!selectedMoveTargetId}
                  onClick={confirmMove}
                >
                  Taşı
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Masayı Birleştir Modal */}
      {mergeMainTable && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Masayı Birleştir"
          onClick={closeMergeModal}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="section-kicker flex items-center gap-1.5">
                  <GitMerge size={13} /> Masa İşlemleri
                </p>
                <h2 className="section-title">Masayı Birleştir</h2>
                <p className="muted mt-1">
                  {mergeMainTable.name} ile hangi masa birleştirilsin?
                </p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={closeMergeModal}
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            <div className="payment-body">
              {mergeCandidateTables.length === 0 ? (
                <p className="muted text-center py-6">Birleştirilebilecek başka dolu masa bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {mergeCandidateTables.map((candidate) => {
                    const isSelected = selectedMergeSourceId === candidate.id
                    const { total: candTotal } = calculateTotals(
                      candidate.cart,
                      candidate.discountRate || 0,
                    )
                    const itemCount = getItemCount(candidate)

                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelectedMergeSourceId(candidate.id)}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'border-[#8a6d57] bg-[#f4ebe3] text-[#3a2a20] shadow-sm'
                            : 'border-[#dfd5cc] bg-[#fcfaf7] text-[#5c493d] hover:border-[#c9bdb3] hover:bg-[#f9f5f0]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm flex items-center gap-1.5">
                            <span>{candidate.name}</span>
                            {candidate.customerName && (
                              <span className="text-[11px] font-semibold text-[#6e4933] bg-[#ebdcd0] px-1.5 py-0.5 rounded truncate">
                                {candidate.customerName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-[#8a6d57] mt-1">
                            {itemCount} ürün · {formatCurrency(candTotal)}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="w-6 h-6 rounded-full bg-[#8a6d57] text-white grid place-items-center shrink-0">
                            <Check size={14} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedMergeSourceTable && (() => {
                const { total: sourceTotal } = calculateTotals(
                  selectedMergeSourceTable.cart,
                  selectedMergeSourceTable.discountRate || 0,
                )
                const { total: mainTotal } = calculateTotals(
                  mergeMainTable.cart,
                  mergeMainTable.discountRate || 0,
                )
                const sourceCount = getItemCount(selectedMergeSourceTable)
                const mainCount = getItemCount(mergeMainTable)

                return (
                  <div className="mt-4 p-3.5 rounded-xl bg-[#f4ebe3] border border-[#dfd5cc] text-xs text-[#5c493d] space-y-1">
                    <div className="font-bold text-[#3b291f] flex items-center gap-1.5">
                      <GitMerge size={14} className="text-[#8a6d57] shrink-0" />
                      <span>
                        {selectedMergeSourceTable.name} siparişi {mergeMainTable.name}&apos;e eklenecek.
                      </span>
                    </div>
                    <div className="font-semibold text-[#6d5a4e]">
                      {selectedMergeSourceTable.name} ({sourceCount} ürün, {formatCurrency(sourceTotal)}) →{' '}
                      {mergeMainTable.name} ({mainCount} ürün, {formatCurrency(mainTotal)}). Birleştirilsin mi?
                    </div>
                  </div>
                )
              })()}

              <div className="success-actions mt-5">
                <button type="button" className="outline-action" onClick={closeMergeModal}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="solid-action disabled:opacity-45"
                  disabled={!selectedMergeSourceId}
                  onClick={confirmMerge}
                >
                  Birleştir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Masayı Ayır Modal */}
      {splitSourceTable && (
        <SplitTableModal
          sourceTable={splitSourceTable}
          tables={tables}
          onClose={() => setSplitSourceId(null)}
          onConfirmSplit={handleConfirmSplit}
        />
      )}
    </div>
  )
}



