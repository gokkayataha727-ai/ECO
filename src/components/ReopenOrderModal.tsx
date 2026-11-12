import { useState } from 'react'
import { AlertCircle, RotateCcw, X, ShieldAlert } from 'lucide-react'
import { formatCurrency } from '../lib/format'
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
    paymentAction: 'keep' | 'cancel'
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
  const [paymentAction, setPaymentAction] = useState<'keep' | 'cancel'>('keep')
  const [targetTableId, setTargetTableId] = useState<string>(() => {
    if (order?.tableId) return order.tableId
    const firstEmpty = tables.find((t) => t.status === 'empty')
    return firstEmpty ? firstEmpty.id : (tables[0]?.id || '')
  })
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isOpen || !order) return null

  // Safety rule check:
  // Is this order belonging to the currently open business day?
  const isOrderFromOpenDay =
    Boolean(openBusinessDayId) && order.businessDayId === openBusinessDayId

  const isReasonValid = reason.trim().length > 0

  const handleProceed = () => {
    if (!isReasonValid) return
    setIsConfirming(true)
  }

  const handleFinalSubmit = () => {
    if (!isReasonValid) return
    onConfirmReopen({
      orderId: order.id,
      reason: reason.trim(),
      paymentAction,
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
              <span>Bu Adisyon Geri Açılamaz</span>
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
            {/* Order info summary */}
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
              <div>
                <div className="font-bold text-stone-800 dark:text-stone-200">
                  {order.tableName || order.orderNumber}
                  {order.customerName ? ` · ${order.customerName}` : ''}
                </div>
                <div className="text-[11px] text-stone-500">
                  {order.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                </div>
              </div>
              <strong className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                {formatCurrency(order.totals.total)}
              </strong>
            </div>

            {/* Target Table Selector */}
            <div>
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                Açılacak Masa
              </label>
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.status === 'occupied' ? '(Dolu)' : '(Boş)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Reopening Reason (Mandatory) */}
            <div>
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                Geri Açma Sebebi <span className="text-rose-500">* (Zorunlu)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Örn: Müşteri ek sipariş vermek istedi, masa birleştirilecek..."
                className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
              />
            </div>

            {/* Payment Handling Options */}
            <div>
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                Önceki Ödeme Kayıtları Nasıl İşlensin?
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {/* Option A: Keep Payment */}
                <button
                  type="button"
                  onClick={() => setPaymentAction('keep')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    paymentAction === 'keep'
                      ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 ring-1 ring-purple-500'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full border border-purple-500 flex items-center justify-center shrink-0 mt-0.5">
                    {paymentAction === 'keep' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-xs">
                      (a) Ödemeyi Koru ve Üzerine Ekle (Önerilen)
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      Önceki ödeme ({formatCurrency(order.totals.total)}) kayıtlı kalır. Masaya yeni
                      ürün eklendiğinde sadece aradaki fark talep edilir.
                    </div>
                  </div>
                </button>

                {/* Option B: Cancel / Refund Payment */}
                <button
                  type="button"
                  onClick={() => setPaymentAction('cancel')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    paymentAction === 'cancel'
                      ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 ring-1 ring-purple-500'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full border border-purple-500 flex items-center justify-center shrink-0 mt-0.5">
                    {paymentAction === 'cancel' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-xs">
                      (b) Ödemeyi İptal Et / İade Olarak İşle
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      Alınan ödeme kaydı silinir/iade edilir. Masa tamamen ödenmemiş (0 ₺ ödenmiş)
                      olarak yeniden başlar.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Actions */}
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
                disabled={!isReasonValid}
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
                Adisyon #{order.orderNumber} ({formatCurrency(order.totals.total)}) masaya aktarılacak.
              </p>
              <div className="mt-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
                Ödeme Planı:{' '}
                {paymentAction === 'keep'
                  ? 'Önceki ödeme korundu (üzerine eklenebilir)'
                  : 'Ödeme sıfırlandı (yeniden tahsil edilecek)'}
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Sebep: "{reason}"
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
                Evet, Adisyonu Aç
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
