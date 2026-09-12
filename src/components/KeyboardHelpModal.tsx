import { CircleHelp, X } from 'lucide-react'

interface KeyboardHelpModalProps { isOpen: boolean; onClose: () => void }
export function KeyboardHelpModal({ isOpen, onClose }: KeyboardHelpModalProps) {
  if (!isOpen) return null
  const shortcuts = [['F2', 'Ürün aramaya odaklan'], ['F4', 'Ödeme panelini aç'], ['+', 'Son ürün adedini artır'], ['−', 'Son ürün adedini azalt'], ['Esc', 'Açık pencereyi kapat'], ['⌘ / Ctrl', 'Backspace ile sepeti temizle']]
  return <div className="overlay" role="dialog" aria-modal="true" aria-label="Klavye kısayolları"><div className="modal" style={{ width: 'min(450px, 100%)' }}><div className="modal-head"><div><p className="section-kicker flex items-center gap-1"><CircleHelp size={13} /> Kullanım ipuçları</p><h2 className="section-title">Klavye Kısayolları</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="Kısayol penceresini kapat"><X size={18} /></button></div><div className="payment-body"><div className="help-list">{shortcuts.map(([key, label]) => <div className="help-row" key={key}><span>{label}</span><span className="key-combo">{key.split(' / ').map((part) => <span className="key" key={part}>{part}</span>)}</span></div>)}</div><p className="muted mt-5 text-center">Kısayollar input alanlarında devre dışıdır.</p></div></div></div>
}
