import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search,
  Clock,
  ChevronLeft,
  ChevronRight,
  User,
  ShieldAlert,
  ShieldCheck,
  Link2,
  Archive,
} from 'lucide-react'
import {
  getActivityLogs,
  getArchivedActivityLogs,
  ACTIVITY_LOG_LABELS,
  verifyChainAndReport,
  archiveOldActivityLogs,
  type ChainVerificationResult,
} from '../lib/activityLog'
import { formatCurrency } from '../lib/format'
import { getAllUsers } from '../lib/auth'
import type { ActivityLog, BusinessDay, Table, Session } from '../types'

interface ActivityLogsViewProps {
  businessDays: BusinessDay[]
  openBusinessDay: BusinessDay | null
  tables: Table[]
  currentSession?: Session | null
  onNavigateHome?: () => void
}

export function ActivityLogsView({
  businessDays,
  openBusinessDay,
  tables,
  currentSession,
  onNavigateHome,
}: ActivityLogsViewProps) {
  const [logs, setLogs] = useState<ActivityLog[]>(() => getActivityLogs())
  const [archivedCount, setArchivedCount] = useState<number>(() => getArchivedActivityLogs().length)
  const [chainStatus, setChainStatus] = useState<ChainVerificationResult>(() =>
    verifyChainAndReport({ logIfBroken: false }),
  )
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null)

  const handleVerifyChain = useCallback(() => {
    const res = verifyChainAndReport({ logIfBroken: true })
    setChainStatus(res)
    setLogs(getActivityLogs())
    setVerifyNotice(res.message)
    setTimeout(() => setVerifyNotice(null), 5000)
  }, [])

  const handleArchiveOld = useCallback(() => {
    const actor = currentSession?.fullName || 'Yönetici'
    const res = archiveOldActivityLogs(500, actor)
    setLogs(getActivityLogs())
    setArchivedCount(getArchivedActivityLogs().length)
    setChainStatus(verifyChainAndReport({ logIfBroken: false }))
    setVerifyNotice(
      res.archivedCount > 0
        ? `${res.archivedCount} eski kayıt arşive taşındı ve zincir başlangıcına bağlandı.`
        : 'Arşivlenecek 500 kayıttan eski log bulunmuyor.',
    )
    setTimeout(() => setVerifyNotice(null), 5000)
  }, [currentSession])

  // Listen for real-time log additions
  useEffect(() => {
    const handleLogAdded = () => {
      setLogs(getActivityLogs())
      setArchivedCount(getArchivedActivityLogs().length)
      setChainStatus(verifyChainAndReport({ logIfBroken: false }))
    }
    window.addEventListener('activity-log-added', handleLogAdded)
    return () => window.removeEventListener('activity-log-added', handleLogAdded)
  }, [])

  // Filters state
  // Default day: openBusinessDay.id if exists, otherwise 'all'
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>(() =>
    openBusinessDay ? openBusinessDay.id : 'all',
  )
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all')
  const [selectedTableFilter, setSelectedTableFilter] = useState<string>('all')
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Database users
  const allUsers = useMemo(() => {
    try {
      return getAllUsers()
    } catch {
      return []
    }
  }, [])

  // Active users for primary select list (Sistem Yöneticisi, Garson 1-4, etc.)
  const activeUsers = useMemo(() => {
    return allUsers
      .filter((u) => !u.isDeleted && u.status === 'active')
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr-TR'))
  }, [allUsers])

  // Logs scoped to selected day filter
  const dayScopedLogs = useMemo(() => {
    if (selectedDayFilter === 'open') {
      if (!openBusinessDay) return []
      return logs.filter((l) => l.businessDayId === openBusinessDay.id)
    } else if (selectedDayFilter !== 'all') {
      return logs.filter((l) => l.businessDayId === selectedDayFilter)
    }
    return logs
  }, [logs, selectedDayFilter, openBusinessDay])

  // Inactive or deleted users that actually have logs in the selected day scope
  const legacyOrInactiveUsers = useMemo(() => {
    return allUsers
      .filter((u) => {
        const isCurrentActive = !u.isDeleted && u.status === 'active'
        if (isCurrentActive) return false
        return dayScopedLogs.some(
          (l) =>
            l.userId === u.id ||
            l.userName.toLowerCase() === u.fullName.toLowerCase() ||
            l.userName.toLowerCase() === u.username.toLowerCase(),
        )
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr-TR'))
  }, [allUsers, dayScopedLogs])

  // Unique tables: strictly existing active tables
  const uniqueTableNames = useMemo(() => {
    return tables.map((t) => t.name).sort((a, b) => a.localeCompare(b, 'tr-TR'))
  }, [tables])

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Day filter
      if (selectedDayFilter === 'open') {
        if (!openBusinessDay || log.businessDayId !== openBusinessDay.id) return false
      } else if (selectedDayFilter !== 'all') {
        if (log.businessDayId !== selectedDayFilter) return false
      }

      // Type filter
      if (selectedTypeFilter !== 'all') {
        if (selectedTypeFilter === 'refunds') {
          if (log.type !== 'item_refund' && log.type !== 'table_refund') return false
        } else if (selectedTypeFilter === 'items') {
          if (
            log.type !== 'item_add' &&
            log.type !== 'item_increase' &&
            log.type !== 'item_decrease' &&
            log.type !== 'item_remove'
          )
            return false
        } else if (selectedTypeFilter === 'payments') {
          if (log.type !== 'payment') return false
        } else if (selectedTypeFilter === 'auth') {
          if (
            log.type !== 'login' &&
            log.type !== 'logout' &&
            log.type !== 'session_timeout' &&
            log.type !== 'login_failed' &&
            log.type !== 'account_lockout'
          )
            return false
        } else if (selectedTypeFilter === 'user_mgmt') {
          if (
            log.type !== 'user_create' &&
            log.type !== 'user_update' &&
            log.type !== 'password_reset' &&
            log.type !== 'user_status_change' &&
            log.type !== 'user_delete' &&
            log.type !== 'permission_override_set' &&
            log.type !== 'permission_reset' &&
            log.type !== 'permission_copy' &&
            log.type !== 'permission_template_update' &&
            log.type !== 'unauthorized_attempt'
          )
            return false
        } else if (selectedTypeFilter === 'permissions') {
          if (
            log.type !== 'permission_override_set' &&
            log.type !== 'permission_reset' &&
            log.type !== 'permission_copy' &&
            log.type !== 'permission_template_update' &&
            log.type !== 'unauthorized_attempt'
          )
            return false
        } else if (selectedTypeFilter === 'tables') {
          if (
            log.type !== 'table_move' &&
            log.type !== 'table_merge' &&
            log.type !== 'table_split'
          )
            return false
        } else if (selectedTypeFilter === 'days') {
          if (log.type !== 'day_open' && log.type !== 'day_close') return false
        } else if (log.type !== selectedTypeFilter) {
          return false
        }
      }

      // Table filter
      if (selectedTableFilter !== 'all') {
        if (log.tableName !== selectedTableFilter) return false
      }

      // User filter (matches by User ID or fallback name matching)
      if (selectedUserFilter !== 'all') {
        if (log.userId) {
          if (log.userId !== selectedUserFilter) return false
        } else {
          const matchedUser = allUsers.find((u) => u.id === selectedUserFilter)
          if (
            !matchedUser ||
            (log.userName.toLowerCase() !== matchedUser.fullName.toLowerCase() &&
              log.userName.toLowerCase() !== matchedUser.username.toLowerCase())
          ) {
            return false
          }
        }
      }

      // Search query (in product, table, reason, details)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchProduct = log.productName?.toLowerCase().includes(q)
        const matchTable = log.tableName?.toLowerCase().includes(q)
        const matchReason = log.reason?.toLowerCase().includes(q)
        const matchDetails = log.details?.toLowerCase().includes(q)
        const matchUser = log.userName?.toLowerCase().includes(q)
        if (!matchProduct && !matchTable && !matchReason && !matchDetails && !matchUser) {
          return false
        }
      }

      return true
    })
  }, [
    logs,
    selectedDayFilter,
    selectedTypeFilter,
    selectedTableFilter,
    selectedUserFilter,
    searchQuery,
    openBusinessDay,
  ])

  // Total pages
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1

  // Paginated records
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, page, pageSize])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedDayFilter, selectedTypeFilter, selectedTableFilter, selectedUserFilter, searchQuery, pageSize])

  const formatLogTime = (dateStr: string) => {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      if (typeof dateStr === 'string' && /^\d{1,2}:\d{2}/.test(dateStr)) {
        return { timePart: dateStr.slice(0, 5), secondsPart: dateStr, datePart: '' }
      }
      return { timePart: '', secondsPart: '', datePart: '' }
    }
    const timePart = date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const secondsPart = date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const datePart = date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
    })
    return { timePart, secondsPart, datePart }
  }

  // Access check: only admins can access Activity Logs
  if (currentSession && currentSession.role !== 'admin') {
    return (
      <div className="flex-1 min-h-0 w-full overflow-y-auto flex items-center justify-center p-6">
        <div className="p-8 max-w-lg mx-auto text-center space-y-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-700 mx-auto grid place-items-center">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-black text-stone-900 dark:text-stone-100">
            Bu Sayfaya Erişim Yetkiniz Yok
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            İşlem Logu ekranı yalnızca Sistem Yöneticisi yetkisine sahip kullanıcılar tarafından görüntülenebilir.
          </p>
          {onNavigateHome && (
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-5 py-2.5 bg-amber-800 text-white font-bold rounded-xl text-xs hover:bg-amber-900 shadow-sm"
            >
              Masalar Ekranına Dön
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="activity-logs-container flex-1 min-h-0 w-full overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 animate-in fade-in duration-200 pb-16">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-stone-900 p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 grid place-items-center font-bold">
              <Clock size={18} />
            </span>
            <div>
              <h1 className="text-2xl font-black text-[#3b291f] dark:text-stone-100">
                İşlem Logu
              </h1>
              <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">
                Tüm sipariş, tur, iade, ödeme ve masa hareketlerinin değiştirilemez tarihçesi
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleVerifyChain}
            data-testid="verify-log-chain-btn"
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
              chainStatus.valid
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                : 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700 animate-pulse'
            }`}
            title="Tüm işlem loglarının SHA-256 hash zincirini baştan sona kontrol et"
          >
            {chainStatus.valid ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
            <span>Zinciri doğrula</span>
          </button>

          {logs.length > 500 && (
            <button
              type="button"
              onClick={handleArchiveOld}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-stone-200"
              title="Eski kayıtları arşiv tablosuna taşı ve son hash'i zincir başına bağla"
            >
              <Archive size={14} />
              <span>Eskileri Arşivle</span>
            </button>
          )}

          <div className="px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-sm font-extrabold text-stone-800 dark:text-stone-200">
            Toplam: <span className="text-amber-800 dark:text-amber-300 font-black">{filteredLogs.length}</span> / {logs.length} Kayıt
            {archivedCount > 0 && (
              <span className="ml-2 text-xs text-stone-500 font-bold">
                (+{archivedCount} Arşiv)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chain Integrity Alert / Verification Feedback */}
      {!chainStatus.valid && (
        <div
          data-testid="log-chain-broken-banner"
          className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border-2 border-rose-500 text-rose-900 dark:text-rose-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white grid place-items-center shrink-0 mt-0.5">
              <ShieldAlert size={22} />
            </div>
            <div className="space-y-1">
              <div className="font-black text-sm text-rose-900 dark:text-rose-100">
                GÜVENLİK UYARISI: İşlem Logu Hash Zincirinde Kırılma Tespit Edildi!
              </div>
              <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                {chainStatus.message}
              </p>
              {chainStatus.brokenLogId && (
                <div className="text-[11px] font-mono bg-rose-100/80 dark:bg-rose-900/50 px-2.5 py-1 rounded-lg inline-block text-rose-900 dark:text-rose-200">
                  Kırılma Başlangıç Kaydı ID: <strong>{chainStatus.brokenLogId}</strong>
                  {chainStatus.brokenLogCreatedAt && (
                    <span> · Zaman: {new Date(chainStatus.brokenLogCreatedAt).toLocaleString('tr-TR')}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {verifyNotice && chainStatus.valid && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>{verifyNotice}</span>
          </div>
          {chainStatus.headHash && (
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
              Zincir Başı: #{chainStatus.headHash.slice(0, 12)}
            </span>
          )}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Day Filter */}
          <div>
            <label className="block text-xs font-black text-stone-700 dark:text-stone-300 mb-1.5">
              İş Günü
            </label>
            <select
              value={selectedDayFilter}
              onChange={(e) => setSelectedDayFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {openBusinessDay && (
                <option value={openBusinessDay.id}>
                  🟢 Açık Gün ({new Date(openBusinessDay.openedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})
                </option>
              )}
              <option value="all">Tüm Günler</option>
              {businessDays
                .filter((d) => d.id !== openBusinessDay?.id)
                .map((day) => {
                  const openedDate = new Date(day.openedAt)
                  return (
                    <option key={day.id} value={day.id}>
                      {openedDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} ·{' '}
                      {openedDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}{' '}
                      ({day.status === 'open' ? 'Açık' : 'Kapalı'})
                    </option>
                  )
                })}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-xs font-black text-stone-700 dark:text-stone-300 mb-1.5">
              İşlem Türü
            </label>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tüm İşlemler</option>
              <option value="refunds">🔴 İadeler (Kalem & Masa)</option>
              <option value="items">📦 Ürün Değişiklikleri (+ / - / Silme)</option>
              <option value="payments">💳 Ödemeler</option>
              <option value="order_reopen">🔄 Adisyon Geri Açma</option>
              <option value="discount">🏷️ İndirimler</option>
              <option value="tables">🪑 Masa Hareketleri (Taşıma/Birleştirme)</option>
              <option value="days">☀️ Gün Açma / Kapama</option>
              <option value="auth">🔐 Giriş / Çıkış / Oturum</option>
              <option value="user_mgmt">👤 Personel / Kullanıcı Yönetimi</option>
              <option value="permissions">🛡️ Yetki Yönetimi & İhlaller</option>
              <option value="unauthorized_attempt">⚠️ Sadece Yetkisiz Denemeler</option>
              <option value="item_add">↳ Sadece Ürün Ekleme</option>
              <option value="item_refund">↳ Sadece Kalem İadesi</option>
              <option value="table_refund">↳ Sadece Masa İadesi</option>
            </select>
          </div>

          {/* Table Filter */}
          <div>
            <label className="block text-xs font-black text-stone-700 dark:text-stone-300 mb-1.5">
              Masa
            </label>
            <select
              value={selectedTableFilter}
              onChange={(e) => setSelectedTableFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tüm Masalar</option>
              {uniqueTableNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* User Filter (Matches by user ID, showing active users and scoped legacy users) */}
          <div>
            <label className="block text-xs font-black text-stone-700 dark:text-stone-300 mb-1.5">
              Kullanıcı
            </label>
            <select
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tüm Kullanıcılar</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
              {legacyOrInactiveUsers.length > 0 && (
                <optgroup label="Eski / silinmiş kullanıcılar">
                  {legacyOrInactiveUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} {u.isDeleted ? '(silinmiş)' : '(pasif)'}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-xs font-black text-stone-700 dark:text-stone-300 mb-1.5">
              Arama
            </label>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ürün, masa, neden..."
                className="w-full pl-9 pr-3 py-2 text-sm font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
        {paginatedLogs.length === 0 ? (
          <div className="p-12 text-center text-stone-500 dark:text-stone-400 space-y-2">
            <Clock size={36} className="mx-auto text-stone-300 dark:text-stone-600 stroke-[1.5]" />
            <div className="font-bold text-base">Kayıt Bulunamadı</div>
            <p className="text-sm text-stone-500">
              Seçilen filtrelere uygun herhangi bir işlem kaydı bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300 uppercase text-xs tracking-wider font-black">
                  <th className="py-3.5 px-4 w-32">Zaman</th>
                  <th className="py-3.5 px-4 w-32">Kullanıcı</th>
                  <th className="py-3.5 px-4 w-36">İşlem Türü</th>
                  <th className="py-3.5 px-4 w-28">Masa</th>
                  <th className="py-3.5 px-4">Detay & Değişiklik</th>
                  <th className="py-3.5 px-4 w-28 text-right">Tutar</th>
                  <th className="py-3.5 px-4 w-48">Neden / Açıklama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60 font-semibold">
                {paginatedLogs.map((log) => {
                  const { timePart, secondsPart, datePart } = formatLogTime(log.createdAt)
                  const typeMeta = ACTIVITY_LOG_LABELS[log.type] || {
                    label: log.type,
                    badgeClass: 'bg-stone-100 text-stone-800',
                  }
                  const isBrokenRow = !chainStatus.valid && chainStatus.brokenLogId === log.id

                  return (
                    <tr
                      key={log.id}
                      className={
                        isBrokenRow
                          ? 'bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-100 transition-colors'
                          : 'hover:bg-amber-50/30 dark:hover:bg-stone-800/40 transition-colors'
                      }
                    >
                      {/* Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div
                          className="font-black text-stone-900 dark:text-stone-100 text-sm"
                          title={`Tam zaman: ${secondsPart}`}
                        >
                          {timePart}
                        </div>
                        <div className="text-xs font-bold text-stone-500 dark:text-stone-400">
                          {datePart}
                        </div>
                        {log.hash && (
                          <div
                            className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono text-stone-400 dark:text-stone-500"
                            title={`Hash: ${log.hash}\nÖnceki: ${log.prevHash || '-'}`}
                          >
                            <Link2 size={10} />
                            <span>#{log.hash.slice(0, 8)}</span>
                          </div>
                        )}
                      </td>

                      {/* User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-black text-[#2d1e15] dark:text-stone-100 text-sm">
                          <User size={14} className="text-stone-500" />
                          <span>{log.userName}</span>
                        </div>
                        {log.userRole && (
                          <span className="text-xs text-stone-500 dark:text-stone-400 font-bold">
                            {log.userRole}
                          </span>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-3 py-1 rounded-lg text-xs font-black border ${typeMeta.badgeClass}`}
                        >
                          {typeMeta.label}
                        </span>
                      </td>

                      {/* Table */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.tableName ? (
                          <span className="font-black text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded-md text-xs">
                            {log.tableName}
                          </span>
                        ) : (
                          <span className="text-stone-400 font-bold">—</span>
                        )}
                      </td>

                      {/* Details */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {log.details ? (
                            <div className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                              {log.details}
                            </div>
                          ) : log.productName ? (
                            <div className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                              {log.productName}
                              {log.oldValue !== undefined && log.newValue !== undefined && (
                                <span className="ml-2 font-mono text-stone-600 dark:text-stone-400 text-xs font-bold">
                                  {log.oldValue} → <strong className="text-stone-950 dark:text-stone-50 font-black">{log.newValue}</strong>
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-stone-700 dark:text-stone-300 font-bold text-sm">
                              {typeMeta.label}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-black text-sm">
                        {typeof log.amount === 'number' && log.amount > 0 ? (
                          <span
                            className={
                              log.type === 'item_refund' || log.type === 'table_refund'
                                ? 'text-rose-600 dark:text-rose-400'
                                : log.type === 'discount'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }
                          >
                            {log.type === 'item_refund' || log.type === 'table_refund' ? '-' : ''}
                            {formatCurrency(log.amount)}
                          </span>
                        ) : (
                          <span className="text-stone-400 font-normal">—</span>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4">
                        {log.reason ? (
                          <div className="text-stone-800 dark:text-stone-200 text-xs font-bold bg-amber-50/80 dark:bg-amber-950/40 px-2.5 py-1 rounded-md border border-amber-200/70 dark:border-amber-900/50 inline-block">
                            {log.reason}
                          </div>
                        ) : (
                          <span className="text-stone-400 font-bold">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredLogs.length > 0 && (
          <div className="p-4 border-t border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-stone-50/50 dark:bg-stone-800/40 text-xs">
            <div className="flex items-center gap-4 text-stone-500 font-medium">
              <div>
                Sayfa <span className="font-bold text-stone-800 dark:text-stone-200">{page}</span> / {totalPages}
                <span className="ml-2 text-stone-400">({filteredLogs.length} kayıt)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-stone-400">Sayfa başı:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="px-2 py-0.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Önceki sayfa"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="px-3 text-xs font-bold text-stone-700 dark:text-stone-300">
                  {page}
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Sonraki sayfa"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
  )
}
