import { useEffect, useState } from 'react'
import { AlertCircle, Info, RotateCcw, ShieldAlert, X } from 'lucide-react'
import { formatCurrency, formatDateTime, isTableOccupied } from '../lib/format'
import { formatReopenCancellationNotice } from '../lib/reopenOrder'
import type { CompletedOrder, Table } from '../types'

interface ReopenOrderModalProps {
  isOpen: boolean
  onClose: () => void
  order: CompletedOrder | null
  openBusinessDayId?: string
  tables: Table[]
  onConfirmReopen: (params: {
    orderId: string
    reason: string
    targetTableId: string
  }) => void
}

export function ReopenOrderModal({
  isOpen,
  onClose,
  order,
  openBusinessDayId,
  tables,
  onConfirmReopen,
}: ReopenOrderModalProps) {
  const [reason, setReason] = useState('')
  const [targetTableId, setTargetTableId] = useState<string>(() => {
    if (order?.tableId && tables.some((t) => t.id === order.tableId)) {
      return order.tableId
    }
    const firstEmpty = tables.find((t) => !isTableOccupied(t))
    return firstEmpty ? firstEmpty.id : (tables[0]?.id || '')
  })
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    if (!isOpen || !order) return
    setReason('')
    setIsConfirming(false)
    if (order.tableId && tables.some((t) => t.id === order.tableId)) {
      setTargetTableId(order.tableId)
      return
    }
    const firstEmpty = tables.find((t) => !isTableOccupied(t))
    setTargetTableId(firstEmpty ? firstEmpty.id : (tables[0]?.id || ''))
  }, [isOpen, order?.id])

  if (!isOpen || !order) return null

  // Kural 8 & Bölüm 4.2: Geri açma yalnızca aktif (kapanmamış) iş gününe ait adisyonlarda yapılabilir
  const isOrderFromOpenDay =
    Boolean(openBusinessDayId) && order.businessDayId === openBusinessDayId

  const trimmedReason = reason.trim()
  const isReasonValid = trimmedReason.length >= 3

  const selectedTable = tables.find((t) => t.id === targetTableId)
  const isSelectedTableOccupied = selectedTable ? isTableOccupied(selectedTable) : false
  const canProceed =
    isOrderFromOpenDay &&
    isReasonValid &&
    Boolean(selectedTable) &&
    !isSelectedTableOccupied

  const cancellationNoticeText = formatReopenCancellationNotice(order)

  const handleProceed = () => {
    if (!canProceed) return
    setIsConfirming(true)
  }

  const handleFinalSubmit = () => {
    if (!canProceed) return
    onConfirmReopen({
      orderId: order.id,
      reason: trimmedReason,
      targetTableId,
    })
    setIsConfirming(false)
    onClose()
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Adisyonu Geri Aç"
      onClick={onClose}
    >
      <div
        className="modal max-w-lg w-full bg-white dark:bg-stone-900 rounded-2xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 grid place-items-center">
              <RotateCcw size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                KAPALI ADİSYONU GERİ AÇ
              </p>
              <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                Adisyon #{order.orderNumber}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            onClick={onClose}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Closed business day block */}
        {!isOrderFromOpenDay ? (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2 text-xs text-rose-900 dark:text-rose-200">
            <div className="flex items-center gap-2 font-bold text-sm">
              <ShieldAlert size={18} className="text-rose-600" />
              <span>Bu adisyon kapanmış bir güne ait, geri açılamaz</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-800 dark:text-rose-300">
              Bu adisyon kapanmış veya arşivlenmiş bir iş gününe aittir (Z raporu
              alınmıştır). Kapanan günlerin mali kayıtları değiştirilemez. Yalnızca şu
              anda açık olan iş gününün adisyonları geri açılabilir.
            </p>
            <div className="pt-2">
              <button
                type="button"
                className="outline-action w-full"
                onClick={onClose}
              >
                Anladım, Kapat
              </button>
            </div>
          </div>
        ) : !isConfirming ? (
          <div className="space-y-4 text-xs">
            {/* Sipariş özeti (adisyon no, tarih/saat, kalemler ve toplam tutar) */}
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <div className="font-bold text-stone-800 dark:text-stone-200">
                  {order.tableName || `Adisyon #${order.orderNumber}`}
                  {order.customerName ? ` · ${order.customerName}` : ''}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  #{order.orderNumber} · {formatDateTime(order.date)}
                </div>
                <div className="text-[11px] text-stone-500 truncate mt-0.5">
                  {order.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                </div>
              </div>
              <strong className="text-sm font-extrabold text-stone-900 dark:text-stone-100 shrink-0">
                {formatCurrency(order.totals.total)}
              </strong>
            </div>

            {/* Açılacak Masa seçici */}
            <div>
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                Açılacak Masa
              </label>
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {tables.map((t) => {
                  const occupied = isTableOccupied(t)
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} {occupied ? '(Dolu)' : '(Boş)'}
                    </option>
                  )
                })}
              </select>

              {isSelectedTableOccupied && (
                <div
                  role="alert"
                  className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 flex items-start gap-2 text-[11px] font-semibold text-amber-900 dark:text-amber-200"
                >
                  <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Bu masada aktif bir adisyon var, önce onu kapatın ya da başka masa seçin
                  </span>
                </div>
              )}
            </div>

            {/* Geri Açma Sebebi (zorunlu alan, en az 3 karakter) */}
            <div>
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                Geri Açma Sebebi{' '}
                <span className="text-rose-500">* (Zorunlu, en az 3 karakter)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Örn: Müşteri ek sipariş vermek istedi, ödeme yöntemi değişecek..."
                className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
              />
              {reason.length > 0 && !isReasonValid && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  Geri açma sebebi en az 3 karakter olmalıdır.
                </p>
              )}
            </div>

            {/* Sabit Bilgi Kutusu (seçenek değil, sadece bilgilendirme) */}
            <div className="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 flex items-start gap-2.5 text-purple-950 dark:text-purple-200">
              <Info size={16} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] font-medium leading-relaxed">
                {cancellationNoticeText}
              </p>
            </div>

            {/* Vazgeç ve Adisyonu Geri Aç butonları */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                className="outline-action flex-1"
                onClick={onClose}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={!canProceed}
                className="solid-action flex-1 bg-purple-700 hover:bg-purple-800 text-white disabled:opacity-40"
                onClick={handleProceed}
              >
                Adisyonu Geri Aç
              </button>
            </div>
          </div>
        ) : (
          /* Confirmation Step */
          <div className="space-y-4 text-center py-2 text-xs">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 mx-auto grid place-items-center">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                Adisyonu Geri Açmayı Onaylıyor musunuz?
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
                Adisyon #{order.orderNumber} ({formatCurrency(order.totals.total)}){' '}
                <strong>{selectedTable?.name}</strong> masasına aktarılacak.
              </p>
              <div className="mt-2.5 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-[11px] font-semibold text-purple-900 dark:text-purple-200 text-left">
                {cancellationNoticeText}
              </div>
              <div className="mt-2 text-[11px] text-stone-500">
                Sebep: &ldquo;{trimmedReason}&rdquo;
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                className="outline-action flex-1"
                onClick={() => setIsConfirming(false)}
              >
                Geri Dön
              </button>
              <button
                type="button"
                className="solid-action flex-1 bg-purple-700 hover:bg-purple-800 text-white font-extrabold"
                onClick={handleFinalSubmit}
              >
                Evet, Adisyonu Geri Aç
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
