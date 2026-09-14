import { Banknote, Check, CheckCircle2, CreditCard, FileText, QrCode, X } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency, paymentMethodLabel } from '../lib/format'
import type { CartItem, OrderTotals, PaymentMethod } from '../types'
import { ReceiptPreview } from './ReceiptPreview'
import { useVirtualKeyboard } from '../context/VirtualKeyboardContext'

interface PaymentModalProps {
  cart: CartItem[]
  customerName?: string
  discountRate: number
  isOpen: boolean
  note: string
  onClose: () => void
  onNewOrder: () => void
  onPaid: (method: PaymentMethod) => void
  orderNumber: string
  paidMethod: PaymentMethod | null
  totals: OrderTotals
}

export function PaymentModal({ cart, customerName, discountRate, isOpen, note, onClose, onNewOrder, onPaid, orderNumber, paidMethod, totals }: PaymentModalProps) {
  const { openKeyboard } = useVirtualKeyboard()
  const [method, setMethod] = useState<PaymentMethod>('card')
  const [cashReceived, setCashReceived] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)

  const handleClose = () => {
    setProcessing(false)
    setShowReceipt(false)
    setCashReceived('')
    onClose()
  }

  const cashValue = Number(cashReceived.replace(',', '.')) || 0
  const change = Math.max(0, cashValue - totals.total)
  const canConfirm = method !== 'cash' || cashValue >= totals.total
  const title = showReceipt ? 'Fiş Önizleme' : paidMethod ? 'Ödeme Başarılı' : 'Ödeme Al'

  const handleConfirm = () => {
    if (!canConfirm || processing) return
    setProcessing(true)
    window.setTimeout(() => {
      setProcessing(false)
      onPaid(method)
    }, 750)
  }

  if (!isOpen) return null

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        {!showReceipt && !paidMethod && <div className="modal-head"><div><p className="section-kicker">#{orderNumber}</p><h2 className="section-title">{title}</h2></div><button type="button" className="close-button" onClick={handleClose} aria-label="Ödeme penceresini kapat"><X size={18} /></button></div>}

        {showReceipt ? (
          <>
            <div className="modal-head"><div><p className="section-kicker">Fiş Çıktısı</p><h2 className="section-title">Fiş Önizleme</h2></div><button type="button" className="close-button" onClick={() => setShowReceipt(false)} aria-label="Fiş önizlemesini kapat"><X size={18} /></button></div>
            <ReceiptPreview cart={cart} customerName={customerName} discountRate={discountRate} note={note} orderNumber={orderNumber} paymentMethod={paidMethod ?? method} totals={totals} />
            <div className="receipt-actions"><button type="button" className="outline-action flex-1" onClick={() => setShowReceipt(false)}>Geri dön</button><button type="button" className="solid-action flex-1" onClick={() => { window.print() }}>Fişi Yazdır</button></div>
          </>
        ) : paidMethod ? (
          <div className="success-body">
            <div className="success-check"><Check size={31} strokeWidth={2.8} /></div>
            <p className="section-kicker">İşlem tamamlandı</p>
            <h2 className="section-title">Ödeme Başarılı</h2>
            <div className="success-total">{formatCurrency(totals.total)}</div>
            <div className="success-meta">{paymentMethodLabel(paidMethod)} · Sipariş #{orderNumber}</div>
            <div className="success-actions"><button type="button" className="outline-action" onClick={() => setShowReceipt(true)}><FileText size={15} className="mr-2 inline" />Fiş Önizleme</button><button type="button" className="solid-action" onClick={() => { setProcessing(false); setShowReceipt(false); setCashReceived(''); onNewOrder() }}>Yeni Sipariş</button></div>
          </div>
        ) : processing ? (
          <div className="processing"><div><div className="spinner" /><h2 className="section-title text-[20px]">Ödeme doğrulanıyor</h2><p className="muted mt-2">POS terminali yanıt bekliyor...</p></div></div>
        ) : (
          <div className="payment-body">
            <div className="flex items-center justify-between"><span className="muted">Tahsil edilecek tutar</span><span className="shortcut">POS Aktif</span></div>
            <div className="payment-total">{formatCurrency(totals.total)}</div>
            <div className="method-grid" role="radiogroup" aria-label="Ödeme yöntemi">
              <button type="button" className={`method-card ${method === 'card' ? 'selected' : ''}`} onClick={() => setMethod('card')} role="radio" aria-checked={method === 'card'}><CreditCard size={25} /><span>Kart</span></button>
              <button type="button" className={`method-card ${method === 'cash' ? 'selected' : ''}`} onClick={() => setMethod('cash')} role="radio" aria-checked={method === 'cash'}><Banknote size={25} /><span>Nakit</span></button>
              <button type="button" className={`method-card ${method === 'qr' ? 'selected' : ''}`} onClick={() => setMethod('qr')} role="radio" aria-checked={method === 'qr'}><QrCode size={25} /><span>QR ile Öde</span></button>
            </div>
            {method === 'card' && <div className="terminal-card"><span className="pulse-dot" /><div><strong className="block text-[12px]">Kart terminali hazır</strong><span>Temassız veya çipli kartınızı okutun.</span></div></div>}
            {method === 'cash' && (
              <div className="cash-area">
                <label className="text-[11px] font-bold text-stone-500" htmlFor="cash-received">Müşterinin verdiği tutar</label>
                <input
                  id="cash-received"
                  className="cash-input"
                  inputMode="decimal"
                  value={cashReceived}
                  onChange={(event) => setCashReceived(event.target.value)}
                  onFocus={() => openKeyboard({
                    value: cashReceived,
                    onChange: setCashReceived,
                    mode: 'number',
                    title: 'Verilen Nakit Tutarı (₺)',
                  })}
                  onClick={() => openKeyboard({
                    value: cashReceived,
                    onChange: setCashReceived,
                    mode: 'number',
                    title: 'Verilen Nakit Tutarı (₺)',
                  })}
                  onTouchEnd={() => openKeyboard({
                    value: cashReceived,
                    onChange: setCashReceived,
                    mode: 'number',
                    title: 'Verilen Nakit Tutarı (₺)',
                  })}
                  placeholder={formatCurrency(totals.total)}
                />
                <div className="quick-amounts">
                  {[200, 300, 500].map((value) => <button type="button" key={value} onClick={() => setCashReceived(String(value))}>{formatCurrency(value)}</button>)}
                  <button type="button" onClick={() => setCashReceived(String(totals.total))}>Tam Tutar</button>
                </div>
                <div className="change-line"><span>Para Üstü</span><strong>{formatCurrency(change)}</strong></div>
              </div>
            )}
            {method === 'qr' && <><div className="qr-placeholder" aria-label="Ödeme QR kodu"><QrCode size={50} /></div><p className="muted text-center">Müşterinin kamerayla taraması için QR Kod</p></>}
            <button type="button" className="confirm-pay" onClick={handleConfirm} disabled={!canConfirm}>{method === 'card' ? <CreditCard size={18} /> : method === 'cash' ? <Banknote size={18} /> : <CheckCircle2 size={18} />} Ödemeyi Onayla</button>
          </div>
        )}
      </div>
    </div>
  )
}
