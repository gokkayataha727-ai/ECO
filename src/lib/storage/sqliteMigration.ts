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
import { computeChecksum } from './checksum'
import { CURRENT_MENU_CATALOG_VERSION, migrateLegacyKeys } from './migrations'
import { quarantineCorruptPayload } from './quarantine'
import {
  emitCriticalStorageError,
  invokeSqliteSync,
  isSqliteBackendActive,
} from './sqliteClient'
import { BACKUP_FORMAT_VERSION, CURRENT_STORAGE_SCHEMA_VERSION, type POSBackupFile, type POSBackupPayload } from './types'
import {
  isObject,
  validateActivityLog,
  validateBackupFileStructure,
  validateBusinessDay,
  validateCompletedOrder,
  validateMenuProduct,
  validateRefund,
  validateTable,
  validateUser,
} from './validators'

export const MIGRATED_TO_SQLITE_KEY = 'migrated_to_sqlite'
export const MIGRATION_IN_PROGRESS_KEY = 'sqlite_migration_in_progress'
export const PRE_SQLITE_MIGRATION_BACKUP_KEY = 'storage_pre_sqlite_migration_backup'
export const LEGACY_RETENTION_DAYS = 30
export const LEGACY_RETENTION_MS = LEGACY_RETENTION_DAYS * 24 * 60 * 60 * 1000

export interface MigrationFlagRecord {
  migrated: boolean
  migratedAt: string
  retainUntil: string
  retentionDays: number
  schemaVersion: number
}

export interface SqliteMigrationResult {
  success: boolean
  skipped?: boolean
  alreadyMigrated?: boolean
  recoveredFromInterruption?: boolean
  rolledBack?: boolean
  quarantinedKeys: string[]
  preMigrationBackup?: POSBackupFile
  migratedAt?: string
  retainUntil?: string
  summary?: Record<string, number>
  error?: string
}

/**
 * Reads and parses the `migrated_to_sqlite` flag from localStorage.
 */
export function getMigrationFlagRecord(): MigrationFlagRecord | null {
  try {
    const raw = localStorage.getItem(MIGRATED_TO_SQLITE_KEY)
    if (!raw) return null
    if (raw === 'true') {
      const now = new Date()
      return {
        migrated: true,
        migratedAt: now.toISOString(),
        retainUntil: new Date(now.getTime() + LEGACY_RETENTION_MS).toISOString(),
        retentionDays: LEGACY_RETENTION_DAYS,
        schemaVersion: 1,
      }
    }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.migrated === true) {
      return parsed as MigrationFlagRecord
    }
  } catch {}
  return null
}

/**
 * Checks whether the 30-day retention period for legacy localStorage data is still active.
 * Returns true if legacy data MUST be retained (cannot be deleted).
 */
export function shouldRetainLegacyLocalStorage(nowMs: number = Date.now()): boolean {
  const record = getMigrationFlagRecord()
  if (!record || !record.retainUntil) return true
  const retainUntilMs = new Date(record.retainUntil).getTime()
  if (Number.isNaN(retainUntilMs)) return true
  return nowMs < retainUntilMs
}

/**
 * Validates a collection from localStorage item-by-item using validators.ts.
 * Quarantines corrupt JSON or individual invalid records without stopping the migration.
 */
function readAndValidateCollection<T>(
  key: string,
  itemValidator: (item: unknown) => T | null,
  fallback: T[],
  quarantinedKeys: string[],
): T[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return fallback
  }
  if (!raw) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const qKey = quarantineCorruptPayload(
      key,
      raw,
      err instanceof Error ? err.message : 'JSON parse error during SQLite migration',
    )
    quarantinedKeys.push(qKey)
    return fallback
  }

  if (!Array.isArray(parsed)) {
    const qKey = quarantineCorruptPayload(
      key,
      raw,
      `Expected array in "${key}" during SQLite migration`,
    )
    quarantinedKeys.push(qKey)
    return fallback
  }

  const validItems: T[] = []
  parsed.forEach((item, index) => {
    const validated = itemValidator(item)
    if (validated) {
      validItems.push(validated)
    } else {
      const itemRaw = (() => {
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })()
      const qKey = quarantineCorruptPayload(
        `${key}_item_${index}`,
        itemRaw,
        `Invalid record at ${key}[${index}] during SQLite migration`,
      )
      quarantinedKeys.push(qKey)
    }
  })

  return validItems
}

/**
 * Gathers and validates all existing localStorage data for migration.
 * Corrupt keys or individual corrupt records are quarantined without aborting.
 */
export function extractAndValidateLocalStorageData(): {
  payload: POSBackupPayload & { extraKv?: Record<string, string> }
  quarantinedKeys: string[]
  hasAnyLegacyData: boolean
} {
  migrateLegacyKeys()
  const quarantinedKeys: string[] = []

  const legacyCoreKeys = [
    'tables',
    'completedOrders',
    'businessDays',
    'menuProducts',
    'appSettings',
    'refunds',
    'activityLogs',
    'appUsers',
  ]
  const hasAnyLegacyData = legacyCoreKeys.some((k) => {
    try {
      return localStorage.getItem(k) !== null
    } catch {
      return false
    }
  })

  const rawTables = readAndValidateCollection<Table>(
    'tables',
    validateTable,
    initialTables,
    quarantinedKeys,
  )
  const tables = rawTables.length > 0 ? rawTables : initialTables

  const completedOrders = readAndValidateCollection<CompletedOrder>(
    'completedOrders',
    validateCompletedOrder,
    [],
    quarantinedKeys,
  )

  const businessDays = readAndValidateCollection<BusinessDay>(
    'businessDays',
    validateBusinessDay,
    [],
    quarantinedKeys,
  )

  const rawProducts = readAndValidateCollection<Product>(
    'menuProducts',
    validateMenuProduct,
    initialProducts,
    quarantinedKeys,
  )
  const menuProducts = rawProducts.length > 0 ? rawProducts : initialProducts

  const refunds = readAndValidateCollection<Refund>(
    'refunds',
    validateRefund,
    [],
    quarantinedKeys,
  )

  const activityLogs = readAndValidateCollection<ActivityLog>(
    'activityLogs',
    validateActivityLog,
    [],
    quarantinedKeys,
  )

  const appUsers = readAndValidateCollection<User>(
    'appUsers',
    validateUser,
    [],
    quarantinedKeys,
  )

  // Validate appSettings
  let appSettings: AppSettings = DEFAULT_SETTINGS
  const rawSettings = localStorage.getItem('appSettings')
  if (rawSettings) {
    try {
      const parsed = JSON.parse(rawSettings)
      if (isObject(parsed)) {
        appSettings = { ...DEFAULT_SETTINGS, ...parsed }
      } else {
        const qKey = quarantineCorruptPayload('appSettings', rawSettings, 'Invalid settings object')
        quarantinedKeys.push(qKey)
      }
    } catch (err) {
      const qKey = quarantineCorruptPayload(
        'appSettings',
        rawSettings,
        err instanceof Error ? err.message : 'JSON parse error',
      )
      quarantinedKeys.push(qKey)
    }
  }

  // Optional auxiliary keys
  let initialWaitstaffPins: any[] | undefined
  const rawPins = localStorage.getItem('initialWaitstaffPins')
  if (rawPins) {
    try {
      const parsed = JSON.parse(rawPins)
      if (Array.isArray(parsed)) initialWaitstaffPins = parsed
    } catch {}
  }

  let waitstaffPermissionTemplate: Record<string, boolean> | undefined
  const rawTemplate =
    localStorage.getItem('appPermissionTemplate') ||
    localStorage.getItem('waitstaffPermissionTemplate')
  if (rawTemplate) {
    try {
      const parsed = JSON.parse(rawTemplate)
      if (isObject(parsed)) waitstaffPermissionTemplate = parsed
    } catch {}
  }

  let userPermissionOverrides: Record<string, Record<string, boolean>> | undefined
  const rawOverrides =
    localStorage.getItem('appUserPermissionOverrides') ||
    localStorage.getItem('userPermissionOverrides')
  if (rawOverrides) {
    try {
      const parsed = JSON.parse(rawOverrides)
      if (isObject(parsed)) userPermissionOverrides = parsed
    } catch {}
  }

  const customAppLogo = localStorage.getItem('customAppLogo')
  const menuCatalogVersion =
    localStorage.getItem('menuCatalogVersion') || CURRENT_MENU_CATALOG_VERSION

  return {
    payload: {
      tables,
      completedOrders,
      businessDays,
      menuProducts,
      appSettings,
      refunds,
      activityLogs,
      appUsers,
      initialWaitstaffPins,
      waitstaffPermissionTemplate,
      userPermissionOverrides,
      customAppLogo,
      menuCatalogVersion,
    },
    quarantinedKeys,
    hasAnyLegacyData,
  }
}

/**
 * Deduplicates any duplicate IDs in collections before creating pre-migration backup
 * (quarantining duplicate entries so backup validation always passes).
 */
function deduplicatePayloadIds(
  payload: POSBackupPayload,
  quarantinedKeys: string[],
): POSBackupPayload {
  const dedup = <T extends { id: string }>(items: T[], collectionName: string): T[] => {
    const seen = new Set<string>()
    const out: T[] = []
    for (const item of items) {
      if (!item.id || seen.has(item.id)) {
        const qKey = quarantineCorruptPayload(
          `${collectionName}_dup_${item.id || 'empty'}`,
          JSON.stringify(item),
          `Duplicate ID "${item.id}" quarantined during SQLite migration`,
        )
        quarantinedKeys.push(qKey)
        continue
      }
      seen.add(item.id)
      out.push(item)
    }
    return out
  }

  return {
    ...payload,
    tables: dedup(payload.tables, 'tables'),
    completedOrders: dedup(payload.completedOrders, 'completedOrders'),
    businessDays: dedup(payload.businessDays, 'businessDays'),
    menuProducts: dedup(payload.menuProducts, 'menuProducts'),
    refunds: dedup(payload.refunds, 'refunds'),
    activityLogs: dedup(payload.activityLogs, 'activityLogs'),
    appUsers: dedup(payload.appUsers, 'appUsers'),
  }
}

/**
 * Checks whether localStorage -> SQLite migration needs to run, and executes it atomically.
 *
 * Guarantees:
 * 1) Takes and verifies a full backup before migration.
 * 2) Validates legacy data with validators.ts; quarantines corrupt records without stopping.
 * 3) Verifies kuruş precision and post-migration financial totals (revenue, payments, open table balances).
 *    Rolls back and emits error if totals do not match 100%.
 * 4) Preserves legacy localStorage data (does NOT delete it) and sets "migrated_to_sqlite" flag with 30-day retention.
 * 5) Safely restarts from the beginning on next launch if interrupted mid-migration (power failure).
 */
export function runLocalStorageToSqliteMigration(options?: {
  force?: boolean
  failAtStep?: string
  tamperAfterWrite?: (db: any) => void
  rawPayloadOverride?: Partial<POSBackupPayload>
}): SqliteMigrationResult {
  if (!isSqliteBackendActive()) {
    return {
      success: false,
      skipped: true,
      quarantinedKeys: [],
      error: 'SQLite bağlantısı aktif değil.',
    }
  }

  // Check if a previous migration was completed or interrupted
  const flag = getMigrationFlagRecord()
  const inProgressMarker = localStorage.getItem(MIGRATION_IN_PROGRESS_KEY)
  const dbMigrationStatusRes = invokeSqliteSync<string | null>('getMeta', {
    key: 'migration_status',
  })
  const dbMigrationStatus = dbMigrationStatusRes.success ? dbMigrationStatusRes.data : null

  const wasInterrupted =
    Boolean(inProgressMarker) ||
    dbMigrationStatus === 'in_progress' ||
    (Boolean(flag?.migrated) && dbMigrationStatus !== 'completed')

  if (!options?.force && flag?.migrated && dbMigrationStatus === 'completed' && !inProgressMarker) {
    return {
      success: true,
      skipped: true,
      alreadyMigrated: true,
      recoveredFromInterruption: false,
      quarantinedKeys: [],
      migratedAt: flag.migratedAt,
      retainUntil: flag.retainUntil,
    }
  }

  // Step 1: Extract and validate legacy localStorage data (quarantining corrupt entries without stopping)
  const { payload: extractedPayload, quarantinedKeys } = extractAndValidateLocalStorageData()
  const mergedPayload: POSBackupPayload = {
    ...extractedPayload,
    ...(options?.rawPayloadOverride || {}),
  }
  const cleanPayload = deduplicatePayloadIds(mergedPayload, quarantinedKeys)

  // Step 2: Create and strictly validate pre-migration full backup
  const payloadJson = JSON.stringify(cleanPayload)
  const preMigrationBackup: POSBackupFile = {
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    appVersion: '1.5.0',
    createdAt: new Date().toISOString(),
    checksum: computeChecksum(payloadJson),
    description: 'SQLite veri aktarımı öncesi otomatik tam yedek',
    data: cleanPayload,
  }

  const backupValidation = validateBackupFileStructure(preMigrationBackup)
  if (!backupValidation.valid) {
    const errMsg = `Migrasyon öncesi yedek doğrulaması başarısız: ${backupValidation.error}`
    emitCriticalStorageError('pre_migration_backup', errMsg)
    return {
      success: false,
      rolledBack: true,
      quarantinedKeys,
      error: errMsg,
    }
  }

  try {
    localStorage.setItem(PRE_SQLITE_MIGRATION_BACKUP_KEY, JSON.stringify(preMigrationBackup))
  } catch {}

  // Also trigger asynchronous disk backup if running in Electron
  try {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (api && typeof api.backupWrite === 'function') {
      api
        .backupWrite({
          backup: preMigrationBackup,
          type: 'manuel',
          secondaryDir: cleanPayload.appSettings?.secondaryBackupDir,
        })
        .catch(() => {})
    }
  } catch {}

  // Step 3: Mark migration in progress so an unexpected power loss can be detected on next launch
  try {
    localStorage.setItem(MIGRATION_IN_PROGRESS_KEY, new Date().toISOString())
  } catch {}

  // Step 4: Execute atomic SQLite migration and post-migration financial totals verification
  const migrateRes = invokeSqliteSync('migrateFromLocalStorage', {
    data: cleanPayload,
    options: {
      failAtStep: options?.failAtStep,
      tamperAfterWrite: options?.tamperAfterWrite,
    },
  })

  if (!migrateRes.success) {
    // Migration failed or rolled back! Leave localStorage data untouched and do NOT set migrated_to_sqlite
    emitCriticalStorageError(
      'migrateFromLocalStorage',
      migrateRes.error || 'SQLite veri aktarımı başarısız oldu, eski veriler korundu.',
      preMigrationBackup,
    )
    return {
      success: false,
      rolledBack: true,
      recoveredFromInterruption: wasInterrupted || Boolean(migrateRes.recoveredFromInterruption),
      quarantinedKeys,
      preMigrationBackup,
      error: migrateRes.error || 'SQLite veri aktarımı başarısız oldu.',
    }
  }

  // Step 5: Migration succeeded! Keep all legacy localStorage data intact, clear in-progress marker,
  // and set "migrated_to_sqlite" flag with 30-day retention window.
  const now = new Date()
  const migratedAt = migrateRes.migratedAt || now.toISOString()
  const retainUntil =
    migrateRes.retainUntil || new Date(now.getTime() + LEGACY_RETENTION_MS).toISOString()

  const flagRecord: MigrationFlagRecord = {
    migrated: true,
    migratedAt,
    retainUntil,
    retentionDays: LEGACY_RETENTION_DAYS,
    schemaVersion: 1,
  }

  try {
    localStorage.setItem(MIGRATED_TO_SQLITE_KEY, JSON.stringify(flagRecord))
    localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
  } catch {}

  return {
    success: true,
    skipped: false,
    alreadyMigrated: false,
    rolledBack: false,
    recoveredFromInterruption: wasInterrupted || Boolean(migrateRes.recoveredFromInterruption),
    quarantinedKeys,
    preMigrationBackup,
    migratedAt,
    retainUntil,
    summary: migrateRes.summary,
  }
}

export async function migrateLocalStorageToSqliteIfNeeded(): Promise<SqliteMigrationResult> {
  return runLocalStorageToSqliteMigration()
}
