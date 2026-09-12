import { useState, useRef } from 'react'
import { Image, Upload, RotateCcw, X, Check } from 'lucide-react'
import { AppLogo } from './AppLogo'
import { uploadLogo } from '../lib/api'

interface LogoSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LogoSettingsModal({ isOpen, onClose }: LogoSettingsModalProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewSrc(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (previewSrc) {
      localStorage.setItem('customAppLogo', previewSrc)
      window.dispatchEvent(new Event('logoUpdated'))

      // Also attempt backend upload if running
      if (selectedFile) {
        try {
          await uploadLogo(selectedFile)
        } catch {
          // Fallback handled via localStorage
        }
      }

      setSavedSuccess(true)
      onClose()
      setTimeout(() => {
        setSavedSuccess(false)
      }, 300)
    }
  }

  const handleReset = () => {
    localStorage.removeItem('customAppLogo')
    window.dispatchEvent(new Event('logoUpdated'))
    setPreviewSrc(null)
    setSelectedFile(null)
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onClose()
    }, 1000)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Logo Ayarları">
      <div className="modal max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden p-6 border border-stone-200">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
              <Image size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Uygulama Logosu Ayarları</h2>
              <p className="text-xs text-stone-500">Adisyon ve üst barda görünecek logonuzu güncelleyin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Current vs New Preview */}
          <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/80 flex items-center justify-around gap-4">
            <div className="text-center">
              <p className="text-xs font-semibold text-stone-500 mb-2">Mevcut Görünüm</p>
              <div className="w-20 h-20 bg-white rounded-xl border border-stone-200 flex items-center justify-center p-2 shadow-sm mx-auto">
                <AppLogo className="max-w-full max-h-full object-contain" />
              </div>
            </div>

            {previewSrc && (
              <div className="text-center">
                <p className="text-xs font-semibold text-emerald-600 mb-2">Yeni Önizleme</p>
                <div className="w-20 h-20 bg-white rounded-xl border-2 border-emerald-500 flex items-center justify-center p-2 shadow-sm mx-auto">
                  <img src={previewSrc} alt="Yeni Logo" className="max-w-full max-h-full object-contain" />
                </div>
              </div>
            )}
          </div>

          {/* File Upload Trigger */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">Bilgisayarınızdan Logo Görseli Seçin</label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 border-2 border-dashed border-stone-300 hover:border-amber-600 rounded-xl bg-stone-50/50 hover:bg-amber-50/30 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
            >
              <Upload className="text-stone-400 group-hover:text-amber-600 transition-colors" size={24} />
              <span className="text-sm font-semibold text-stone-700 group-hover:text-amber-800">
                {selectedFile ? selectedFile.name : 'Görsel Seçmek İçin Tıklayın (PNG, JPG, SVG, WebP)'}
              </span>
              <span className="text-xs text-stone-400">Şeffaf arka planlı PNG logosu tavsiye edilir</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-stone-100 gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-stone-600 text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={14} /> Varsayılan Logoya Dön
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-bold transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!previewSrc}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  previewSrc
                    ? 'bg-amber-800 hover:bg-amber-900 text-white cursor-pointer'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check size={16} /> Kaydedildi!
                  </>
                ) : (
                  'Logoyu Kaydet & Uygula'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
