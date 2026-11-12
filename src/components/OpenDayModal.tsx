import React, { useState } from 'react'
import { AlertCircle, Banknote, Calendar, Sun, User, X } from 'lucide-react'
import { formatCurrency, roundCurrency } from '../lib/format'

export interface OpenDayParams {
  openingCash: number
  cardCarryIn?: number
  cardCarryInAuto?: number
  cardCarryInOverridden?: boolean
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
  onClose,
  onOpenDay,
}: OpenDayModalProps) {
  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    setOpeningCashInput('0')
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

  const isFormInvalid = isCashInvalid

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
      cardCarryIn: 0,
      cardCarryInAuto: 0,
      cardCarryInOverridden: false,
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

          {/* Summary Box */}
          {!isFormInvalid && (
            <div className="p-3.5 rounded-xl bg-[#fcfaf7] border border-[#dfd5cc]">
              <div className="flex items-center justify-between text-xs text-[#6d5a4e]">
                <span className="flex items-center gap-1.5">
                  <Banknote size={14} className="text-[#8a6d57]" />
                  <span className="font-bold">Kasa başlangıç nakit bakiyesi:</span>
                </span>
                <strong className="text-[#3b2b21] font-extrabold text-sm">{formatCurrency(parsedCash)}</strong>
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
