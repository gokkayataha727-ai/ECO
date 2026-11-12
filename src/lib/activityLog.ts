import type { ActivityLog, ActivityLogType, Table, User } from '../types'
import { generateUUID } from './uuid'
import { sha256HexSync } from './crypto'
import {
  getActivityLogsSafe,
  saveActivityLogsSafe,
  prependActivityLogSqlite,
  archiveActivityLogsSqlite,
  getArchivedActivityLogsSqlite,
  getMetaSqlite,
  setMetaSqlite,
  safeGetItem,
  safeSetItem,
} from './storage/repository'
import { isSqliteActive } from './storage/sqliteClient'

export const GENESIS_LOG_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000'
export const ARCHIVE_ANCHOR_META_KEY = 'activity_logs_archive_anchor_hash'
export const CHAIN_HEAD_META_KEY = 'activity_logs_head_hash'
export const ARCHIVE_STORAGE_KEY = 'activityLogsArchive'

export interface ChainVerificationResult {
  valid: boolean
  totalChecked: number
  anchorHash: string
  headHash?: string
  brokenAtIndex?: number
  brokenChronologicalIndex?: number
  brokenLogId?: string
  brokenLogCreatedAt?: string
  brokenLogType?: ActivityLogType
  expectedPrevHash?: string
  actualPrevHash?: string
  expectedHash?: string
  actualHash?: string
  reason?: 'missing_hash' | 'prev_hash_mismatch' | 'hash_mismatch' | 'head_truncated'
  message: string
}

let lastChainVerificationResult: ChainVerificationResult | null = null
let lastReportedBrokenSignature: string | null = null

/**
 * Computes the deterministic SHA-256 hash of an ActivityLog entry linked to `prevHash`.
 * Matches `computeActivityLogHashCjs` in `electron/db/repository.cjs`.
 */
export function computeActivityLogHash(
  log: Omit<ActivityLog, 'hash'>,
  prevHash: string = GENESIS_LOG_HASH,
): string {
  const amountKurus =
    log.amount !== undefined && log.amount !== null && Number.isFinite(Number(log.amount))
      ? Math.round(Number(log.amount) * 100)
      : null
  const canonicalPayload = JSON.stringify([
    String(prevHash || GENESIS_LOG_HASH),
    String(log.id ?? ''),
    String(log.createdAt ?? ''),
    String(log.businessDayId ?? ''),
    String(log.type ?? ''),
    String(log.tableName ?? ''),
    String(log.tableId ?? ''),
    String(log.orderId ?? ''),
    String(log.productName ?? ''),
    log.oldValue !== undefined && log.oldValue !== null ? String(log.oldValue) : '',
    log.newValue !== undefined && log.newValue !== null ? String(log.newValue) : '',
    amountKurus !== null ? String(amountKurus) : '',
    String(log.reason ?? ''),
    String(log.userName ?? ''),
    String(log.userRole ?? ''),
    String(log.userId ?? ''),
    String(log.details ?? ''),
  ])
  return sha256HexSync(canonicalPayload)
}

export function getArchiveAnchorHash(): string {
  if (isSqliteActive()) {
    const metaAnchor = getMetaSqlite(ARCHIVE_ANCHOR_META_KEY)
    if (metaAnchor) return metaAnchor
  }
  const localAnchor = safeGetItem(ARCHIVE_ANCHOR_META_KEY)
  return localAnchor || GENESIS_LOG_HASH
}

export function setArchiveAnchorHash(anchorHash: string): void {
  if (isSqliteActive()) {
    setMetaSqlite(ARCHIVE_ANCHOR_META_KEY, anchorHash)
  }
  safeSetItem(ARCHIVE_ANCHOR_META_KEY, anchorHash)
}

export function getActivityLogs(): ActivityLog[] {
  return getActivityLogsSafe()
}

export function getArchivedActivityLogs(): ActivityLog[] {
  if (isSqliteActive()) {
    return getArchivedActivityLogsSqlite()
  }
  const raw = safeGetItem(ARCHIVE_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Backfills hash chain on legacy unhashed logs once (only if NO logs in the list have a hash yet).
 * Never alters any record that already has a hash.
 */
export function sealLegacyActivityLogsIfNeeded(): boolean {
  const logs = getActivityLogs()
  if (logs.length === 0) return false

  const anyHashed = logs.some((l) => Boolean(l.hash || l.prevHash))
  if (anyHashed) return false

  const anchor = getArchiveAnchorHash()
  let currentPrev = anchor
  const cloned = logs.map((l) => ({ ...l }))
  for (let i = cloned.length - 1; i >= 0; i--) {
    const item = cloned[i]
    item.prevHash = currentPrev
    item.hash = computeActivityLogHash(item, currentPrev)
    currentPrev = item.hash
  }

  saveActivityLogsSafe(cloned)
  return true
}

// StrictMode veya hızlı çift çağrılarda aynı işlemi mükerrer loglamayı önlemek için son log takibi
let lastLogPayload: string | null = null
let lastLogTimestamp = 0

export function logActivity(entry: {
  businessDayId?: string
  type: ActivityLogType
  tableName?: string
  tableId?: string
  orderId?: string
  productName?: string
  oldValue?: string | number
  newValue?: string | number
  amount?: number
  reason?: string
  userName: string
  userRole?: string
  userId?: string
  details?: string
  operationId?: string
}): ActivityLog {
  const now = Date.now()
  // İdempotent imza: son 600ms içinde aynı tip, masa, ürün ve değerler gelirse mükerrer kaydı engelle
  const signature = `${entry.type}|${entry.tableId || entry.tableName || ''}|${entry.productName || ''}|${entry.oldValue ?? ''}|${entry.newValue ?? ''}|${entry.details || ''}`
  if (lastLogPayload === signature && now - lastLogTimestamp < 600) {
    const current = getActivityLogs()
    if (current.length > 0) return current[0]
  }
  lastLogPayload = signature
  lastLogTimestamp = now

  sealLegacyActivityLogsIfNeeded()
  const current = getActivityLogs()
  const prevHash =
    current.length > 0 && current[0].hash ? current[0].hash : getArchiveAnchorHash()

  const baseLog: Omit<ActivityLog, 'hash'> = {
    id: entry.operationId || generateUUID(),
    createdAt: new Date().toISOString(),
    businessDayId: entry.businessDayId,
    type: entry.type,
    tableName: entry.tableName,
    tableId: entry.tableId,
    orderId: entry.orderId,
    productName: entry.productName,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    amount: entry.amount,
    reason: entry.reason,
    userName: entry.userName || 'Kullanıcı',
    userRole: entry.userRole || 'Kasiyer',
    userId: entry.userId,
    details: entry.details,
    prevHash,
  }

  const hash = computeActivityLogHash(baseLog, prevHash)
  const newLog: ActivityLog = {
    ...baseLog,
    hash,
  }

  try {
    if (isSqliteActive()) {
      prependActivityLogSqlite(newLog)
    } else {
      const updated = [newLog, ...current]
      saveActivityLogsSafe(updated)
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('activity-log-added', { detail: newLog }))
    }
  } catch (err) {
    console.error('Failed to save activity log', err)
  }

  return newLog
}

/**
 * Verifies the SHA-256 hash chain across all activity logs from oldest to newest.
 * Detects:
 * 1. Modifying any field of any record (`hash_mismatch`)
 * 2. Deleting a record from the chain (`prev_hash_mismatch`)
 * 3. Inserting a record in the middle or stripping hashes (`missing_hash` or `prev_hash_mismatch`)
 */
export function verifyActivityLogChain(
  customLogs?: ActivityLog[],
  options?: { archiveAnchorHash?: string } | string,
): ChainVerificationResult {
  const logs = customLogs ?? getActivityLogs()
  const anchorHash =
    typeof options === 'string'
      ? options
      : options?.archiveAnchorHash ?? getArchiveAnchorHash()

  if (!Array.isArray(logs) || logs.length === 0) {
    return {
      valid: true,
      totalChecked: 0,
      anchorHash,
      headHash: anchorHash,
      message: 'Log zinciri geçerli (henüz kayıt yok).',
    }
  }

  let expectedPrevHash = anchorHash

  // Walk chronologically: oldest is at logs[logs.length - 1], newest is at logs[0]
  for (let i = logs.length - 1; i >= 0; i--) {
    const entry = logs[i]
    const chronoIdx = logs.length - 1 - i

    if (!entry.prevHash || !entry.hash) {
      return {
        valid: false,
        totalChecked: chronoIdx + 1,
        anchorHash,
        brokenAtIndex: i,
        brokenChronologicalIndex: chronoIdx,
        brokenLogId: entry.id,
        brokenLogCreatedAt: entry.createdAt,
        brokenLogType: entry.type,
        expectedPrevHash,
        actualPrevHash: entry.prevHash,
        reason: 'missing_hash',
        message: `Log zinciri kırık: #${chronoIdx + 1}. kayıtta (${entry.id}) hash bilgisi eksik veya silinmiş.`,
      }
    }

    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalChecked: chronoIdx + 1,
        anchorHash,
        brokenAtIndex: i,
        brokenChronologicalIndex: chronoIdx,
        brokenLogId: entry.id,
        brokenLogCreatedAt: entry.createdAt,
        brokenLogType: entry.type,
        expectedPrevHash,
        actualPrevHash: entry.prevHash,
        reason: 'prev_hash_mismatch',
        message: `Log zinciri kırık: #${chronoIdx + 1}. kayıtta (${entry.id}) önceki kayıt bağlantısı (prevHash) uyuşmuyor (aradan kayıt silinmiş veya araya kayıt eklenmiş).`,
      }
    }

    const recomputedHash = computeActivityLogHash(entry, entry.prevHash)
    if (recomputedHash !== entry.hash) {
      return {
        valid: false,
        totalChecked: chronoIdx + 1,
        anchorHash,
        brokenAtIndex: i,
        brokenChronologicalIndex: chronoIdx,
        brokenLogId: entry.id,
        brokenLogCreatedAt: entry.createdAt,
        brokenLogType: entry.type,
        expectedPrevHash,
        actualPrevHash: entry.prevHash,
        expectedHash: recomputedHash,
        actualHash: entry.hash,
        reason: 'hash_mismatch',
        message: `Log zinciri kırık: #${chronoIdx + 1}. kaydın (${entry.id}) içeriği değiştirilmiş (hash uyuşmazlığı).`,
      }
    }

    expectedPrevHash = entry.hash
  }

  return {
    valid: true,
    totalChecked: logs.length,
    anchorHash,
    headHash: expectedPrevHash,
    message: `Log zinciri doğrulandı (${logs.length} kayıt incelendi, bütünlük tam).`,
  }
}

/**
 * Runs full chain verification, updates the cached health status, dispatches UI events,
 * and logs a `log_chain_broken` security event if tampering is detected.
 */
export function verifyChainAndReport(options?: {
  logIfBroken?: boolean
}): ChainVerificationResult {
  sealLegacyActivityLogsIfNeeded()
  const result = verifyActivityLogChain()
  lastChainVerificationResult = result

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('pos-log-chain-status', { detail: result }))
  }

  if (!result.valid && options?.logIfBroken !== false) {
    const brokenSig = `${result.brokenLogId || 'none'}|${result.reason || 'unknown'}`
    if (lastReportedBrokenSignature !== brokenSig) {
      lastReportedBrokenSignature = brokenSig
      try {
        if (
          typeof window !== 'undefined' &&
          (window as any).electronAPI &&
          typeof (window as any).electronAPI.writeSystemLog === 'function'
        ) {
          ;(window as any).electronAPI.writeSystemLog({
            level: 'error',
            category: 'SECURITY_LOG_CHAIN',
            message: result.message,
            meta: {
              brokenLogId: result.brokenLogId,
              brokenLogCreatedAt: result.brokenLogCreatedAt,
              brokenAtIndex: result.brokenAtIndex,
              reason: result.reason,
            },
          })
        }
      } catch {}

      logActivity({
        type: 'log_chain_broken',
        userName: 'Sistem Güvenliği',
        userRole: 'Sistem',
        reason: result.reason,
        details: result.message,
      })
    }
  } else if (result.valid) {
    lastReportedBrokenSignature = null
  }

  return result
}

export function getLastChainVerificationResult(): ChainVerificationResult {
  if (!lastChainVerificationResult) {
    lastChainVerificationResult = verifyActivityLogChain()
  }
  return lastChainVerificationResult
}

/**
 * Archives old activity logs beyond `keepCount` into the archive table and links
 * the archive's latest hash (`archiveAnchorHash`) to the beginning of the main chain.
 */
export function archiveOldActivityLogs(
  keepCount: number = 500,
  actorName: string = 'Yönetici',
): {
  archivedCount: number
  remainingCount: number
  archiveAnchorHash: string
} {
  const safeKeep = Math.max(0, Math.floor(keepCount))
  sealLegacyActivityLogsIfNeeded()

  if (isSqliteActive()) {
    const res = archiveActivityLogsSqlite(safeKeep)
    if (res) {
      if (res.archivedCount > 0) {
        logActivity({
          type: 'log_archive',
          userName: actorName,
          userRole: 'Yönetici',
          details: `${res.archivedCount} eski log kaydı arşive taşındı (Arşiv Kök Hash: ${res.archiveAnchorHash.slice(0, 12)}...)`,
        })
        return {
          ...res,
          remainingCount: res.remainingCount + 1,
        }
      }
      return res
    }
  }

  const logs = getActivityLogs()
  if (logs.length <= safeKeep) {
    return {
      archivedCount: 0,
      remainingCount: logs.length,
      archiveAnchorHash: getArchiveAnchorHash(),
    }
  }

  const remaining = logs.slice(0, safeKeep)
  const toArchive = logs.slice(safeKeep)
  const newestArchived = toArchive[0]
  const newAnchorHash = newestArchived.hash || GENESIS_LOG_HASH

  const existingArchive = getArchivedActivityLogs()
  const updatedArchive = [...toArchive, ...existingArchive]
  safeSetItem(ARCHIVE_STORAGE_KEY, JSON.stringify(updatedArchive))
  setArchiveAnchorHash(newAnchorHash)
  saveActivityLogsSafe(remaining)

  logActivity({
    type: 'log_archive',
    userName: actorName,
    userRole: 'Yönetici',
    details: `${toArchive.length} eski log kaydı arşive taşındı (Arşiv Kök Hash: ${newAnchorHash.slice(0, 12)}...)`,
  })

  return {
    archivedCount: toArchive.length,
    remainingCount: remaining.length + 1,
    archiveAnchorHash: newAnchorHash,
  }
}

/**
 * İŞ 3 Migrasyonu: Eski (henüz hash zincirine girmemiş) log kayıtlarında userId alanı eksik olanları
 * kullanıcı ID'sine bağlar. Hash'lenmiş kayıtlar değiştirilemez (append-only) olduğu için onlara dokunulmaz.
 */
export function migrateActivityLogsUsers(users: User[]): { migratedCount: number } {
  try {
    const logs = getActivityLogs()
    if (logs.length === 0) return { migratedCount: 0 }

    // Eğer kayıtlar zaten hash zincirine alınmışsa hiçbir kaydı değiştirme (append-only kuralı)
    const anyHashed = logs.some((l) => Boolean(l.hash || l.prevHash))
    if (anyHashed) {
      return { migratedCount: 0 }
    }

    const adminUser = users.find((u) => !u.isDeleted && u.role === 'admin')
    let migratedCount = 0

    const updated = logs.map((log) => {
      if (log.userId) return log

      const matchedUser = users.find(
        (u) =>
          u.fullName.toLowerCase() === log.userName.toLowerCase() ||
          u.username.toLowerCase() === log.userName.toLowerCase(),
      )

      if (matchedUser) {
        migratedCount++
        return {
          ...log,
          userId: matchedUser.id,
          userName: matchedUser.fullName,
        }
      }

      if (
        adminUser &&
        (log.userName.toLowerCase() === 'admin' ||
          log.userName.toLowerCase().includes('sistem yönetici') ||
          log.userRole?.toLowerCase() === 'admin')
      ) {
        migratedCount++
        return {
          ...log,
          userId: adminUser.id,
          userName: adminUser.fullName,
        }
      }

      if (log.userName === 'LEMOON' || log.userName.toLowerCase() === 'kasiyer') {
        migratedCount++
        return {
          ...log,
          userId: 'legacy-lemoon',
          userName: 'LEMOON (Eski Kayıt)',
        }
      }

      return log
    })

    if (migratedCount > 0) {
      saveActivityLogsSafe(updated)
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('activity-log-added', { detail: null }))
      }
    } else {
      sealLegacyActivityLogsIfNeeded()
    }

    return { migratedCount }
  } catch (err) {
    console.error('Failed to migrate activity logs users', err)
    return { migratedCount: 0 }
  }
}

/**
 * İŞ 1: Masa sepetlerindeki eksik veya bozuk addedAt alanlarını İşlem Logu'ndaki
 * "item_add" kayıtlarının zamanından geri doldurur (backfill).
 */
export function backfillCartItemsTime(tables: Table[]): { updatedTables: Table[]; changed: boolean } {
  try {
    const logs = getActivityLogs()
    let changed = false

    const updatedTables = tables.map((t) => {
      if (!t.cart || t.cart.length === 0) return t

      const newCart = t.cart.map((item) => {
        // Eğer zaten geçerli bir ISO tarihi varsa veya saat bilgisi düzgünse dokunma
        const isValidDate = item.addedAt && !isNaN(new Date(item.addedAt).getTime())
        const isTimeFormat = item.addedAt && /^\d{1,2}:\d{2}/.test(item.addedAt)
        if (isValidDate || isTimeFormat) {
          return item
        }

        // Loglarda bu masaya ve bu ürüne ait en son item_add kaydını bul
        const matchingLog = logs.find(
          (l) =>
            l.type === 'item_add' &&
            (l.tableId === t.id || l.tableName === t.name) &&
            l.productName === item.name,
        )

        if (matchingLog && matchingLog.createdAt) {
          changed = true
          return {
            ...item,
            addedAt: matchingLog.createdAt,
          }
        }

        return item
      })

      return { ...t, cart: newCart }
    })

    return { updatedTables, changed }
  } catch {
    return { updatedTables: tables, changed: false }
  }
}


export const ACTIVITY_LOG_LABELS: Record<ActivityLogType, { label: string; badgeClass: string }> = {
  item_add: {
    label: 'Ürün Eklendi',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  item_increase: {
    label: 'Adet Artırıldı',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  item_decrease: {
    label: 'Adet Azaltıldı',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  item_remove: {
    label: 'Sepetten Silindi',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  item_refund: {
    label: 'Ürün İadesi',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  table_refund: {
    label: 'Masa İadesi',
    badgeClass: 'bg-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-700 font-bold',
  },
  order_reopen: {
    label: 'Adisyon Geri Açıldı',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  payment: {
    label: 'Ödeme Alındı',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  },
  discount: {
    label: 'İndirim Uygulandı',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  },
  item_discount: {
    label: 'Kalem İndirimi',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  },
  order_discount: {
    label: 'Masa İndirimi',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  table_move: {
    label: 'Masa Taşıma',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  table_merge: {
    label: 'Masa Birleştirme',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  table_split: {
    label: 'Masa Ayırma',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  },
  note_change: {
    label: 'Not / Müşteri Değişti',
    badgeClass: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700',
  },
  day_open: {
    label: 'Gün Açıldı',
    badgeClass: 'bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-700',
  },
  day_close: {
    label: 'Gün Kapatıldı',
    badgeClass: 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-200 border-stone-300 dark:border-stone-600',
  },
  login: {
    label: 'Giriş Yapıldı',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  },
  logout: {
    label: 'Çıkış Yapıldı',
    badgeClass: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-300 dark:border-stone-700',
  },
  session_timeout: {
    label: 'Zaman Aşımı (Çıkış)',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold',
  },
  login_failed: {
    label: 'Hatalı Giriş Denemesi',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-700 font-semibold',
  },
  account_lockout: {
    label: 'Hesap Kilitlendi',
    badgeClass: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800 font-bold',
  },
  user_create: {
    label: 'Kullanıcı Eklendi',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  },
  user_update: {
    label: 'Kullanıcı Güncellendi',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
  },
  password_reset: {
    label: 'Şifre/PIN Sıfırlandı',
    badgeClass: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300 border-violet-300 dark:border-violet-700',
  },
  user_status_change: {
    label: 'Durum Değişti (Pasif/Aktif)',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  },
  user_delete: {
    label: 'Kullanıcı Silindi',
    badgeClass: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800 font-bold',
  },
  permission_override_set: {
    label: 'Özel Yetki Değişti',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-bold',
  },
  permission_reset: {
    label: 'Yetkiler Sıfırlandı',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  permission_copy: {
    label: 'Yetkiler Kopyalandı',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  permission_template_update: {
    label: 'Garson Şablonu Güncellendi',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800 font-bold',
  },
  unauthorized_attempt: {
    label: 'Yetkisiz İşlem Denemesi',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-700 font-extrabold',
  },
  product_delete: {
    label: 'Menü Ürünü Silindi',
    badgeClass: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200 border-red-300 dark:border-red-700 font-bold',
  },
  backup_restore: {
    label: 'Yedekten Geri Yüklendi',
    badgeClass: 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200 border-orange-300 dark:border-orange-700 font-bold',
  },
  log_chain_broken: {
    label: 'Log Zinciri Kırılması',
    badgeClass: 'bg-red-600 text-white border-red-700 font-extrabold',
  },
  log_archive: {
    label: 'Log Arşivleme',
    badgeClass: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 font-semibold',
  },
  crash_recovery: {
    label: 'Çökme Toparlama',
    badgeClass: 'bg-amber-200 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold',
  },
}

/**
 * Adım 6A gereği log kayıtları yalnızca eklenebilir (append-only).
 * Mevcut logların silinmesi hash zincirini kıracağından bu fonksiyon yalnızca
 * henüz hash zincirine girmemiş eski kayıtlar varsa ilk mühürlemeden önce çalışır,
 * hash'lenmiş hiçbir kaydı silmez.
 */
export function cleanupSpuriousDiscountLogs(): void {
  try {
    const logs = getActivityLogs()
    if (!Array.isArray(logs) || logs.length === 0) return
    const anyHashed = logs.some((l) => Boolean(l.hash || l.prevHash))
    if (anyHashed) {
      // Append-only kuralı: Hash zinciri aktifken hiçbir log kaydı silinmez
      return
    }
    const cleaned = logs.filter(
      (l) => !(l.type === 'order_discount' && (l.details === 'Masa indirimi sıfırlandı' || l.newValue === 0)),
    )
    if (cleaned.length !== logs.length) {
      saveActivityLogsSafe(cleaned)
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('activity-log-added'))
      }
    }
  } catch (e) {
    console.error('cleanupSpuriousDiscountLogs error', e)
  }
}
