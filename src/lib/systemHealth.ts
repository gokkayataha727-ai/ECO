import type { ChainVerificationResult } from './activityLog'

export type HealthLevel = 'green' | 'yellow' | 'red'

export interface HealthCheckItem {
  id:
    | 'backup_recency'
    | 'disk_and_db'
    | 'write_error'
    | 'secondary_backup_dir'
    | 'clock_drift'
    | 'log_integrity'
  title: string
  status: HealthLevel
  summary: string
  detail?: string
}

export interface SystemHealthInput {
  nowMs?: number
  /** ISO timestamp or ms of the last successful backup */
  lastBackupAt?: string | number | null
  /** Database size in bytes */
  dbSizeBytes?: number | null
  /** Free disk space in bytes */
  freeDiskBytes?: number | null
  /** Total disk space in bytes */
  totalDiskBytes?: number | null
  /** Last storage write error message (if any) */
  lastWriteError?: string | null
  /** Last storage write error timestamp */
  lastWriteErrorAt?: string | null
  /** Configured secondary backup folder path */
  secondaryBackupDir?: string | null
  /** Whether the secondary backup folder is currently accessible/writable */
  secondaryDirAccessible?: boolean | null
  /** Recent secondary backup warning message */
  secondaryBackupWarning?: string | null
  /** Whether system clock drift / backward time jump was detected */
  clockDriftDetected?: boolean
  /** Amount of backward clock drift in milliseconds */
  clockDriftMs?: number
  /** Clock drift explanation message */
  clockDriftMessage?: string | null
  /** Activity log hash chain integrity status (Adım 6A) */
  logChainValid?: boolean
  /** Broken log record ID if chain is invalid */
  logChainBrokenRecordId?: string | null
  /** Detailed chain verification message */
  logChainMessage?: string | null
}

export interface SystemHealthReport {
  overallStatus: HealthLevel
  checks: {
    backupRecency: HealthCheckItem
    diskAndDb: HealthCheckItem
    writeError: HealthCheckItem
    secondaryBackupDir: HealthCheckItem
    clockDrift: HealthCheckItem
    logIntegrity: HealthCheckItem
  }
  items: HealthCheckItem[]
  criticalCount: number
  warningCount: number
  evaluatedAt: string
}

export const BACKUP_CRITICAL_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
export const BACKUP_WARNING_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours
export const DISK_FREE_WARNING_RATIO = 0.10 // 10%
export const DISK_FREE_CRITICAL_RATIO = 0.03 // 3%
export const CLOCK_DRIFT_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes backward jump

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return 'Bilinmiyor'
  }
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

export function formatRelativeAge(ageMs: number): string {
  if (ageMs < 60_000) return 'Az önce'
  const mins = Math.floor(ageMs / 60_000)
  if (mins < 60) return `${mins} dk önce`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) {
    return remMins > 0 ? `${hours} sa ${remMins} dk önce` : `${hours} saat önce`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days} gün ${remHours} sa önce` : `${days} gün önce`
}

/**
 * Detects whether the system clock has jumped backward compared to recorded timestamps
 * (e.g. CMOS battery failure or manual clock tampering on POS terminal).
 */
export function detectClockDrift(params: {
  nowMs?: number
  latestKnownTimestamps: Array<string | number | undefined | null>
  thresholdMs?: number
}): {
  driftDetected: boolean
  driftMs: number
  latestTimestampIso: string | null
  message: string
} {
  const nowMs = typeof params.nowMs === 'number' ? params.nowMs : Date.now()
  const thresholdMs =
    typeof params.thresholdMs === 'number' ? params.thresholdMs : CLOCK_DRIFT_THRESHOLD_MS

  let maxKnownMs = 0
  for (const ts of params.latestKnownTimestamps) {
    if (!ts) continue
    const parsed = typeof ts === 'number' ? ts : new Date(ts).getTime()
    if (Number.isFinite(parsed) && parsed > maxKnownMs) {
      maxKnownMs = parsed
    }
  }

  if (maxKnownMs === 0) {
    return {
      driftDetected: false,
      driftMs: 0,
      latestTimestampIso: null,
      message: 'Sistem saati tutarlı.',
    }
  }

  const diffMs = maxKnownMs - nowMs
  if (diffMs > thresholdMs) {
    const mins = Math.round(diffMs / 60_000)
    const latestIso = new Date(maxKnownMs).toISOString()
    return {
      driftDetected: true,
      driftMs: diffMs,
      latestTimestampIso: latestIso,
      message: `Saat kayması tespit edildi: Sistem saati son kayıttan ${mins} dakika geride!`,
    }
  }

  return {
    driftDetected: false,
    driftMs: 0,
    latestTimestampIso: new Date(maxKnownMs).toISOString(),
    message: 'Sistem saati tutarlı.',
  }
}

/**
 * Pure health calculation engine for Adım 5.3.
 * Evaluates all 6 indicators and computes overall green / yellow / red status.
 */
export function evaluateSystemHealth(input: SystemHealthInput): SystemHealthReport {
  const nowMs = typeof input.nowMs === 'number' ? input.nowMs : Date.now()

  // 1. Son yedek zamanı (24 saatten eskiyse kırmızı)
  let backupRecency: HealthCheckItem
  if (input.lastBackupAt === undefined || input.lastBackupAt === null || input.lastBackupAt === '') {
    backupRecency = {
      id: 'backup_recency',
      title: 'Son Yedek Zamanı',
      status: 'yellow',
      summary: 'Henüz otomatik yedek alınmadı',
      detail: 'İlk yedekleme bekleniyor veya manuel yedek alabilirsiniz.',
    }
  } else {
    const backupMs =
      typeof input.lastBackupAt === 'number'
        ? input.lastBackupAt
        : new Date(input.lastBackupAt).getTime()

    if (!Number.isFinite(backupMs)) {
      backupRecency = {
        id: 'backup_recency',
        title: 'Son Yedek Zamanı',
        status: 'yellow',
        summary: 'Yedek zamanı okunamadı',
      }
    } else {
      const ageMs = Math.max(0, nowMs - backupMs)
      const relText = formatRelativeAge(ageMs)
      if (ageMs > BACKUP_CRITICAL_AGE_MS) {
        backupRecency = {
          id: 'backup_recency',
          title: 'Son Yedek Zamanı',
          status: 'red',
          summary: `Son yedek 24 saatten eski (${relText})`,
          detail: `Son yedek: ${new Date(backupMs).toLocaleString('tr-TR')}. Lütfen hemen yedek alın!`,
        }
      } else if (ageMs > BACKUP_WARNING_AGE_MS) {
        backupRecency = {
          id: 'backup_recency',
          title: 'Son Yedek Zamanı',
          status: 'yellow',
          summary: `Son yedek: ${relText}`,
          detail: `Son yedek: ${new Date(backupMs).toLocaleString('tr-TR')}`,
        }
      } else {
        backupRecency = {
          id: 'backup_recency',
          title: 'Son Yedek Zamanı',
          status: 'green',
          summary: `Güncel (${relText})`,
          detail: `Son yedek: ${new Date(backupMs).toLocaleString('tr-TR')}`,
        }
      }
    }
  }

  // 2. Veritabanı boyutu ve kalan disk alanı (boş alan %10'un altına düşerse uyarı)
  let diskAndDb: HealthCheckItem
  const dbSizeStr =
    typeof input.dbSizeBytes === 'number' && input.dbSizeBytes >= 0
      ? formatBytes(input.dbSizeBytes)
      : 'Bilinmiyor'

  if (
    typeof input.freeDiskBytes === 'number' &&
    typeof input.totalDiskBytes === 'number' &&
    input.totalDiskBytes > 0
  ) {
    const freeRatio = input.freeDiskBytes / input.totalDiskBytes
    const freePct = (freeRatio * 100).toFixed(1)
    const freeStr = formatBytes(input.freeDiskBytes)

    if (freeRatio < DISK_FREE_CRITICAL_RATIO) {
      diskAndDb = {
        id: 'disk_and_db',
        title: 'Veritabanı ve Disk Alanı',
        status: 'red',
        summary: `Kritik düşük disk alanı (%${freePct} boş · ${freeStr})`,
        detail: `Veritabanı boyutu: ${dbSizeStr} · Toplam disk: ${formatBytes(input.totalDiskBytes)}`,
      }
    } else if (freeRatio < DISK_FREE_WARNING_RATIO) {
      diskAndDb = {
        id: 'disk_and_db',
        title: 'Veritabanı ve Disk Alanı',
        status: 'yellow',
        summary: `Disk alanı %10'un altında (%${freePct} boş · ${freeStr})`,
        detail: `Veritabanı boyutu: ${dbSizeStr} · Toplam disk: ${formatBytes(input.totalDiskBytes)}`,
      }
    } else {
      diskAndDb = {
        id: 'disk_and_db',
        title: 'Veritabanı ve Disk Alanı',
        status: 'green',
        summary: `DB: ${dbSizeStr} · Boş Alan: ${freeStr} (%${freePct})`,
        detail: `Toplam disk kapasitesi: ${formatBytes(input.totalDiskBytes)}`,
      }
    }
  } else {
    diskAndDb = {
      id: 'disk_and_db',
      title: 'Veritabanı ve Disk Alanı',
      status: 'green',
      summary: `Veritabanı: ${dbSizeStr}`,
      detail: 'Disk alanı durumu normal.',
    }
  }

  // 3. Son yazma hatası olup olmadığı
  let writeError: HealthCheckItem
  if (input.lastWriteError && String(input.lastWriteError).trim().length > 0) {
    writeError = {
      id: 'write_error',
      title: 'Veritabanı Yazma Durumu',
      status: 'red',
      summary: 'Son yazma işleminde hata oluştu!',
      detail: `${input.lastWriteError}${input.lastWriteErrorAt ? ` (${new Date(input.lastWriteErrorAt).toLocaleTimeString('tr-TR')})` : ''}`,
    }
  } else {
    writeError = {
      id: 'write_error',
      title: 'Veritabanı Yazma Durumu',
      status: 'green',
      summary: 'Yazma hatası yok',
      detail: 'Tüm veritabanı işlemleri diske başarıyla kaydedildi.',
    }
  }

  // 4. İkinci yedek klasörünün erişilebilir olup olmadığı
  let secondaryBackupDir: HealthCheckItem
  const hasSecondaryDir = Boolean(
    input.secondaryBackupDir && String(input.secondaryBackupDir).trim().length > 0,
  )
  if (!hasSecondaryDir) {
    secondaryBackupDir = {
      id: 'secondary_backup_dir',
      title: 'İkinci Yedek Klasörü',
      status: 'green',
      summary: 'Tanımlı değil (İsteğe bağlı)',
      detail: 'Ayarlardan USB bellek veya bulut klasörü seçebilirsiniz.',
    }
  } else if (input.secondaryDirAccessible === false || Boolean(input.secondaryBackupWarning)) {
    secondaryBackupDir = {
      id: 'secondary_backup_dir',
      title: 'İkinci Yedek Klasörü',
      status: 'yellow',
      summary: 'İkinci yedek klasörüne erişilemiyor',
      detail:
        input.secondaryBackupWarning ||
        `Klasör bulunamadı veya yazma izni yok: ${input.secondaryBackupDir}`,
    }
  } else {
    secondaryBackupDir = {
      id: 'secondary_backup_dir',
      title: 'İkinci Yedek Klasörü',
      status: 'green',
      summary: 'Erişilebilir ve aktif',
      detail: String(input.secondaryBackupDir),
    }
  }

  // 5. Saat kayması uyarısı (Adım 1)
  let clockDrift: HealthCheckItem
  if (input.clockDriftDetected) {
    const mins = input.clockDriftMs ? Math.round(input.clockDriftMs / 60_000) : null
    clockDrift = {
      id: 'clock_drift',
      title: 'Sistem Saati Tutarlılığı',
      status: 'yellow',
      summary: mins ? `Saat kayması uyarısı (${mins} dk geride)` : 'Saat kayması tespit edildi',
      detail:
        input.clockDriftMessage ||
        'Bilgisayar saati son işlem zamanından geride görünüyor. Lütfen sistem saatini kontrol edin.',
    }
  } else {
    clockDrift = {
      id: 'clock_drift',
      title: 'Sistem Saati Tutarlılığı',
      status: 'green',
      summary: 'Sistem saati doğrulandı',
      detail: 'Zaman kayması veya geri alma tespit edilmedi.',
    }
  }

  // 6. Log bütünlüğü durumu (Adım 6A)
  let logIntegrity: HealthCheckItem
  if (input.logChainValid === false) {
    logIntegrity = {
      id: 'log_integrity',
      title: 'Log Hash Zinciri Bütünlüğü',
      status: 'red',
      summary: 'Log zincirinde kırılma tespit edildi!',
      detail:
        input.logChainMessage ||
        (input.logChainBrokenRecordId
          ? `Kırılma başlangıç kaydı: ${input.logChainBrokenRecordId}`
          : 'İşlem loglarında yetkisiz silme veya değiştirme algılandı.'),
    }
  } else {
    logIntegrity = {
      id: 'log_integrity',
      title: 'Log Hash Zinciri Bütünlüğü',
      status: 'green',
      summary: 'SHA-256 hash zinciri doğrulandı',
      detail: input.logChainMessage || 'Tüm işlem kayıtları değiştirilemez zincirde bütün.',
    }
  }

  const items: HealthCheckItem[] = [
    backupRecency,
    diskAndDb,
    writeError,
    secondaryBackupDir,
    clockDrift,
    logIntegrity,
  ]

  const criticalCount = items.filter((i) => i.status === 'red').length
  const warningCount = items.filter((i) => i.status === 'yellow').length

  let overallStatus: HealthLevel = 'green'
  if (criticalCount > 0) {
    overallStatus = 'red'
  } else if (warningCount > 0) {
    overallStatus = 'yellow'
  }

  return {
    overallStatus,
    checks: {
      backupRecency,
      diskAndDb,
      writeError,
      secondaryBackupDir,
      clockDrift,
      logIntegrity,
    },
    items,
    criticalCount,
    warningCount,
    evaluatedAt: new Date(nowMs).toISOString(),
  }
}

// ────────────────────────────────────────────────────────────
// Renderer Error Log Ring Buffer & Export Helper
// ────────────────────────────────────────────────────────────

const PBKDF2_HASH_REGEX = /pbkdf2\$\d+\$[a-fA-F0-9]+\$[a-fA-F0-9]+/g
const INLINE_SECRET_KV_REGEX =
  /((?:password|parola|sifre|şifre|pin|pinHash|passwordHash|pin_hash|password_hash)\s*["']?\s*[:=]\s*["']?)([^"',\s}\]]+)/gi

export function redactSensitiveText(text: string): string {
  if (typeof text !== 'string') return String(text ?? '')
  return text
    .replace(PBKDF2_HASH_REGEX, '[REDACTED_HASH]')
    .replace(INLINE_SECRET_KV_REGEX, '$1[REDACTED]')
}

interface RendererLogItem {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
}

const rendererLogBuffer: RendererLogItem[] = []
const MAX_RENDERER_LOG_BUFFER = 500

export function recordSystemLog(
  level: 'info' | 'warn' | 'error',
  category: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const safeMsg = redactSensitiveText(message)
  const item: RendererLogItem = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message: safeMsg,
  }
  rendererLogBuffer.push(item)
  if (rendererLogBuffer.length > MAX_RENDERER_LOG_BUFFER) {
    rendererLogBuffer.shift()
  }

  try {
    if (
      typeof window !== 'undefined' &&
      (window as any).electronAPI &&
      typeof (window as any).electronAPI.writeSystemLog === 'function'
    ) {
      ;(window as any).electronAPI.writeSystemLog({
        level,
        category,
        message: safeMsg,
        meta,
      })
    }
  } catch {}
}

export function getRendererLogBuffer(): RendererLogItem[] {
  return [...rendererLogBuffer]
}

/**
 * Exports all rotating error logs as a single `.zip` (in Electron) or triggers a browser download.
 */
export async function exportErrorLogsToFile(chainStatus?: ChainVerificationResult): Promise<{
  success: boolean
  canceled?: boolean
  fileName?: string
  filePath?: string
  error?: string
}> {
  try {
    if (
      typeof window !== 'undefined' &&
      (window as any).electronAPI &&
      typeof (window as any).electronAPI.exportSystemLogs === 'function'
    ) {
      const res = await (window as any).electronAPI.exportSystemLogs()
      if (res && res.success) {
        return {
          success: true,
          fileName: res.fileName,
          filePath: res.filePath,
        }
      }
      if (res && res.canceled) {
        return { success: false, canceled: true }
      }
      if (res && res.base64Zip) {
        const link = document.createElement('a')
        link.href = `data:application/zip;base64,${res.base64Zip}`
        link.download = res.fileName || 'lemoon-hata-kayitlari.zip'
        document.body.appendChild(link)
        link.click()
        link.remove()
        return { success: true, fileName: res.fileName }
      }
    }

    // Browser fallback: export sanitized text log bundle
    const dateStr = new Date().toISOString().slice(0, 10)
    const fileName = `lemoon-hata-kayitlari-${dateStr}.log`
    const lines = [
      `# LEMOON KAFE POS — Sistem ve Hata Kayıtları Dışa Aktarımı`,
      `# Tarih: ${new Date().toISOString()}`,
      `# Log Zinciri Durumu: ${chainStatus ? (chainStatus.valid ? 'GEÇERLİ' : `KIRIK (${chainStatus.brokenLogId})`) : 'BİLİNMİYOR'}`,
      ``,
      ...rendererLogBuffer.map(
        (l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`,
      ),
    ]
    const content = redactSensitiveText(lines.join('\n'))
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content)
    const anchor = document.createElement('a')
    anchor.setAttribute('href', dataUrl)
    anchor.setAttribute('download', fileName)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    return { success: true, fileName }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Hata kayıtları dışa aktarılamadı.',
    }
  }
}
