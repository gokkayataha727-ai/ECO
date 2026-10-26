import React, { useState } from 'react'
import { AlertCircle, AlertTriangle, Banknote, Calendar, CreditCard, RotateCcw, Sun, User, X } from 'lucide-react'
import { formatCurrency, roundCurrency } from '../lib/format'

export interface OpenDayParams {
  openingCash: number
  cardCarryIn: number
  cardCarryInAuto: number
  cardCarryInOverridden: boolean
  note?: string
}

interface OpenDayModalProps {
  isOpen: boolean
  cashierName: string
  previousDayCarryOut?: number
  hasPreviousClosedDay?: boolean
  previousDayNeverClosed?: boolean
  posZCutoffTime?: string
  onClose: () => void
  onOpenDay: (params: OpenDayParams) => void
}

export function OpenDayModal({
  isOpen,
  cashierName,
  previousDayCarryOut = 0,
  hasPreviousClosedDay = false,
  previousDayNeverClosed = false,
  posZCutoffTime = '23:57',
  onClose,
  onOpenDay,
}: OpenDayModalProps) {
  const autoCarryIn = roundCurrency(previousDayCarryOut)

  const formatAmountInput = (val: number): string => {
    if (val === 0) return '0'
    return val.toFixed(2).replace('.', ',').replace(/,00$/, '')
  }

  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [cardCarryInInput, setCardCarryInInput] = useState(() => formatAmountInput(autoCarryIn))
  const [isCardOverridden, setIsCardOverridden] = useState(false)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    setOpeningCashInput('0')
    setCardCarryInInput(formatAmountInput(autoCarryIn))
    setIsCardOverridden(false)
    setNote('')
    setIsSubmitting(false)
    onClose()
  }

  const parseMoney = (raw: string): number => {
    const cleaned = raw.trim().replace(',', '.')
    if (cleaned === '') return 0
    const val = Number(cleaned)
    return Number.isFinite(val) ? roundCurrency(val) : NaN
  }

  const isValidMoneyDecimals = (raw: string): boolean => {
    const cleaned = raw.trim().replace(',', '.')
    if (cleaned === '') return true
    return /^\d+(\.\d{1,2})?$/.test(cleaned)
  }

  const parsedCash = parseMoney(openingCashInput)
  const isCashInvalid =
    Number.isNaN(parsedCash) || parsedCash < 0 || !isValidMoneyDecimals(openingCashInput)

  const parsedCard = parseMoney(cardCarryInInput)
  const isCardInvalid =
    Number.isNaN(parsedCard) || parsedCard < 0 || !isValidMoneyDecimals(cardCarryInInput)

  const isFormInvalid = isCashInvalid || isCardInvalid

  const handleCardInputChange = (val: string) => {
    setCardCarryInInput(val)
    const num = parseMoney(val)
    if (!Number.isNaN(num)) {
      setIsCardOverridden(num !== autoCarryIn)
    } else {
      setIsCardOverridden(true)
    }
  }

  const handleResetCardToAuto = () => {
    setCardCarryInInput(formatAmountInput(autoCarryIn))
    setIsCardOverridden(false)
  }

  const dateTimeFormatted = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isFormInvalid || isSubmitting) return

    setIsSubmitting(true)
    onOpenDay({
      openingCash: parsedCash,
      cardCarryIn: parsedCard,
      cardCarryInAuto: autoCarryIn,
      cardCarryInOverridden: isCardOverridden,
      note: note.trim() || undefined,
    })
    handleClose()
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Günü Aç"
      onClick={handleClose}
    >
      <div className="modal" style={{ width: 'min(520px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1.5">
              <Sun size={13} className="text-amber-600" /> GÜN BAŞI İŞLEMİ
            </p>
            <h2 className="section-title">Günü Aç</h2>
            <p className="muted mt-1">
              Yeni iş gününü başlatmak için kasa açılış ve kart devir tutarlarını onaylayın.
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

        <form onSubmit={handleSubmit} className="payment-body space-y-4">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc]">
              <span className="text-[11px] font-bold text-[#8a6d57] flex items-center gap-1.5 uppercase">
                <Calendar size={12} /> Tarih & Saat
              </span>
              <div className="mt-1 text-xs font-extrabold text-[#3b2b21]">
                {dateTimeFormatted}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc]">
              <span className="text-[11px] font-bold text-[#8a6d57] flex items-center gap-1.5 uppercase">
                <User size={12} /> Kasiyer
              </span>
              <div className="mt-1 text-xs font-extrabold text-[#3b2b21]">
                {cashierName || 'LEMOON'}
              </div>
            </div>
          </div>

          {/* Warning if previous day was never closed properly */}
          {previousDayNeverClosed && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Önceki gün kapatılmamış</strong>
                <span>
                  Önceki iş gününün Z raporu kapatılmamış görünüyor. Lütfen POS cihazınızın devir tutarını kontrol edip elle giriniz.
                </span>
              </div>
            </div>
          )}

          {/* Section 1: Cash Opening Balance */}
          <div>
            <label
              htmlFor="opening-cash-input"
              className="block text-xs font-extrabold text-[#5c493d] mb-1.5"
            >
              Kasa açılış tutarı (₺)
            </label>
            <div className="relative flex items-center">
              <Banknote
                size={18}
                className="absolute left-3.5 text-[#8a6d57] pointer-events-none"
              />
              <input
                id="opening-cash-input"
                type="text"
                inputMode="decimal"
                autoFocus
                value={openingCashInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                placeholder="0,00"
                style={{ paddingLeft: '42px' }}
                className={`cash-input w-full text-base ${
                  isCashInvalid ? 'input-error' : ''
                }`}
              />
            </div>
            {isCashInvalid ? (
              <p className="payment-validation-msg mt-1.5">
                <AlertCircle size={13} />
                Lütfen 0 veya daha büyük, en fazla 2 basamaklı geçerli bir nakit tutarı girin.
              </p>
            ) : (
              <div className="mt-1.5 text-xs text-[#6d5a4e]">
                <span>Kasa nakit başlangıç bakiyesi: </span>
                <strong className="text-[#3b2b21]">{formatCurrency(parsedCash)}</strong>
              </div>
            )}

            <div className="quick-amounts mt-2">
              {[0, 250, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setOpeningCashInput(String(preset))}
                >
                  {formatCurrency(preset)}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Card (POS) Opening Carry-Over */}
          <div className="pt-3 border-t border-[#dfd5cc]/70">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="opening-card-input"
                className="block text-xs font-extrabold text-[#5c493d]"
              >
                Kart (POS) devir tutarı (₺)
              </label>
              {isCardOverridden && (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Düzenlendi
                  </span>
                  <button
                    type="button"
                    onClick={handleResetCardToAuto}
                    className="text-[11px] font-extrabold text-[#8a6d57] hover:text-[#3b2b21] flex items-center gap-1 underline transition-colors"
                  >
                    <RotateCcw size={11} />
                    <span>Otomatiğe dön</span>
                  </button>
                </div>
              )}
            </div>

            <div className="relative flex items-center">
              <CreditCard
                size={18}
                className="absolute left-3.5 text-[#8a6d57] pointer-events-none"
              />
              <input
                id="opening-card-input"
                type="text"
                inputMode="decimal"
                value={cardCarryInInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleCardInputChange(e.target.value)}
                placeholder="0,00"
                style={{ paddingLeft: '42px' }}
                className={`cash-input w-full text-base ${
                  isCardInvalid ? 'input-error' : ''
                }`}
              />
            </div>

            {isCardInvalid ? (
              <p className="payment-validation-msg mt-1.5">
                <AlertCircle size={13} />
                Lütfen 0 veya daha büyük, en fazla 2 basamaklı geçerli bir kart tutarı girin.
              </p>
            ) : (
              <div className="mt-1.5 text-xs text-[#6d5a4e]">
                <span>Önceki günden devreden kart tutarı: </span>
                <strong className="text-[#3b2b21]">{formatCurrency(autoCarryIn)}</strong>
              </div>
            )}

            <p className="text-[11px] text-[#8a6d57] mt-1">
              {hasPreviousClosedDay
                ? `Önceki günün ${posZCutoffTime} sonrası kart satışlarından otomatik hesaplandı.`
                : 'Önceki iş günü bulunamadı (₺0,00 varsayıldı).'}
            </p>
          </div>

          {/* Info Card Row: Showing both Cash and Card Opening */}
          {!isFormInvalid && (
            <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#6d5a4e]">
                <span className="flex items-center gap-1.5">
                  <Banknote size={13} className="text-[#8a6d57]" />
                  <span>Kasa başlangıç bakiyesi (nakit):</span>
                </span>
                <strong className="text-[#3b2b21] font-extrabold">{formatCurrency(parsedCash)}</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-[#6d5a4e] pt-2 border-t border-[#dfd5cc]/60">
                <span className="flex items-center gap-1.5">
                  <CreditCard size={13} className="text-[#8a6d57]" />
                  <span>Kart devir tutarı:</span>
                  {isCardOverridden && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      Düzenlendi
                    </span>
                  )}
                </span>
                <strong className="text-[#3b2b21] font-extrabold">{formatCurrency(parsedCard)}</strong>
              </div>
            </div>
          )}

          {/* Note Input */}
          <div>
            <label
              htmlFor="opening-day-note"
              className="block text-xs font-extrabold text-[#5c493d] mb-1.5"
            >
              Not (İsteğe bağlı)
            </label>
            <textarea
              id="opening-day-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn: Sabah vardiyası, bozuk para eklendi..."
              className="note-area mt-0"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="success-actions mt-5">
            <button
              type="button"
              className="outline-action"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isFormInvalid || isSubmitting}
              className="solid-action disabled:opacity-45"
            >
              {isSubmitting ? 'Açılıyor...' : 'Günü Aç'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
