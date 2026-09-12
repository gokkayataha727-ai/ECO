import { useState } from 'react'
import {
  X,
  Palette,
  Store,
  Printer,
  Sliders,
  Check,
  Sun,
  Moon,
  Coffee,
  Package,
  LayoutGrid,
  ImageIcon,
  RotateCcw,
  Download,
} from 'lucide-react'
import type { AppSettings } from '../types/settings'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdateSettings: (newSettings: AppSettings) => void
  onOpenProducts: () => void
  onOpenTableManager: () => void
  onOpenLogoSettings: () => void
  onResetData: () => void
}

type TabType = 'appearance' | 'store' | 'receipt' | 'system'

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenProducts,
  onOpenTableManager,
  onOpenLogoSettings,
  onResetData,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('appearance')
  const [formData, setFormData] = useState<AppSettings>(settings)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  if (!isOpen) return null

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...formData, [key]: value }
    setFormData(updated)
    onUpdateSettings(updated)
  }

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(formData, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute("href", dataStr)
    downloadAnchor.setAttribute("download", `eco_coffee_ayarlar_${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Sistem ve Görünüm Ayarları">
      <div className="modal settings-modal-container max-w-3xl w-full">
        {/* Modal Header */}
        <div className="modal-head">
          <div>
            <p className="section-kicker flex items-center gap-1.5">
              <Sliders size={14} className="text-amber-700 dark:text-amber-400" /> POS SİSTEM AYARLARI
            </p>
            <h2 className="section-title">Ayarlar ve Özelleştirme</h2>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Ayarlar penceresini kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 px-4 sm:px-6 bg-stone-100/80 dark:bg-stone-900/60 gap-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === 'appearance'
                ? 'border-amber-700 text-amber-900 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-400'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Palette size={16} />
            Görünüm & Tema
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === 'store'
                ? 'border-amber-700 text-amber-900 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-400'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Store size={16} />
            İşletme Bilgileri
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('receipt')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === 'receipt'
                ? 'border-amber-700 text-amber-900 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-400'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Printer size={16} />
            Adisyon & Fiş
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === 'system'
                ? 'border-amber-700 text-amber-900 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-400'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Sliders size={16} />
            Hızlı Yönetim & Sistem
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* ── TAB 1: Görünüm & Tema ── */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-1">
                  Uygulama Teması (Renk Modu)
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400 mb-4">
                  Sisteminizin göz yormayan karanlık veya sıcak açık renk paletini seçin.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Light Theme Card */}
                  <button
                    type="button"
                    onClick={() => handleChange('theme', 'light')}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between min-h-[120px] ${
                      formData.theme === 'light'
                        ? 'border-amber-700 bg-amber-50/70 dark:bg-stone-800 dark:border-amber-500 shadow-sm'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-2 rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300">
                        <Sun size={20} />
                      </div>
                      {formData.theme === 'light' && (
                        <span className="w-5 h-5 rounded-full bg-amber-700 text-white flex items-center justify-center text-xs font-bold">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-stone-900 dark:text-stone-100 text-sm mt-3">
                        Açık Tema (Klasik)
                      </div>
                      <div className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                        Aydınlık ve ferah kahve kremi tonları
                      </div>
                    </div>
                  </button>

                  {/* Dark Theme Card */}
                  <button
                    type="button"
                    onClick={() => handleChange('theme', 'dark')}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between min-h-[120px] ${
                      formData.theme === 'dark'
                        ? 'border-amber-700 bg-stone-900 dark:border-amber-400 dark:bg-stone-800 shadow-sm text-stone-100'
                        : 'border-stone-200 dark:border-stone-800 bg-stone-900 text-stone-100 hover:border-amber-500'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-2 rounded-lg bg-stone-800 text-amber-400">
                        <Moon size={20} />
                      </div>
                      {formData.theme === 'dark' && (
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center text-xs font-bold">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-stone-100 text-sm mt-3">
                        Karanlık Mod (Dark)
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        Göz yormayan şık gece modu ve mat siyahlar
                      </div>
                    </div>
                  </button>

                  {/* Warm Coffee Theme Card */}
                  <button
                    type="button"
                    onClick={() => handleChange('theme', 'warm')}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between min-h-[120px] ${
                      formData.theme === 'warm'
                        ? 'border-amber-700 bg-amber-100/70 dark:bg-amber-950/50 dark:border-amber-400 shadow-sm'
                        : 'border-stone-200 dark:border-stone-800 bg-amber-50/40 dark:bg-stone-900 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-2 rounded-lg bg-amber-800 text-amber-100">
                        <Coffee size={20} />
                      </div>
                      {formData.theme === 'warm' && (
                        <span className="w-5 h-5 rounded-full bg-amber-800 text-white flex items-center justify-center text-xs font-bold">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-amber-950 dark:text-amber-200 text-sm mt-3">
                        Sıcak Espresso (Warm)
                      </div>
                      <div className="text-xs text-amber-900/80 dark:text-amber-400 mt-0.5">
                        Zengin ve sıcak karamel & kahve dokuları
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-200 dark:border-stone-800">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">Önizleme İpucu</h4>
                <div className="p-3.5 bg-stone-100 dark:bg-stone-800/80 rounded-xl text-xs text-stone-700 dark:text-stone-300 font-medium">
                  Tema seçiminiz anında tüm ekrana, masalara, adisyona ve rapor ekranlarına uygulanır. Tercihiniz tarayıcınızda otomatik kaydedilir.
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: İşletme Bilgileri ── */}
          {activeTab === 'store' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                    İşletme Adı
                  </label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={(e) => handleChange('storeName', e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                    placeholder="Örn: Eco Coffee"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                    Slogan / Alt Başlık
                  </label>
                  <input
                    type="text"
                    value={formData.storeSub}
                    onChange={(e) => handleChange('storeSub', e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                    placeholder="Örn: Kahvenin iyi hali"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                    Şube / Konum Bilgisi
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                    placeholder="Örn: Eco Coffee · Nurdağı"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                    Aktif Kasiyer İsmi
                  </label>
                  <input
                    type="text"
                    value={formData.cashierName}
                    onChange={(e) => handleChange('cashierName', e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                    placeholder="Örn: ECO"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: Adisyon & Fiş ── */}
          {activeTab === 'receipt' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                    Para Birimi Simgesi
                  </label>
                  <select
                    value={formData.currencySymbol}
                    onChange={(e) => handleChange('currencySymbol', e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                  >
                    <option value="₺">₺ (Türk Lirası - TRY)</option>
                    <option value="$">$ (Amerikan Doları - USD)</option>
                    <option value="€">€ (Euro - EUR)</option>
                    <option value="£">£ (İngiliz Sterlini - GBP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                    Dahil KDV Oranı (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.taxRate}
                    onChange={(e) => handleChange('taxRate', Number(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                  Adisyon Alt Teşekkür Mesajı
                </label>
                <textarea
                  rows={3}
                  value={formData.receiptFooter}
                  onChange={(e) => handleChange('receiptFooter', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                  placeholder="Adisyonda en altta görünecek mesaj..."
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-stone-100/90 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700">
                <div>
                  <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
                    Ödeme Sonrası Otomatik Fiş Yazdır
                  </div>
                  <div className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5">
                    Ödeme tamamlandığında adisyon penceresini otomatik tetikle
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.autoPrintReceipt}
                  onChange={(e) => handleChange('autoPrintReceipt', e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* ── TAB 4: Hızlı Yönetim & Sistem ── */}
          {activeTab === 'system' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
                  Sistem Modüllerine Hızlı Erişim
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenProducts()
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-500 hover:shadow-md transition-all text-left group"
                  >
                    <div className="p-2.5 rounded-lg bg-amber-100 text-amber-900 dark:bg-stone-800 dark:text-amber-400 group-hover:scale-105 transition-transform">
                      <Package size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Ürün Yönetimi</div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400">Menü & Fiyat Ekle</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenTableManager()
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-500 hover:shadow-md transition-all text-left group"
                  >
                    <div className="p-2.5 rounded-lg bg-amber-100 text-amber-900 dark:bg-stone-800 dark:text-amber-400 group-hover:scale-105 transition-transform">
                      <LayoutGrid size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Masa Yönetimi</div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400">Masa Ekle / Sil</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenLogoSettings()
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-500 hover:shadow-md transition-all text-left group"
                  >
                    <div className="p-2.5 rounded-lg bg-amber-100 text-amber-900 dark:bg-stone-800 dark:text-amber-400 group-hover:scale-105 transition-transform">
                      <ImageIcon size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Logo Ayarları</div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400">Logoyu Güncelle</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-200 dark:border-stone-800 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                  Veri İşlemleri & Yedekleme
                </h4>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportData}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shadow-sm"
                  >
                    <Download size={14} /> Ayarları Dışa Aktar (JSON)
                  </button>

                  {!showResetConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shadow-sm"
                    >
                      <RotateCcw size={14} /> Varsayılan Verilere Dön
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 p-2 bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 rounded-xl">
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-300">Emin misiniz?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onResetData()
                          setShowResetConfirm(false)
                        }}
                        className="px-2.5 py-1 bg-rose-700 text-white rounded-lg text-[11px] font-bold hover:bg-rose-800"
                      >
                        Evet, Sıfırla
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowResetConfirm(false)}
                        className="px-2.5 py-1 bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-300 rounded-lg text-[11px] font-bold"
                      >
                        İptal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-stone-200 dark:border-stone-800 bg-stone-100/90 dark:bg-stone-900/90 flex items-center justify-between rounded-b-2xl">
          <div className="text-[11px] font-medium text-stone-600 dark:text-stone-400">Eco Coffee v1.2 · Ayarlar Otomatik Kaydedilir</div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-amber-800 hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600 text-white shadow-sm transition-colors"
          >
            Tamam & Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
