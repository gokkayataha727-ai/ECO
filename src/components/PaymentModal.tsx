import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  FileText,
  Landmark,
  Minus,
  Plus,
  RotateCcw,
  ShoppingBag,
  Tag,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  calculateSelectedItemsPayment,
  deriveLinePaymentStates,
  derivePaymentState,
  formatCurrency,
  formatIban,
  formatTime,
  paymentMethodLabel,
  roundCurrency,
  sanitizeDecimalInput,
  validateTurkishIban,
} from '../lib/format'
import { generateUUID } from '../lib/uuid'
import type {
  AppSettings,
  CartItem,
  OrderTotals,
  PartialPayment,
  PaymentMethod,
  Session,
} from '../types'
import { can } from '../lib/permissions'
import { ReceiptPreview } from './ReceiptPreview'

const DEFAULT_IBAN_PLACEHOLDER = 'TR00 0000 0000 0000 0000 0000 00'

interface PaymentModalProps {
  cart: CartItem[]
  customerName?: string
  discountRate: number
  discountAmount?: number
  onApplyDiscountAmount?: (amount: number) => void
  isOpen: boolean
  note: string
  onClose: () => void
  onNewOrder: () => void
  onPaid: (method: PaymentMethod) => void
  onAddPayment: (payment: PartialPayment, isComplete: boolean, finalMethod: PaymentMethod) => void
  onUndoLastPayment?: () => void
  orderNumber: string
  paidMethod: PaymentMethod | null
  payments: PartialPayment[]
  settings: AppSettings
  totals: OrderTotals
  currentSession?: Session | null
}

export function PaymentModal({
  cart,
  customerName,
  discountRate,
  discountAmount = 0,
  onApplyDiscountAmount,
  isOpen,
  note,
  onClose,
  onNewOrder,
  onAddPayment,
  onUndoLastPayment,
  orderNumber,
  paidMethod,
  payments,
  settings,
  totals,
  currentSession,
}: PaymentModalProps) {
  const canCash = can(currentSession, 'payment_cash', settings)
  const canCard = can(currentSession, 'payment_card', settings)
  const canIban = can(currentSession, 'payment_iban', settings)
  const canPartial = can(currentSession, 'payment_partial', settings)
  const canCustomAmount = can(currentSession, 'payment_custom_amount', settings)

  const defaultMethod = useMemo<'card' | 'cash' | 'iban'>(() => {
    if (canCash) return 'cash'
    if (canCard) return 'card'
    if (canIban) return 'iban'
    return 'cash'
  }, [canCash, canCard, canIban])

  const [method, setMethod] = useState<'card' | 'cash' | 'iban'>(defaultMethod)
  const [customAmountInput, setCustomAmountInput] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [copiedIban, setCopiedIban] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [splitCount, setSplitCount] = useState<number | null>(null)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [itemsCollapsedMobile, setItemsCollapsedMobile] = useState(false)
  const [showDiscountEditor, setShowDiscountEditor] = useState(false)
  const [discountMode, setDiscountMode] = useState<'amount' | 'net' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState('')

  const grandTotal = roundCurrency(totals.total)
  const baseTotalBeforePaymentDiscount = roundCurrency(grandTotal + discountAmount)
  const { paidTotal, remaining } = derivePaymentState(grandTotal, payments)
  const maxApplicableDiscount = Math.max(0, roundCurrency(baseTotalBeforePaymentDiscount - paidTotal))
  const hasPartialPayments = payments.length > 0

  const lineStates = useMemo(
    () => deriveLinePaymentStates(cart, discountRate, payments, discountAmount),
    [cart, discountRate, payments, discountAmount],
  )

  // Sanitize selection so it never exceeds current unpaidQty of any line
  const effectiveSelectedQuantities = useMemo(() => {
    const cleaned: Record<string, number> = {}
    for (const line of lineStates) {
      const sel = selectedQuantities[line.cartItemId]
      if (sel && sel > 0 && line.unpaidQty > 0) {
        cleaned[line.cartItemId] = Math.min(sel, line.unpaidQty)
      }
    }
    return cleaned
  }, [lineStates, selectedQuantities])

  const selectedPayment = useMemo(
    () => calculateSelectedItemsPayment(lineStates, effectiveSelectedQuantities, remaining),
    [lineStates, effectiveSelectedQuantities, remaining],
  )

  const hasItemSelection = selectedPayment.items.length > 0

  const totalOrderUnits = useMemo(
    () =>
      cart
        .filter((item) => item.status !== 'refunded')
        .reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  )

  const totalUnpaidUnits = useMemo(
    () => lineStates.reduce((sum, line) => sum + line.unpaidQty, 0),
    [lineStates],
  )

  const allUnpaidSelected =
    totalUnpaidUnits > 0 &&
    lineStates.every(
      (line) =>
        line.unpaidQty === 0 ||
        (effectiveSelectedQuantities[line.cartItemId] || 0) === line.unpaidQty,
    )

  const formatInputVal = (val: number) =>
    val.toFixed(2).replace('.', ',').replace(/,00$/, '')

  const amountInput =
    customAmountInput !== null
      ? customAmountInput
      : hasItemSelection
        ? formatInputVal(selectedPayment.totalAmount)
        : formatInputVal(remaining)

  const handleClose = () => {
    setProcessing(false)
    setShowReceipt(false)
    setMethod('cash')
    setCustomAmountInput(null)
    setFeedback(null)
    setConfirmUndo(false)
    setSplitCount(null)
    setSelectedQuantities({})
    setItemsCollapsedMobile(false)
    setShowDiscountEditor(false)
    setDiscountInput('')
    setDiscountMode('amount')
    onClose()
  }

  const parseAmount = (str: string): number => {
    const cleaned = str.trim().replace(',', '.')
    const num = Number(cleaned)
    return Number.isFinite(num) ? roundCurrency(num) : 0
  }

  const parsedDiscountInput = parseAmount(discountInput)
  const candidateDiscountAmount = useMemo(() => {
    if (discountInput.trim() === '') return 0
    if (discountMode === 'amount') return parsedDiscountInput
    if (discountMode === 'net') return roundCurrency(baseTotalBeforePaymentDiscount - parsedDiscountInput)
    return roundCurrency(baseTotalBeforePaymentDiscount * (parsedDiscountInput / 100))
  }, [discountInput, discountMode, parsedDiscountInput, baseTotalBeforePaymentDiscount])

  const discountError = useMemo(() => {
    if (discountInput.trim() === '') return null
    if (discountMode === 'percent' && (parsedDiscountInput < 0 || parsedDiscountInput > 100)) {
      return 'İndirim oranı %0 ile %100 arasında olmalıdır.'
    }
    if (discountMode === 'net' && parsedDiscountInput > baseTotalBeforePaymentDiscount + 0.001) {
      return `Net tutar mevcut toplamdan (${formatCurrency(baseTotalBeforePaymentDiscount)}) büyük olamaz.`
    }
    if (discountMode === 'net' && parsedDiscountInput < paidTotal - 0.001) {
      return `Net tutar ödenmiş tutardan (${formatCurrency(paidTotal)}) az olamaz.`
    }
    if (candidateDiscountAmount < 0) {
      return 'İndirim tutarı negatif olamaz.'
    }
    if (candidateDiscountAmount > maxApplicableDiscount + 0.001) {
      return `En fazla ${formatCurrency(maxApplicableDiscount)} indirim uygulanabilir.`
    }
    return null
  }, [
    discountInput,
    discountMode,
    parsedDiscountInput,
    baseTotalBeforePaymentDiscount,
    paidTotal,
    candidateDiscountAmount,
    maxApplicableDiscount,
  ])

  const previewNewTotal = Math.max(
    paidTotal,
    roundCurrency(baseTotalBeforePaymentDiscount - Math.min(candidateDiscountAmount, maxApplicableDiscount)),
  )

  const handleOpenDiscountEditor = () => {
    setDiscountMode('amount')
    setDiscountInput(discountAmount > 0 ? formatInputVal(discountAmount) : '')
    setShowDiscountEditor(true)
  }

  const handleApplyDiscount = () => {
    if (!onApplyDiscountAmount || discountError) return
    const nextDiscount =
      discountInput.trim() === ''
        ? 0
        : Math.min(maxApplicableDiscount, Math.max(0, roundCurrency(candidateDiscountAmount)))
    onApplyDiscountAmount(nextDiscount)
    setCustomAmountInput(null)
    setSplitCount(null)
    setShowDiscountEditor(false)
    setDiscountInput('')
  }

  const handleClearDiscount = () => {
    if (!onApplyDiscountAmount) return
    onApplyDiscountAmount(0)
    setCustomAmountInput(null)
    setSplitCount(null)
    setShowDiscountEditor(false)
    setDiscountInput('')
  }

  const amountToPay = parseAmount(amountInput)
  const isAmountZeroOrEmpty = amountInput.trim() === '' || amountToPay <= 0
  const isAmountExceeding = amountToPay > roundCurrency(remaining + 0.001)
  const isAmountValid = !isAmountZeroOrEmpty && !isAmountExceeding

  // İŞ 2: Kullanıcı tutarı seçili ürün toplamından farklı girdiyse tutar bazlı kısmi ödeme uygulanır
  const isManualAmountWithSelection =
    hasItemSelection && Math.abs(amountToPay - selectedPayment.totalAmount) >= 0.005

  const appliedAmount = isAmountValid ? Math.min(amountToPay, remaining) : 0

  const canConfirm = isAmountValid && remaining > 0

  const title = showReceipt ? 'Fiş Önizleme' : paidMethod ? 'Ödeme Başarılı' : 'Ödeme Al'

  const handleToggleLine = (cartItemId: string, unpaidQty: number) => {
    if (!canPartial) return
    if (unpaidQty <= 0) return
    setSplitCount(null)
    setCustomAmountInput(null)
    setSelectedQuantities((prev) => {
      const next = { ...prev }
      if (next[cartItemId]) {
        delete next[cartItemId]
      } else {
        // İŞ 1: Çok adetli bir kalem seçildiğinde varsayılan ödenecek adet 1 başlar
        next[cartItemId] = 1
      }
      return next
    })
  }

  const handleStepLineQty = (cartItemId: string, delta: number, unpaidQty: number) => {
    if (unpaidQty <= 0) return
    setSplitCount(null)
    setCustomAmountInput(null)
    setSelectedQuantities((prev) => {
      const current = prev[cartItemId] ?? 1
      const updated = Math.min(unpaidQty, Math.max(1, current + delta))
      return { ...prev, [cartItemId]: updated }
    })
  }

  const handleSetLineAllQty = (cartItemId: string, unpaidQty: number) => {
    if (unpaidQty <= 0) return
    setSplitCount(null)
    setCustomAmountInput(null)
    setSelectedQuantities((prev) => ({
      ...prev,
      [cartItemId]: unpaidQty,
    }))
  }

  const handleSelectAllUnpaid = () => {
    setSplitCount(null)
    setCustomAmountInput(null)
    if (allUnpaidSelected) {
      setSelectedQuantities({})
      return
    }
    const next: Record<string, number> = {}
    for (const line of lineStates) {
      if (line.unpaidQty > 0) {
        next[line.cartItemId] = line.unpaidQty
      }
    }
    setSelectedQuantities(next)
  }

  const handleClearSelection = () => {
    setSelectedQuantities({})
    setCustomAmountInput(null)
    setSplitCount(null)
  }

  const handleSetFullRemaining = () => {
    setSplitCount(null)
    setCustomAmountInput(formatInputVal(remaining))
  }

  const handleSetHalfRemaining = () => {
    setSplitCount(null)
    const half = roundCurrency(remaining / 2)
    setCustomAmountInput(formatInputVal(half))
  }

  const handleSplitEqually = (n: number) => {
    setSplitCount(n)
    const share = roundCurrency(remaining / n)
    setCustomAmountInput(formatInputVal(share))
  }

  const handleCopyIban = () => {
    const rawIban = (settings.iban || DEFAULT_IBAN_PLACEHOLDER).replace(/\s+/g, '')
    navigator.clipboard?.writeText(rawIban).catch(() => {})
    setCopiedIban(true)
    window.setTimeout(() => setCopiedIban(false), 2000)
  }

  const formatPaymentItemsSummary = (payment: PartialPayment): string | null => {
    if (!payment.items || payment.items.length === 0) return null
    return payment.items
      .map((pi) => {
        const found = cart.find((c) => c.cartItemId === pi.lineId)
        const name = found ? found.name : 'Ürün'
        return `${name} × ${pi.quantity}`
      })
      .join(', ')
  }

  const handleConfirm = () => {
    if (!canConfirm || processing) return
    const payAmount = roundCurrency(Math.min(amountToPay, remaining))
    const newRemaining = Math.max(0, roundCurrency(remaining - payAmount))
    const isComplete = newRemaining === 0

    const paidItemsPayload =
      hasItemSelection && !isManualAmountWithSelection
        ? selectedPayment.items.map((item) => ({ ...item }))
        : undefined

    const paymentEntry: PartialPayment = {
      id: generateUUID(),
      method,
      amount: payAmount,
      ...(method === 'cash'
        ? {
            receivedAmount: payAmount,
            change: 0,
          }
        : {}),
      ...(paidItemsPayload ? { items: paidItemsPayload } : {}),
      ...(isManualAmountWithSelection
        ? {
            isManualAmount: true,
            selectedItemsTotal: selectedPayment.totalAmount,
          }
        : {}),
      createdAt: new Date().toISOString(),
    }

    const allPayments = [...payments, paymentEntry]
    const uniqueMethods = new Set(allPayments.map((p) => p.method))
    const finalMethod: PaymentMethod =
      uniqueMethods.size > 1 ? 'mixed' : method

    const paidItemNames = paidItemsPayload
      ? paidItemsPayload
          .map((pi) => {
            const c = cart.find((x) => x.cartItemId === pi.lineId)
            if (!c) return 'Ürün'
            return pi.quantity > 1 ? `${c.name} × ${pi.quantity}` : c.name
          })
          .join(', ')
      : null

    setProcessing(true)
    window.setTimeout(() => {
      setProcessing(false)
      onAddPayment(paymentEntry, isComplete, finalMethod)
      setSelectedQuantities({})
      setCustomAmountInput(null)
      setSplitCount(null)
      setConfirmUndo(false)
      if (!isComplete) {
        if (paidItemNames) {
          setFeedback(`${paidItemNames} ödemesi alındı. Kalan: ${formatCurrency(newRemaining)}`)
        } else {
          const methodText =
            method === 'cash' ? 'nakit' : method === 'card' ? 'kart' : 'IBAN'
          setFeedback(
            `${formatCurrency(payAmount)} ${methodText} ödeme alındı. Kalan: ${formatCurrency(newRemaining)}`,
          )
        }
      } else {
        setFeedback(null)
      }
    }, 550)
  }

  const rawConfiguredIban = (settings.iban || '').trim()
  const isIbanUnconfigured =
    !rawConfiguredIban ||
    formatIban(rawConfiguredIban) === DEFAULT_IBAN_PLACEHOLDER ||
    validateTurkishIban(rawConfiguredIban) !== null

  const isWidePaymentView = !showReceipt && !paidMethod && !processing

  if (!isOpen) return null

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${isWidePaymentView ? 'payment-modal-wide' : ''}`}>
        {!showReceipt && !paidMethod && (
          <div key="payment-modal-head" className="modal-head">
            <div>
              <p className="section-kicker">#{orderNumber}</p>
              <h2 className="section-title">{title}</h2>
            </div>
            <button
              type="button"
              className="close-button"
              onClick={handleClose}
              aria-label="Ödeme penceresini kapat"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {showReceipt ? (
          <div key="payment-receipt-view">
            <div className="modal-head">
              <div>
                <p className="section-kicker">Fiş Çıktısı</p>
                <h2 className="section-title">Fiş Önizleme</h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowReceipt(false)}
                aria-label="Fiş önizlemesini kapat"
              >
                <X size={18} />
              </button>
            </div>
            <ReceiptPreview
              cart={cart}
              customerName={customerName}
              discountRate={discountRate}
              note={note}
              orderNumber={orderNumber}
              paymentMethod={paidMethod ?? method}
              payments={payments}
              totals={totals}
            />
            <div className="receipt-actions">
              <button
                type="button"
                className="outline-action flex-1"
                onClick={() => setShowReceipt(false)}
              >
                Geri dön
              </button>
              <button
                type="button"
                className="solid-action flex-1"
                onClick={() => {
                  window.print()
                }}
              >
                Fişi Yazdır
              </button>
            </div>
          </div>
        ) : paidMethod ? (
          <div key="payment-success-view" className="success-body">
            <div className="success-check">
              <Check size={31} strokeWidth={2.8} />
            </div>
            <p className="section-kicker">İşlem tamamlandı</p>
            <h2 className="section-title">Ödeme Başarılı</h2>
            <div className="success-total">{formatCurrency(totals.total)}</div>
            <div className="success-meta">
              {paymentMethodLabel(paidMethod)} · Sipariş #{orderNumber}
            </div>
            {payments.length > 1 && (
              <div className="partial-payments-list mt-4 text-left">
                <div className="partial-payments-head">
                  <span>Ödeme Dağılımı ({payments.length} parça)</span>
                </div>
                {payments.map((p) => {
                  const itemsDesc = formatPaymentItemsSummary(p)
                  return (
                    <div key={p.id} className="partial-payment-row">
                      <span className="partial-payment-method">
                        {p.method === 'card' ? (
                          <CreditCard size={13} />
                        ) : p.method === 'cash' ? (
                          <Banknote size={13} />
                        ) : (
                          <Landmark size={13} />
                        )}
                        <span>{paymentMethodLabel(p.method)}</span>
                        {itemsDesc && (
                          <small className="partial-payment-items-tag">· {itemsDesc}</small>
                        )}
                      </span>
                      <strong>{formatCurrency(p.amount)}</strong>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="success-actions">
              <button
                type="button"
                className="outline-action"
                onClick={() => setShowReceipt(true)}
              >
                <FileText size={15} className="mr-2 inline" />
                Fiş Önizleme
              </button>
              <button
                type="button"
                className="solid-action"
                onClick={() => {
                  setProcessing(false)
                  setShowReceipt(false)
                  setCustomAmountInput(null)
                  setFeedback(null)
                  setSelectedQuantities({})
                  onNewOrder()
                }}
              >
                Yeni Sipariş
              </button>
            </div>
          </div>
        ) : processing ? (
          <div key="payment-processing-view" className="processing">
            <div>
              <div className="spinner" />
              <h2 className="section-title text-[20px]">Ödeme doğrulanıyor</h2>
              <p className="muted mt-2">POS terminali yanıt bekliyor...</p>
            </div>
          </div>
        ) : (
          <div key="payment-main-grid" className="payment-modal-grid">
            {/* LEFT COLUMN: Sipariş Ürünleri */}
            <div className="payment-items-col" aria-label="Sipariş Ürünleri">
              <div className="payment-items-head">
                <div className="payment-items-title-wrap">
                  <ShoppingBag size={15} className="text-[#8a6d57] shrink-0" />
                  <h3 className="payment-items-title">Sipariş Ürünleri</h3>
                  <span className="payment-items-count">{totalOrderUnits} adet</span>
                </div>
                <div className="payment-items-actions">
                  {totalUnpaidUnits > 0 && (
                    <>
                      {hasItemSelection && !allUnpaidSelected && (
                        <button
                          type="button"
                          className="payment-select-action-btn clear"
                          onClick={handleClearSelection}
                        >
                          Seçimi Temizle
                        </button>
                      )}
                      <button
                        type="button"
                        className="payment-select-action-btn"
                        onClick={handleSelectAllUnpaid}
                      >
                        {allUnpaidSelected ? 'Seçimi Temizle' : 'Tümünü Seç'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="payment-items-collapse-btn"
                    onClick={() => setItemsCollapsedMobile((v) => !v)}
                    aria-expanded={!itemsCollapsedMobile}
                    aria-label={itemsCollapsedMobile ? 'Ürünleri göster' : 'Ürünleri gizle'}
                  >
                    {itemsCollapsedMobile ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                </div>
              </div>

              <div className={`payment-items-body ${itemsCollapsedMobile ? 'collapsed-mobile' : ''}`}>
                <p className="payment-items-hint">
                  Ürün bazlı ödeme almak için satırlara dokunun. Seçim yapılmazsa tutar bölerek ödeme uygulanır.
                </p>

                <div className="payment-items-list" role="group" aria-label="Sipariş kalemleri">
                  {lineStates.map((line) => {
                    const { item, status, paidQty, unpaidQty, paidMethod: linePaidMethod } = line
                    const selectedQty = effectiveSelectedQuantities[line.cartItemId] || 0
                    const isSelected = selectedQty > 0
                    const isPaid = status === 'paid'
                    const isPartial = status === 'partial'
                    const hasLineDiscount = line.lineNetTotal < line.lineGrossTotal - 0.005

                    const selectedEntry = selectedPayment.items.find(
                      (pi) => pi.lineId === line.cartItemId,
                    )

                    return (
                      <div
                        key={line.cartItemId}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={isPaid}
                        tabIndex={isPaid ? -1 : 0}
                        onClick={() => {
                          if (!isPaid) handleToggleLine(line.cartItemId, unpaidQty)
                        }}
                        onKeyDown={(e) => {
                          if (!isPaid && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            handleToggleLine(line.cartItemId, unpaidQty)
                          }
                        }}
                        className={`payment-item-row ${isSelected ? 'selected' : ''} ${
                          isPaid ? 'paid' : ''
                        } ${isPartial ? 'partial' : ''}`}
                      >
                        <div className="payment-item-check" aria-hidden="true">
                          {isPaid ? (
                            <span className="check-box paid-check">
                              <Check size={13} strokeWidth={3} />
                            </span>
                          ) : isSelected ? (
                            <span className="check-box active-check">
                              <Check size={13} strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="check-box" />
                          )}
                        </div>

                        <div className="payment-item-info">
                          <div className="payment-item-top">
                            <span className="payment-item-name">{item.name}</span>
                            {isPaid && (
                              <span className="payment-item-badge badge-paid">
                                {linePaidMethod === 'card' ? (
                                  <CreditCard size={11} />
                                ) : linePaidMethod === 'cash' ? (
                                  <Banknote size={11} />
                                ) : linePaidMethod === 'iban' ? (
                                  <Landmark size={11} />
                                ) : (
                                  <Check size={11} />
                                )}
                                Ödendi
                              </span>
                            )}
                            {isPartial && (
                              <span className="payment-item-badge badge-partial">
                                {paidQty}/{item.quantity} ödendi
                              </span>
                            )}
                          </div>

                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                            <div className="payment-item-options">
                              {item.selectedOptions
                                .map((o) =>
                                  o.priceDelta !== 0
                                    ? `${o.optionName} (${o.priceDelta > 0 ? '+' : ''}${o.priceDelta}₺)`
                                    : o.optionName,
                                )
                                .join(', ')}
                            </div>
                          )}

                          <div className="payment-item-meta">
                            <span>
                              {formatCurrency(
                                hasLineDiscount ? line.unitNetPrice : line.unitGrossPrice,
                              )}{' '}
                              × {item.quantity} adet
                            </span>
                            {hasLineDiscount && (
                              <span className="payment-item-discount-pill">İndirimli</span>
                            )}
                          </div>

                          {isSelected && unpaidQty > 1 && (
                            <div
                              className="payment-item-stepper"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="stepper-label">Ödenecek adet:</span>
                              <div className="stepper-controls">
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  disabled={selectedQty <= 1}
                                  onClick={() =>
                                    handleStepLineQty(line.cartItemId, -1, unpaidQty)
                                  }
                                  aria-label="Ödenecek adedi azalt"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="stepper-value">
                                  {selectedQty} / {unpaidQty}
                                </span>
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  disabled={selectedQty >= unpaidQty}
                                  onClick={() =>
                                    handleStepLineQty(line.cartItemId, 1, unpaidQty)
                                  }
                                  aria-label="Ödenecek adedi artır"
                                >
                                  <Plus size={13} />
                                </button>
                                {selectedQty < unpaidQty && (
                                  <button
                                    type="button"
                                    className="stepper-all-btn"
                                    onClick={() => handleSetLineAllQty(line.cartItemId, unpaidQty)}
                                    title="Kalan tüm adedi seç"
                                  >
                                    Tümü
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="payment-item-price-col">
                          {hasLineDiscount && (
                            <span className="payment-item-gross-strike">
                              {formatCurrency(line.lineGrossTotal)}
                            </span>
                          )}
                          <strong className="payment-item-total">
                            {formatCurrency(line.lineNetTotal)}
                          </strong>
                          {isSelected && selectedEntry && (item.quantity > 1 || isPartial) && (
                            <span className="payment-item-selected-amount">
                              Seçili: {formatCurrency(selectedEntry.amount)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {hasItemSelection && (
                  <div className="payment-selection-bar" role="status">
                    <span>
                      <strong>{selectedPayment.totalUnits} ürün seçildi</strong> ·{' '}
                      {formatCurrency(selectedPayment.totalAmount)}
                    </span>
                    <button
                      type="button"
                      className="payment-selection-clear"
                      onClick={handleClearSelection}
                    >
                      Seçimi Temizle
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Existing Payment Panel */}
            <div className="payment-body payment-panel-col">
              <div className="flex items-center justify-between">
                <span className="muted">
                  {hasPartialPayments ? 'Kalan tahsil edilecek tutar' : 'Tahsil edilecek tutar'}
                </span>
                <span className="shortcut">POS Aktif</span>
              </div>
              <div className="payment-total">{formatCurrency(remaining)}</div>

              <div className="payment-summary-strip">
                <div className="payment-summary-item">
                  <span>Toplam</span>
                  <strong>{formatCurrency(grandTotal)}</strong>
                </div>
                <div className="payment-summary-item paid">
                  <span>Ödenen</span>
                  <strong>{formatCurrency(paidTotal)}</strong>
                </div>
                <div className="payment-summary-item remaining">
                  <span>Kalan</span>
                  <strong>{formatCurrency(remaining)}</strong>
                </div>
              </div>

              {onApplyDiscountAmount && remaining > 0 && (
                <div className="rounded-xl border border-[#dfd5cc] dark:border-stone-700 bg-[#fcfaf7] dark:bg-stone-800/70 px-3 py-2">
                  {!showDiscountEditor ? (
                    <div key="discount-summary-view" className="flex items-center justify-between gap-2">
                      {discountAmount > 0 ? (
                        <div key="discount-applied" className="flex items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-extrabold shrink-0">
                              <Tag size={12} />
                              <span>İndirim: -{formatCurrency(discountAmount)}</span>
                            </span>
                            <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 truncate">
                              ({formatCurrency(baseTotalBeforePaymentDiscount)} → {formatCurrency(grandTotal)})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={handleOpenDiscountEditor}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold bg-[#f1e9e1] hover:bg-[#e5d9ce] dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 transition-colors"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={handleClearDiscount}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-300 transition-colors"
                              title="İndirimi kaldır"
                            >
                              Kaldır
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          key="discount-add-btn"
                          type="button"
                          onClick={handleOpenDiscountEditor}
                          className="w-full flex items-center justify-between text-xs font-bold text-[#6e4933] dark:text-amber-300 hover:text-[#4e3322] dark:hover:text-amber-200 py-0.5 transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <Tag size={14} />
                            <span>İndirim Uygula (Yuvarlama / ₺ / %)</span>
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#f1e9e1] dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                            + Ekle
                          </span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div key="discount-editor-view" className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-stone-700 dark:text-stone-200 flex items-center gap-1.5">
                          <Tag size={13} className="text-[#8a6d57] dark:text-amber-300" />
                          Ödeme İndirimi
                        </span>
                        <div className="flex items-center gap-1 bg-[#f1e9e1] dark:bg-stone-900 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountMode('amount')
                              setDiscountInput('')
                            }}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                              discountMode === 'amount'
                                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                                : 'text-stone-600 dark:text-stone-400'
                            }`}
                          >
                            ₺ İndirim
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountMode('net')
                              setDiscountInput('')
                            }}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                              discountMode === 'net'
                                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                                : 'text-stone-600 dark:text-stone-400'
                            }`}
                          >
                            Net Tutar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountMode('percent')
                              setDiscountInput('')
                            }}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                              discountMode === 'percent'
                                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                                : 'text-stone-600 dark:text-stone-400'
                            }`}
                          >
                            % Oran
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={discountInput}
                          onChange={(e) => setDiscountInput(sanitizeDecimalInput(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !discountError) {
                              e.preventDefault()
                              handleApplyDiscount()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setShowDiscountEditor(false)
                            }
                          }}
                          placeholder={
                            discountMode === 'amount'
                              ? 'İndirim tutarı (örn: 10)'
                              : discountMode === 'net'
                                ? `Alınacak tutar (örn: ${Math.floor(baseTotalBeforePaymentDiscount / 10) * 10})`
                                : 'İndirim % (örn: 10)'
                          }
                          className={`cash-input flex-1 !py-1.5 !text-sm ${discountError ? 'input-error' : ''}`}
                          aria-label="İndirim değeri"
                        />
                        <button
                          type="button"
                          disabled={Boolean(discountError)}
                          onClick={handleApplyDiscount}
                          className="px-3 py-1.5 rounded-xl text-xs font-black bg-[#8a6d57] hover:bg-[#745a47] disabled:opacity-40 text-white transition-colors shrink-0"
                        >
                          Uygula
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDiscountEditor(false)
                            setDiscountInput('')
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 transition-colors shrink-0"
                        >
                          İptal
                        </button>
                      </div>

                      {discountError ? (
                        <p key="disc-error" className="payment-validation-msg !mt-1" role="alert">
                          <AlertCircle size={12} />
                          <span>{discountError}</span>
                        </p>
                      ) : discountInput.trim() !== '' ? (
                        <div key="disc-preview" className="flex items-center justify-between text-[11px] font-bold text-stone-600 dark:text-stone-300 px-0.5">
                          <span>
                            Uygulanacak İndirim:{' '}
                            <strong className="text-rose-600 dark:text-rose-400">
                              -{formatCurrency(Math.max(0, candidateDiscountAmount))}
                            </strong>
                          </span>
                          <span>
                            Yeni Toplam:{' '}
                            <strong className="text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(previewNewTotal)}
                            </strong>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {feedback && (
                <div className="partial-feedback" role="status">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>{feedback}</span>
                </div>
              )}

              <div className="method-grid" role="radiogroup" aria-label="Ödeme yöntemi">
                <button
                  type="button"
                  disabled={!canCard}
                  className={`method-card ${method === 'card' ? 'selected' : ''} ${!canCard ? 'opacity-35 cursor-not-allowed' : ''}`}
                  onClick={() => canCard && setMethod('card')}
                  role="radio"
                  aria-checked={method === 'card'}
                  title={!canCard ? 'Kart ile ödeme yetkiniz yok' : undefined}
                >
                  <CreditCard size={25} />
                  <span>Kart</span>
                </button>
                <button
                  type="button"
                  disabled={!canCash}
                  className={`method-card ${method === 'cash' ? 'selected' : ''} ${!canCash ? 'opacity-35 cursor-not-allowed' : ''}`}
                  onClick={() => canCash && setMethod('cash')}
                  role="radio"
                  aria-checked={method === 'cash'}
                  title={!canCash ? 'Nakit ile ödeme yetkiniz yok' : undefined}
                >
                  <Banknote size={25} />
                  <span>Nakit</span>
                </button>
                <button
                  type="button"
                  disabled={!canIban}
                  className={`method-card ${method === 'iban' ? 'selected' : ''} ${!canIban ? 'opacity-35 cursor-not-allowed' : ''}`}
                  onClick={() => canIban && setMethod('iban')}
                  role="radio"
                  aria-checked={method === 'iban'}
                  title={!canIban ? 'IBAN ile ödeme yetkiniz yok' : undefined}
                >
                  <Landmark size={25} />
                  <span>IBAN</span>
                </button>
              </div>

              {/* Editable Amount to Pay Now (or Locked Selected Items Total) */}
              <div className="split-amount-area">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-stone-700 dark:text-stone-300" htmlFor="amount-to-pay">
                    {hasItemSelection
                      ? 'Seçili ürünlerin toplamı'
                      : 'Ödenecek tutar (Bölerek ödeme)'}
                  </label>
                  {hasItemSelection ? (
                    <button
                      type="button"
                      className="clear-selection-inline-link"
                      onClick={handleClearSelection}
                    >
                      Seçimi Temizle
                    </button>
                  ) : (
                    amountToPay < remaining &&
                    amountToPay > 0 && (
                      <span className="text-xs font-black text-amber-800 dark:text-amber-400">
                        İşlem sonrası kalan:{' '}
                        {formatCurrency(Math.max(0, roundCurrency(remaining - amountToPay)))}
                      </span>
                    )
                  )}
                </div>
                <input
                  id="amount-to-pay"
                  disabled={!canCustomAmount}
                  readOnly={!canCustomAmount}
                  title={!canCustomAmount ? 'Tutar manuel olarak değiştirilemez' : undefined}
                  className={`cash-input ${
                    !isAmountValid && amountInput.trim() !== '' ? 'input-error' : ''
                  } ${!canCustomAmount ? 'opacity-70 cursor-not-allowed bg-stone-100 dark:bg-stone-800' : ''}`}
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => {
                    if (!canCustomAmount) return
                    setSplitCount(null)
                    setCustomAmountInput(sanitizeDecimalInput(event.target.value))
                  }}
                  placeholder={formatCurrency(remaining)}
                />
                {isManualAmountWithSelection && isAmountValid && (
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mt-1.5 flex items-center gap-1" role="status">
                    <AlertCircle size={14} className="shrink-0" />
                    Manuel tutar girildi, ödeme tutar bazlı uygulanacak.
                  </p>
                )}
                {isAmountExceeding && (
                  <p className="payment-validation-msg" role="alert">
                    <AlertCircle size={13} />
                    Ödenecek tutar kalan tutardan ({formatCurrency(remaining)}) fazla olamaz.
                  </p>
                )}
                {isAmountZeroOrEmpty && amountInput.trim() !== '' && (
                  <p className="payment-validation-msg" role="alert">
                    <AlertCircle size={13} />
                    Ödenecek tutar 0&apos;dan büyük olmalıdır.
                  </p>
                )}
                {canPartial && (
                  <div className="quick-amounts split-quick-amounts">
                    <button
                      type="button"
                      onClick={handleSetFullRemaining}
                    >
                      Tam Tutar ({formatCurrency(remaining)})
                    </button>
                    <button
                      type="button"
                      onClick={handleSetHalfRemaining}
                    >
                      Yarısı ({formatCurrency(roundCurrency(remaining / 2))})
                    </button>
                    <button
                      type="button"
                      className={splitCount === 3 ? 'active' : ''}
                      onClick={() => handleSplitEqually(3)}
                      title="Kalan tutarı 3 kişiye eşit böl"
                    >
                      <Users size={11} className="inline mr-1" />1/3 Böl
                    </button>
                    <button
                      type="button"
                      className={splitCount === 4 ? 'active' : ''}
                      onClick={() => handleSplitEqually(4)}
                      title="Kalan tutarı 4 kişiye eşit böl"
                    >
                      <Users size={11} className="inline mr-1" />1/4 Böl
                    </button>
                  </div>
                )}
              </div>

              {method === 'card' && (
                <div key="method-card-info" className="terminal-card">
                  <span className="pulse-dot" />
                  <div>
                    <strong className="block text-sm font-black">Kart terminali hazır</strong>
                    <span className="text-xs font-semibold">Temassız veya çipli kartınızı okutun.</span>
                  </div>
                </div>
              )}

              {method === 'iban' && (
                <div key="method-iban-info" className="iban-card" aria-label="IBAN ile ödeme bilgileri">
                  {isIbanUnconfigured && (
                    <div className="iban-warning">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>IBAN bilgisi tanımlı değil, Ayarlar&apos;dan ekleyin.</span>
                    </div>
                  )}
                  <div className="iban-row">
                    <span className="iban-label">Banka Adı</span>
                    <strong className="iban-value">{settings.bankName || 'Banka Adı'}</strong>
                  </div>
                  <div className="iban-row">
                    <span className="iban-label">Hesap Sahibi</span>
                    <strong className="iban-value">{settings.accountHolder || 'Hesap Sahibi'}</strong>
                  </div>
                  <div className="iban-number-box">
                    <div>
                      <span className="iban-label block mb-0.5">IBAN</span>
                      <code className="iban-code">
                        {formatIban(settings.iban || DEFAULT_IBAN_PLACEHOLDER)}
                      </code>
                    </div>
                    <button
                      type="button"
                      className="iban-copy-btn"
                      onClick={handleCopyIban}
                    >
                      {copiedIban ? (
                        <>
                          <Check size={13} /> Kopyalandı
                        </>
                      ) : (
                        <>
                          <Copy size={13} /> IBAN&apos;ı Kopyala
                        </>
                      )}
                    </button>
                  </div>
                  <p className="iban-note">Açıklamaya masa numarasını (#{orderNumber}) yazınız.</p>
                </div>
              )}

              {/* Yapılan Ödemeler Listesi */}
              {hasPartialPayments && (
                <div className="partial-payments-list">
                  <div className="partial-payments-head">
                    <span>Yapılan Ödemeler ({payments.length})</span>
                    {onUndoLastPayment && (
                      !confirmUndo ? (
                        <button
                          type="button"
                          className="undo-payment-btn"
                          onClick={() => setConfirmUndo(true)}
                        >
                          <RotateCcw size={11} /> Son Ödemeyi Geri Al
                        </button>
                      ) : (
                        <span className="undo-confirm-inline">
                          <span>Silinsin mi?</span>
                          <button
                            type="button"
                            className="confirm-yes"
                            onClick={() => {
                              onUndoLastPayment()
                              setSelectedQuantities({})
                              setCustomAmountInput(null)
                              setSplitCount(null)
                              setConfirmUndo(false)
                              setFeedback('Son parçalı ödeme geri alındı.')
                            }}
                          >
                            Evet
                          </button>
                          <button
                            type="button"
                            className="confirm-no"
                            onClick={() => setConfirmUndo(false)}
                          >
                            Vazgeç
                          </button>
                        </span>
                      )
                    )}
                  </div>
                  {payments.map((p) => {
                    const timeStr = formatTime(p.createdAt)
                    const itemsSummary = formatPaymentItemsSummary(p)
                    return (
                      <div key={p.id} className="partial-payment-row">
                        <span className="partial-payment-method">
                          {p.method === 'card' ? (
                            <CreditCard size={13} />
                          ) : p.method === 'cash' ? (
                            <Banknote size={13} />
                          ) : (
                            <Landmark size={13} />
                          )}
                          <span>{paymentMethodLabel(p.method)}</span>
                          {itemsSummary && (
                            <span className="partial-payment-items-tag">{itemsSummary}</span>
                          )}
                          <small className="partial-payment-time">{timeStr}</small>
                        </span>
                        <strong>{formatCurrency(p.amount)}</strong>
                      </div>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                className="confirm-pay"
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                {method === 'card' ? (
                  <CreditCard key="confirm-icon-card" size={18} />
                ) : method === 'cash' ? (
                  <Banknote key="confirm-icon-cash" size={18} />
                ) : (
                  <CheckCircle2 key="confirm-icon-iban" size={18} />
                )}
                <span>
                  {hasItemSelection && !isManualAmountWithSelection
                    ? `Seçili Ürünleri Öde (${formatCurrency(appliedAmount)})`
                    : `${method ? paymentMethodLabel(method).toLocaleUpperCase('tr-TR') : 'Öde'} (${formatCurrency(appliedAmount)})`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
