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
import {
  buildReportFromOrders,
  calculateDayCardBreakdown,
  getOpenBusinessDayDurationAlert,
  getStoredBusinessDays,
  getStoredCashMovements,
  hesaplaBeklenenNakit,
  selectOrdersForBusinessDay,
  summarizeCashMovements,
} from '../lib/businessDay'
import {
  calculateTotals,
  formatCurrency,
  fromKurus,
  isTableOccupied,
  roundCurrency,
  toKurus,
} from '../lib/format'
import type {
  AppSettings,
  BusinessDay,
  CashMovement,
  CompletedOrder,
  Table,
} from '../types'
import { ZReportPrintView } from './ZReportPrintView'
import { PrintPortal } from './PrintPortal'

interface CloseDayModalProps {
  isOpen: boolean
  openDay: BusinessDay | null
  orders: CompletedOrder[]
  tables: Table[]
  cashMovements?: CashMovement[]
  businessDays?: BusinessDay[]
  settings: AppSettings
  onClose: () => void
  onCloseDay: (
    closedDay: BusinessDay,
  ) => void
  onGoToTables: () => void
  onViewReport: (dayId: string) => void
}

export const CASH_DIFFERENCE_NOTE_THRESHOLD = 50

export function CloseDayModal(props: CloseDayModalProps) {
  if (!props.isOpen) return null
  return <CloseDayModalContent {...props} />
}

function CloseDayModalContent({
  openDay,
  orders,
  tables,
  cashMovements,
  businessDays,
  settings,
  onClose,
  onCloseDay,
  onGoToTables,
  onViewReport,
}: CloseDayModalProps) {
  const [countedCashInput, setCountedCashInput] = useState('')
  const [usedExpectedCash, setUsedExpectedCash] = useState(false)
  const [cashDifferenceNote, setCashDifferenceNote] = useState('')
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

  const dayCashMovementsSummary = useMemo(() => {
    if (!openDay) return null
    return summarizeCashMovements(cashMovements ?? getStoredCashMovements(), openDay.id)
  }, [openDay, cashMovements])

  const closedBusinessDayIds = useMemo(
    () =>
      (businessDays ?? getStoredBusinessDays())
        .filter((d) => d.status === 'closed' && d.id !== openDay?.id)
        .map((d) => d.id),
    [businessDays, openDay?.id],
  )

  const durationAlert = useMemo(
    () => getOpenBusinessDayDurationAlert(openDay),
    [openDay],
  )

  const liveReport = useMemo(() => {
    if (!openDay) return null
    const dayOrders = selectOrdersForBusinessDay(orders, openDay.id)
    return buildReportFromOrders(
      dayOrders,
      settings.taxRate,
      tables,
      openDay.id,
      undefined,
      {
        ...(cashMovements !== undefined ? { cashMovements } : {}),
        closedBusinessDayIds,
      },
    )
  }, [openDay, orders, settings.taxRate, tables, cashMovements, closedBusinessDayIds])

  const cardBreakdown = useMemo(() => {
    if (!openDay) return null
    return calculateDayCardBreakdown(
      openDay,
      orders,
      tables,
      settings.posZCutoffTime || '23:57',
    )
  }, [openDay, orders, tables, settings.posZCutoffTime])

  const cashSummary = useMemo(() => {
    if (!openDay || !liveReport) return null
    return hesaplaBeklenenNakit(
      openDay,
      liveReport,
      dayCashMovementsSummary
        ? { kasaHareketleri: dayCashMovementsSummary.activeMovements }
        : undefined,
    )
  }, [openDay, liveReport, dayCashMovementsSummary])

  const expectedCash = cashSummary?.beklenen ?? 0

  const handleClose = () => {
    setCountedCashInput('')
    setUsedExpectedCash(false)
    setCashDifferenceNote('')
    setEnteredZInput('')
    setCloseNote('')
    setConfirmStep(false)
    setClosedDayResult(null)
    setPrintMode('receipt')
    setIsSubmitting(false)
    onClose()
  }

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

          <PrintPortal>
            <div
              className={`print-container ${
                printMode === 'a4' ? 'print-a4' : 'print-receipt'
              }`}
            >
              <ZReportPrintView
                report={closedDayResult.report}
                day={closedDayResult}
                titleLabel="Gün Sonu Özeti"
                settings={settings}
                mode={printMode}
              />
            </div>
          </PrintPortal>

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
              onClick={() => {
                const safeDate = new Date().toISOString().slice(0, 10)
                const prevTitle = document.title
                document.title = `LEMOON_KAFE_Z_Raporu_GunSonu_${safeDate}`
                setTimeout(() => {
                  window.print()
                  setTimeout(() => {
                    document.title = prevTitle
                  }, 1000)
                }, 50)
              }}
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

  const hasCountedCash = countedCashInput.trim() !== ''
  const countedCash = parseMoney(countedCashInput)
  const isCountedValid =
    hasCountedCash &&
    !Number.isNaN(countedCash) &&
    countedCash >= 0 &&
    isValidMoneyDecimals(countedCashInput)
  const cashDifference = isCountedValid
    ? fromKurus(toKurus(countedCash) - toKurus(expectedCash))
    : 0
  const absCashDifference = Math.abs(cashDifference)
  const hasCashDifference = isCountedValid && toKurus(cashDifference) !== 0
  const requiresDifferenceNote =
    isCountedValid &&
    toKurus(absCashDifference) > toKurus(CASH_DIFFERENCE_NOTE_THRESHOLD)
  const isDifferenceNoteValid =
    !requiresDifferenceNote || cashDifferenceNote.trim().length > 0

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
  const canSubmit =
    !hasOpenTables &&
    isCountedValid &&
    isDifferenceNoteValid &&
    isEnteredZValid &&
    !isSubmitting

  const handleConfirmCloseDay = () => {
    if (!canSubmit) return
    if (!confirmStep) {
      setConfirmStep(true)
      return
    }

    setIsSubmitting(true)

    const resolvedMovements = cashMovements ?? getStoredCashMovements()
    const finalMovementsSummary = summarizeCashMovements(resolvedMovements, openDay.id)
    const finalSnapshot = buildReportFromOrders(
      selectOrdersForBusinessDay(orders, openDay.id),
      settings.taxRate,
      tables,
      openDay.id,
      undefined,
      { cashMovements: resolvedMovements, closedBusinessDayIds },
    )
    const finalCashSummary = hesaplaBeklenenNakit(openDay, finalSnapshot, {
      kasaHareketleri: finalMovementsSummary.activeMovements,
    })
    const finalExpectedCash = finalCashSummary.beklenen
    const finalCashDifference = fromKurus(toKurus(countedCash) - toKurus(finalExpectedCash))
    const finalHasCashDifference = toKurus(finalCashDifference) !== 0
    const finalCashDifferenceNote =
      finalHasCashDifference && cashDifferenceNote.trim()
        ? cashDifferenceNote.trim()
        : undefined

    const trimmedCloseNote = closeNote.trim()
    const expectedCashNoteText = 'Beklenen tutar kullanıldı'
    const finalCloseNote = usedExpectedCash
      ? trimmedCloseNote
        ? `${trimmedCloseNote} (${expectedCashNoteText})`
        : expectedCashNoteText
      : trimmedCloseNote || undefined

    const enteredZVal = hasEnteredZ && isEnteredZValid ? parsedEnteredZ : undefined
    const zDiffVal = typeof zDifference === 'number' ? zDifference : undefined

    const closedRecord: BusinessDay = {
      ...openDay,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: settings.cashierName || 'LEMOON',
      countedCash,
      closingCash: countedCash,
      expectedCash: finalExpectedCash,
      cashDifference: finalCashDifference,
      cashDifferenceNote: finalCashDifferenceNote,
      usedExpectedCash: usedExpectedCash ? true : undefined,
      closeNote: finalCloseNote,
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
      onClick={handleClose}
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
            onClick={handleClose}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="payment-body space-y-4">
          {durationAlert && (
            <div
              role="status"
              data-testid="close-day-multiday-alert"
              className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2"
            >
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>{durationAlert.message}</span>
            </div>
          )}

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
                  const { total } = calculateTotals(t.cart, t.discountRate || 0, t.discountAmount || 0)
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

              {cashSummary && cashSummary.kirilim.acikMasaNakit > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">
                  <span>Açık masalardaki nakit ara ödeme toplamı:</span>
                  <strong className="font-extrabold">
                    {formatCurrency(cashSummary.kirilim.acikMasaNakit)}
                    {(liveReport?.cashDrawerBreakdown?.openTableCashRefunds ?? 0) > 0 && (
                      <span className="ml-1 font-semibold text-amber-700">
                        (Net: {formatCurrency(liveReport?.openTablePaymentsByMethod?.cash ?? 0)})
                      </span>
                    )}
                  </strong>
                </div>
              )}

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
                Tahsil Edilen (Net)
              </span>
              <strong className="text-base font-extrabold text-emerald-700">
                {formatCurrency(liveReport.paidTablesTotal ?? liveReport.totalRevenue)}
              </strong>
              {(liveReport.grossItemsRevenue ?? liveReport.totalRevenue) !==
                (liveReport.paidTablesTotal ?? liveReport.totalRevenue) && (
                <span className="text-[10px] font-semibold text-[#8a6d57] block mt-0.5">
                  Girilen (Brüt):{' '}
                  {formatCurrency(liveReport.grossItemsRevenue ?? liveReport.totalRevenue)}
                </span>
              )}
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
            {(liveReport.previousDayCarryoverCollection || 0) > 0 && (
              <div
                data-testid="close-day-carryover-collection"
                className="mt-2 pt-2 border-t border-[#e8dfd6] flex items-center justify-between text-xs text-amber-900 font-bold"
              >
                <span>Önceki günden devreden tahsilat:</span>
                <strong>{formatCurrency(liveReport.previousDayCarryoverCollection || 0)}</strong>
              </div>
            )}
          </div>

          {/* Section: POS Z Report */}
          <div className="p-4 rounded-2xl bg-[#f4ebe3]/60 border border-[#dfd5cc] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[#5c493d] flex items-center gap-1.5 uppercase tracking-wider">
                  <CreditCard size={14} className="text-[#8a6d57]" />
                  POS Z Raporu Özeti
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
                <span className="text-[#6d5a4e] font-semibold">Nakit Satışlar</span>
                <strong className="text-[#3b2b21]">
                  {formatCurrency(
                    cashSummary
                      ? cashSummary.kirilim.netNakitSatis
                      : liveReport.paymentDistribution.cash,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-[#6d5a4e] font-semibold">Kredi Kartı Satışları (Toplam)</span>
                <strong className="text-[#3b2b21]">{formatCurrency(cardBreakdown.totalCard)}</strong>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#f7f1eb] font-extrabold border-t border-[#e2d6ca]">
                <span className="text-[#3b2b21]">
                  Beklenen POS Z Raporu Toplamı
                </span>
                <strong className="text-sm text-[#3b2b21]">{formatCurrency(cardBreakdown.expectedZ)}</strong>
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
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#5c493d]">
                <span className="font-semibold">Açılış Nakiti</span>
                <strong className="font-bold text-[#3b2b21]">
                  {formatCurrency(cashSummary?.kirilim.acilisNakiti ?? openDay.openingCash)}
                </strong>
              </div>
              <div className="flex items-center justify-between text-[#5c493d]">
                <span className="font-semibold">+ Kapanan adisyonlar (nakit)</span>
                <strong className="font-bold text-emerald-700">
                  {formatCurrency(
                    cashSummary?.kirilim.kapananNakit ?? liveReport.paymentDistribution.cash,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between text-[#5c493d]">
                <span className="font-semibold">+ Açık masa ara ödemeleri</span>
                <strong className="font-bold text-amber-700">
                  {formatCurrency(cashSummary?.kirilim.acikMasaNakit ?? 0)}
                </strong>
              </div>
              <div className="flex items-center justify-between text-[#5c493d]">
                <span className="font-semibold">− Nakit iadeler</span>
                <strong className="font-bold text-rose-700">
                  {formatCurrency(cashSummary?.kirilim.nakitIadeler ?? 0)}
                </strong>
              </div>
              {cashSummary && cashSummary.kirilim.kasaGiris > 0 && (
                <div className="flex items-center justify-between text-[#5c493d]">
                  <span className="font-semibold">+ Kasa giriş</span>
                  <strong className="font-bold text-emerald-700">
                    {formatCurrency(cashSummary.kirilim.kasaGiris)}
                  </strong>
                </div>
              )}
              {cashSummary && cashSummary.kirilim.kasaCikis > 0 && (
                <div className="flex items-center justify-between text-[#5c493d]">
                  <span className="font-semibold">− Kasa çıkış</span>
                  <strong className="font-bold text-rose-700">
                    {formatCurrency(cashSummary.kirilim.kasaCikis)}
                  </strong>
                </div>
              )}
              <div className="pt-2 border-t border-[#dfd5cc] flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#3b2b21]">
                  = Beklenen Nakit (Kasa)
                </span>
                <strong
                  className="text-lg font-extrabold text-[#3b2b21]"
                  data-testid="close-day-expected-cash"
                >
                  {formatCurrency(expectedCash)}
                </strong>
              </div>
              {((liveReport.unexplainedDifference || 0) > 0 ||
                (cashSummary?.aciklanamayanFark || 0) > 0) && (
                <div
                  className="mt-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-900"
                  data-testid="close-day-unexplained-diff"
                >
                  Açıklanamayan fark:{' '}
                  {formatCurrency(
                    Math.max(
                      liveReport.unexplainedDifference || 0,
                      cashSummary?.aciklanamayanFark || 0,
                    ),
                  )}{' '}
                  (Negatif toplam 0 TL olarak sınırlandı — lütfen kayıtları kontrol edin)
                </div>
              )}
              {dayCashMovementsSummary && dayCashMovementsSummary.dayMovements.length > 0 && (
                <div
                  className="mt-2 pt-2 border-t border-[#e5dcd3] space-y-1"
                  data-testid="close-day-cash-movements"
                >
                  <div className="text-[11px] font-extrabold text-[#5c493d]">
                    Gün İçi Kasa Hareketleri ({dayCashMovementsSummary.activeCount} aktif /{' '}
                    {dayCashMovementsSummary.dayMovements.length} toplam)
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                    {dayCashMovementsSummary.dayMovements.map((mov) => (
                      <div
                        key={mov.id}
                        className={`flex items-center justify-between gap-2 text-[11px] ${
                          mov.cancelled ? 'line-through text-[#a18f82]' : 'text-[#5c493d]'
                        }`}
                      >
                        <span className="truncate">
                          {mov.type === 'GIRIS' ? '+ Giriş' : '− Çıkış'} · {mov.category} —{' '}
                          {mov.description}
                          {mov.cancelled ? ' (İptal)' : ''}
                        </span>
                        <strong className="shrink-0 tabular-nums">
                          {mov.type === 'GIRIS' ? '+' : '−'}
                          {formatCurrency(mov.amount)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="counted-cash-input"
                  className="block text-xs font-extrabold text-[#5c493d]"
                >
                  Sayılan nakit (₺) <span className="text-rose-600">*</span>
                </label>
                <button
                  type="button"
                  data-testid="use-expected-cash-btn"
                  onClick={() => {
                    setCountedCashInput(
                      expectedCash.toFixed(2).replace('.', ',').replace(/,00$/, ''),
                    )
                    setUsedExpectedCash(true)
                    setCashDifferenceNote('')
                    setConfirmStep(false)
                  }}
                  className="text-[11px] font-bold text-[#8a6d57] hover:text-[#3b2b21] bg-white hover:bg-[#fcfaf7] border border-[#dfd5cc] px-2.5 py-1 rounded-lg transition-colors"
                >
                  Beklenen tutarı kullan
                </button>
              </div>
              <input
                id="counted-cash-input"
                type="text"
                inputMode="decimal"
                value={countedCashInput}
                onChange={(e) => {
                  setCountedCashInput(e.target.value)
                  setUsedExpectedCash(false)
                  setConfirmStep(false)
                }}
                placeholder="Kasada sayılan nakit tutarını girin"
                className={`cash-input w-full text-base ${
                  !isCountedValid && countedCashInput.trim() !== ''
                    ? 'input-error'
                    : ''
                }`}
              />
              {!hasCountedCash && (
                <p className="mt-1.5 text-[11px] font-medium text-[#8a6d57]">
                  Günü kapatmak için kasada fiilen sayılan nakit tutarını girmelisiniz.
                </p>
              )}
              {hasCountedCash && !isCountedValid && (
                <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
                  Lütfen 0 veya daha büyük, en fazla 2 ondalık basamaklı geçerli bir tutar girin.
                </p>
              )}
              {usedExpectedCash && isCountedValid && (
                <p
                  className="mt-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
                  data-testid="used-expected-cash-notice"
                >
                  Beklenen tutar ({formatCurrency(expectedCash)}) tek tıkla kopyalandı. Gün sonu kaydına &quot;Beklenen tutar kullanıldı&quot; notu düşülecektir.
                </p>
              )}
            </div>

            {isCountedValid && !hasCashDifference && (
              <div
                data-testid="close-day-cash-difference"
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-extrabold bg-emerald-50 border-emerald-200 text-emerald-800"
              >
                <span>Kasa Farkı (Kasa Tam)</span>
                <strong className="text-sm">{formatCurrency(0)}</strong>
              </div>
            )}

            {isCountedValid && hasCashDifference && (
              <div
                role="alert"
                data-testid="close-day-cash-difference"
                className={`p-3.5 rounded-xl text-xs space-y-1.5 ${
                  requiresDifferenceNote
                    ? cashDifference < 0
                      ? 'bg-rose-50 border-2 border-rose-300 text-rose-900'
                      : 'bg-amber-50 border-2 border-amber-400 text-amber-950'
                    : cashDifference < 0
                      ? 'bg-rose-50 border border-rose-200 text-rose-800'
                      : 'bg-amber-50 border border-amber-300 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-extrabold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>
                      Kasa Farkı ({cashDifference > 0 ? 'Kasa Fazlası' : 'Kasa Eksiği'})
                    </span>
                  </span>
                  <strong className="text-sm">
                    {cashDifference > 0
                      ? `${formatCurrency(absCashDifference)} Fazla`
                      : `${formatCurrency(absCashDifference)} Eksik`}
                  </strong>
                </div>
                <p className="text-[11px] font-medium opacity-90">
                  {cashDifference < 0
                    ? `Kasada beklenen nakitten ${formatCurrency(absCashDifference)} daha az sayıldı (${formatCurrency(cashDifference)}).`
                    : `Kasada beklenen nakitten ${formatCurrency(absCashDifference)} daha fazla sayıldı (+${formatCurrency(cashDifference)}).`}
                  {requiresDifferenceNote &&
                    ` Fark ${formatCurrency(CASH_DIFFERENCE_NOTE_THRESHOLD)} eşiğinin üzerinde olduğu için kısa bir açıklama girmeniz zorunludur.`}
                </p>
              </div>
            )}

            {hasCashDifference && (
              <div>
                <label
                  htmlFor="cash-difference-note"
                  className="block text-xs font-extrabold text-[#5c493d] mb-1.5"
                >
                  Kasa farkı açıklaması{' '}
                  {requiresDifferenceNote ? (
                    <span className="text-rose-600">
                      * (Zorunlu — {formatCurrency(CASH_DIFFERENCE_NOTE_THRESHOLD)} üzeri fark)
                    </span>
                  ) : (
                    <span className="text-[11px] font-normal text-[#8a6d57]">
                      (İsteğe bağlı)
                    </span>
                  )}
                </label>
                <textarea
                  id="cash-difference-note"
                  data-testid="cash-difference-note-input"
                  value={cashDifferenceNote}
                  onChange={(e) => {
                    setCashDifferenceNote(e.target.value)
                    setConfirmStep(false)
                  }}
                  placeholder="Örn: Gün içi bozuk para harcaması, hatalı para üstü, sayım farkı..."
                  className={`note-area mt-0 ${
                    requiresDifferenceNote && !isDifferenceNoteValid
                      ? 'border-rose-400 bg-rose-50/40'
                      : ''
                  }`}
                  rows={2}
                />
                {requiresDifferenceNote && !isDifferenceNoteValid && (
                  <p
                    className="mt-1 text-[11px] font-semibold text-rose-600"
                    data-testid="cash-difference-note-error"
                  >
                    {formatCurrency(CASH_DIFFERENCE_NOTE_THRESHOLD)} üzerindeki kasa farkı için kısa bir açıklama giriniz.
                  </p>
                )}
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
              onClick={handleClose}
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
