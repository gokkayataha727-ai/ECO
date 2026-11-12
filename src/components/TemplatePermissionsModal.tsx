import { useState, useMemo } from 'react'
import {
  Shield,
  Search,
  X,
  Check,
  AlertTriangle,
  Lock,
  Coffee,
  RotateCcw as RefundIcon,
  CreditCard,
  Sun,
  Package,
  LayoutGrid,
  BarChart3,
  Sliders,
} from 'lucide-react'
import {
  PERMISSION_GROUPS,
  PERMISSION_CATALOG,
  getPermissionTemplate,
  savePermissionTemplate,
  type PermissionGroup,
} from '../lib/permissions'
import type { PermissionKey, Session } from '../types'

interface TemplatePermissionsModalProps {
  currentSession: Session | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

const GROUP_ICONS: Record<PermissionGroup, React.ReactNode> = {
  order: <Coffee size={16} />,
  refund: <RefundIcon size={16} />,
  payment: <CreditCard size={16} />,
  business_day: <Sun size={16} />,
  product: <Package size={16} />,
  table_manage: <LayoutGrid size={16} />,
  reports: <BarChart3 size={16} />,
  admin_only: <Shield size={16} />,
}

export function TemplatePermissionsModal({
  currentSession,
  isOpen,
  onClose,
  onSuccess,
}: TemplatePermissionsModalProps) {
  const initialTemplate = useMemo(() => getPermissionTemplate(), [])
  const [template, setTemplate] = useState<Record<PermissionKey, boolean>>({ ...initialTemplate })
  const [searchQuery, setSearchQuery] = useState('')

  // Compute changes from initial
  const changes = useMemo(() => {
    const diffs: Array<{ key: PermissionKey; label: string; from: boolean; to: boolean }> = []
    for (const item of PERMISSION_CATALOG) {
      if (item.adminOnly) continue
      const initialVal = Boolean(initialTemplate[item.key])
      const currentVal = Boolean(template[item.key])
      if (initialVal !== currentVal) {
        diffs.push({
          key: item.key,
          label: item.label,
          from: initialVal,
          to: currentVal,
        })
      }
    }
    return diffs
  }, [template, initialTemplate])

  const handleToggle = (key: PermissionKey) => {
    setTemplate((prev) => {
      const nextVal = !prev[key]
      const updated = { ...prev, [key]: nextVal }
      if (key === 'payment_take' && !nextVal) {
        for (const item of PERMISSION_CATALOG) {
          if (item.parentKey === 'payment_take') {
            updated[item.key] = false
          }
        }
      }
      return updated
    })
  }

  const handleToggleGroup = (groupId: PermissionGroup, enable: boolean) => {
    const groupItems = PERMISSION_CATALOG.filter((p) => p.group === groupId && !p.adminOnly)
    const hasSensitive = groupItems.some((p) => p.sensitive && enable)

    if (hasSensitive) {
      const confirmed = window.confirm(
        `"${PERMISSION_GROUPS.find((g) => g.id === groupId)?.title}" grubundaki hassas yetkileri açmak üzeresiniz. Onaylıyor musunuz?`,
      )
      if (!confirmed) return
    }

    setTemplate((prev) => {
      const updated = { ...prev }
      for (const item of groupItems) {
        updated[item.key] = enable
      }
      return updated
    })
  }

  const handleSave = () => {
    const adminUser = {
      id: currentSession?.userId,
      fullName: currentSession?.fullName || 'Sistem Yöneticisi',
      role: currentSession?.role || 'admin',
    }

    savePermissionTemplate(template, adminUser)
    onSuccess('Varsayılan Garson Şablonu başarıyla güncellendi.')
    onClose()
  }

  if (!isOpen) return null

  const filteredCatalog = PERMISSION_CATALOG.filter((item) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.key.toLowerCase().includes(q)
    )
  })

  return (
    <div
      className="overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal max-w-3xl w-full bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3 bg-stone-50/70 dark:bg-stone-850/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-xs">
              <Sliders size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100 truncate">
                Varsayılan Garson Yetkileri (Genel Şablon)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Kişiye özel ayarı olmayan tüm garsonlar ve yeni eklenecek personeller bu şablona uyar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 sm:px-5 py-3 border-b border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Yetki adı veya açıklamasında ara..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 rounded-xl text-xs font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {PERMISSION_GROUPS.map((group) => {
            const items = filteredCatalog.filter((item) => item.group === group.id)
            if (items.length === 0) return null

            const isGroupAdminOnly = group.id === 'admin_only'
            const allEnabled = items.every((i) => Boolean(template[i.key]))
            const allDisabled = items.every((i) => !template[i.key])

            return (
              <div
                key={group.id}
                className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900/60 shadow-xs"
              >
                <div className="p-3 sm:px-4 sm:py-3 bg-stone-100/70 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[#8a6d57] dark:text-amber-400">
                      {GROUP_ICONS[group.id]}
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider text-stone-800 dark:text-stone-200">
                      {group.title}
                    </span>
                    <span className="text-[11px] font-bold text-stone-400">
                      ({items.filter((i) => Boolean(template[i.key])).length}/{items.length})
                    </span>
                  </div>

                  {!isGroupAdminOnly && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleToggleGroup(group.id, true)}
                        className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                          allEnabled
                            ? 'text-stone-400 cursor-default'
                            : 'text-amber-800 hover:bg-amber-100/70 dark:text-amber-400 dark:hover:bg-stone-700'
                        }`}
                        disabled={allEnabled}
                      >
                        Tümünü Aç
                      </button>
                      <span className="text-stone-300 dark:text-stone-700">·</span>
                      <button
                        type="button"
                        onClick={() => handleToggleGroup(group.id, false)}
                        className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                          allDisabled
                            ? 'text-stone-400 cursor-default'
                            : 'text-stone-600 hover:bg-stone-200/60 dark:text-stone-400 dark:hover:bg-stone-700'
                        }`}
                        disabled={allDisabled}
                      >
                        Tümünü Kapat
                      </button>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
                  {items.map((item) => {
                    const isAllowed = Boolean(template[item.key])
                    const isPaymentSub = item.parentKey === 'payment_take'
                    const isPaymentParentOff = isPaymentSub && !template.payment_take

                    return (
                      <div
                        key={item.key}
                        className={`p-3 sm:px-4 sm:py-3.5 flex items-start justify-between gap-3 transition-colors ${
                          isPaymentParentOff ? 'opacity-40 bg-stone-50/50 dark:bg-stone-950/20' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                              {item.label}
                            </span>
                            {item.sensitive && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded">
                                <AlertTriangle size={10} /> Hassas
                              </span>
                            )}
                            {item.adminOnly && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 px-1.5 py-0.2 rounded">
                                <Lock size={10} /> Kilitli (Yalnızca Yönetici)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                            {item.description}
                          </p>
                          {isPaymentParentOff && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold mt-1">
                              * Ana &quot;Ödeme alma&quot; yetkisi kapalı olduğu için devre dışıdır.
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 pt-0.5">
                          {item.adminOnly ? (
                            <div className="p-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-400">
                              <Lock size={14} />
                            </div>
                          ) : (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isAllowed}
                              disabled={isPaymentParentOff}
                              onClick={() => handleToggle(item.key)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                                isPaymentParentOff
                                  ? 'bg-stone-200 dark:bg-stone-800 cursor-not-allowed opacity-50'
                                  : isAllowed
                                  ? 'bg-emerald-600'
                                  : 'bg-stone-300 dark:bg-stone-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  isAllowed ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-850/50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-stone-500">
            {changes.length > 0 ? (
              <span className="font-bold text-amber-800 dark:text-amber-300">
                {changes.length} yetkide şablon değişikliği yapıldı.
              </span>
            ) : (
              <span>Şablonda değişiklik yapılmadı.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-black transition-colors shadow-sm cursor-pointer"
            >
              <Check size={14} />
              <span>Şablonu Kaydet</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

