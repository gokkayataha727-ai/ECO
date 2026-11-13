import type {
  POSBackupFile,
  POSBackupPayload,
  RestoreResult,
  BackupScheduleType,
  BackupWriteResult,
  BackupListResult,
  BackupRestoreReadResult,
} from './types'
import { BACKUP_FORMAT_VERSION, CURRENT_STORAGE_SCHEMA_VERSION } from './types'
import { computeChecksum } from './checksum'
import {
  getActivityLogsSafe,
  getBusinessDaysSafe,
  getCompletedOrdersSafe,
  getMenuProductsSafe,
  getRefundsSafe,
  getSettingsSafe,
  getTablesSafe,
  getUserPermissionOverridesSafe,
  getUsersSafe,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  saveActivityLogsSafe,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveMenuProductsSafe,
  saveRefundsSafe,
  saveSettingsSafe,
  saveTablesSafe,
  saveUserPermissionOverridesSafe,
  saveUsersSafe,
} from './repository'
import { validateBackupFileStructure } from './validators'
import { logActivity } from '../activityLog'

const PRE_RESTORE_BACKUP_KEY = 'storage_pre_restore_backup'

/**
 * Gathers complete POS state into a single cohesive payload.
 */
export function getFullBackupPayload(): POSBackupPayload {
  let pins: any[] | undefined
  try {
    const raw = safeGetItem('initialWaitstaffPins')
    if (raw) pins = JSON.parse(raw)
  } catch {}

  let template: any | undefined
  try {
    const raw = safeGetItem('waitstaffPermissionTemplate') || safeGetItem('appPermissionTemplate')
    if (raw) template = JSON.parse(raw)
  } catch {}

  let overrides: any | undefined
  try {
    const obj = getUserPermissionOverridesSafe()
    if (obj && Object.keys(obj).length > 0) {
      overrides = obj
    } else {
      const raw = safeGetItem('userPermissionOverrides') || safeGetItem('appUserPermissionOverrides')
      if (raw) overrides = JSON.parse(raw)
    }
  } catch {}

  const logo = safeGetItem('customAppLogo')
  const catalogVersion = safeGetItem('menuCatalogVersion') || undefined

  return {
    tables: getTablesSafe(),
    completedOrders: getCompletedOrdersSafe(),
    businessDays: getBusinessDaysSafe(),
    menuProducts: getMenuProductsSafe(),
    appSettings: getSettingsSafe(),
    refunds: getRefundsSafe(),
    activityLogs: getActivityLogsSafe(),
    appUsers: getUsersSafe(),
    initialWaitstaffPins: pins,
    waitstaffPermissionTemplate: template,
    userPermissionOverrides: overrides,
    customAppLogo: logo,
    menuCatalogVersion: catalogVersion,
  }
}

/**
 * Creates an exportable POSBackupFile with metadata, timestamp, and checksum.
 */
export function createFullBackupFile(description?: string): POSBackupFile {
  const payload = getFullBackupPayload()
  const payloadString = JSON.stringify(payload)
  const checksum = computeChecksum(payloadString)

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    appVersion: '1.6.0',
    createdAt: new Date().toISOString(),
    checksum,
    description: description || 'Manuel sistem yedeği',
    data: payload,
  }
}

/**
 * Triggers a browser download of the full backup file.
 */
export function exportFullBackupToFile(filename?: string): void {
  const backup = createFullBackupFile()
  const dateStr = new Date().toISOString().slice(0, 10)
  const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '')
  const finalName = filename || `lemoon_pos_tam_yedek_${dateStr}_${timeStr}.json`

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2))
  const downloadAnchor = document.createElement('a')
  downloadAnchor.setAttribute('href', dataStr)
  downloadAnchor.setAttribute('download', finalName)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  downloadAnchor.remove()
}

/**
 * Retrieves the automatic pre-restore backup (if any).
 */
export function getPreRestoreBackup(): POSBackupFile | null {
  try {
    const raw = safeGetItem(PRE_RESTORE_BACKUP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed
  } catch {
    return null
  }
}

/**
 * Restores full POS state from a validated POSBackupFile.
 * Always creates an automatic pre-restore backup first so any operation can be undone.
 */
export function restoreFromBackup(
  backupFile: unknown,
  options?: { skipPreRestoreBackup?: boolean },
): RestoreResult {
  // 1. Strict validation
  const validation = validateBackupFileStructure(backupFile)
  if (!validation.valid || !validation.backup) {
    return {
      success: false,
      message: validation.error || 'Yedek dosyası doğrulaması başarısız oldu.',
      errors: [validation.error || 'Doğrulama hatası'],
    }
  }

  const verified = validation.backup

  // 2. Create pre-restore snapshot of existing state unless explicitly skipped
  if (!options?.skipPreRestoreBackup) {
    try {
      const currentSnapshot = createFullBackupFile('Geri yükleme öncesi otomatik güvenlik yedeği')
      safeSetItem(PRE_RESTORE_BACKUP_KEY, JSON.stringify(currentSnapshot))
    } catch (err) {
      console.warn('Could not save pre-restore backup, proceeding with caution', err)
    }
  }

  // 3. Atomically apply restored data to repositories
  try {
    const { data } = verified

    saveTablesSafe(data.tables)
    saveCompletedOrdersSafe(data.completedOrders)
    saveBusinessDaysSafe(data.businessDays)
    saveMenuProductsSafe(data.menuProducts)
    saveSettingsSafe(data.appSettings)

    if (Array.isArray(data.refunds)) {
      saveRefundsSafe(data.refunds)
    }
    if (Array.isArray(data.activityLogs)) {
      saveActivityLogsSafe(data.activityLogs)
    }
    if (Array.isArray(data.appUsers)) {
      saveUsersSafe(data.appUsers)
    }
    if (data.initialWaitstaffPins) {
      safeSetItem('initialWaitstaffPins', JSON.stringify(data.initialWaitstaffPins))
    }
    if (data.waitstaffPermissionTemplate) {
      const tplJson = JSON.stringify(data.waitstaffPermissionTemplate)
      safeSetItem('waitstaffPermissionTemplate', tplJson)
      safeSetItem('appPermissionTemplate', tplJson)
    }
    if (data.userPermissionOverrides) {
      saveUserPermissionOverridesSafe(data.userPermissionOverrides)
    }
    if (typeof data.customAppLogo === 'string') {
      safeSetItem('customAppLogo', data.customAppLogo)
    } else if (data.customAppLogo === null) {
      safeRemoveItem('customAppLogo')
    }
    if (data.menuCatalogVersion) {
      safeSetItem('menuCatalogVersion', data.menuCatalogVersion)
    }

    try {
      logActivity({
        type: 'backup_restore',
        userName: 'Yönetici',
        userRole: 'Yönetici',
        details: `Yedekten geri yükleme tamamlandı (${verified.description || 'Sistem yedeği'}, tarih: ${verified.createdAt})`,
      })
    } catch {}

    return {
      success: true,
      message: 'Sistem yedeği başarıyla geri yüklendi.',
      preRestoreBackupKey: PRE_RESTORE_BACKUP_KEY,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Geri yükleme esnasında hata oluştu.',
      errors: [String(err)],
    }
  }
}

/**
 * Rolls back the state to the pre-restore backup.
 */
export function rollbackPreRestoreBackup(): RestoreResult {
  const preRestore = getPreRestoreBackup()
  if (!preRestore) {
    return {
      success: false,
      message: 'Geri alınacak bir önceki yedek kaydı bulunamadı.',
    }
  }

  return restoreFromBackup(preRestore, { skipPreRestoreBackup: true })
}

const BACKUP_TYPE_DESCRIPTIONS: Record<BackupScheduleType, string> = {
  saatlik: 'Otomatik saatlik yedek',
  gunluk: 'Otomatik gün sonu (günlük) yedek',
  acilis: 'Uygulama açılış yedeği',
  kapanis: 'Uygulama kapanış yedeği',
  manuel: 'Manuel sistem yedeği',
}

function getElectronBackupAPI(): any | null {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI
  }
  return null
}

function emitBackupWarning(warning: string, type: string): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('pos-backup-warning', {
        detail: {
          warning,
          type,
          timestamp: new Date().toISOString(),
        },
      }),
    )
  }
}

/**
 * Creates a full backup with checksum and writes it via Electron main process IPC (`backup:write`)
 * to Documents\LemoonYedek\ and optional secondary backup directory.
 */
export async function triggerAutomatedBackup(
  type: BackupScheduleType = 'manuel',
  secondaryDirOverride?: string,
): Promise<BackupWriteResult> {
  try {
    const description = BACKUP_TYPE_DESCRIPTIONS[type] || 'Sistem yedeği'
    const backup = createFullBackupFile(description)
    const settings = getSettingsSafe()
    const secondaryDir =
      secondaryDirOverride !== undefined ? secondaryDirOverride : settings.secondaryBackupDir

    const api = getElectronBackupAPI()
    if (api && typeof api.backupWrite === 'function') {
      const result: BackupWriteResult = await api.backupWrite({
        backup,
        type,
        secondaryDir,
      })
      if (result.secondaryWarning) {
        emitBackupWarning(result.secondaryWarning, type)
      }
      return result
    }

    // Fallback when running in plain browser without Electron main process
    return {
      success: false,
      error: 'Otomatik disk yedeklemesi yalnızca masaüstü (Electron) ortamında aktiftir.',
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Yedekleme sırasında beklenmeyen hata oluştu.',
    }
  }
}

/**
 * Lists backup files from Documents\LemoonYedek\ via Electron IPC (`backup:list`).
 */
export async function listDiskBackups(): Promise<BackupListResult> {
  const api = getElectronBackupAPI()
  if (api && typeof api.backupList === 'function') {
    try {
      return await api.backupList()
    } catch (err) {
      return {
        success: false,
        backups: [],
        error: err instanceof Error ? err.message : 'Yedek listesi alınamadı.',
      }
    }
  }
  return {
    success: false,
    backups: [],
    error: 'Disk yedek listesi yalnızca masaüstü (Electron) ortamında kullanılabilir.',
  }
}

/**
 * Reads and verifies a backup file from disk via Electron IPC (`backup:restore-read`).
 */
export async function readDiskBackupForRestore(
  fileName: string,
): Promise<BackupRestoreReadResult> {
  const api = getElectronBackupAPI()
  if (api && typeof api.backupRestoreRead === 'function') {
    try {
      return await api.backupRestoreRead(fileName)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Yedek dosyası okunamadı.',
      }
    }
  }
  return {
    success: false,
    error: 'Diskten geri yükleme yalnızca masaüstü (Electron) ortamında kullanılabilir.',
  }
}

/**
 * Opens native directory picker in Electron (`backup:select-dir`) to choose secondary backup directory.
 */
export async function selectSecondaryBackupDirectory(): Promise<{
  canceled: boolean
  path: string | null
}> {
  const api = getElectronBackupAPI()
  if (api && typeof api.backupSelectDir === 'function') {
    try {
      return await api.backupSelectDir()
    } catch {
      return { canceled: true, path: null }
    }
  }
  return { canceled: true, path: null }
}


