import { useState, useMemo } from 'react'
import { AlertCircle, RotateCcw, X, Banknote, CreditCard } from 'lucide-react'
import { formatCurrency, getEffectivePrice } from '../lib/format'
import type { CartItem, PaymentMethod, Table } from '../types'

interface RefundModalProps {
  isOpen: boolean
  onClose: () => void
  item?: CartItem | null
  table?: Table | null
  hasPaymentReceived?: boolean
  onConfirmRefund: (params: {
    qty: number
    reason: string
    paymentMethod: PaymentMethod
    isTableRefund: boolean
  }) => void
}

const COMMON_REASONS = [
  'Yanlış Sipariş',
  'Müşteri Vazgeçti',
  'Bozuk / Kusurlu Ürün',
  'Soğuk / Geç Geldi',
  'Masa İptal Edildi',
  'Diğer',
]

export function RefundModal({
  isOpen,
  onClose,
  item,
  table,
  hasPaymentReceived = false,
  onConfirmRefund,
}: RefundModalProps) {
  const isTableRefund = !item && Boolean(table)

  // Max refundable quantity for the item
  const maxQty = useMemo(() => {
    if (!item) return 1
    const alreadyRefunded = item.refundedQty || 0
    return Math.max(1, item.quantity - alreadyRefunded)
  }, [item])

  const [qty, setQty] = useState(1)
  const [selectedReason, setSelectedReason] = useState(COMMON_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<PaymentMethod>('cash')
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isOpen) return null

  const effectiveReason =
    selectedReason === 'Diğer' ? customReason.trim() : selectedReason

  const isReasonValid = effectiveReason.length > 0

  const unitPrice = item ? getEffectivePrice(item) : 0
  const refundAmount = isTableRefund
    ? (table?.cart || [])
        .filter((i) => i.status !== 'refunded')
        .reduce((sum, i) => sum + getEffectivePrice(i) * (i.quantity - (i.refundedQty || 0)), 0)
    : unitPrice * qty

  const handleProceed = () => {
    if (!isReasonValid) return
    setIsConfirming(true)
  }

  const handleFinalSubmit = () => {
    if (!isReasonValid) return
    onConfirmRefund({
      qty: isTableRefund ? 1 : qty,
      reason: effectiveReason,
      paymentMethod: refundPaymentMethod,
      isTableRefund,
    })
    setIsConfirming(false)
    onClose()
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="İade İşlemi"
      onClick={onClose}
    >
      <div
        className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-2xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 grid place-items-center">
              <RotateCcw size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                {isTableRefund ? 'MASA İADESİ' : 'KALEM İADESİ'}
              </p>
              <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                {isTableRefund
                  ? `${table?.name} Tüm Siparişi İade Et`
                  : `${item?.name} İadesi`}
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

        {!isConfirming ? (
          <div className="space-y-4 text-xs">
            {/* Quantity Selector (for item refund) */}
            {!isTableRefund && maxQty > 1 && (
              <div>
                <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                  İade Edilecek Adet (Mevcut: {maxQty} adet)
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-stone-300 dark:border-stone-700 rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800">
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      className="px-3.5 py-2 font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors"
                    >
                      -
                    </button>
                    <span className="px-4 py-2 font-extrabold text-sm text-stone-900 dark:text-stone-100">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                      disabled={qty >= maxQty}
                      className="px-3.5 py-2 font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-xs text-stone-500">
                    İade Tutarı: <strong className="text-rose-600 text-sm">{formatCurrency(refundAmount)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Refund Reason Selection (Mandatory) */}
            <div>
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                İade Nedeni <span className="text-rose-500">* (Zorunlu)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {COMMON_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedReason(r)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                      selectedReason === r
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-bold'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {selectedReason === 'Diğer' && (
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="İade nedenini detaylı yazın..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  autoFocus
                />
              )}
            </div>

            {/* Payment Method for Refund (if payment was taken) */}
            {hasPaymentReceived && (
              <div>
                <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                  İade Ödeme Yöntemi (Müşteriye Ödenecek Biçim)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundPaymentMethod('cash')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      refundPaymentMethod === 'cash'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <Banknote size={15} />
                    Nakit İade
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundPaymentMethod('card')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      refundPaymentMethod === 'card'
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <CreditCard size={15} />
                    Kredi Kartı İade
                  </button>
                </div>
              </div>
            )}

            {/* Summary Box */}
            <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 flex items-center justify-between">
              <div>
                <span className="font-bold text-rose-900 dark:text-rose-200">
                  Toplam İade Tutarı
                </span>
                <p className="text-[11px] text-rose-700 dark:text-rose-400">
                  {isTableRefund
                    ? `${table?.name} tüm siparişi iade edilecek`
                    : `${qty} adet × ${formatCurrency(unitPrice)}`}
                </p>
              </div>
              <strong className="text-base font-extrabold text-rose-700 dark:text-rose-300">
                {formatCurrency(refundAmount)}
              </strong>
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
                className="solid-action flex-1 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
                onClick={handleProceed}
              >
                İadeyi Onayla
              </button>
            </div>
          </div>
        ) : (
          /* Confirmation Step */
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto grid place-items-center">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                İade İşlemini Onaylıyor musunuz?
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
                {isTableRefund
                  ? `${table?.name} masasının tüm siparişi (${formatCurrency(refundAmount)}) iade olarak kaydedilecektir.`
                  : `${qty} adet ${item?.name} (${formatCurrency(refundAmount)}) iade edilecek.`}
              </p>
              <div className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                Neden: "{effectiveReason}"
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
                className="solid-action flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold"
                onClick={handleFinalSubmit}
              >
                Evet, İade Et
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
