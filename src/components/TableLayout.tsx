import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { BodyPortal } from './BodyPortal'
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
  RotateCcw,
  Search,
  Clock,
} from 'lucide-react'
import {
  calculateTotals,
  derivePaymentState,
  formatCurrency,
  formatTime,
  isTableOccupied,
  type SplitItemSelection,
} from '../lib/format'
import { SplitTableModal } from './SplitTableModal'
import type { Table, CompletedOrder } from '../types'

interface TableLayoutProps {
  tables: Table[]
  onSelectTable: (id: string) => void
  onOpenTableManager: () => void
  onCloseTable?: (id: string) => void
  onCancelOrder?: (id: string) => void
  onRefundTable?: (id: string) => void
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
  canManageTables?: boolean
  canTransferMerge?: boolean
  canRefundTable?: boolean
  canViewAdisyon?: boolean
  canReopenOrder?: boolean
  onRequestReopenOrder?: (orderId: string) => void
  completedOrders?: CompletedOrder[]
  openBusinessDayId?: string
}

const getItemCount = (table: Table): number =>
  table.cart
    .filter((item) => item.status !== 'refunded')
    .reduce((sum, item) => sum + item.quantity, 0)

export function TableLayout({
  tables,
  onSelectTable,
  onOpenTableManager,
  onCloseTable,
  onCancelOrder,
  onRefundTable,
  onCompleteOrder,
  onViewAdisyon,
  onMoveTable,
  onMergeTables,
  onSplitTable,
  isDayOpen = true,
  onOpenDayModal,
  canManageTables = true,
  canTransferMerge = true,
  canRefundTable = true,
  canViewAdisyon = true,
  canReopenOrder = false,
  onRequestReopenOrder,
  completedOrders = [],
  openBusinessDayId,
}: TableLayoutProps) {
  const [openMenuTableId, setOpenMenuTableId] = useState<string | null>(null)
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null)
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState<string | null>(null)
  const [mergeMainId, setMergeMainId] = useState<string | null>(null)
  const [selectedMergeSourceId, setSelectedMergeSourceId] = useState<string | null>(null)
  const [splitSourceId, setSplitSourceId] = useState<string | null>(null)
  const [reopenSelectorOpen, setReopenSelectorOpen] = useState(false)
  const [reopenSearchQuery, setReopenSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const closedOrdersForOpenDay = useMemo(() => {
    if (!completedOrders || !openBusinessDayId) return []
    return completedOrders
      .filter((o) => o.businessDayId === openBusinessDayId && !o.reopened)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [completedOrders, openBusinessDayId])

  const filteredReopenOrders = useMemo(() => {
    if (!reopenSearchQuery.trim()) return closedOrdersForOpenDay
    const q = reopenSearchQuery.toLowerCase().trim()
    return closedOrdersForOpenDay.filter(
      (o) =>
        (o.tableName && o.tableName.toLowerCase().includes(q)) ||
        (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        o.items.some((i) => i.name.toLowerCase().includes(q)),
    )
  }, [closedOrdersForOpenDay, reopenSearchQuery])

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
    if (!openMenuTableId) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target)) return
      const targetElement = target instanceof Element ? target : target.parentElement
      if (targetElement?.closest('[data-table-menu-trigger]')) return
      if (
        containerRef.current &&
        target === containerRef.current &&
        event.clientX >=
          containerRef.current.getBoundingClientRect().left + containerRef.current.clientWidth
      ) {
        return
      }
      setOpenMenuTableId(null)
    }
    const handleMenuEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpenMenuTableId(null)
      }
    }
    document.addEventListener('click', handleClickOutside, true)
    window.addEventListener('keydown', handleMenuEscape, true)
    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      window.removeEventListener('keydown', handleMenuEscape, true)
    }
  }, [openMenuTableId])

  useEffect(() => {
    if (!openMenuTableId) return
    const container = containerRef.current
    const menu = menuRef.current
    if (!container || !menu) return

    const containerRect = container.getBoundingClientRect()
    const offsetParent = menu.offsetParent as HTMLElement | null
    const menuTop = offsetParent
      ? offsetParent.getBoundingClientRect().top + menu.offsetTop
      : menu.getBoundingClientRect().top
    const menuHeight = menu.offsetHeight || menu.getBoundingClientRect().height
    const menuBottom = menuTop + menuHeight
    const bottomBreathingRoom = 20

    const overflowBottom = menuBottom + bottomBreathingRoom - containerRect.bottom
    if (overflowBottom > 0) {
      const maxSafeDelta = Math.max(0, menuTop - containerRect.top - 12)
      const delta = Math.min(overflowBottom, maxSafeDelta)
      if (delta > 0) {
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
        const targetTop = Math.min(container.scrollTop + delta, maxScrollTop)
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ top: targetTop, behavior: 'smooth' })
        } else {
          container.scrollTop = targetTop
        }
      }
      return
    }

    const overflowTop = containerRect.top + 12 - menuTop
    if (overflowTop > 0) {
      const targetTop = Math.max(0, container.scrollTop - overflowTop)
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: targetTop, behavior: 'smooth' })
      } else {
        container.scrollTop = targetTop
      }
    }
  }, [openMenuTableId])

  useEffect(() => {
    if (!moveSourceId && !mergeMainId && !reopenSelectorOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (moveSourceId) closeMoveModal()
        if (mergeMainId) closeMergeModal()
        if (reopenSelectorOpen) setReopenSelectorOpen(false)
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
    reopenSelectorOpen,
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
    <div ref={containerRef} className="tables-container">
      <div className="tables-header flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Masalar</h2>
          <p className="muted mt-1">Sipariş almak veya düzenlemek için bir masa seçin.</p>
        </div>
        <div className="flex items-center gap-2">
          {canReopenOrder && onRequestReopenOrder && (
            <button
              type="button"
              onClick={() => {
                setReopenSearchQuery('')
                setReopenSelectorOpen(true)
              }}
              className="px-3.5 py-2 rounded-xl text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Yalnızca Yönetici: Bugün kapatılan adisyonları listele ve geri aç"
            >
              <RotateCcw size={15} />
              <span>Kapatılan Adisyonu Aç</span>
              {closedOrdersForOpenDay.length > 0 && (
                <span className="ml-0.5 px-2 py-0.5 rounded-full bg-purple-200 dark:bg-purple-900 text-xs text-purple-900 dark:text-purple-200 font-extrabold">
                  {closedOrdersForOpenDay.length}
                </span>
              )}
            </button>
          )}
          {canManageTables && (
            <button type="button" onClick={onOpenTableManager} className="btn-secondary text-sm font-bold">
              <Settings className="w-4 h-4 mr-1.5" />
              Masa Yönetimi
            </button>
          )}
        </div>
      </div>

      {!isDayOpen && (
        <div
          role="region"
          aria-label="Gün Kapalı Uyarısı"
          className="mb-4 p-4 rounded-2xl bg-[#fff8f5] dark:bg-[#2a1d19] border-2 border-[#e8c5b8] dark:border-rose-900/60 flex flex-wrap items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 grid place-items-center shrink-0">
              <Sun size={20} />
            </div>
            <div>
              <div className="text-sm font-extrabold text-[#3b291f] dark:text-stone-100">
                Gün Kapalı — Sipariş almak için önce günü açın
              </div>
              <div className="text-xs font-semibold text-[#8c7a6e] dark:text-stone-400 mt-0.5">
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
        <BodyPortal>
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#3b291f] text-[#fffdf9] text-sm font-bold shadow-xl border border-[#8a6d57]/40 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </BodyPortal>
      )}

      <div className="tables-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tables.map((table) => {
          const { total } = calculateTotals(table.cart, table.discountRate || 0, table.discountAmount || 0)
          const { paidTotal, remaining } = derivePaymentState(total, table.payments)
          const hasCustomer = Boolean(table.customerName && table.customerName.trim().length > 0)
          const isOccupied = isTableOccupied(table)
          const isMenuOpen = openMenuTableId === table.id
          const hasActiveItems = table.cart.some((item) => item.status !== 'refunded')
          const canMove = canTransferMerge && isOccupied && emptyTables.length > 0
          const canMerge =
            canTransferMerge && isOccupied && tables.some((t) => t.id !== table.id && isTableOccupied(t))
          const canSplit = canTransferMerge && isOccupied && hasActiveItems && tables.length > 1
          const showTopSection =
            isOccupied && (hasActiveItems || canMove || canMerge || canSplit)

          return (
            <div
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className={`relative p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between min-h-[120px] cursor-pointer group ${
                isMenuOpen ? 'z-30' : 'z-0'
              } ${
                isOccupied
                  ? 'border-[#a67658] bg-[#f9f3ec] hover:border-[#8c5c3d] dark:border-[#c99b7b]/60 dark:bg-[#2b221c] dark:hover:border-[#c99b7b] shadow-sm'
                  : 'border-[#eee6df] bg-white hover:border-[#d7bca6] dark:border-[#3a3029] dark:bg-[#1f1a17] dark:hover:border-[#6e5a4d]'
              }`}
            >
              {/* Header area with Table name and 3-dots Menu Button */}
              <div className="flex items-start justify-between gap-1">
                <div className="pr-6">
                  <div className="font-black text-[#2d1e15] dark:text-stone-100 text-xl leading-snug tracking-tight">{table.name}</div>
                  {hasCustomer && (
                    <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#6e4933] dark:text-amber-200 bg-[#ebdcd0] dark:bg-[#3d2e24] px-2 py-0.5 rounded-md max-w-full truncate">
                      <User size={12} className="shrink-0" />
                      <span className="truncate">{table.customerName}</span>
                    </div>
                  )}
                </div>

                {/* 3-dots Action Menu Button */}
                <button
                  type="button"
                  data-table-menu-trigger={table.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuTableId(isMenuOpen ? null : table.id)
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:bg-black/10 hover:text-gray-800 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100 transition-colors z-10"
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
                    className="table-menu-dropdown absolute top-11 right-2 w-48 bg-white dark:bg-[#26201c] rounded-xl shadow-xl border border-gray-200 dark:border-[#3d332c] py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 text-sm font-medium text-gray-700 dark:text-stone-200"
                  >
                    {showTopSection && (
                      <>
                        {hasActiveItems && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuTableId(null)
                                onCompleteOrder?.(table.id)
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 transition-colors"
                            >
                              <CheckCircle2 size={16} />
                              <span>Siparişi Tamamla</span>
                            </button>
                            {onViewAdisyon && canViewAdisyon && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuTableId(null)
                                  onViewAdisyon?.(table.id)
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-800 dark:text-amber-400 flex items-center gap-2 transition-colors"
                              >
                                <Receipt size={16} />
                                <span>Adisyon Fişi Gör</span>
                              </button>
                            )}
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
                            className="w-full text-left px-3.5 py-2 hover:bg-[#f4ebe3] dark:hover:bg-white/10 text-[#5c493d] dark:text-stone-200 flex items-center gap-2 transition-colors"
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
                            className="w-full text-left px-3.5 py-2 hover:bg-[#f4ebe3] dark:hover:bg-white/10 text-[#5c493d] dark:text-stone-200 flex items-center gap-2 transition-colors"
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
                            className="w-full text-left px-3.5 py-2 hover:bg-[#f4ebe3] dark:hover:bg-white/10 text-[#5c493d] dark:text-stone-200 flex items-center gap-2 transition-colors"
                          >
                            <Split size={16} />
                            <span>Masayı Ayır</span>
                          </button>
                        )}

                        <div className="my-1 border-t border-gray-100 dark:border-[#3d332c]" />
                      </>
                    )}

                    {isOccupied && (
                      <>
                        {onRefundTable && canRefundTable && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null)
                              onRefundTable(table.id)
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-400 flex items-center gap-2 transition-colors font-medium"
                          >
                            <RotateCcw size={16} />
                            <span>Masa İadesi</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuTableId(null)
                            onCancelOrder?.(table.id)
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center gap-2 transition-colors"
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
                          className="w-full text-left px-3.5 py-2 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-stone-200 flex items-center gap-2 transition-colors"
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
                        className="w-full text-left px-3.5 py-2 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-stone-200 flex items-center gap-2 transition-colors"
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
                <span className={`text-sm font-bold ${isOccupied ? 'text-[#8c5c3d] dark:text-amber-400' : 'text-[#6b584b] dark:text-stone-300'}`}>
                  {isOccupied ? (paidTotal > 0 ? 'Kısmi Ödendi' : 'Dolu') : 'Boş'}
                </span>
                {isOccupied && hasActiveItems && (
                  <span className="font-black text-[#2d1e15] dark:text-stone-100 text-base">
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
        <BodyPortal>
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
                            ? 'border-[#8a6d57] bg-[#f4ebe3] text-[#3a2a20] dark:border-[#c99b7b] dark:bg-[#362b24] dark:text-stone-100 shadow-sm'
                            : 'border-[#dfd5cc] bg-[#fcfaf7] text-[#5c493d] hover:border-[#c9bdb3] hover:bg-[#f9f5f0] dark:border-[#3d332c] dark:bg-[#241e1a] dark:text-stone-200 dark:hover:border-[#6e5a4d] dark:hover:bg-[#2d2621]'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm">{target.name}</div>
                          <div className="text-[11px] font-semibold text-[#a08e82] dark:text-stone-400 mt-0.5">Boş</div>
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
                <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-[#f4ebe3] dark:bg-[#2d241e] border border-[#dfd5cc] dark:border-[#443830] text-xs font-semibold text-[#5c493d] dark:text-stone-200 flex items-center gap-2">
                  <ArrowRight size={15} className="text-[#8a6d57] dark:text-[#c99b7b] shrink-0" />
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
        </BodyPortal>
      )}

      {/* Masayı Birleştir Modal */}
      {mergeMainTable && (
        <BodyPortal>
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
                      candidate.discountAmount || 0,
                    )
                    const itemCount = getItemCount(candidate)

                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelectedMergeSourceId(candidate.id)}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'border-[#8a6d57] bg-[#f4ebe3] text-[#3a2a20] dark:border-[#c99b7b] dark:bg-[#362b24] dark:text-stone-100 shadow-sm'
                            : 'border-[#dfd5cc] bg-[#fcfaf7] text-[#5c493d] hover:border-[#c9bdb3] hover:bg-[#f9f5f0] dark:border-[#3d332c] dark:bg-[#241e1a] dark:text-stone-200 dark:hover:border-[#6e5a4d] dark:hover:bg-[#2d2621]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm flex items-center gap-1.5">
                            <span>{candidate.name}</span>
                            {candidate.customerName && (
                              <span className="text-[11px] font-semibold text-[#6e4933] dark:text-amber-200 bg-[#ebdcd0] dark:bg-[#3d2e24] px-1.5 py-0.5 rounded truncate">
                                {candidate.customerName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-[#8a6d57] dark:text-[#c99b7b] mt-1">
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
                  selectedMergeSourceTable.discountAmount || 0,
                )
                const { total: mainTotal } = calculateTotals(
                  mergeMainTable.cart,
                  mergeMainTable.discountRate || 0,
                  mergeMainTable.discountAmount || 0,
                )
                const sourceCount = getItemCount(selectedMergeSourceTable)
                const mainCount = getItemCount(mergeMainTable)

                return (
                  <div className="mt-4 p-3.5 rounded-xl bg-[#f4ebe3] dark:bg-[#2d241e] border border-[#dfd5cc] dark:border-[#443830] text-xs text-[#5c493d] dark:text-stone-200 space-y-1">
                    <div className="font-bold text-[#3b291f] dark:text-stone-100 flex items-center gap-1.5">
                      <GitMerge size={14} className="text-[#8a6d57] dark:text-[#c99b7b] shrink-0" />
                      <span>
                        {selectedMergeSourceTable.name} siparişi {mergeMainTable.name}&apos;e eklenecek.
                      </span>
                    </div>
                    <div className="font-semibold text-[#6d5a4e] dark:text-stone-300">
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
        </BodyPortal>
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

      {/* Kapatılan Adisyon Seçici Modal (Yalnızca Yönetici) */}
      {reopenSelectorOpen && (
        <BodyPortal>
          <div
            className="overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Kapatılan Adisyon Seçimi"
            onClick={() => setReopenSelectorOpen(false)}
          >
          <div
            className="modal w-full bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4"
            style={{ width: 'min(760px, 95vw)', maxWidth: '760px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlık */}
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 grid place-items-center shadow-xs">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                      Kapatılan Adisyonu Aç
                    </h3>
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      Bugün
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-stone-500 dark:text-stone-400 mt-0.5">
                    Geri açmak istediğiniz adisyonu seçin (Yalnızca açık gün kayıtları)
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                onClick={() => setReopenSelectorOpen(false)}
                aria-label="Kapat"
              >
                <X size={20} />
              </button>
            </div>

            {/* Arama Çubuğu */}
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Masa adı, fiş no veya ürün ara..."
                value={reopenSearchQuery}
                onChange={(e) => setReopenSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 text-sm font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-800/80 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-xs"
              />
              {reopenSearchQuery && (
                <button
                  type="button"
                  onClick={() => setReopenSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors cursor-pointer"
                  aria-label="Aramayı Temizle"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Liste */}
            <div
              className="max-h-[50vh] sm:max-h-[440px] overflow-y-auto space-y-2.5 pr-1.5"
              style={{ scrollbarGutter: 'stable' }}
            >
              {filteredReopenOrders.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl bg-stone-50/50 dark:bg-stone-800/30 border border-dashed border-stone-200 dark:border-stone-800">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 grid place-items-center mb-3">
                    <RotateCcw size={22} className="opacity-60" />
                  </div>
                  <p className="text-sm font-bold text-stone-700 dark:text-stone-300">
                    {closedOrdersForOpenDay.length === 0
                      ? 'Bugün kapatılmış adisyon bulunmamaktadır.'
                      : 'Aramanızla eşleşen kapatılmış adisyon bulunamadı.'}
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    {closedOrdersForOpenDay.length === 0
                      ? 'Bir masa kapatıldığında burada listelenecektir.'
                      : 'Lütfen arama terimini kontrol edin veya temizleyin.'}
                  </p>
                </div>
              ) : (
                filteredReopenOrders.map((order) => {
                  const getPaymentBadge = () => {
                    if (order.payments && order.payments.length > 0) {
                      const methods = Array.from(new Set(order.payments.map((p) => p.method.toLowerCase())))
                      if (methods.length === 1) {
                        const m = methods[0]
                        if (m === 'cash') return { label: 'Nakit', color: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' }
                        if (m === 'card') return { label: 'Kredi Kartı', color: 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800' }
                        if (m === 'iban') return { label: 'IBAN', color: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800' }
                      }
                      return { label: 'Parçalı Ödeme', color: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800' }
                    }
                    const m = (order.paymentMethod || '').toLowerCase()
                    if (m === 'cash') return { label: 'Nakit', color: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' }
                    if (m === 'card') return { label: 'Kredi Kartı', color: 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800' }
                    if (m === 'iban') return { label: 'IBAN', color: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800' }
                    if (m === 'mixed') return { label: 'Karışık Ödeme', color: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800' }
                    return { label: 'Ödendi', color: 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700' }
                  }

                  const badge = getPaymentBadge()
                  const totalItemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

                  return (
                    <div
                      key={order.id}
                      className="p-3.5 sm:p-4 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/40 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-purple-300 dark:hover:border-purple-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {/* Başlık ve Etiketler */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-base text-stone-900 dark:text-stone-100">
                            {order.tableName || `Adisyon #${order.orderNumber}`}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-200/80 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                            <Clock size={11} className="text-stone-500 dark:text-stone-400" />
                            {formatTime(order.date)}
                          </span>
                          {order.customerName && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <User size={11} />
                              {order.customerName}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-stone-400 dark:text-stone-500 font-mono">
                            #{order.orderNumber}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Ürünler Özeti */}
                        <div className="text-xs font-bold text-stone-700 dark:text-stone-300 line-clamp-2 leading-relaxed">
                          {order.items.map((i, idx) => (
                            <span key={idx} className="inline-block mr-2">
                              <span className="text-stone-900 dark:text-stone-100 font-black">{i.name}</span>
                              <span className="text-stone-500 dark:text-stone-400 font-black ml-1">×{i.quantity}</span>
                              {idx < order.items.length - 1 && <span className="text-stone-300 dark:text-stone-600 ml-2">,</span>}
                            </span>
                          ))}
                        </div>

                        {/* Alt Bilgi */}
                        <div className="text-[11px] font-bold text-stone-400 dark:text-stone-500 flex items-center gap-2">
                          <span>{totalItemCount} adet ürün</span>
                          {order.cashier && (
                            <>
                              <span>·</span>
                              <span>Kasiyer: {order.cashier}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Tutar ve Geri Aç Butonu */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200 dark:border-stone-800 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-bold text-stone-400 dark:text-stone-500 block sm:hidden">Tutar:</span>
                          <span className="text-base sm:text-lg font-black text-stone-900 dark:text-stone-100 tracking-tight">
                            {formatCurrency(order.totals.total)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReopenSelectorOpen(false)
                            onRequestReopenOrder?.(order.id)
                          }}
                          className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black text-white bg-purple-600 hover:bg-purple-700 active:scale-95 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <RotateCcw size={14} />
                          <span>Adisyonu Geri Aç</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Modal Alt Bilgi ve Kapat Butonu */}
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <div className="text-xs font-bold text-stone-500 dark:text-stone-400">
                {filteredReopenOrders.length > 0 ? (
                  <span>
                    Toplam <strong className="text-stone-900 dark:text-stone-100 font-black">{filteredReopenOrders.length}</strong> kapatılan adisyon
                  </span>
                ) : (
                  <span>0 adisyon</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReopenSelectorOpen(false)}
                className="btn-secondary text-xs sm:text-sm font-bold px-4 py-2 rounded-xl cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
          </div>
        </BodyPortal>
      )}
    </div>
  )
}



