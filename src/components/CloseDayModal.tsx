import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  CreditCard,
  Landmark,
  Lock,
  Moon,
  Printer,
  X,
} from 'lucide-react'
import { buildReportFromOrders, calculateDayCardBreakdown } from '../lib/businessDay'
import { calculateTotals, formatCurrency, isTableOccupied, roundCurrency } from '../lib/format'
import type {
  AppSettings,
  BusinessDay,
  CompletedOrder,
  Table,
} from '../types'
import { ZReportPrintView } from './ZReportPrintView'

interface CloseDayModalProps {
  isOpen: boolean
  openDay: BusinessDay | null
  orders: CompletedOrder[]
  tables: Table[]
  settings: AppSettings
  onClose: () => void
  onCloseDay: (
    closedDay: BusinessDay,
  ) => void
  onGoToTables: () => void
  onViewReport: (dayId: string) => void
}

export function CloseDayModal({
  isOpen,
  openDay,
  orders,
  tables,
  settings,
  onClose,
  onCloseDay,
  onGoToTables,
  onViewReport,
}: CloseDayModalProps) {
  const [customCountedCash, setCustomCountedCash] = useState<string | null>(null)
  const [enteredZInput, setEnteredZInput] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [confirmStep, setConfirmStep] = useState(false)
  const [closedDayResult, setClosedDayResult] = useState<BusinessDay | null>(null)
  const [printMode, setPrintMode] = useState<'receipt' | 'a4'>('receipt')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const occupiedTables = useMemo(
    () => tables.filter((t) => isTableOccupied(t)),
    [tables],
  )

  const liveReport = useMemo(() => {
    if (!openDay) return null
    const dayOrders = orders.filter((o) => o.businessDayId === openDay.id)
    return buildReportFromOrders(dayOrders, settings.taxRate, tables, openDay.id)
  }, [openDay, orders, settings.taxRate, tables])

  const cardBreakdown = useMemo(() => {
    if (!openDay) return null
    return calculateDayCardBreakdown(
      openDay,
      orders,
      tables,
      settings.posZCutoffTime || '23:57',
    )
  }, [openDay, orders, tables, settings.posZCutoffTime])

  const expectedCash = useMemo(() => {
    if (!openDay || !liveReport) return 0
    return roundCurrency(openDay.openingCash + liveReport.paymentDistribution.cash)
  }, [openDay, liveReport])

  const countedCashInput =
    customCountedCash ??
    expectedCash.toFixed(2).replace('.', ',').replace(/,00$/, '')

  const handleClose = () => {
    setCustomCountedCash(null)
    setEnteredZInput('')
    setCloseNote('')
    setConfirmStep(false)
    setClosedDayResult(null)
    setPrintMode('receipt')
    setIsSubmitting(false)
    onClose()
  }

  if (!isOpen) return null

  // Post-close Z Report Success Screen
  if (closedDayResult && closedDayResult.report) {
    return (
      <div
        className="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Z Raporu - Gün Sonu Tamamlandı"
        onClick={handleClose}
      >
        <div
          className="modal max-w-2xl w-full"
          style={{ width: 'min(680px, 95vw)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
                <Check size={22} strokeWidth={2.6} />
              </div>
              <div>
                <p className="section-kicker text-emerald-700">GÜN SONU TAMAMLANDI</p>
                <h2 className="section-title text-xl">Z Raporu Arşivlendi</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-[#f4ebe3] p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPrintMode('receipt')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    printMode === 'receipt'
                      ? 'bg-[#8a6d57] text-white'
                      : 'text-[#6d5a4e]'
                  }`}
                >
                  80mm Fiş
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('a4')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    printMode === 'a4'
                      ? 'bg-[#8a6d57] text-white'
                      : 'text-[#6d5a4e]'
                  }`}
                >
                  A4 Rapor
                </button>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={handleClose}
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="max-h-[62vh] overflow-y-auto p-4 bg-[#efe8e0]">
            <ZReportPrintView
              report={closedDayResult.report}
              day={closedDayResult}
              settings={settings}
              mode={printMode}
            />
          </div>

          <div className="receipt-actions">
            <button
              type="button"
              className="outline-action flex-1"
              onClick={handleClose}
            >
              Kapat
            </button>
            <button
              type="button"
              className="outline-action flex-1 flex items-center justify-center gap-1.5"
              onClick={() => {
                const id = closedDayResult.id
                handleClose()
                onViewReport(id)
              }}
            >
              <BarChart3 size={15} />
              <span>Raporu Gör</span>
            </button>
            <button
              type="button"
              className="solid-action flex-1 flex items-center justify-center gap-1.5"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              <span>Yazdır</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!openDay || !liveReport || !cardBreakdown) return null

  const parseMoney = (raw: string): number => {
    const cleaned = raw.trim().replace(',', '.')
    if (cleaned === '') return NaN
    const num = Number(cleaned)
    return Number.isFinite(num) ? roundCurrency(num) : NaN
  }

  const isValidMoneyDecimals = (raw: string): boolean => {
    const cleaned = raw.trim().replace(',', '.')
    if (cleaned === '') return true
    return /^\d+(\.\d{1,2})?$/.test(cleaned)
  }

  const countedCash = parseMoney(countedCashInput)
  const isCountedValid =
    !Number.isNaN(countedCash) && countedCash >= 0 && isValidMoneyDecimals(countedCashInput)
  const cashDifference = isCountedValid
    ? roundCurrency(countedCash - expectedCash)
    : 0

  // Optional POS Z Report Input
  const hasEnteredZ = enteredZInput.trim() !== ''
  const parsedEnteredZ = parseMoney(enteredZInput)
  const isEnteredZValid =
    !hasEnteredZ ||
    (!Number.isNaN(parsedEnteredZ) && parsedEnteredZ >= 0 && isValidMoneyDecimals(enteredZInput))

  const zDifference =
    hasEnteredZ && isEnteredZValid
      ? roundCurrency(parsedEnteredZ - cardBreakdown.expectedZ)
      : null

  const hasOpenTables = occupiedTables.length > 0
  const canSubmit = !hasOpenTables && isCountedValid && isEnteredZValid && !isSubmitting

  const handleConfirmCloseDay = () => {
    if (!canSubmit) return
    if (!confirmStep) {
      setConfirmStep(true)
      return
    }

    setIsSubmitting(true)

    const finalSnapshot = buildReportFromOrders(
      orders.filter((o) => o.businessDayId === openDay.id),
      settings.taxRate,
    )

    const enteredZVal = hasEnteredZ && isEnteredZValid ? parsedEnteredZ : undefined
    const zDiffVal = typeof zDifference === 'number' ? zDifference : undefined

    const closedRecord: BusinessDay = {
      ...openDay,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: settings.cashierName || 'LEMOON',
      countedCash,
      expectedCash,
      cashDifference,
      closeNote: closeNote.trim() || undefined,
      posZCutoffTime: cardBreakdown.posZCutoffTime,
      cardCarryIn: cardBreakdown.cardCarryIn,
      cardBeforeCutoff: cardBreakdown.cardBeforeCutoff,
      cardAfterCutoff: cardBreakdown.cardAfterCutoff,
      cardCarryOut: cardBreakdown.cardCarryOut,
      expectedZ: cardBreakdown.expectedZ,
      enteredZ: enteredZVal,
      zDifference: zDiffVal,
      report: {
        ...finalSnapshot,
        posZCutoffTime: cardBreakdown.posZCutoffTime,
        cardCarryIn: cardBreakdown.cardCarryIn,
        cardBeforeCutoff: cardBreakdown.cardBeforeCutoff,
        cardAfterCutoff: cardBreakdown.cardAfterCutoff,
        cardCarryOut: cardBreakdown.cardCarryOut,
        expectedZ: cardBreakdown.expectedZ,
        enteredZ: enteredZVal,
        zDifference: zDiffVal,
      },
    }

    onCloseDay(closedRecord)
    setClosedDayResult(closedRecord)
    setIsSubmitting(false)
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Günü Kapat"
      onClick={onClose}
    >
      <div
        className="modal"
        style={{ width: 'min(660px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1.5">
              <Moon size={13} /> GÜN SONU (Z RAPORU)
            </p>
            <h2 className="section-title">Günü Kapat</h2>
            <p className="muted mt-1">
              Açılış:{' '}
              {new Date(openDay.openedAt).toLocaleString('tr-TR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · Kasiyer: {openDay.openedBy}
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

        <div className="payment-body space-y-4">
          {/* Pre-close check: Open Tables Warning */}
          {hasOpenTables && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-900 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  size={20}
                  className="text-rose-600 shrink-0 mt-0.5"
                />
                <div>
                  <h3 className="text-sm font-extrabold text-rose-900">
                    Açık Masalar Var ({occupiedTables.length} masa)
                  </h3>
                  <p className="text-xs font-medium text-rose-700 mt-0.5">
                    Günü kapatmadan önce açık masalardaki siparişlerin tamamlanması veya iptal edilmesi gerekir.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                {occupiedTables.map((t) => {
                  const { total } = calculateTotals(t.cart, t.discountRate || 0)
                  const count = t.cart.reduce((s, i) => s + i.quantity, 0)
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-rose-200 text-xs"
                    >
                      <div className="min-w-0">
                        <strong className="font-extrabold text-stone-800 block truncate">
                          {t.name}
                          {t.customerName ? ` · ${t.customerName}` : ''}
                        </strong>
                        <span className="text-[11px] text-stone-500">
                          {count} ürün
                        </span>
                      </div>
                      <strong className="font-extrabold text-rose-700 shrink-0">
                        {formatCurrency(total)}
                      </strong>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose()
                  onGoToTables()
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
              >
                <span>Masalara Git ve İşlemleri Tamamla</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Day Summary Strip */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc]">
              <span className="text-[11px] font-bold text-[#8a6d57] block">
                Açılış Nakiti
              </span>
              <strong className="text-base font-extrabold text-[#3b2b21]">
                {formatCurrency(openDay.openingCash)}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc]">
              <span className="text-[11px] font-bold text-[#8a6d57] block">
                Toplam Satış (Ciro)
              </span>
              <strong className="text-base font-extrabold text-emerald-700">
                {formatCurrency(liveReport.totalRevenue)}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc]">
              <span className="text-[11px] font-bold text-[#8a6d57] block">
                Sipariş Sayısı
              </span>
              <strong className="text-base font-extrabold text-[#3b2b21]">
                {liveReport.orderCount} adet
              </strong>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc] space-y-2">
            <div className="text-[11px] font-extrabold text-[#6d5a4e] uppercase tracking-wider">
              Ödeme Yöntemlerine Göre Satışlar
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-[#f4ebe3]/70 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-[#6d5a4e] flex items-center gap-1">
                  <CreditCard size={13} /> Kart
                </span>
                <strong className="text-sm font-extrabold text-[#3b2b21]">
                  {formatCurrency(liveReport.paymentDistribution.card)}
                </strong>
              </div>
              <div className="p-2.5 rounded-lg bg-[#f4ebe3]/70 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-[#6d5a4e] flex items-center gap-1">
                  <Banknote size={13} /> Nakit
                </span>
                <strong className="text-sm font-extrabold text-[#3b2b21]">
                  {formatCurrency(liveReport.paymentDistribution.cash)}
                </strong>
              </div>
              <div className="p-2.5 rounded-lg bg-[#f4ebe3]/70 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-[#6d5a4e] flex items-center gap-1">
                  <Landmark size={13} /> IBAN
                </span>
                <strong className="text-sm font-extrabold text-[#3b2b21]">
                  {formatCurrency(liveReport.paymentDistribution.iban)}
                </strong>
              </div>
            </div>

            {liveReport.openTablePaymentsTotal !== undefined &&
              liveReport.openTablePaymentsTotal > 0 && (
                <div className="mt-2 pt-2 border-t border-[#e8dfd6] flex items-center justify-between text-xs text-amber-800 font-bold">
                  <span>Açık masalarda alınan kısmi ödemeler:</span>
                  <strong>{formatCurrency(liveReport.openTablePaymentsTotal)}</strong>
                </div>
              )}
          </div>

          {/* Section: POS Z Report & Card Carry-Over Details */}
          <div className="p-4 rounded-2xl bg-[#f4ebe3]/60 border border-[#dfd5cc] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[#5c493d] flex items-center gap-1.5 uppercase tracking-wider">
                  <CreditCard size={14} className="text-[#8a6d57]" />
                  POS Z Raporu & Kart Devir Detayı
                </span>
                <span className="text-[11px] text-[#8a6d57] font-semibold">
                  Otomatik Z Kesim Saati: {cardBreakdown.posZCutoffTime}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#8a6d57] font-bold block uppercase">
                  Beklenen POS Z Toplamı
                </span>
                <strong className="text-base font-extrabold text-[#3b2b21]">
                  {formatCurrency(cardBreakdown.expectedZ)}
                </strong>
              </div>
            </div>

            {/* Breakdown Table Rows */}
            <div className="rounded-xl bg-white border border-[#dfd5cc] divide-y divide-[#f0e8e0] text-xs overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-[#6d5a4e] font-semibold">Nakit satış</span>
                <strong className="text-[#3b2b21]">{formatCurrency(liveReport.paymentDistribution.cash)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-[#6d5a4e] font-semibold">Kart satış (toplam)</span>
                <strong className="text-[#3b2b21]">{formatCurrency(cardBreakdown.totalCard)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-1.5 pl-6 bg-[#fcfaf7]">
                <span className="text-[#8a6d57] font-medium text-[11px]">
                  ↳ {cardBreakdown.posZCutoffTime} öncesi (Z raporuna girer)
                </span>
                <strong className="text-emerald-700">{formatCurrency(cardBreakdown.cardBeforeCutoff)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-1.5 pl-6 bg-[#fcfaf7]">
                <span className="text-[#8a6d57] font-medium text-[11px]">
                  ↳ {cardBreakdown.posZCutoffTime} sonrası (yarına devreder)
                </span>
                <strong className="text-amber-700">{formatCurrency(cardBreakdown.cardAfterCutoff)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-[#6d5a4e] font-semibold">Önceki günden devreden kart</span>
                <strong className="text-[#3b2b21]">{formatCurrency(cardBreakdown.cardCarryIn)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#f7f1eb] font-extrabold border-t border-[#e2d6ca]">
                <span className="text-[#3b2b21]">
                  Beklenen POS Z raporu toplamı{' '}
                  <span className="text-[10px] text-[#8a6d57] font-normal">
                    (= devreden + {cardBreakdown.posZCutoffTime} öncesi)
                  </span>
                </span>
                <strong className="text-sm text-[#3b2b21]">{formatCurrency(cardBreakdown.expectedZ)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 bg-amber-50/50">
                <span className="text-[#8a6d57] font-bold">Yarına devreden kart tutarı</span>
                <strong className="text-amber-800 font-extrabold">{formatCurrency(cardBreakdown.cardCarryOut)}</strong>
              </div>
            </div>

            {/* Optional Input: Fişteki POS Z Raporu Tutarı */}
            <div>
              <label
                htmlFor="entered-z-input"
                className="block text-xs font-extrabold text-[#5c493d] mb-1.5"
              >
                POS Z raporu tutarı (fişteki){' '}
                <span className="text-[11px] font-normal text-[#8a6d57]">(İsteğe bağlı)</span>
              </label>
              <input
                id="entered-z-input"
                type="text"
                inputMode="decimal"
                value={enteredZInput}
                onChange={(e) => {
                  setEnteredZInput(e.target.value)
                  setConfirmStep(false)
                }}
                placeholder="Örn: 2000,00 (fişteki toplam)"
                className={`cash-input w-full text-base ${
                  !isEnteredZValid && enteredZInput.trim() !== '' ? 'input-error' : ''
                }`}
              />
            </div>

            {/* POS Z Difference Display */}
            {hasEnteredZ && isEnteredZValid && typeof zDifference === 'number' && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  zDifference === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : zDifference > 0
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center justify-between font-extrabold">
                  <span>
                    POS Z Farkı (
                    {zDifference === 0
                      ? 'Tam / Denk'
                      : zDifference > 0
                        ? 'POS Fazlası'
                        : 'POS Eksiği'}
                    )
                  </span>
                  <strong className="text-sm">
                    {zDifference > 0 ? '+' : ''}
                    {formatCurrency(zDifference)}
                  </strong>
                </div>
                <p className="text-[11px] mt-1 font-medium opacity-90">
                  {zDifference === 0
                    ? 'POS Z raporu sistemdeki devir ve gün içi satış hesabı ile tam uyuşuyor.'
                    : zDifference > 0
                      ? `Fişteki Z toplamı beklenen tutardan ${formatCurrency(zDifference)} daha fazla.`
                      : `Fişteki Z toplamı beklenen tutardan ${formatCurrency(Math.abs(zDifference))} daha az.`}
                </p>
              </div>
            )}
          </div>

          {/* Cash Counting & Difference Calculation */}
          <div className="p-4 rounded-2xl bg-[#f4ebe3]/60 border border-[#dfd5cc] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[#5c493d] block">
                  Beklenen Nakit (Kasa)
                </span>
                <span className="text-[11px] text-[#8a6d57] font-semibold">
                  Açılış ({formatCurrency(openDay.openingCash)}) + Nakit Satış (
                  {formatCurrency(liveReport.paymentDistribution.cash)})
                </span>
              </div>
              <strong className="text-lg font-extrabold text-[#3b2b21]">
                {formatCurrency(expectedCash)}
              </strong>
            </div>

            <div>
              <label
                htmlFor="counted-cash-input"
                className="block text-xs font-extrabold text-[#5c493d] mb-1.5"
              >
                Sayılan nakit (₺)
              </label>
              <input
                id="counted-cash-input"
                type="text"
                inputMode="decimal"
                value={countedCashInput}
                onChange={(e) => {
                  setCustomCountedCash(e.target.value)
                  setConfirmStep(false)
                }}
                placeholder="0,00"
                className={`cash-input w-full text-base ${
                  !isCountedValid && countedCashInput.trim() !== ''
                    ? 'input-error'
                    : ''
                }`}
              />
            </div>

            {isCountedValid && (
              <div
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-extrabold ${
                  cashDifference === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : cashDifference > 0
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <span>
                  Kasa Farkı (
                  {cashDifference === 0
                    ? 'Tam / Denk'
                    : cashDifference > 0
                      ? 'Kasa Fazlası'
                      : 'Kasa Eksiği'}
                  )
                </span>
                <strong className="text-sm">
                  {cashDifference > 0 ? '+' : ''}
                  {formatCurrency(cashDifference)}
                </strong>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="close-day-note"
              className="block text-xs font-extrabold text-[#5c493d] mb-1.5"
            >
              Gün sonu notu (İsteğe bağlı)
            </label>
            <textarea
              id="close-day-note"
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="Örn: Z raporu alındı, nakit teslim edildi..."
              className="note-area mt-0"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
            <Lock size={14} className="shrink-0 text-amber-700" />
            <span>
              Gün kapatıldıktan sonra geri alınamaz ve Z raporu salt okunur olarak arşivlenir.
            </span>
          </div>

          {confirmStep && !hasOpenTables && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#3b291f] text-[#fffdf9] text-xs font-bold flex items-center justify-between gap-3"
            >
              <span>
                Günü kapatmak istediğinize emin misiniz? Gün kapatıldıktan sonra geri alınamaz.
              </span>
              <button
                type="button"
                onClick={() => setConfirmStep(false)}
                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] shrink-0"
              >
                İptal
              </button>
            </div>
          )}

          <div className="success-actions mt-4">
            <button
              type="button"
              className="outline-action"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={handleConfirmCloseDay}
              className="solid-action disabled:opacity-45"
            >
              {isSubmitting
                ? 'Kapatılıyor...'
                : confirmStep
                  ? 'Onayla ve Günü Kapat'
                  : 'Günü Kapat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
