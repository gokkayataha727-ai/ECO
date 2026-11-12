import { useState, useMemo } from 'react'
import {
  UserPlus,
  Search,
  KeyRound,
  Edit2,
  Trash2,
  Power,
  Shield,
  User as UserIcon,
  CheckCircle2,
  AlertTriangle,
  Shuffle,
  Eye,
  EyeOff,
  X,
  Lock,
  Sliders,
} from 'lucide-react'
import {
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  toggleUserStatus,
  softDeleteUser,
  getInitialWaitstaffPins,
  type WaitstaffPinRecord,
} from '../lib/auth'
import { getUserOverrideCount } from '../lib/permissions'
import { UserPermissionsModal } from './UserPermissionsModal'
import { TemplatePermissionsModal } from './TemplatePermissionsModal'
import {
  checkPasswordStrength,
  generateRandomPassword,
  generateSecurePin,
  validateStrongPassword,
  isSimplePin,
} from '../lib/crypto'
import type { AppSettings, Session, User } from '../types'

interface UserManagementViewProps {
  currentSession: Session | null
  settings: AppSettings
  onUpdateSettings: (settings: AppSettings) => void
}

export function UserManagementView({
  currentSession,
  settings: _settings,
  onUpdateSettings: _onUpdateSettings,
}: UserManagementViewProps) {
  const [users, setUsers] = useState<User[]>(() => getAllUsers())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Notification toast
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const reloadUsers = () => {
    setUsers(getAllUsers())
  }

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetPassUser, setResetPassUser] = useState<User | null>(null)
  const [confirmStatusUser, setConfirmStatusUser] = useState<User | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)
  const [selectedPermissionsUser, setSelectedPermissionsUser] = useState<User | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [initialPins] = useState<WaitstaffPinRecord[] | null>(() => getInitialWaitstaffPins())
  const [showPinsModal, setShowPinsModal] = useState(false)
  const [copiedPins, setCopiedPins] = useState(false)

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (u.isDeleted) return false

      if (statusFilter === 'active' && u.status !== 'active') return false
      if (statusFilter === 'inactive' && u.status !== 'inactive') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = u.fullName.toLowerCase().includes(q)
        const matchUsername = u.username.toLowerCase().includes(q)
        if (!matchName && !matchUsername) return false
      }

      return true
    })
  }, [users, statusFilter, searchQuery])

  // Count active / inactive
  const counts = useMemo(() => {
    const nonDeleted = users.filter((u) => !u.isDeleted)
    return {
      all: nonDeleted.length,
      active: nonDeleted.filter((u) => u.status === 'active').length,
      inactive: nonDeleted.filter((u) => u.status === 'inactive').length,
    }
  }, [users])

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold transition-all shadow-md ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.text}</span>
</div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <UserIcon size={17} className="text-amber-800 dark:text-amber-400" />
            Personel & Kullanıcı Listesi
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Sisteme giriş yapabilecek yönetici ve garsonları yönetin.
          </p>
</div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {initialPins && initialPins.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPinsModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              <KeyRound size={14} />
              <span>Garson PIN Kartı</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            <UserPlus size={15} />
            <span>Yeni Personel Ekle</span>
          </button>
</div>
</div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-100/60 dark:bg-stone-850 p-3 rounded-2xl border border-stone-200 dark:border-stone-800">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute inset-y-0 left-3 my-auto text-stone-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="İsim veya kullanıcı adı ile ara..."
            className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
</div>

        <div className="flex items-center gap-1.5 bg-stone-200/70 dark:bg-stone-800 p-1 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Tümü ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Aktif ({counts.active})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === 'inactive'
                ? 'bg-stone-600 text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            Pasif ({counts.inactive})
          </button>
</div>
</div>

      {/* Users Table */}
      <div className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-100/80 dark:bg-stone-800/80 border-b border-stone-200 dark:border-stone-800 text-[11px] font-black uppercase tracking-wider text-stone-600 dark:text-stone-400">
                <th className="py-3 px-4">Kullanıcı</th>
                <th className="py-3 px-3">Rol</th>
                <th className="py-3 px-3">Giriş Türü</th>
                <th className="py-3 px-3">Durum</th>
                <th className="py-3 px-3">Yetkiler</th>
                <th className="py-3 px-3">Son Giriş</th>
                <th className="py-3 px-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-400 font-semibold">
                    Kriterlere uygun kullanıcı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = currentSession?.userId === u.id
                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-amber-50/40 dark:hover:bg-stone-850/50 transition-colors ${
                        u.status === 'inactive' ? 'opacity-60 bg-stone-50/50 dark:bg-stone-950/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              u.role === 'admin'
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                            }`}
                          >
                            {u.fullName.charAt(0).toUpperCase()}
                  </div>
                          <div>
                            <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                              {u.fullName}
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded font-bold">
                                  Siz
                                </span>
                              )}
                    </div>
                            <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                              @{u.username}
                    </div>
                  </div>
                </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          {u.role === 'admin' ? (
                            <>
                              <Shield size={11} /> Yönetici
                            </>
                          ) : (
                            <>
                              <UserIcon size={11} /> Garson
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-stone-600 dark:text-stone-400 font-semibold text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Lock size={12} className="text-stone-400" />
                          <span>Şifre</span>
                          {u.pinHash && (
                            <span className="text-[10px] bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded text-amber-800 dark:text-amber-400 font-bold">
                              + PIN
                            </span>
                          )}
                </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.status === 'active' ? 'bg-emerald-600 animate-pulse' : 'bg-stone-400'
                            }`}
                          />
                          {u.status === 'active' ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            <Shield size={11} /> Tüm Yetkiler
                          </span>
                        ) : (
                          (() => {
                            const count = getUserOverrideCount(u.id)
                            return count > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                Özel · {count} değişiklik
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                                Varsayılan
                              </span>
                            )
                          })()
                        )}
                      </td>

                      <td className="py-3 px-3 text-[11px] text-stone-500 dark:text-stone-400">
                        {u.lastLoginAt ? (
                          new Intl.DateTimeFormat('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(u.lastLoginAt))
                        ) : (
                          <span className="text-stone-400 italic">Henüz giriş yapmadı</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedPermissionsUser(u)}
                            disabled={u.role === 'admin'}
                            title={
                              u.role === 'admin'
                                ? 'Yönetici tüm yetkilere sahiptir ve kısıtlanamaz'
                                : 'Yetkileri Düzenle'
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.role === 'admin'
                                ? 'opacity-30 cursor-not-allowed text-stone-400'
                                : 'text-purple-700 hover:text-purple-900 hover:bg-purple-100/60 dark:text-purple-400 dark:hover:bg-stone-800 cursor-pointer'
                            }`}
                          >
                            <Shield size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditUser(u)}
                            title="Bilgileri Düzenle"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-amber-800 hover:bg-amber-100/60 dark:hover:bg-stone-800 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setResetPassUser(u)}
                            title="Şifre / PIN Sıfırla"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-amber-800 hover:bg-amber-100/60 dark:hover:bg-stone-800 transition-colors"
                          >
                            <KeyRound size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmStatusUser(u)}
                            disabled={isCurrent}
                            title={
                              isCurrent
                                ? 'Kendi hesabınızı pasife alamazsınız'
                                : u.status === 'active'
                                ? 'Pasife Al'
                                : 'Yeniden Aktif Et'
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCurrent
                                ? 'opacity-30 cursor-not-allowed text-stone-400'
                                : u.status === 'active'
                                ? 'text-amber-700 hover:bg-amber-100/60 dark:text-amber-400 dark:hover:bg-stone-800'
                                : 'text-emerald-700 hover:bg-emerald-100/60 dark:text-emerald-400 dark:hover:bg-stone-800'
                            }`}
                          >
                            <Power size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser(u)}
                            disabled={isCurrent}
                            title={isCurrent ? 'Kendi hesabınızı silemezsiniz' : 'Sil (Arşivle)'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCurrent
                                ? 'opacity-30 cursor-not-allowed text-stone-400'
                                : 'text-rose-600 hover:bg-rose-100/60 dark:hover:bg-stone-800'
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
</div>
</div>

      {/* Role-Based Global Default Permissions Template */}
      <div className="pt-4 border-t border-stone-200 dark:border-stone-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
              <Shield size={14} className="text-amber-800 dark:text-amber-400" />
              Varsayılan Garson Yetkileri (Genel Şablon)
            </h4>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
              Bu genel yetki şablonu, kendisine özel yetki atanmamış tüm garsonlar ve yeni eklenecek personeller için geçerlidir.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setTemplateModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
          >
            <Sliders size={14} />
            <span>Genel Şablonu Düzenle</span>
          </button>
        </div>
      </div>

      {/* ─── MODAL: CREATE NEW USER ─── */}
      {createModalOpen && (
        <CreateUserModal
          onClose={() => setCreateModalOpen(false)}
          onSuccess={(created) => {
            setCreateModalOpen(false)
            reloadUsers()
            showToast(`${created.fullName} başarıyla eklendi.`)
          }}
          currentSession={currentSession}
        />
      )}

      {/* ─── MODAL: EDIT USER ─── */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={(updated) => {
            setEditUser(null)
            reloadUsers()
            showToast(`${updated.fullName} güncellendi.`)
          }}
          currentSession={currentSession}
        />
      )}

      {/* ─── MODAL: RESET PASSWORD ─── */}
      {resetPassUser && (
        <ResetPasswordModal
          user={resetPassUser}
          onClose={() => setResetPassUser(null)}
          onSuccess={() => {
            setResetPassUser(null)
            reloadUsers()
            showToast('Şifre / PIN başarıyla sıfırlandı.')
          }}
          currentSession={currentSession}
        />
      )}

      {/* ─── MODAL: CONFIRM STATUS TOGGLE ─── */}
      {confirmStatusUser && (
        <ConfirmStatusModal
          user={confirmStatusUser}
          onClose={() => setConfirmStatusUser(null)}
          onConfirm={() => {
            const res = toggleUserStatus(confirmStatusUser.id, currentSession)
            if (res.success) {
              setConfirmStatusUser(null)
              reloadUsers()
              showToast(
                `${confirmStatusUser.fullName} ${
                  confirmStatusUser.status === 'active' ? 'pasife alındı' : 'aktif edildi'
                }.`,
              )
            } else {
              showToast(res.error || 'İşlem gerçekleştirilemedi.', 'error')
            }
          }}
        />
      )}

      {/* ─── MODAL: CONFIRM SOFT DELETE ─── */}
      {confirmDeleteUser && (
        <ConfirmDeleteModal
          user={confirmDeleteUser}
          onClose={() => setConfirmDeleteUser(null)}
          onConfirm={() => {
            const res = softDeleteUser(confirmDeleteUser.id, currentSession)
            if (res.success) {
              setConfirmDeleteUser(null)
              reloadUsers()
              showToast(`${confirmDeleteUser.fullName} silindi (geçmiş kayıtlar korundu).`)
            } else {
              showToast(res.error || 'İşlem gerçekleştirilemedi.', 'error')
            }
          }}
        />
      )}
      {/* ─── MODAL: BAŞLANGIÇ PIN BİLGİLERİ ─── */}
      {showPinsModal && initialPins && (
        <div
          className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-amber-800 dark:text-amber-400" />
                <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
                  Garson Başlangıç PIN Kodları
                </h3>
              </div>
              <button type="button" onClick={() => setShowPinsModal(false)} className="close-button">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-stone-500">
              Sistem kurulumunda otomatik üretilen benzersiz garson PIN kodları. Bu kodlar hash&apos;lenerek saklanır.
            </p>

            <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden text-xs">
              {initialPins.map((w) => (
                <div key={w.userId} className="p-3 flex items-center justify-between bg-stone-50 dark:bg-stone-850">
                  <div>
                    <span className="font-extrabold text-stone-900 dark:text-stone-100">{w.fullName}</span>
                    <span className="text-[11px] text-stone-400 ml-1.5 font-mono">(@{w.username})</span>
                  </div>
                  <div className="px-3 py-1 bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-800 rounded-lg font-mono font-black text-sm text-amber-800 dark:text-amber-300 tracking-widest">
                    {w.pin}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const text = initialPins
                    .map((p) => `${p.fullName} (@${p.username}): PIN ${p.pin}`)
                    .join('\n')
                  navigator.clipboard.writeText(text)
                  setCopiedPins(true)
                  setTimeout(() => setCopiedPins(false), 3000)
                }}
                className="outline-action flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
              >
                {copiedPins ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Shuffle size={14} />}
                <span>{copiedPins ? 'Kopyalandı!' : 'Tümünü Kopyala'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPinsModal(false)}
                className="solid-action flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold py-2.5 text-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: USER PERMISSIONS ─── */}
      {selectedPermissionsUser && (
        <UserPermissionsModal
          user={selectedPermissionsUser}
          allUsers={users}
          currentSession={currentSession}
          isOpen={Boolean(selectedPermissionsUser)}
          onClose={() => setSelectedPermissionsUser(null)}
          onSuccess={(msg) => {
            reloadUsers()
            showToast(msg)
          }}
        />
      )}

      {/* ─── MODAL: DEFAULT TEMPLATE PERMISSIONS ─── */}
      {templateModalOpen && (
        <TemplatePermissionsModal
          currentSession={currentSession}
          isOpen={templateModalOpen}
          onClose={() => setTemplateModalOpen(false)}
          onSuccess={(msg) => {
            reloadUsers()
            showToast(msg)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB-MODALS
// ─────────────────────────────────────────────────────────────

interface CreateUserModalProps {
  onClose: () => void
  onSuccess: (user: User) => void
  currentSession: Session | null
}

function CreateUserModal({ onClose, onSuccess, currentSession }: CreateUserModalProps) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'admin' | 'waiter'>('waiter')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [useDefaultPermissions, setUseDefaultPermissions] = useState(true)

  const strength = checkPasswordStrength(password)

  const handleRandomizePassword = () => {
    setPassword(generateRandomPassword())
  }

  const handleRandomizePin = () => {
    setPin(generateSecurePin())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (role === 'admin') {
      if (!password) {
        setError('Yönetici hesabı için güçlü bir şifre belirlenmesi zorunludur.')
        return
      }
      const val = validateStrongPassword(password)
      if (!val.valid) {
        setError(val.error || 'Şifre kriterleri karşılanmıyor.')
        return
      }
    } else {
      if (pin && isSimplePin(pin)) {
        setError('Basit veya ardışık PIN kodları (1234, 0000, 1111 vb.) kullanılamaz.')
        return
      }
    }

    setLoading(true)

    try {
      const res = await createUser(
        {
          fullName,
          username,
          password: password || undefined,
          pin: pin || undefined,
          role,
        },
        currentSession,
      )

      if (res.success && res.user) {
        onSuccess(res.user)
      } else {
        setError(res.error || 'Kullanıcı oluşturulurken bir hata oluştu.')
      }
    } catch {
      setError('Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="modal max-w-lg w-full bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-5">
        <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-amber-800 dark:text-amber-400" />
            <h3 className="text-base font-black text-stone-900 dark:text-stone-100">Yeni Personel Ekle</h3>
  </div>
          <button type="button" onClick={onClose} className="close-button">
            <X size={16} />
          </button>
</div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
  </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Ad Soyad *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn: Mehmet Demir"
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              />
    </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                Kullanıcı Adı *
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="mehmetd"
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono"
              />
    </div>
  </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">Rol</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('waiter')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'waiter'
                    ? 'border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                    : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                }`}
              >
                <UserIcon size={14} /> Garson (Varsayılan)
              </button>

              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'admin'
                    ? 'border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                    : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                }`}
              >
                <Shield size={14} /> Yönetici
              </button>
    </div>
  </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Giriş Şifresi
              </label>
              <button
                type="button"
                onClick={handleRandomizePassword}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <Shuffle size={12} /> Rastgele Şifre Üret
              </button>
    </div>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={role === 'admin' ? 'En az 10 karakter (harf + rakam)' : 'Otomatik güçlü şifre atanır'}
                className="w-full px-3 pr-9 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(!showPass)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
    </div>

            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold">
                <span className="text-stone-500">Güç:</span>
                <span className={strength.color.split(' ')[0]}>{strength.label}</span>
      </div>
            )}
  </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Hızlı Garson PIN Kodu (4-6 Haneli)
              </label>
              <button
                type="button"
                onClick={handleRandomizePin}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <Shuffle size={12} /> Rastgele PIN Üret
              </button>
    </div>
            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Örn: 2468 (Dokunmatik ekranda hızlı giriş için)"
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono tracking-widest"
            />
          </div>

          {role === 'waiter' && (
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDefaultPermissions}
                  onChange={(e) => setUseDefaultPermissions(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500 border-stone-300"
                />
                <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  Varsayılan garson yetkileriyle oluştur
                </span>
              </label>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 pl-6">
                Personel eklendikten sonra yetkilerini kullanıcı tablosundaki kalkan simgesinden dilediğiniz gibi özelleştirebilirsiniz.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="outline-action flex-1">
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !fullName || !username}
              className="solid-action flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold"
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditUserModalProps {
  user: User
  onClose: () => void
  onSuccess: (user: User) => void
  currentSession: Session | null
}

function EditUserModal({ user, onClose, onSuccess, currentSession }: EditUserModalProps) {
  const [fullName, setFullName] = useState(user.fullName)
  const [username, setUsername] = useState(user.username)
  const [role, setRole] = useState<'admin' | 'waiter'>(user.role)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await updateUser(user.id, { fullName, username, role }, currentSession)
      if (res.success && res.user) {
        onSuccess(res.user)
      } else {
        setError(res.error || 'Güncelleme başarısız.')
      }
    } catch {
      setError('Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
          <h3 className="text-base font-black text-stone-900 dark:text-stone-100">Kullanıcıyı Düzenle</h3>
          <button type="button" onClick={onClose} className="close-button">
            <X size={16} />
          </button>
</div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
  </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Ad Soyad
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
            />
  </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono"
            />
  </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">Rol</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('waiter')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'waiter'
                    ? 'border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                    : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                }`}
              >
                <UserIcon size={14} /> Garson
              </button>

              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  role === 'admin'
                    ? 'border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                    : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                }`}
              >
                <Shield size={14} /> Yönetici
              </button>
    </div>
  </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="outline-action flex-1">
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !fullName || !username}
              className="solid-action flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold"
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ResetPasswordModalProps {
  user: User
  onClose: () => void
  onSuccess: () => void
  currentSession: Session | null
}

function ResetPasswordModal({ user, onClose, onSuccess, currentSession }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [mustChange, setMustChange] = useState(true)
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword && newPassword.trim()) {
      const val = validateStrongPassword(newPassword)
      if (!val.valid) {
        setError(val.error || 'Şifre kriterleri karşılanmıyor.')
        return
      }
    }

    if (newPin && newPin.trim()) {
      if (isSimplePin(newPin.trim())) {
        setError('Basit veya ardışık PIN kodları (1234, 0000, 1111 vb.) kullanılamaz.')
        return
      }
    }

    setLoading(true)

    try {
      const res = await resetUserPassword(
        user.id,
        newPassword || undefined,
        newPin || undefined,
        mustChange,
        currentSession,
      )
      if (res.success) {
        onSuccess()
      } else {
        setError(res.error || 'Sıfırlama başarısız.')
      }
    } catch {
      setError('Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="modal max-w-md w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-amber-800 dark:text-amber-400" />
            <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
              Şifre / PIN Sıfırla
            </h3>
  </div>
          <button type="button" onClick={onClose} className="close-button">
            <X size={16} />
          </button>
</div>

        <p className="text-xs text-stone-600 dark:text-stone-400">
          <strong>{user.fullName}</strong> (@{user.username}) hesabı için yeni kimlik bilgisi belirleyin.
        </p>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
  </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">Yeni Şifre</label>
              <button
                type="button"
                onClick={() => setNewPassword(generateRandomPassword())}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <Shuffle size={12} /> Rastgele Üret
              </button>
    </div>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Değiştirmek istemiyorsanız boş bırakın"
                className="w-full px-3 pr-9 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(!showPass)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
    </div>
  </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Yeni PIN (4-6 Haneli)
              </label>
              <button
                type="button"
                onClick={() => setNewPin(generateSecurePin())}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <Shuffle size={12} /> Rastgele PIN Üret
              </button>
    </div>
            <input
              type="text"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Değiştirmek istemiyorsanız boş bırakın"
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-mono tracking-widest"
            />
  </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mustChange}
              onChange={(e) => setMustChange(e.target.checked)}
              className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500 border-stone-300"
            />
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              Kullanıcı ilk girişte şifresini değiştirmek zorunda olsun
            </span>
          </label>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="outline-action flex-1">
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || (!newPassword && !newPin)}
              className="solid-action flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold"
            >
              Şifreyi Güncelle
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmStatusModal({
  user,
  onClose,
  onConfirm,
}: {
  user: User
  onClose: () => void
  onConfirm: () => void
}) {
  const isDeactivating = user.status === 'active'

  return (
    <div className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="modal max-w-sm w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 text-center">
        <div
          className={`w-12 h-12 rounded-2xl mx-auto grid place-items-center ${
            isDeactivating
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
          }`}
        >
          <Power size={22} />
</div>

        <div>
          <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
            {isDeactivating ? 'Kullanıcıyı Pasife Al' : 'Kullanıcıyı Yeniden Aktif Et'}
          </h3>
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
            <strong>{user.fullName}</strong> (@{user.username}){' '}
            {isDeactivating ? (
              <>
                hesabını pasife almak üzeresiniz. Kullanıcı sisteme giriş yapamaz, açık oturumu varsa anında sonlandırılır. Geçmiş sipariş ve işlem logları eksiksiz korunur.
              </>
            ) : (
              <>hesabı yeniden aktif edilecek ve sisteme giriş yapabilecektir.</>
            )}
          </p>
</div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="outline-action flex-1">
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`solid-action flex-1 text-white font-bold ${
              isDeactivating ? 'bg-amber-800 hover:bg-amber-900' : 'bg-emerald-700 hover:bg-emerald-800'
            }`}
          >
            {isDeactivating ? 'Evet, Pasife Al' : 'Aktif Et'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({
  user,
  onClose,
  onConfirm,
}: {
  user: User
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="modal max-w-sm w-full bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 text-center">
        <div className="w-12 h-12 rounded-2xl mx-auto grid place-items-center bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
          <Trash2 size={22} />
</div>

        <div>
          <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
            Kullanıcıyı Sil (Arşivle)
          </h3>
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
            <strong>{user.fullName}</strong> (@{user.username}) kullanıcı listesinden ve girişten kaldırılacaktır.
          </p>
          <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl text-[11px] text-amber-900 dark:text-amber-200 text-left">
            <strong>Güvenli Silme (Soft-Delete):</strong> Bu kullanıcının geçmişte aldığı siparişler, yaptığı iadeler ve işlem loglarındaki kayıtları bozulmaz, ismi korunmaya devam eder.
  </div>
</div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="outline-action flex-1">
            İptal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="solid-action flex-1 bg-rose-700 hover:bg-rose-800 text-white font-bold"
          >
            Evet, Sil
          </button>
        </div>
      </div>
    </div>
  )
}
