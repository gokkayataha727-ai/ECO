import { useState, useMemo, useEffect } from 'react'
import {
  Shield,
  Search,
  X,
  RotateCcw,
  Copy,
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
} from 'lucide-react'
import {
  PERMISSION_GROUPS,
  PERMISSION_CATALOG,
  getPermissionTemplate,
  getUserOverrides,
  saveUserOverrides,
  resetUserOverrides,
  copyUserOverrides,
  type PermissionGroup,
} from '../lib/permissions'
import type { PermissionKey, Session, User } from '../types'

interface UserPermissionsModalProps {
  user: User
  allUsers: User[]
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

export function UserPermissionsModal({
  user,
  allUsers,
  currentSession,
  isOpen,
  onClose,
  onSuccess,
}: UserPermissionsModalProps) {
  const template = useMemo(() => getPermissionTemplate(), [])
  const initialOverrides = useMemo(() => getUserOverrides(user.id), [user.id])

  // Working state for effective permissions: PermissionKey -> boolean
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>(() => {
    const state: Partial<Record<PermissionKey, boolean>> = {}
    for (const item of PERMISSION_CATALOG) {
      if (item.adminOnly) {
        state[item.key] = false
      } else if (initialOverrides[item.key] !== undefined) {
        state[item.key] = initialOverrides[item.key]
      } else {
        state[item.key] = Boolean(template[item.key])
      }
    }
    return state as Record<PermissionKey, boolean>
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [selectedCopyTargetIds, setSelectedCopyTargetIds] = useState<string[]>([])
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

  // Listen for external permissions update
  useEffect(() => {
    const handleUpdate = () => {
      const curTemplate = getPermissionTemplate()
      const curOverrides = getUserOverrides(user.id)
      const state: Partial<Record<PermissionKey, boolean>> = {}
      for (const item of PERMISSION_CATALOG) {
        if (item.adminOnly) {
          state[item.key] = false
        } else if (curOverrides[item.key] !== undefined) {
          state[item.key] = curOverrides[item.key]
        } else {
          state[item.key] = Boolean(curTemplate[item.key])
        }
      }
      setEffectivePerms(state as Record<PermissionKey, boolean>)
    }
    window.addEventListener('permissions-updated', handleUpdate)
    return () => window.removeEventListener('permissions-updated', handleUpdate)
  }, [user.id])

  // Other waiters eligible for copying permissions
  const otherWaiters = useMemo(() => {
    return allUsers.filter((u) => u.id !== user.id && !u.isDeleted && u.role === 'waiter')
  }, [allUsers, user.id])

  // Compute changes from current initial state
  const changes = useMemo(() => {
    const diffs: Array<{ key: PermissionKey; label: string; from: boolean; to: boolean }> = []
    for (const item of PERMISSION_CATALOG) {
      if (item.adminOnly) continue
      const initialVal =
        initialOverrides[item.key] !== undefined
          ? initialOverrides[item.key]
          : Boolean(template[item.key])
      const currentVal = Boolean(effectivePerms[item.key])
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
  }, [effectivePerms, initialOverrides, template])

  // Toggle single permission
  const handleToggle = (key: PermissionKey, forcedVal?: boolean) => {
    setEffectivePerms((prev) => {
      const currentVal = Boolean(prev[key])
      const nextVal = forcedVal !== undefined ? forcedVal : !currentVal
      const updated = { ...prev, [key]: nextVal }

      // If disabling payment_take, also disable all payment sub-permissions
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

  // Toggle entire group
  const handleToggleGroup = (groupId: PermissionGroup, enable: boolean) => {
    const groupItems = PERMISSION_CATALOG.filter((p) => p.group === groupId && !p.adminOnly)
    const hasSensitive = groupItems.some((p) => p.sensitive && enable)

    if (hasSensitive) {
      const confirmed = window.confirm(
        `"${PERMISSION_GROUPS.find((g) => g.id === groupId)?.title}" grubundaki hassas yetkileri açmak üzeresiniz. Onaylıyor musunuz?`,
      )
      if (!confirmed) return
    }

    setEffectivePerms((prev) => {
      const updated = { ...prev }
      for (const item of groupItems) {
        updated[item.key] = enable
      }
      return updated
    })
  }

  // Save changes
  const handleSave = () => {
    const adminUser = {
      id: currentSession?.userId,
      fullName: currentSession?.fullName || 'Sistem Yöneticisi',
      role: currentSession?.role || 'admin',
    }

    // Convert effectivePerms to overrides relative to template
    const newOverrides: Record<string, boolean> = {}
    for (const item of PERMISSION_CATALOG) {
      if (item.adminOnly) continue
      const templateVal = Boolean(template[item.key])
      const currentVal = Boolean(effectivePerms[item.key])
      if (currentVal !== templateVal) {
        newOverrides[item.key] = currentVal
      }
    }

    saveUserOverrides(user.id, newOverrides, adminUser, user)
    onSuccess(`${user.fullName} yetkileri başarıyla güncellendi.`)
    onClose()
  }

  // Reset to template
  const handleReset = () => {
    const adminUser = {
      id: currentSession?.userId,
      fullName: currentSession?.fullName || 'Sistem Yöneticisi',
      role: currentSession?.role || 'admin',
    }
    resetUserOverrides(user.id, adminUser, user)
    setConfirmResetOpen(false)
    onSuccess(`${user.fullName} yetkileri varsayılan garson şablonuna sıfırlandı.`)
    onClose()
  }

  // Copy to other waiters
  const handleCopySubmit = () => {
    if (selectedCopyTargetIds.length === 0) return
    const adminUser = {
      id: currentSession?.userId,
      fullName: currentSession?.fullName || 'Sistem Yöneticisi',
      role: currentSession?.role || 'admin',
    }

    // First ensure current changes are saved
    const newOverrides: Record<string, boolean> = {}
    for (const item of PERMISSION_CATALOG) {
      if (item.adminOnly) continue
      const templateVal = Boolean(template[item.key])
      const currentVal = Boolean(effectivePerms[item.key])
      if (currentVal !== templateVal) {
        newOverrides[item.key] = currentVal
      }
    }
    saveUserOverrides(user.id, newOverrides, adminUser, user)

    copyUserOverrides(
      user.id,
      selectedCopyTargetIds,
      adminUser,
      user,
      otherWaiters.map((w) => ({ id: w.id, fullName: w.fullName, username: w.username })),
    )

    setCopyModalOpen(false)
    onSuccess(
      `${user.fullName} yetkileri seçilen ${selectedCopyTargetIds.length} garsona başarıyla kopyalandı.`,
    )
    onClose()
  }

  if (!isOpen) return null

  // Filter catalog by search query
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
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
              <Shield size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-stone-900 dark:text-stone-100 truncate">
                  {user.fullName}
                </h3>
                <span className="text-xs font-mono font-bold text-stone-500 dark:text-stone-400">
                  @{user.username}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    user.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                  }`}
                >
                  {user.status === 'active' ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Garson rolü için detaylı yetkilendirme ve kişiselleştirilmiş izinler.
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

        {/* Search Bar */}
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

        {/* Permissions Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {PERMISSION_GROUPS.map((group) => {
            const items = filteredCatalog.filter((item) => item.group === group.id)
            if (items.length === 0) return null

            const isGroupAdminOnly = group.id === 'admin_only'
            const allEnabled = items.every((i) => Boolean(effectivePerms[i.key]))
            const allDisabled = items.every((i) => !effectivePerms[i.key])

            return (
              <div
                key={group.id}
                className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900/60 shadow-xs"
              >
                {/* Group Header */}
                <div className="p-3 sm:px-4 sm:py-3 bg-stone-100/70 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[#8a6d57] dark:text-amber-400">
                      {GROUP_ICONS[group.id]}
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider text-stone-800 dark:text-stone-200">
                      {group.title}
                    </span>
                    <span className="text-[11px] font-bold text-stone-400">
                      ({items.filter((i) => Boolean(effectivePerms[i.key])).length}/{items.length})
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

                {/* Group Items */}
                <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
                  {items.map((item) => {
                    const isAllowed = Boolean(effectivePerms[item.key])
                    const templateVal = Boolean(template[item.key])
                    const isCustomOverride = !item.adminOnly && isAllowed !== templateVal
                    const isPaymentSub = item.parentKey === 'payment_take'
                    const isPaymentParentOff = isPaymentSub && !effectivePerms.payment_take

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

                            {isCustomOverride && (
                              <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 px-1.5 py-0.2 rounded border border-purple-200 dark:border-purple-800">
                                Özel
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
                              * Ana &quot;Ödeme alma&quot; yetkisi kapalı olduğu için bu alt yetki
                              devre dışıdır.
                            </p>
                          )}
                        </div>

                        {/* Switch Toggle */}
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

        {/* Changes Summary Pill (if any changes) */}
        {changes.length > 0 && (
          <div className="px-4 sm:px-5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className="font-black shrink-0">Kaydedilecek Değişiklikler ({changes.length}):</span>
              <span className="truncate text-[11px] font-semibold opacity-90">
                {changes.map((c) => `${c.label} (${c.to ? 'Açık' : 'Kapalı'})`).join(', ')}
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-850/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 transition-colors shadow-xs cursor-pointer"
              title="Tüm özel yetkileri kaldırıp varsayılan garson şablonuna döner"
            >
              <RotateCcw size={13} />
              <span>Varsayılana Sıfırla</span>
            </button>

            {otherWaiters.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCopyTargetIds([])
                  setCopyModalOpen(true)
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 transition-colors shadow-xs cursor-pointer"
                title="Bu kullanıcının yetki ayarlarını diğer garsonlara aktarır"
              >
                <Copy size={13} />
                <span>Başka Garsona Kopyala</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              İptal
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-black transition-colors shadow-sm cursor-pointer"
            >
              <Check size={14} />
              <span>Kaydet ({changes.length > 0 ? `${changes.length} Değişiklik` : 'Tamam'})</span>
            </button>
          </div>
        </div>

        {/* ─── MODAL: CONFIRM RESET ─── */}
        {confirmResetOpen && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            role="dialog"
          >
            <div className="max-w-sm w-full bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <RotateCcw size={20} />
                <h4 className="text-sm font-black">Varsayılana Sıfırlansın mı?</h4>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {user.fullName} için tanımlanmış tüm özel yetki ayarları silinecek ve kullanıcı
                genel garson şablonuna dönecektir.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Evet, Sıfırla
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL: COPY TO OTHER WAITERS ─── */}
        {copyModalOpen && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            role="dialog"
          >
            <div className="max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-5 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <Copy size={16} className="text-amber-800 dark:text-amber-400" />
                  <h4 className="text-sm font-black text-stone-900 dark:text-stone-100">
                    Yetkileri Başka Garsona Kopyala
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setCopyModalOpen(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-stone-500">
                <strong>{user.fullName}</strong> kullanıcısının yetki ayarlarını aktarmak istediğiniz
                garsonları seçin:
              </p>

              <div className="max-h-60 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-2xl text-xs">
                {otherWaiters.map((w) => {
                  const isChecked = selectedCopyTargetIds.includes(w.id)
                  return (
                    <label
                      key={w.id}
                      className="p-3 flex items-center gap-3 hover:bg-amber-50/50 dark:hover:bg-stone-800/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCopyTargetIds((prev) => [...prev, w.id])
                          } else {
                            setSelectedCopyTargetIds((prev) => prev.filter((id) => id !== w.id))
                          }
                        }}
                        className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500 border-stone-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-stone-900 dark:text-stone-100">{w.fullName}</div>
                        <div className="text-[11px] text-stone-400 font-mono">@{w.username}</div>
                      </div>
                    </label>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCopyTargetIds.length === otherWaiters.length) {
                      setSelectedCopyTargetIds([])
                    } else {
                      setSelectedCopyTargetIds(otherWaiters.map((w) => w.id))
                    }
                  }}
                  className="text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline"
                >
                  {selectedCopyTargetIds.length === otherWaiters.length
                    ? 'Seçimi Temizle'
                    : 'Tümünü Seç'}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCopyModalOpen(false)}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    disabled={selectedCopyTargetIds.length === 0}
                    onClick={handleCopySubmit}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-amber-800 hover:bg-amber-900 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    Kopyala ({selectedCopyTargetIds.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
