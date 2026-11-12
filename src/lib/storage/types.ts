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
import type { WaitstaffPinRecord } from '../auth'

export const BACKUP_FORMAT_VERSION = 1
export const CURRENT_STORAGE_SCHEMA_VERSION = 1

export interface POSBackupPayload {
  tables: Table[]
  completedOrders: CompletedOrder[]
  businessDays: BusinessDay[]
  menuProducts: Product[]
  appSettings: AppSettings
  refunds: Refund[]
  activityLogs: ActivityLog[]
  appUsers: User[]
  initialWaitstaffPins?: WaitstaffPinRecord[]
  waitstaffPermissionTemplate?: Record<string, boolean>
  userPermissionOverrides?: Record<string, Record<string, boolean>>
  customAppLogo?: string | null
  menuCatalogVersion?: string
}

export interface POSBackupFile {
  formatVersion: number
  schemaVersion: number
  appVersion: string
  createdAt: string
  checksum: string
  description?: string
  data: POSBackupPayload
}

export interface ValidationResult<T> {
  isValid: boolean
  data: T | null
  errors: string[]
  quarantinedKey?: string
}

export interface RestoreResult {
  success: boolean
  message: string
  preRestoreBackupKey?: string
  errors?: string[]
}

export interface QuarantineRecord {
  key: string
  timestamp: string
  rawLength: number
  error: string
  rawPreview: string
}

export type BackupScheduleType = 'saatlik' | 'gunluk' | 'acilis' | 'kapanis' | 'manuel'

export interface DiskBackupItem {
  fileName: string
  filePath: string
  createdAt: string
  sizeBytes: number
  type: BackupScheduleType | string
}

export interface BackupWriteResult {
  success: boolean
  fileName?: string
  filePath?: string
  type?: string
  createdAt?: string
  secondaryCopied?: boolean
  secondaryFilePath?: string
  secondaryWarning?: string
  error?: string
}

export interface BackupListResult {
  success: boolean
  directory?: string
  backups: DiskBackupItem[]
  error?: string
}

export interface BackupRestoreReadResult {
  success: boolean
  fileName?: string
  backup?: POSBackupFile
  error?: string
}

