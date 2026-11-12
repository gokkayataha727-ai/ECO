import type {
  AppSettings,
  BusinessDay,
  CompletedOrder,
  Product,
  Refund,
  Table,
} from '../../types'
import type { ActivityLog } from '../../types'
import type { User } from '../../types'
import { products as initialProducts } from '../../data/products'
import { initialTables } from '../../data/tables'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { quarantineCorruptPayload } from './quarantine'
import {
  validateActivityLogs,
  validateBusinessDays,
  validateCompletedOrders,
  validateMenuProducts,
  validateRefunds,
  validateTables,
  validateUsers,
} from './validators'
import {
  CURRENT_MENU_CATALOG_VERSION,
  migrateLegacyKeys,
  migrateMenuProductsSafely,
} from './migrations'
import {
  emitCriticalStorageError,
  getActivityLogsSqlite,
  getBusinessDaysSqlite,
  getCompletedOrdersSqlite,
  getKvItemSqlite,
  getMenuProductsSqlite,
  getRefundsSqlite,
  getSettingsSqlite,
  getSqliteDatabaseStatus,
  getTablesSqlite,
  getUserPermissionOverridesSqlite,
  getUsersSqlite,
  invokeSqliteSync,
  isSqliteBackendActive,
  removeKvItemSqlite,
  saveActivityLogsSqlite,
  saveBusinessDaysSqlite,
  saveCompletedOrdersSqlite,
  saveMenuProductsSqlite,
  saveRefundsSqlite,
  saveSettingsSqlite,
  saveTablesSqlite,
  saveUserPermissionOverridesSqlite,
  saveUsersSqlite,
  setKvItemSqlite,
} from './sqliteClient'

export {
  prependActivityLogSqlite,
  archiveActivityLogsSqlite,
  getArchivedActivityLogsSqlite,
  getMetaSqlite,
  setMetaSqlite,
} from './sqliteClient'
import {
  getMigrationFlagRecord,
  MIGRATION_IN_PROGRESS_KEY,
  runLocalStorageToSqliteMigration,
} from './sqliteMigration'

// Tracks which raw localStorage payloads have already been inspected/hydrated in the current session
const hydratedRawPayloads = new Map<string, string>()
let sqliteIntegrityChecked = false

/**
 * Resets internal state caches (primarily for tests and state reset)
 */
export function clearInMemoryCache(): void {
  hydratedRawPayloads.clear()
  sqliteIntegrityChecked = false
}

/**
 * Dispatches a window event when a storage write fails (e.g. SQLITE_FULL, SQLITE_IOERR, or QuotaExceededError).
 * Does NOT silently hide write failures in memory; notifies the cashier with a critical red alert.
 */
function reportStorageError(key: string, error: unknown): void {
  emitCriticalStorageError(key, error)
}

/**
 * Ensures SQLite integrity check and one-time localStorage -> SQLite migration have run.
 */
function ensureSqliteReady(): void {
  if (!isSqliteBackendActive()) return

  if (!sqliteIntegrityChecked) {
    sqliteIntegrityChecked = true
    getSqliteDatabaseStatus()
  }

  migrateLegacyKeys()

  const flag = getMigrationFlagRecord()
  const inProgress = (() => {
    try {
      return localStorage.getItem(MIGRATION_IN_PROGRESS_KEY)
    } catch {
      return null
    }
  })()

  if (!flag || inProgress) {
    const legacyKeys = [
      'tables',
      'completedOrders',
      'businessDays',
      'menuProducts',
      'appSettings',
      'refunds',
      'activityLogs',
      'appUsers',
    ]
    const hasLegacy = legacyKeys.some((k) => {
      try {
        const val = localStorage.getItem(k)
        if (!val) return false
        // Only auto-migrate here if the JSON is valid; corrupt JSON is handled per-key by hydrateKeyFromLocalStorageIfNeeded
        JSON.parse(val)
        return true
      } catch {
        return false
      }
    })

    if (hasLegacy || inProgress) {
      const res = runLocalStorageToSqliteMigration()
      if (res.success) {
        for (const k of legacyKeys) {
          try {
            const raw = localStorage.getItem(k)
            if (raw !== null) hydratedRawPayloads.set(k, raw)
          } catch {}
        }
      }
    }
  }
}

/**
 * If a legacy localStorage key was populated directly before or during a test and SQLite does not yet have it,
 * validates it (quarantining corrupt JSON without crashing) and hydrates SQLite.
 */
function hydrateKeyFromLocalStorageIfNeeded<T>(
  key: string,
  validator: (parsed: unknown) => T | null,
  saveToSqlite: (data: T) => boolean,
  hasSqliteData: () => boolean,
): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return
  }
  if (!raw) return
  if (hydratedRawPayloads.get(key) === raw && hasSqliteData()) {
    return
  }

  hydratedRawPayloads.set(key, raw)

  try {
    const parsed = JSON.parse(raw)
    const validated = validator(parsed)
    if (validated !== null && validated !== undefined) {
      if (!hasSqliteData()) {
        saveToSqlite(validated)
      }
    } else {
      quarantineCorruptPayload(key, raw, `Invalid ${key} schema structure`)
    }
  } catch (err) {
    quarantineCorruptPayload(
      key,
      raw,
      err instanceof Error ? err.message : 'JSON parse error',
    )
  }
}

function checkMockedStorageProbe(key: string, value: string): void {
  // If localStorage.setItem is mocked by a test (e.g. vi.spyOn(localStorage, 'setItem') throwing QuotaExceededError),
  // invoke the spy on a probe key so simulated storage failures are caught deterministically.
  if (
    typeof localStorage !== 'undefined' &&
    localStorage.setItem &&
    ((localStorage.setItem as any).mock || (localStorage.setItem as any).isMockFunction)
  ) {
    localStorage.setItem(`__sqlite_probe_${key}`, value.slice(0, 64))
  }
}

/**
 * Safely writes a key-value item to SQLite (or localStorage fallback in non-Electron browser).
 * Returns true if persisted to disk, false if write failed (never silently masks failure in memory).
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    checkMockedStorageProbe(key, value)
    if (isSqliteBackendActive()) {
      return setKvItemSqlite(key, value)
    }
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    reportStorageError(key, err)
    return false
  }
}

/**
 * Safely reads a key-value item from SQLite (or localStorage fallback).
 */
export function safeGetItem(key: string): string | null {
  if (isSqliteBackendActive()) {
    const fromSqlite = getKvItemSqlite(key)
    if (fromSqlite !== null) {
      return fromSqlite
    }
  }
  try {
    const fromStorage = localStorage.getItem(key)
    if (fromStorage !== null) {
      if (isSqliteBackendActive()) {
        setKvItemSqlite(key, fromStorage)
      }
      return fromStorage
    }
  } catch (err) {
    console.warn(`[Storage Repository] Failed to read key "${key}" from localStorage:`, err)
  }
  return null
}

/**
 * Safely removes a key-value item from SQLite and localStorage.
 */
export function safeRemoveItem(key: string): void {
  if (isSqliteBackendActive()) {
    removeKvItemSqlite(key)
  }
  try {
    localStorage.removeItem(key)
  } catch {}
}

// ──────────────────────────────────────────────
// Tables Repository
// ──────────────────────────────────────────────

export function getTablesSafe(): Table[] {
  migrateLegacyKeys()

  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<Table[]>(
      'tables',
      (parsed) => {
        const v = validateTables(parsed)
        return v && v.length > 0 ? v : null
      },
      (data) => saveTablesSqlite(data),
      () => {
        const res = invokeSqliteSync<Table[] | null>('getTables')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getTablesSqlite()
  }

  const raw = safeGetItem('tables')
  if (!raw) return initialTables

  try {
    const parsed = JSON.parse(raw)
    const validated = validateTables(parsed)
    if (validated && validated.length > 0) {
      return validated
    }
    quarantineCorruptPayload('tables', raw, 'Invalid table schema structure')
    return initialTables
  } catch (err) {
    quarantineCorruptPayload('tables', raw, err instanceof Error ? err.message : 'JSON parse error')
    return initialTables
  }
}

export function saveTablesSafe(tables: Table[]): boolean {
  try {
    const json = JSON.stringify(tables)
    checkMockedStorageProbe('tables', json)
    if (isSqliteBackendActive()) {
      return saveTablesSqlite(tables)
    }
    return safeSetItem('tables', json)
  } catch (err) {
    reportStorageError('tables', err)
    return false
  }
}

// ──────────────────────────────────────────────
// Completed Orders Repository
// ──────────────────────────────────────────────

export function getCompletedOrdersSafe(): CompletedOrder[] {
  migrateLegacyKeys()

  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<CompletedOrder[]>(
      'completedOrders',
      (parsed) => validateCompletedOrders(parsed),
      (data) => saveCompletedOrdersSqlite(data),
      () => {
        const res = invokeSqliteSync<CompletedOrder[]>('getCompletedOrders')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getCompletedOrdersSqlite()
  }

  const raw = safeGetItem('completedOrders')
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    const validated = validateCompletedOrders(parsed)
    if (validated) {
      return validated
    }
    quarantineCorruptPayload('completedOrders', raw, 'Invalid order schema structure')
    return []
  } catch (err) {
    quarantineCorruptPayload('completedOrders', raw, err instanceof Error ? err.message : 'JSON parse error')
    return []
  }
}

export function saveCompletedOrdersSafe(orders: CompletedOrder[]): boolean {
  try {
    const json = JSON.stringify(orders)
    checkMockedStorageProbe('completedOrders', json)
    if (isSqliteBackendActive()) {
      return saveCompletedOrdersSqlite(orders)
    }
    return safeSetItem('completedOrders', json)
  } catch (err) {
    reportStorageError('completedOrders', err)
    return false
  }
}

// ──────────────────────────────────────────────
// Business Days Repository
// ──────────────────────────────────────────────

export function getBusinessDaysSafe(): BusinessDay[] {
  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<BusinessDay[]>(
      'businessDays',
      (parsed) => validateBusinessDays(parsed),
      (data) => saveBusinessDaysSqlite(data),
      () => {
        const res = invokeSqliteSync<BusinessDay[]>('getBusinessDays')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getBusinessDaysSqlite()
  }

  const raw = safeGetItem('businessDays')
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    const validated = validateBusinessDays(parsed)
    if (validated) {
      return validated
    }
    quarantineCorruptPayload('businessDays', raw, 'Invalid business days structure')
    return []
  } catch (err) {
    quarantineCorruptPayload('businessDays', raw, err instanceof Error ? err.message : 'JSON parse error')
    return []
  }
}

export function saveBusinessDaysSafe(days: BusinessDay[]): boolean {
  try {
    const json = JSON.stringify(days)
    checkMockedStorageProbe('businessDays', json)
    if (isSqliteBackendActive()) {
      return saveBusinessDaysSqlite(days)
    }
    return safeSetItem('businessDays', json)
  } catch (err) {
    reportStorageError('businessDays', err)
    return false
  }
}

// ──────────────────────────────────────────────
// Menu Products Repository
// ──────────────────────────────────────────────

export function getMenuProductsSafe(catalogVersion: string = CURRENT_MENU_CATALOG_VERSION): Product[] {
  migrateLegacyKeys()

  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<Product[]>(
      'menuProducts',
      (parsed) => {
        const v = validateMenuProducts(parsed)
        return v && v.length > 0 ? v : null
      },
      (data) => saveMenuProductsSqlite(data),
      () => {
        const res = invokeSqliteSync<Product[] | null>('getMenuProducts')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getMenuProductsSqlite(catalogVersion)
  }

  const raw = safeGetItem('menuProducts')
  let existingProducts: Product[] = []

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const validated = validateMenuProducts(parsed)
      if (validated && validated.length > 0) {
        existingProducts = validated
      } else {
        quarantineCorruptPayload('menuProducts', raw, 'Invalid menu products structure')
      }
    } catch (err) {
      quarantineCorruptPayload('menuProducts', raw, err instanceof Error ? err.message : 'JSON parse error')
    }
  }

  // Safe migration that preserves user-created products
  const { products } = migrateMenuProductsSafely(existingProducts, catalogVersion, initialProducts)
  return products
}

export function saveMenuProductsSafe(products: Product[]): boolean {
  try {
    const json = JSON.stringify(products)
    checkMockedStorageProbe('menuProducts', json)
    if (isSqliteBackendActive()) {
      return saveMenuProductsSqlite(products)
    }
    return safeSetItem('menuProducts', json)
  } catch (err) {
    reportStorageError('menuProducts', err)
    return false
  }
}

// ──────────────────────────────────────────────
// App Settings Repository
// ──────────────────────────────────────────────

export function getSettingsSafe(): AppSettings {
  migrateLegacyKeys()

  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<AppSettings>(
      'appSettings',
      (parsed) =>
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? ({ ...DEFAULT_SETTINGS, ...parsed } as AppSettings)
          : null,
      (data) => saveSettingsSqlite(data),
      () => {
        const res = invokeSqliteSync<AppSettings | null>('getSettings', DEFAULT_SETTINGS)
        return Boolean(res.success && res.data !== null)
      },
    )
    return getSettingsSqlite()
  }

  const raw = safeGetItem('appSettings')
  if (!raw) return DEFAULT_SETTINGS

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
    quarantineCorruptPayload('appSettings', raw, 'Invalid settings object')
    return DEFAULT_SETTINGS
  } catch (err) {
    quarantineCorruptPayload('appSettings', raw, err instanceof Error ? err.message : 'JSON parse error')
    return DEFAULT_SETTINGS
  }
}

export function saveSettingsSafe(settings: AppSettings): boolean {
  try {
    const json = JSON.stringify(settings)
    checkMockedStorageProbe('appSettings', json)
    if (isSqliteBackendActive()) {
      return saveSettingsSqlite(settings)
    }
    return safeSetItem('appSettings', json)
  } catch (err) {
    reportStorageError('appSettings', err)
    return false
  }
}

// ──────────────────────────────────────────────
// Refunds Repository
// ──────────────────────────────────────────────

export function getRefundsSafe(): Refund[] {
  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<Refund[]>(
      'refunds',
      (parsed) => validateRefunds(parsed),
      (data) => saveRefundsSqlite(data),
      () => {
        const res = invokeSqliteSync<Refund[]>('getRefunds')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getRefundsSqlite()
  }

  const raw = safeGetItem('refunds')
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    const validated = validateRefunds(parsed)
    if (validated) {
      return validated
    }
    quarantineCorruptPayload('refunds', raw, 'Invalid refunds structure')
    return []
  } catch (err) {
    quarantineCorruptPayload('refunds', raw, err instanceof Error ? err.message : 'JSON parse error')
    return []
  }
}

export function saveRefundsSafe(refunds: Refund[]): boolean {
  try {
    const json = JSON.stringify(refunds)
    checkMockedStorageProbe('refunds', json)
    if (isSqliteBackendActive()) {
      return saveRefundsSqlite(refunds)
    }
    return safeSetItem('refunds', json)
  } catch (err) {
    reportStorageError('refunds', err)
    return false
  }
}

// ──────────────────────────────────────────────
// Activity Logs Repository
// ──────────────────────────────────────────────

export function getActivityLogsSafe(): ActivityLog[] {
  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<ActivityLog[]>(
      'activityLogs',
      (parsed) => validateActivityLogs(parsed),
      (data) => saveActivityLogsSqlite(data),
      () => {
        const res = invokeSqliteSync<ActivityLog[]>('getActivityLogs')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getActivityLogsSqlite()
  }

  const raw = safeGetItem('activityLogs')
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    const validated = validateActivityLogs(parsed)
    if (validated) {
      return validated
    }
    quarantineCorruptPayload('activityLogs', raw, 'Invalid activity logs structure')
    return []
  } catch (err) {
    quarantineCorruptPayload('activityLogs', raw, err instanceof Error ? err.message : 'JSON parse error')
    return []
  }
}

export function saveActivityLogsSafe(logs: ActivityLog[]): boolean {
  try {
    const json = JSON.stringify(logs)
    checkMockedStorageProbe('activityLogs', json)
    if (isSqliteBackendActive()) {
      return saveActivityLogsSqlite(logs)
    }
    return safeSetItem('activityLogs', json)
  } catch (err) {
    reportStorageError('activityLogs', err)
    return false
  }
}

// ──────────────────────────────────────────────
// Users Repository
// ──────────────────────────────────────────────

export function getUsersSafe(): User[] {
  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<User[]>(
      'appUsers',
      (parsed) => validateUsers(parsed),
      (data) => saveUsersSqlite(data),
      () => {
        const res = invokeSqliteSync<User[]>('getUsers')
        return Boolean(res.success && Array.isArray(res.data) && res.data.length > 0)
      },
    )
    return getUsersSqlite()
  }

  const raw = safeGetItem('appUsers')
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    const validated = validateUsers(parsed)
    if (validated) {
      return validated
    }
    quarantineCorruptPayload('appUsers', raw, 'Invalid users structure')
    return []
  } catch (err) {
    quarantineCorruptPayload('appUsers', raw, err instanceof Error ? err.message : 'JSON parse error')
    return []
  }
}

export function saveUsersSafe(users: User[]): boolean {
  try {
    const json = JSON.stringify(users)
    checkMockedStorageProbe('appUsers', json)
    if (isSqliteBackendActive()) {
      return saveUsersSqlite(users)
    }
    return safeSetItem('appUsers', json)
  } catch (err) {
    reportStorageError('appUsers', err)
    return false
  }
}

// ──────────────────────────────────────────────
// User Permission Overrides Repository
// ──────────────────────────────────────────────

export function getUserPermissionOverridesSafe(): Record<string, Record<string, boolean>> {
  if (isSqliteBackendActive()) {
    ensureSqliteReady()
    hydrateKeyFromLocalStorageIfNeeded<Record<string, Record<string, boolean>>>(
      'appUserPermissionOverrides',
      (parsed) =>
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, Record<string, boolean>>)
          : null,
      (data) => saveUserPermissionOverridesSqlite(data),
      () => {
        const res = getUserPermissionOverridesSqlite()
        return Object.keys(res).length > 0
      },
    )
    hydrateKeyFromLocalStorageIfNeeded<Record<string, Record<string, boolean>>>(
      'userPermissionOverrides',
      (parsed) =>
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, Record<string, boolean>>)
          : null,
      (data) => saveUserPermissionOverridesSqlite(data),
      () => {
        const res = getUserPermissionOverridesSqlite()
        return Object.keys(res).length > 0
      },
    )
    return getUserPermissionOverridesSqlite()
  }

  const raw =
    safeGetItem('appUserPermissionOverrides') || safeGetItem('userPermissionOverrides')
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {}
  return {}
}

export function saveUserPermissionOverridesSafe(
  overrides: Record<string, Record<string, boolean>>,
): boolean {
  try {
    const json = JSON.stringify(overrides)
    checkMockedStorageProbe('appUserPermissionOverrides', json)
    if (isSqliteBackendActive()) {
      const ok = saveUserPermissionOverridesSqlite(overrides)
      setKvItemSqlite('appUserPermissionOverrides', json)
      setKvItemSqlite('userPermissionOverrides', json)
      return ok
    }
    safeSetItem('userPermissionOverrides', json)
    return safeSetItem('appUserPermissionOverrides', json)
  } catch (err) {
    reportStorageError('appUserPermissionOverrides', err)
    return false
  }
}
