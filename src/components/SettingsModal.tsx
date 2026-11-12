import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  Palette,
  Store,
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
  Upload,
  Landmark,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  Users,
  Database,
  Undo2,
  FolderOpen,
  HardDrive,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import type { AppSettings, Session } from '../types'
import { formatIban, validateTurkishIban } from '../lib/format'
import { UserManagementView } from './UserManagementView'
import {
  exportFullBackupToFile,
  restoreFromBackup,
  getPreRestoreBackup,
  rollbackPreRestoreBackup,
  validateBackupFileStructure,
  triggerAutomatedBackup,
  listDiskBackups,
  readDiskBackupForRestore,
  selectSecondaryBackupDirectory,
  type DiskBackupItem,
} from '../lib/storage'
import { exportErrorLogsToFile } from '../lib/systemHealth'
import { getLastChainVerificationResult } from '../lib/activityLog'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdateSettings: (newSettings: AppSettings) => void
  onOpenProducts: () => void
  onOpenTableManager: () => void
  onOpenLogoSettings: () => void
  onResetData: () => void
  currentSession?: Session | null
}

type TabType = 'appearance' | 'store' | 'users' | 'backups' | 'system'

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

function getBackupTypeLabel(type: string): { label: string; badgeClass: string } {
  switch (type) {
    case 'saatlik':
      return {
        label: 'Saatlik',
        badgeClass: 'bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800',
      }
    case 'gunluk':
      return {
        label: 'Günlük (Gün Sonu)',
        badgeClass: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      }
    case 'acilis':
      return {
        label: 'Açılış',
        badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      }
    case 'kapanis':
      return {
        label: 'Kapanış',
        badgeClass: 'bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      }
    default:
      return {
        label: 'Manuel',
        badgeClass: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-stone-300 dark:border-stone-700',
      }
  }
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenProducts,
  onOpenTableManager,
  onOpenLogoSettings,
  onResetData,
  currentSession,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('appearance')
  const [formData, setFormData] = useState<AppSettings>(settings)
  const [waiterTimeoutStr, setWaiterTimeoutStr] = useState<string>(
    settings.waiterSessionTimeoutMinutes !== undefined ? String(settings.waiterSessionTimeoutMinutes) : '5'
  )
  const [adminTimeoutStr, setAdminTimeoutStr] = useState<string>(
    settings.adminSessionTimeoutMinutes !== undefined
      ? String(settings.adminSessionTimeoutMinutes)
      : settings.sessionTimeoutMinutes !== undefined
      ? String(settings.sessionTimeoutMinutes)
      : '30'
  )
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [restoreFeedback, setRestoreFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pendingBackup, setPendingBackup] = useState<any | null>(null)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [diskBackups, setDiskBackups] = useState<DiskBackupItem[]>([])
  const [primaryBackupDir, setPrimaryBackupDir] = useState<string>('Documents\\LemoonYedek\\')
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [isTakingBackup, setIsTakingBackup] = useState(false)
  const [secondaryWarning, setSecondaryWarning] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasRollback = Boolean(getPreRestoreBackup())

  const refreshDiskBackups = useCallback(async () => {
    setIsLoadingBackups(true)
    try {
      const res = await listDiskBackups()
      if (res.success) {
        setDiskBackups(res.backups)
        if (res.directory) setPrimaryBackupDir(res.directory)
      }
    } finally {
      setIsLoadingBackups(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && (activeTab === 'backups' || activeTab === 'system')) {
      refreshDiskBackups()
    }
  }, [isOpen, activeTab, refreshDiskBackups])

  useEffect(() => {
    if (isOpen) {
      setFormData(settings)
      setWaiterTimeoutStr(
        settings.waiterSessionTimeoutMinutes !== undefined ? String(settings.waiterSessionTimeoutMinutes) : '5'
      )
      setAdminTimeoutStr(
        settings.adminSessionTimeoutMinutes !== undefined
          ? String(settings.adminSessionTimeoutMinutes)
          : settings.sessionTimeoutMinutes !== undefined
          ? String(settings.sessionTimeoutMinutes)
          : '30'
      )
    }
  }, [settings, isOpen])

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
    downloadAnchor.setAttribute("download", `lemoon_kafe_ayarlar_${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const handleExportErrorLogs = async () => {
    setRestoreFeedback(null)
    const chainStatus = getLastChainVerificationResult()
    const res = await exportErrorLogsToFile(chainStatus)
    if (res.success) {
      setRestoreFeedback({
        type: 'success',
        message: `Hata kayıtları başarıyla dışa aktarıldı (${res.fileName || 'lemoon-hata-kayitlari.zip'}).`,
      })
    } else if (!res.canceled) {
      setRestoreFeedback({
        type: 'error',
        message: res.error || 'Hata kayıtları dışa aktarılamadı.',
      })
    }
  }

  const handleFullBackupExport = () => {
    exportFullBackupToFile()
    setRestoreFeedback({
      type: 'success',
      message: 'Tam sistem yedeği başarıyla indirildi.',
    })
  }

  const handleTakeBackupNow = async () => {
    setIsTakingBackup(true)
    setRestoreFeedback(null)
    setSecondaryWarning(null)
    try {
      const res = await triggerAutomatedBackup('manuel', formData.secondaryBackupDir)
      if (res.success) {
        if (res.secondaryWarning) {
          setSecondaryWarning(res.secondaryWarning)
        }
        setRestoreFeedback({
          type: 'success',
          message: `Yedek başarıyla oluşturuldu: ${res.fileName}${
            res.secondaryCopied ? ' (İkinci klasöre de kopyalandı)' : ''
          }`,
        })
        await refreshDiskBackups()
      } else {
        // Tarayıcı ortamındaysa indirme olarak yedek al
        exportFullBackupToFile()
        setRestoreFeedback({
          type: 'success',
          message: 'Tam sistem yedeği dosyası indirildi.',
        })
      }
    } finally {
      setIsTakingBackup(false)
    }
  }

  const handleSelectSecondaryDir = async () => {
    const res = await selectSecondaryBackupDirectory()
    if (!res.canceled && res.path) {
      handleChange('secondaryBackupDir', res.path)
      setSecondaryWarning(null)
    }
  }

  const handleRestoreFromDiskBackup = async (fileName: string) => {
    setRestoreFeedback(null)
    const res = await readDiskBackupForRestore(fileName)
    if (!res.success || !res.backup) {
      setRestoreFeedback({
        type: 'error',
        message: res.error || 'Seçilen yedek dosyası doğrulanamadı.',
      })
      setPendingBackup(null)
      return
    }
    const validation = validateBackupFileStructure(res.backup)
    if (!validation.valid || !validation.backup) {
      setRestoreFeedback({
        type: 'error',
        message: validation.error || 'Yedek dosyası şema doğrulamasından geçemedi.',
      })
      setPendingBackup(null)
      return
    }
    setPendingBackup(validation.backup)
    setShowRestoreConfirm(true)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsed = JSON.parse(text)
        const validation = validateBackupFileStructure(parsed)
        if (!validation.valid || !validation.backup) {
          setRestoreFeedback({
            type: 'error',
            message: validation.error || 'Geçersiz yedek dosyası.',
          })
          setPendingBackup(null)
          return
        }

        setPendingBackup(validation.backup)
        setShowRestoreConfirm(true)
        setRestoreFeedback(null)
      } catch (err) {
        setRestoreFeedback({
          type: 'error',
          message: 'Dosya okunurken hata oluştu: Geçerli bir JSON dosyası seçiniz.',
        })
        setPendingBackup(null)
      }
    }
    reader.readAsText(file)
    // Reset file input so user can re-select same file if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleConfirmRestore = () => {
    if (!pendingBackup) return
    const result = restoreFromBackup(pendingBackup)
    if (result.success) {
      setRestoreFeedback({
        type: 'success',
        message: 'Yedek başarıyla geri yüklendi! Sayfa yenileniyor...',
      })
      setShowRestoreConfirm(false)
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } else {
      setRestoreFeedback({
        type: 'error',
        message: result.message,
      })
    }
  }

  const handleRollback = () => {
    if (window.confirm('Önceki yedeğe geri dönmek istediğinizden emin misiniz?')) {
      const result = rollbackPreRestoreBackup()
      if (result.success) {
        setRestoreFeedback({
          type: 'success',
          message: 'Önceki yedek geri yüklendi. Sayfa yenileniyor...',
        })
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        setRestoreFeedback({
          type: 'error',
          message: result.message,
        })
      }
    }
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

          {(!currentSession || currentSession.role === 'admin') && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 rounded-t-lg transition-all whitespace-nowrap ${
                activeTab === 'users'
                  ? 'border-amber-700 text-amber-900 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-400'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              <Users size={16} />
              Kullanıcılar & Personel
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('backups')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 rounded-t-lg transition-all whitespace-nowrap ${
              activeTab === 'backups'
                ? 'border-amber-700 text-amber-900 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-400'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Database size={16} />
            Yedekler
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
                    placeholder="Örn: LEMOON KAFE"
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
                    placeholder="Örn: LEMOON KAFE · SIMAV"
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
                    placeholder="Örn: LEMOON"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200">
                      Garson Oturum Zaman Aşımı (Dakika)
                    </label>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {waiterTimeoutStr === '0' ? 'Süresiz (Kapanmaz)' : `${waiterTimeoutStr || '0'} dk`}
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={waiterTimeoutStr}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      setWaiterTimeoutStr(val)
                      if (val !== '') {
                        const num = parseInt(val, 10)
                        handleChange('waiterSessionTimeoutMinutes', num)
                      }
                    }}
                    onBlur={() => {
                      if (waiterTimeoutStr === '') {
                        setWaiterTimeoutStr('5')
                        handleChange('waiterSessionTimeoutMinutes', 5)
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono"
                    placeholder="Örn: 5 (0: süresiz)"
                  />
                  {/* Hızlı seçim butonları */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {[
                      { label: '2 dk', val: 2 },
                      { label: '5 dk', val: 5 },
                      { label: '10 dk', val: 10 },
                      { label: '30 dk', val: 30 },
                      { label: 'Süresiz (0)', val: 0 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => {
                          setWaiterTimeoutStr(String(preset.val))
                          handleChange('waiterSessionTimeoutMinutes', preset.val)
                        }}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                          waiterTimeoutStr === String(preset.val)
                            ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 shadow-xs'
                            : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1.5">
                    Garson boşta kaldığında oturumun kapanacağı süreyi elle girin (varsayılan: 5 dk, 0: süresiz).
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200">
                      Yönetici Oturum Zaman Aşımı (Dakika)
                    </label>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {adminTimeoutStr === '0' ? 'Süresiz (Kapanmaz)' : `${adminTimeoutStr || '0'} dk`}
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={adminTimeoutStr}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      setAdminTimeoutStr(val)
                      if (val !== '') {
                        const num = parseInt(val, 10)
                        handleChange('adminSessionTimeoutMinutes', num)
                        handleChange('sessionTimeoutMinutes', num)
                      }
                    }}
                    onBlur={() => {
                      if (adminTimeoutStr === '') {
                        setAdminTimeoutStr('30')
                        handleChange('adminSessionTimeoutMinutes', 30)
                        handleChange('sessionTimeoutMinutes', 30)
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono"
                    placeholder="Örn: 30 (0: süresiz)"
                  />
                  {/* Hızlı seçim butonları */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {[
                      { label: '15 dk', val: 15 },
                      { label: '30 dk', val: 30 },
                      { label: '60 dk (1 sa)', val: 60 },
                      { label: '120 dk (2 sa)', val: 120 },
                      { label: 'Süresiz (0)', val: 0 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => {
                          setAdminTimeoutStr(String(preset.val))
                          handleChange('adminSessionTimeoutMinutes', preset.val)
                          handleChange('sessionTimeoutMinutes', preset.val)
                        }}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                          adminTimeoutStr === String(preset.val)
                            ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 shadow-xs'
                            : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1.5">
                    Yönetici boşta kaldığında oturumun kapanacağı süreyi elle girin (varsayılan: 30 dk, 0: süresiz).
                  </p>
                </div>
              </div>

              {/* Rol & Güvenlik Yetki Ayarları */}
              <div className="pt-5 border-t border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-amber-700 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Kullanıcı Rolü & Yetkilendirme
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                      Aktif Kullanıcı Rolü
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleChange('currentUserRole', 'cashier')}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          (formData.currentUserRole ?? 'cashier') === 'cashier'
                            ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 shadow-xs'
                            : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        <UserCheck size={14} />
                        Kasiyer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChange('currentUserRole', 'admin')}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          formData.currentUserRole === 'admin'
                            ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 shadow-xs'
                            : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        <ShieldCheck size={14} />
                        Yönetici (Tam Yetkili)
                      </button>
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                      Yöneticiler tüm iade ve kapatılan adisyonları geri açma işlemlerini doğrudan gerçekleştirebilir.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3">
                    <div className="text-xs font-bold text-stone-800 dark:text-stone-200">
                      Kasiyer İzinleri
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.allowCashierRefund)}
                        onChange={(e) => handleChange('allowCashierRefund', e.target.checked)}
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs text-stone-700 dark:text-stone-300 font-medium">
                        Kasiyer ürün ve masa iadesi yapabilsin
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.allowCashierReopen)}
                        onChange={(e) => handleChange('allowCashierReopen', e.target.checked)}
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs text-stone-700 dark:text-stone-300 font-medium">
                        Kasiyer kapatılmış adisyonu geri açabilsin
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* IBAN Bilgileri */}
              <div className="pt-5 border-t border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-2 mb-3">
                  <Landmark size={16} className="text-amber-700 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    IBAN Bilgileri (Havale / EFT)
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                      Banka Adı
                    </label>
                    <input
                      type="text"
                      value={formData.bankName || ''}
                      onChange={(e) => handleChange('bankName', e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                      placeholder="Örn: Ziraat Bankası"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                      Hesap Sahibi
                    </label>
                    <input
                      type="text"
                      value={formData.accountHolder || ''}
                      onChange={(e) => handleChange('accountHolder', e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                      placeholder="Örn: LEMOON KAFE Gıda Ltd. Şti."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
                      IBAN Numarası
                    </label>
                    <input
                      type="text"
                      value={formData.iban || ''}
                      onChange={(e) => handleChange('iban', formatIban(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-xs font-mono font-bold tracking-wider rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                      placeholder="TR00 0000 0000 0000 0000 0000 00"
                      maxLength={32}
                    />
                    {formData.iban && formData.iban !== 'TR00 0000 0000 0000 0000 0000 00' && validateTurkishIban(formData.iban) && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle size={13} />
                        {validateTurkishIban(formData.iban)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* ── TAB 3: Kullanıcılar & Personel ── */}
          {activeTab === 'users' && (
            <UserManagementView
              currentSession={currentSession || null}
              settings={formData}
              onUpdateSettings={(newSettings) => {
                setFormData(newSettings)
                onUpdateSettings(newSettings)
              }}
            />
          )}

          {/* ── TAB 4 & 5: Yedekler / Hızlı Yönetim & Sistem ── */}
          {(activeTab === 'backups' || activeTab === 'system') && (
            <div className="space-y-5">
              {activeTab === 'system' && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
                    Sistem Modüllerine Hızlı Erişim
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
                      onClick={() => setActiveTab('users')}
                      className="flex items-center gap-3 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-500 hover:shadow-md transition-all text-left group"
                    >
                      <div className="p-2.5 rounded-lg bg-amber-100 text-amber-900 dark:bg-stone-800 dark:text-amber-400 group-hover:scale-105 transition-transform">
                        <Users size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Kullanıcılar</div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400">Garson & Yetkiler</div>
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
              )}

              {/* ── YEDEKLER BÖLÜMÜ (İki Konumlu Otomatik & Manuel Yedekleme) ── */}
              <div className={`${activeTab === 'system' ? 'pt-4 border-t border-stone-200 dark:border-stone-800' : ''} space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5 mb-1">
                      <Database size={14} /> Yedekler (Otomatik & İki Konumlu Yedekleme)
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      Her saat başı, gün sonu kapanışında, uygulama açılışında ve kapanışında otomatik yedek alınır. Son 48 saatlik ve son 30 günlük yedekler korunur.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTakeBackupNow}
                    disabled={isTakingBackup}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white shadow-sm transition-colors cursor-pointer"
                  >
                    <HardDrive size={14} />
                    {isTakingBackup ? 'Yedek Alınıyor...' : 'Şimdi Yedek Al'}
                  </button>
                </div>

                {/* Klasör Ayarları: Birincil & İkinci Yedek Klasörü */}
                <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-700 dark:text-stone-300">Birincil Yedek Klasörü:</span>
                    <code className="px-2 py-0.5 rounded bg-stone-200/70 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-[11px]">
                      {primaryBackupDir}
                    </code>
                  </div>

                  <div className="pt-2 border-t border-stone-200/80 dark:border-stone-800">
                    <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">
                      İkinci Yedek Klasörü (USB Bellek / OneDrive / Google Drive)
                    </label>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <input
                        type="text"
                        value={formData.secondaryBackupDir || ''}
                        onChange={(e) => {
                          handleChange('secondaryBackupDir', e.target.value)
                          setSecondaryWarning(null)
                        }}
                        placeholder="Örn: E:\LemoonYedek veya C:\Users\Kasa\OneDrive\LemoonYedek"
                        className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleSelectSecondaryDir}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shrink-0 cursor-pointer"
                      >
                        <FolderOpen size={14} /> Klasör Seç
                      </button>
                      {formData.secondaryBackupDir && (
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('secondaryBackupDir', '')
                            setSecondaryWarning(null)
                          }}
                          className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-800 text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0 cursor-pointer"
                          title="İkinci yedek klasörü seçimini kaldır"
                        >
                          Temizle
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">
                      Her yedek otomatik olarak bu klasöre de kopyalanır. USB bellek çıkarılırsa veya klasöre erişilemezse kasa durmaz, yalnızca uyarı verir.
                    </p>
                  </div>
                </div>

                {secondaryWarning && (
                  <div className="p-3 rounded-xl text-xs font-semibold flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800">
                    <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{secondaryWarning}</span>
                  </div>
                )}

                {restoreFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      restoreFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                        : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                    }`}
                  >
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{restoreFeedback.message}</span>
                  </div>
                )}

                {/* Restore Confirmation Dialog */}
                {showRestoreConfirm && pendingBackup && (
                  <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-700 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle size={18} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-xs font-extrabold text-amber-950 dark:text-amber-200">
                          Yedek Dosyası Doğrulandı — Geri Yükleme Onayı
                        </h5>
                        <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 mt-1">
                          Yedek Tarihi:{' '}
                          <strong>{new Date(pendingBackup.createdAt).toLocaleString('tr-TR')}</strong> ·{' '}
                          {pendingBackup.data.completedOrders?.length || 0} Satış Kaydı ·{' '}
                          {pendingBackup.data.businessDays?.length || 0} İş Günü ·{' '}
                          {pendingBackup.data.menuProducts?.length || 0} Ürün
                        </p>
                        <p className="text-[10px] text-stone-600 dark:text-stone-400 mt-1">
                          * Güvenlik amacıyla mevcut verilerinizin otomatik bir geri alma yedeği oluşturulacaktır.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleConfirmRestore}
                        className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                        Evet, Yedeği Geri Yükle
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRestoreConfirm(false)
                          setPendingBackup(null)
                        }}
                        className="px-3.5 py-2 bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-300 rounded-lg text-xs font-semibold hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors"
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                )}

                {/* Kayıtlı Yedekler Listesi */}
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden bg-white dark:bg-stone-900">
                  <div className="px-3.5 py-2.5 bg-stone-100/80 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                      Yedek Listesi ({diskBackups.length})
                    </span>
                    <button
                      type="button"
                      onClick={refreshDiskBackups}
                      disabled={isLoadingBackups}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
                    >
                      <RefreshCw size={12} className={isLoadingBackups ? 'animate-spin' : ''} />
                      Yenile
                    </button>
                  </div>

                  {diskBackups.length === 0 ? (
                    <div className="p-4 text-center text-xs text-stone-500 dark:text-stone-400">
                      {isLoadingBackups
                        ? 'Yedek listesi yükleniyor...'
                        : 'Henüz kayıtlı otomatik disk yedeği bulunmuyor. "Şimdi Yedek Al" düğmesiyle hemen yedek oluşturabilirsiniz.'}
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-stone-200/70 dark:divide-stone-800">
                      {diskBackups.map((item) => {
                        const typeMeta = getBackupTypeLabel(item.type)
                        return (
                          <div
                            key={item.fileName}
                            className="px-3.5 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                                  {new Date(item.createdAt).toLocaleString('tr-TR')}
                                </span>
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${typeMeta.badgeClass}`}
                                >
                                  {typeMeta.label}
                                </span>
                                <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                                  {formatFileSize(item.sizeBytes)}
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-stone-400 dark:text-stone-500 truncate mt-0.5">
                                {item.fileName}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRestoreFromDiskBackup(item.fileName)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800 transition-colors shrink-0 cursor-pointer"
                            >
                              Bu yedeği geri yükle
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Dosyadan İndirme / Yükleme & Geri Alma */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleFullBackupExport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shadow-sm"
                  >
                    <Download size={14} /> Tam Sistem Yedeği İndir (JSON)
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shadow-sm"
                  >
                    <Upload size={14} /> Dosyadan Yedek Yükle (JSON)
                  </button>

                  {hasRollback && (
                    <button
                      type="button"
                      onClick={handleRollback}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      title="Geri yükleme öncesi otomatik alınan güvenlik yedeğini geri yükler"
                    >
                      <Undo2 size={13} /> Önceki Yedeğe Dön (Geri Al)
                    </button>
                  )}
                </div>
              </div>

              {/* İkincil / Ayar Dışa Aktarımı ve Sıfırlama */}
              <div className="pt-4 border-t border-stone-200 dark:border-stone-800 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                  Diğer Veri İşlemleri
                </h4>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportErrorLogs}
                    data-testid="export-error-logs-btn"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shadow-sm"
                    title="Teknik destek için döngüsel hata kayıtlarını (şifre ve PIN'ler filtrelenmiş olarak) tek dosya (.zip) halinde dışa aktarır"
                  >
                    <Download size={13} /> Hata kayıtlarını dışa aktar
                  </button>

                  <button
                    type="button"
                    onClick={handleExportData}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    title="Yalnızca tema ve fiş ayarlarını dışa aktarır (satışları içermez)"
                  >
                    <Download size={13} /> Yalnızca Ayarları Dışa Aktar (JSON)
                  </button>

                  {!showResetConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shadow-sm"
                    >
                      <RotateCcw size={13} /> Varsayılan Verilere Dön
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 p-2 bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 rounded-xl">
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-300">Tüm veriler sıfırlansın mı?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onResetData()
                          setShowResetConfirm(false)
                        }}
                        className="px-2.5 py-1 bg-rose-700 text-white rounded-lg text-[11px] font-bold hover:bg-rose-800"
                      >
                        Evet, Sıfırla (Ön-Yedek Alınır)
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
          <div className="text-[11px] font-medium text-stone-600 dark:text-stone-400">LEMOON KAFE v1.2 · Ayarlar Otomatik Kaydedilir</div>
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
