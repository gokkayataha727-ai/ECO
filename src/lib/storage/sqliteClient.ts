import type {
  ActivityLog,
  AppSettings,
  BusinessDay,
  CompletedOrder,
  Product,
  Refund,
  Table,
  User,
} from '../../types'
import { products as initialProducts } from '../../data/products'
import { initialTables } from '../../data/tables'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { CURRENT_MENU_CATALOG_VERSION } from './migrations'
import type { POSBackupFile } from './types'

export interface SqliteActionResult<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
  rolledBack?: boolean
  recoveredFromInterruption?: boolean
  migratedAt?: string
  retainUntil?: string
  summary?: Record<string, number>
}

export interface SqliteDatabaseStatus {
  dbPath: string
  pragmas: {
    journalMode: string
    synchronous: number
    foreignKeys: number
    busyTimeout: number
  }
  integrityOk: boolean
  corruptReplaced?: boolean
  integrityMessage?: string | null
  corruptionError: string | null
  quarantinedDbPath: string | null
  suggestedBackup: {
    fileName: string
    filePath: string
    createdAt: string
    type: string
    backup: POSBackupFile
  } | null
  migrationStatus: string | null
  migratedAt: string | null
}

export type SqliteSyncDispatcher = (action: string, payload?: any) => SqliteActionResult

let customSyncDispatcher: SqliteSyncDispatcher | null = null

/**
 * Registers an in-process SQLite dispatcher (used in tests or custom Electron bridges).
 */
export function setCustomSqliteDispatcher(dispatcher: SqliteSyncDispatcher | null): void {
  customSyncDispatcher = dispatcher
}

export function getActiveSqliteDispatcher(): SqliteSyncDispatcher | null {
  if (customSyncDispatcher) {
    return customSyncDispatcher
  }
  if (
    typeof window !== 'undefined' &&
    (window as any).electronAPI &&
    typeof (window as any).electronAPI.dbSync === 'function'
  ) {
    return (action: string, payload?: any) => (window as any).electronAPI.dbSync(action, payload)
  }
  return null
}

export function isSqliteBackendActive(): boolean {
  return getActiveSqliteDispatcher() !== null
}

export const isSqliteActive = isSqliteBackendActive

/**
 * Dispatches a critical storage error event to the UI so the cashier sees a red warning
 * and can recover from an automatic backup instead of silently losing sales in memory.
 */
export function emitCriticalStorageError(
  keyOrAction: string,
  error: unknown,
  suggestedBackup?: any,
): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[SQLite Storage] Critical error on "${keyOrAction}":`, message)
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('pos-storage-error', {
        detail: {
          key: keyOrAction,
          message,
          error: message,
          critical: true,
          source: 'sqlite',
          suggestedBackup: suggestedBackup || null,
          timestamp: new Date().toISOString(),
        },
      }),
    )
  }
}

export function invokeSqliteSync<T = any>(
  action: string,
  payload?: any,
): SqliteActionResult<T> {
  const dispatcher = getActiveSqliteDispatcher()
  if (!dispatcher) {
    return {
      success: false,
      error: 'SQLite IPC bağlantısı bulunamadı.',
    }
  }
  try {
    const res = dispatcher(action, payload)
    if (!res || typeof res !== 'object') {
      return { success: false, error: 'SQLite geçersiz yanıt döndürdü.' }
    }
    return res as SqliteActionResult<T>
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function getSqliteDatabaseStatus(): SqliteDatabaseStatus | null {
  const res = invokeSqliteSync<SqliteDatabaseStatus>('status')
  if (res.success && res.data) {
    if (!res.data.integrityOk) {
      emitCriticalStorageError(
        'PRAGMA integrity_check',
        res.data.corruptionError || 'Veritabanı bütünlük kontrolü başarısız oldu.',
        res.data.suggestedBackup?.backup || null,
      )
    }
    return res.data
  }
  return null
}

// ────────────────────────────────────────────────────────────
// Repository-compatible SQLite Operations
// ────────────────────────────────────────────────────────────

export function getTablesSqlite(): Table[] {
  const res = invokeSqliteSync<Table[] | null>('getTables')
  if (res.success && Array.isArray(res.data) && res.data.length > 0) {
    return res.data
  }
  return initialTables
}

export function saveTablesSqlite(tables: Table[]): boolean {
  const res = invokeSqliteSync('saveTables', tables)
  if (!res.success) {
    emitCriticalStorageError('tables', res.error || 'Masalar SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getCompletedOrdersSqlite(): CompletedOrder[] {
  const res = invokeSqliteSync<CompletedOrder[]>('getCompletedOrders')
  if (res.success && Array.isArray(res.data)) {
    return res.data
  }
  return []
}

export function saveCompletedOrdersSqlite(orders: CompletedOrder[]): boolean {
  const res = invokeSqliteSync('saveCompletedOrders', orders)
  if (!res.success) {
    emitCriticalStorageError('completedOrders', res.error || 'Siparişler SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getBusinessDaysSqlite(): BusinessDay[] {
  const res = invokeSqliteSync<BusinessDay[]>('getBusinessDays')
  if (res.success && Array.isArray(res.data)) {
    return res.data
  }
  return []
}

export function saveBusinessDaysSqlite(days: BusinessDay[]): boolean {
  const res = invokeSqliteSync('saveBusinessDays', days)
  if (!res.success) {
    emitCriticalStorageError('businessDays', res.error || 'İş günleri SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getMenuProductsSqlite(
  catalogVersion: string = CURRENT_MENU_CATALOG_VERSION,
): Product[] {
  const res = invokeSqliteSync<Product[] | null>('getMenuProducts')
  const existingProducts = res.success && Array.isArray(res.data) ? res.data : []

  const versionRes = invokeSqliteSync<string | null>('getKvItem', { key: 'menuCatalogVersion' })
  const currentVersion = versionRes.success ? versionRes.data : null

  if (currentVersion === catalogVersion && existingProducts.length > 0) {
    return existingProducts
  }

  if (existingProducts.length > 0) {
    const defaultIds = new Set(initialProducts.map((p) => p.id))
    const defaultNames = new Set(initialProducts.map((p) => p.name.toLowerCase().trim()))
    const userCreatedProducts = existingProducts.filter(
      (p) => !defaultIds.has(p.id) && !defaultNames.has(p.name.toLowerCase().trim()),
    )
    const merged: Product[] = [...initialProducts, ...userCreatedProducts]
    invokeSqliteSync('setKvItem', { key: 'menuCatalogVersion', value: catalogVersion })
    invokeSqliteSync('saveMenuProducts', merged)
    return merged
  }

  invokeSqliteSync('setKvItem', { key: 'menuCatalogVersion', value: catalogVersion })
  invokeSqliteSync('saveMenuProducts', initialProducts)
  return initialProducts
}

export function saveMenuProductsSqlite(products: Product[]): boolean {
  const res = invokeSqliteSync('saveMenuProducts', products)
  if (!res.success) {
    emitCriticalStorageError('menuProducts', res.error || 'Menü ürünleri SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getSettingsSqlite(): AppSettings {
  const res = invokeSqliteSync<AppSettings | null>('getSettings', DEFAULT_SETTINGS)
  if (res.success && res.data && typeof res.data === 'object') {
    return { ...DEFAULT_SETTINGS, ...res.data }
  }
  return DEFAULT_SETTINGS
}

export function saveSettingsSqlite(settings: AppSettings): boolean {
  const res = invokeSqliteSync('saveSettings', settings)
  if (!res.success) {
    emitCriticalStorageError('appSettings', res.error || 'Ayarlar SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getRefundsSqlite(): Refund[] {
  const res = invokeSqliteSync<Refund[]>('getRefunds')
  if (res.success && Array.isArray(res.data)) {
    return res.data
  }
  return []
}

export function saveRefundsSqlite(refunds: Refund[]): boolean {
  const res = invokeSqliteSync('saveRefunds', refunds)
  if (!res.success) {
    emitCriticalStorageError('refunds', res.error || 'İadeler SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getActivityLogsSqlite(): ActivityLog[] {
  const res = invokeSqliteSync<ActivityLog[]>('getActivityLogs')
  if (res.success && Array.isArray(res.data)) {
    return res.data
  }
  return []
}

export function saveActivityLogsSqlite(logs: ActivityLog[]): boolean {
  const res = invokeSqliteSync('saveActivityLogs', logs)
  if (!res.success) {
    emitCriticalStorageError('activityLogs', res.error || 'İşlem logları SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function prependActivityLogSqlite(log: ActivityLog): boolean {
  const res = invokeSqliteSync('prependActivityLog', log)
  if (!res.success) {
    emitCriticalStorageError('activityLogs', res.error || 'İşlem logu SQLite veritabanına eklenemedi.')
    return false
  }
  return true
}

export function archiveActivityLogsSqlite(keepCount: number): {
  archivedCount: number
  remainingCount: number
  archiveAnchorHash: string
} | null {
  const res = invokeSqliteSync<{
    archivedCount: number
    remainingCount: number
    archiveAnchorHash: string
  }>('archiveActivityLogs', { keepCount })
  if (res.success && res.data) {
    return res.data
  }
  return null
}

export function getArchivedActivityLogsSqlite(): ActivityLog[] {
  const res = invokeSqliteSync<ActivityLog[]>('getArchivedActivityLogs')
  if (res.success && Array.isArray(res.data)) {
    return res.data
  }
  return []
}

export function getMetaSqlite(key: string): string | null {
  const res = invokeSqliteSync<string | null>('getMeta', { key })
  return res.success && typeof res.data === 'string' ? res.data : null
}

export function setMetaSqlite(key: string, value: string): boolean {
  const res = invokeSqliteSync('setMeta', { key, value })
  return res.success
}

export function getUsersSqlite(): User[] {
  const res = invokeSqliteSync<User[]>('getUsers')
  if (res.success && Array.isArray(res.data)) {
    return res.data
  }
  return []
}

export function saveUsersSqlite(users: User[]): boolean {
  const res = invokeSqliteSync('saveUsers', users)
  if (!res.success) {
    emitCriticalStorageError('appUsers', res.error || 'Kullanıcılar SQLite veritabanına yazılamadı.')
    return false
  }
  return true
}

export function getUserPermissionOverridesSqlite(): Record<string, Record<string, boolean>> {
  const res = invokeSqliteSync<Record<string, Record<string, boolean>>>('getUserPermissionOverrides')
  if (res.success && res.data && typeof res.data === 'object') {
    return res.data
  }
  return {}
}

export function saveUserPermissionOverridesSqlite(
  overrides: Record<string, Record<string, boolean>>,
): boolean {
  const res = invokeSqliteSync('saveUserPermissionOverrides', { overrides })
  if (!res.success) {
    emitCriticalStorageError(
      'userPermissionOverrides',
      res.error || 'Kullanıcı yetkileri SQLite veritabanına yazılamadı.',
    )
    return false
  }
  return true
}

export function getKvItemSqlite(key: string): string | null {
  const res = invokeSqliteSync<string | null>('getKvItem', { key })
  return res.success && typeof res.data === 'string' ? res.data : null
}

export function setKvItemSqlite(key: string, value: string): boolean {
  const res = invokeSqliteSync('setKvItem', { key, value })
  if (!res.success) {
    emitCriticalStorageError(key, res.error || `"${key}" anahtarı SQLite veritabanına yazılamadı.`)
    return false
  }
  return true
}

export function removeKvItemSqlite(key: string): boolean {
  const res = invokeSqliteSync('removeKvItem', { key })
  return res.success
}

// ────────────────────────────────────────────────────────────
// Multi-step Atomic SQLite Transactions
// ────────────────────────────────────────────────────────────

export function executeCompleteOrderSqliteTx(params: {
  order: CompletedOrder
  tableId?: string
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:completeOrder', params)
  if (!res.success) {
    emitCriticalStorageError('tx:completeOrder', res.error || 'Adisyon kapatma işlemi başarısız oldu.')
  }
  return res
}

export function executeUpdateTablePaymentsSqliteTx(params: {
  table: Table
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:updateTablePayments', params)
  if (!res.success) {
    emitCriticalStorageError('tx:updateTablePayments', res.error || 'Ödeme kaydetme işlemi başarısız oldu.')
  }
  return res
}

export function executeRefundSqliteTx(params: {
  refund: Refund
  updatedTables?: Table[]
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:refund', params)
  if (!res.success) {
    emitCriticalStorageError('tx:refund', res.error || 'İade işlemi başarısız oldu.')
  }
  return res
}

export function executeReopenOrderSqliteTx(params: {
  orderId: string
  reopenedAt: string
  reopenedBy: string
  reopenReason: string
  updatedTables: Table[]
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:reopenOrder', params)
  if (!res.success) {
    emitCriticalStorageError('tx:reopenOrder', res.error || 'Adisyon geri açma işlemi başarısız oldu.')
  }
  return res
}

export function executeOpenBusinessDaySqliteTx(params: {
  businessDay: BusinessDay
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:openBusinessDay', params)
  if (!res.success) {
    emitCriticalStorageError('tx:openBusinessDay', res.error || 'İş günü açma işlemi başarısız oldu.')
  }
  return res
}

export function executeCloseBusinessDaySqliteTx(params: {
  closedDay: BusinessDay
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:closeBusinessDay', params)
  if (!res.success) {
    emitCriticalStorageError('tx:closeBusinessDay', res.error || 'İş günü kapatma işlemi başarısız oldu.')
  }
  return res
}

export function executeTransferMergeSplitTableSqliteTx(params: {
  updatedTables: Table[]
  activityLog?: ActivityLog
  options?: { failAtStep?: string }
}): SqliteActionResult {
  const res = invokeSqliteSync('tx:transferMergeSplitTable', params)
  if (!res.success) {
    emitCriticalStorageError(
      'tx:transferMergeSplitTable',
      res.error || 'Masa taşıma/birleştirme işlemi başarısız oldu.',
    )
  }
  return res
}
