import { useState, useMemo, useEffect } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  Lock,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import { BodyPortal } from './BodyPortal'
import { formatCurrency, fromKurus, roundCurrency, toKurus } from '../lib/format'
import { summarizeCashMovements } from '../lib/businessDay'
import type { BusinessDay, CashMovement, CashMovementType } from '../types'

const CASH_MOVEMENT_CATEGORIES: ReadonlyArray<{
  value: string
  label: string
  hintType?: CashMovementType
}> = [
  { value: 'Tedarikçi', label: 'Tedarikçi', hintType: 'CIKIS' },
  { value: 'Personel Avansı', label: 'Personel Avansı', hintType: 'CIKIS' },
  { value: 'Fatura / Gider', label: 'Fatura / Gider', hintType: 'CIKIS' },
  { value: 'Bozuk Para', label: 'Bozuk Para', hintType: 'GIRIS' },
  { value: 'Kasa Takviyesi', label: 'Kasa Takviyesi', hintType: 'GIRIS' },
  { value: 'Diğer', label: 'Diğer' },
]

export interface CashMovementFormValues {
  type: CashMovementType
  amount: number
  category: string
  description: string
}

export interface CashMovementActionResult {
  ok: boolean
  error?: string
}

interface CashMovementModalProps {
  isOpen: boolean
  onClose: () => void
  openBusinessDay: BusinessDay | null
  movements: CashMovement[]
  canManage?: boolean
  onAddMovement: (
    values: CashMovementFormValues,
  ) => CashMovementActionResult | void
  onCancelMovement: (
    movementId: string,
    reason: string,
  ) => CashMovementActionResult | void
  onOpenDayModal?: () => void
  onUnauthorized?: () => void
}

function parseAmountInput(raw: string): number {
  const normalized = raw.trim().replace(',', '.')
  if (!normalized) return NaN
  const num = Number(normalized)
  if (!Number.isFinite(num)) return NaN
  return roundCurrency(num)
}

export function CashMovementModal(props: CashMovementModalProps) {
  if (!props.isOpen) return null
  return <CashMovementModalContent {...props} />
}

function CashMovementModalContent({
  onClose,
  openBusinessDay,
  movements,
  canManage = true,
  onAddMovement,
  onCancelMovement,
  onOpenDayModal,
  onUnauthorized,
}: CashMovementModalProps) {
  const [type, setType] = useState<CashMovementType>('CIKIS')
  const [amountInput, setAmountInput] = useState('')
  const [category, setCategory] = useState('Tedarikçi')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const isDayOpen = Boolean(openBusinessDay && openBusinessDay.status === 'open')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (cancellingId) {
          setCancellingId(null)
          setCancelReason('')
          setCancelError(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [cancellingId, onClose])

  const daySummary = useMemo(() => {
    if (!openBusinessDay) {
      return {
        dayMovements: [] as CashMovement[],
        activeMovements: [] as CashMovement[],
        cashInTotal: 0,
        cashOutTotal: 0,
        activeCount: 0,
      }
    }
    return summarizeCashMovements(movements, openBusinessDay.id)
  }, [movements, openBusinessDay])

  const handleTypeSelect = (nextType: CashMovementType) => {
    setType(nextType)
    setFormError(null)
    if (nextType === 'GIRIS' && category === 'Tedarikçi') {
      setCategory('Bozuk Para')
    } else if (nextType === 'CIKIS' && (category === 'Bozuk Para' || category === 'Kasa Takviyesi')) {
      setCategory('Tedarikçi')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFeedback(null)

    if (!canManage) {
      onUnauthorized?.()
      setFormError('Kasa giriş/çıkış hareketi kaydetme yetkiniz yok.')
      return
    }

    if (!isDayOpen) {
      setFormError('Açık bir iş günü olmadan kasa hareketi kaydedilemez.')
      return
    }

    const parsedAmount = parseAmountInput(amountInput)
    if (!Number.isFinite(parsedAmount) || toKurus(parsedAmount) <= 0) {
      setFormError('Lütfen sıfırdan büyük geçerli bir tutar girin.')
      return
    }

    const trimmedDesc = description.trim()
    if (trimmedDesc.length < 3) {
      setFormError('Açıklama zorunludur ve en az 3 karakter olmalıdır.')
      return
    }

    const res = onAddMovement({
      type,
      amount: parsedAmount,
      category: category.trim() || 'Diğer',
      description: trimmedDesc,
    })

    if (res && !res.ok) {
      setFormError(res.error || 'Kasa hareketi kaydedilemedi.')
      return
    }

    setAmountInput('')
    setDescription('')
    setFeedback(
      `${type === 'GIRIS' ? 'Kasaya giriş' : 'Kasadan çıkış'} kaydedildi: ${formatCurrency(parsedAmount)}`,
    )
  }

  const handleConfirmCancel = (movementId: string) => {
    setCancelError(null)
    setFeedback(null)

    if (!canManage) {
      onUnauthorized?.()
      setCancelError('Kasa hareketini iptal etme yetkiniz yok.')
      return
    }

    if (!isDayOpen) {
      setCancelError('Gün kapalıyken kasa hareketi iptal edilemez.')
      return
    }

    const trimmedReason = cancelReason.trim()
    if (trimmedReason.length < 3) {
      setCancelError('İptal gerekçesi en az 3 karakter olmalıdır.')
      return
    }

    const res = onCancelMovement(movementId, trimmedReason)
    if (res && !res.ok) {
      setCancelError(res.error || 'Kasa hareketi iptal edilemedi.')
      return
    }

    setCancellingId(null)
    setCancelReason('')
    setCancelError(null)
    setFeedback('Kasa hareketi iptal edildi.')
  }

  const netCashEffect = fromKurus(toKurus(daySummary.cashInTotal) - toKurus(daySummary.cashOutTotal))

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Kasa Hareketleri"
        data-testid="cash-movement-modal"
      >
        <div
          className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#fffdf9] dark:bg-stone-900 border border-[#e6dad0] dark:border-stone-800 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#eee6df] dark:border-stone-800 bg-[#f9f4ef] dark:bg-stone-950/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 grid place-items-center">
                <Wallet size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-[#3b291f] dark:text-stone-100">
                  Kasa Hareketi (Giriş / Çıkış)
                </h2>
                <p className="text-xs font-semibold text-[#8c7a6e] dark:text-stone-400">
                  {openBusinessDay
                    ? `Açık Gün (${new Date(openBusinessDay.openedAt).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}) · Kayıtlar silinmez, yalnızca gerekçeyle iptal edilebilir`
                    : 'Açık iş günü bulunmuyor'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
              aria-label="Kapat"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {!isDayOpen && (
              <div
                data-testid="cash-movement-day-closed-banner"
                className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 text-rose-900 dark:text-rose-200">
                  <Sun size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
                  <div className="text-xs font-bold">
                    Gün kapalı olduğu için yeni kasa hareketi eklenemez veya iptal edilemez.
                  </div>
                </div>
                {onOpenDayModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenDayModal()
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-extrabold"
                  >
                    Günü Aç
                  </button>
                )}
              </div>
            )}

            {!canManage && (
              <div
                data-testid="cash-movement-unauthorized-banner"
                className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center gap-2.5 text-amber-900 dark:text-amber-200 text-xs font-bold"
              >
                <Lock size={16} className="shrink-0" />
                <span>Kasa hareketi ekleme veya iptal etme yetkiniz bulunmuyor (yalnızca görüntüleme).</span>
              </div>
            )}

            {/* Day Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  + Kasaya Giriş ({daySummary.activeMovements.filter((m) => m.type === 'GIRIS').length})
                </div>
                <div
                  data-testid="cash-movement-total-in"
                  className="text-lg font-black text-emerald-800 dark:text-emerald-200 mt-0.5 tabular-nums"
                >
                  {formatCurrency(daySummary.cashInTotal)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  − Kasadan Çıkış ({daySummary.activeMovements.filter((m) => m.type === 'CIKIS').length})
                </div>
                <div
                  data-testid="cash-movement-total-out"
                  className="text-lg font-black text-rose-800 dark:text-rose-200 mt-0.5 tabular-nums"
                >
                  {formatCurrency(daySummary.cashOutTotal)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#f9f4ef] dark:bg-stone-800/70 border border-[#e6dad0] dark:border-stone-700">
                <div className="text-[11px] font-bold text-[#6d5a4e] dark:text-stone-400">
                  Net Kasa Etkisi
                </div>
                <div
                  data-testid="cash-movement-net"
                  className={`text-lg font-black mt-0.5 tabular-nums ${
                    netCashEffect >= 0
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {netCashEffect >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(netCashEffect))}
                </div>
              </div>
            </div>

            {/* New Movement Form */}
            <form
              onSubmit={handleSubmit}
              className="p-4 rounded-2xl bg-white dark:bg-stone-950/60 border border-[#e6dad0] dark:border-stone-800 space-y-4 shadow-2xs"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  data-testid="cash-movement-type-out"
                  disabled={!isDayOpen || !canManage}
                  onClick={() => handleTypeSelect('CIKIS')}
                  className={`py-2.5 px-3 rounded-xl border-2 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    type === 'CIKIS'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                      : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  <ArrowUpCircle size={17} />
                  <span>Kasadan Çıkış (Gider)</span>
                </button>
                <button
                  type="button"
                  data-testid="cash-movement-type-in"
                  disabled={!isDayOpen || !canManage}
                  onClick={() => handleTypeSelect('GIRIS')}
                  className={`py-2.5 px-3 rounded-xl border-2 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    type === 'GIRIS'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  <ArrowDownCircle size={17} />
                  <span>Kasaya Giriş</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="cash-movement-amount"
                    className="block text-xs font-extrabold text-[#5c493d] dark:text-stone-300 mb-1"
                  >
                    Tutar (₺) *
                  </label>
                  <input
                    id="cash-movement-amount"
                    data-testid="cash-movement-amount-input"
                    type="text"
                    inputMode="decimal"
                    value={amountInput}
                    disabled={!isDayOpen}
                    onChange={(e) => {
                      setAmountInput(e.target.value)
                      setFormError(null)
                    }}
                    placeholder="Örn: 150.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#dcd0c4] dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-bold text-[#3b291f] dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-stone-100 dark:disabled:bg-stone-800"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cash-movement-category"
                    className="block text-xs font-extrabold text-[#5c493d] dark:text-stone-300 mb-1"
                  >
                    Kategori *
                  </label>
                  <select
                    id="cash-movement-category"
                    data-testid="cash-movement-category-select"
                    value={category}
                    disabled={!isDayOpen}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#dcd0c4] dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-bold text-[#3b291f] dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-stone-100 dark:disabled:bg-stone-800"
                  >
                    {CASH_MOVEMENT_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="cash-movement-desc"
                  className="block text-xs font-extrabold text-[#5c493d] dark:text-stone-300 mb-1"
                >
                  Açıklama (en az 3 karakter) *
                </label>
                <input
                  id="cash-movement-desc"
                  data-testid="cash-movement-description-input"
                  type="text"
                  value={description}
                  disabled={!isDayOpen}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setFormError(null)
                  }}
                  placeholder="Örn: Süt tedarikçisi ödemesi / Gün içi bozuk para ekleme"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#dcd0c4] dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-semibold text-[#3b291f] dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-stone-100 dark:disabled:bg-stone-800"
                />
              </div>

              {formError && (
                <div
                  role="alert"
                  data-testid="cash-movement-form-error"
                  className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-200"
                >
                  {formError}
                </div>
              )}

              {feedback && (
                <div
                  role="status"
                  data-testid="cash-movement-feedback"
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
                >
                  <CheckCircle2 size={15} />
                  <span>{feedback}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  data-testid="cash-movement-submit-btn"
                  disabled={!isDayOpen}
                  className={`px-5 py-2.5 rounded-xl text-sm font-extrabold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    type === 'GIRIS'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-rose-700 hover:bg-rose-800'
                  }`}
                >
                  {type === 'GIRIS' ? 'Kasaya Giriş Kaydet' : 'Kasadan Çıkış Kaydet'}
                </button>
              </div>
            </form>

            {/* Intraday Movements List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#6d5a4e] dark:text-stone-400">
                  Gün İçi Kasa Hareketleri ({daySummary.dayMovements.length})
                </h3>
              </div>

              {daySummary.dayMovements.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-[#dfd3c7] dark:border-stone-700 text-center text-xs font-semibold text-[#8c7a6e] dark:text-stone-400">
                  Bu iş günü için henüz kasa giriş/çıkış kaydı bulunmuyor.
                </div>
              ) : (
                <div className="space-y-2" data-testid="cash-movement-list">
                  {daySummary.dayMovements.map((mov) => {
                    const isCancelled = Boolean(mov.cancelled)
                    const isGiris = mov.type === 'GIRIS'
                    return (
                      <div
                        key={mov.id}
                        data-testid={`cash-movement-item-${mov.id}`}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isCancelled
                            ? 'bg-stone-100/80 dark:bg-stone-800/40 border-stone-200 dark:border-stone-800 opacity-75'
                            : 'bg-white dark:bg-stone-950/60 border-[#e6dad0] dark:border-stone-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                                  isGiris
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                }`}
                              >
                                {isGiris ? 'Kasaya Giriş' : 'Kasadan Çıkış'}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-[11px] font-bold text-stone-700 dark:text-stone-300">
                                {mov.category}
                              </span>
                              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                                {new Date(mov.createdAt).toLocaleTimeString('tr-TR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })} · {mov.createdBy}
                              </span>
                              {isCancelled && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-200 dark:bg-stone-700 text-[11px] font-extrabold text-stone-700 dark:text-stone-200">
                                  <Ban size={11} /> İptal Edildi
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-sm font-bold ${
                                isCancelled
                                  ? 'line-through text-stone-500 dark:text-stone-400'
                                  : 'text-[#3b291f] dark:text-stone-100'
                              }`}
                            >
                              {mov.description}
                            </div>
                            {isCancelled && mov.cancelledReason && (
                              <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                                İptal Gerekçesi: {mov.cancelledReason}
                                {mov.cancelledBy ? ` (${mov.cancelledBy})` : ''}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`text-base font-black tabular-nums ${
                                isCancelled
                                  ? 'line-through text-stone-400 dark:text-stone-500'
                                  : isGiris
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {isGiris ? '+' : '−'}
                              {formatCurrency(mov.amount)}
                            </span>

                            {!isCancelled && isDayOpen && cancellingId !== mov.id && (
                              <button
                                type="button"
                                data-testid={`cash-movement-cancel-btn-${mov.id}`}
                                onClick={() => {
                                  if (!canManage) {
                                    onUnauthorized?.()
                                    setCancelError('Kasa hareketini iptal etme yetkiniz yok.')
                                    return
                                  }
                                  setCancellingId(mov.id)
                                  setCancelReason('')
                                  setCancelError(null)
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-bold transition-colors cursor-pointer"
                              >
                                İptal Et
                              </button>
                            )}
                          </div>
                        </div>

                        {cancellingId === mov.id && (
                          <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
                            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                              İptal Gerekçesi (en az 3 karakter) *
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <input
                                type="text"
                                data-testid={`cash-movement-cancel-reason-${mov.id}`}
                                value={cancelReason}
                                onChange={(e) => {
                                  setCancelReason(e.target.value)
                                  setCancelError(null)
                                }}
                                placeholder="Hatalı tutar / yanlış işlem gerekçesi..."
                                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-semibold text-stone-800 dark:text-stone-100"
                              />
                              <button
                                type="button"
                                data-testid={`cash-movement-cancel-confirm-${mov.id}`}
                                onClick={() => handleConfirmCancel(mov.id)}
                                className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-extrabold cursor-pointer"
                              >
                                İptali Onayla
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCancellingId(null)
                                  setCancelReason('')
                                  setCancelError(null)
                                }}
                                className="px-3 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-bold cursor-pointer"
                              >
                                Vazgeç
                              </button>
                            </div>
                            {cancelError && (
                              <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                {cancelError}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  )
}
