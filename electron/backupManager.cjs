const fs = require('fs')
const path = require('path')
const os = require('os')

const VALID_BACKUP_TYPES = new Set(['saatlik', 'gunluk', 'acilis', 'kapanis', 'manuel'])

const BACKUP_FILENAME_REGEX = /^lemoon-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([a-z0-9_]+)\.json$/i

const HOURLY_RETENTION_MS = 48 * 60 * 60 * 1000 // 48 hours
const HOURLY_MAX_COUNT = 48
const DAILY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const DAILY_MAX_COUNT = 30

/**
 * Deterministic checksum utility matching src/lib/storage/checksum.ts
 * Implements 64-bit FNV-1a hash combined with Murmur-like avalanche mixing.
 */
function computeChecksum(content) {
  if (typeof content !== 'string') return ''
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4

  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i)
    h1 ^= ch
    h1 = Math.imul(h1, 0x01000193)

    h2 ^= ch
    h2 = Math.imul(h2, 0x01000193)
    h2 = (h2 << 5) | (h2 >>> 27)
  }

  h1 ^= h2 >>> 16
  h1 = Math.imul(h1, 0x85ebca6b)
  h1 ^= h1 >>> 13
  h1 = Math.imul(h1, 0xc2b2ae35)
  h1 ^= h1 >>> 16

  h2 ^= h1 >>> 16
  h2 = Math.imul(h2, 0x85ebca6b)
  h2 ^= h2 >>> 13
  h2 = Math.imul(h2, 0xc2b2ae35)
  h2 ^= h2 >>> 16

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0')
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0')
  return `${hex1}${hex2}`
}

function verifyChecksum(content, expectedChecksum) {
  if (!content || typeof expectedChecksum !== 'string' || !expectedChecksum.trim()) {
    return false
  }
  const actual = computeChecksum(content)
  return actual.toLowerCase() === expectedChecksum.trim().toLowerCase()
}

function isObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/**
 * Validates POSBackupFile structure and checksum in the main process.
 */
function validateBackupInMain(backupFile) {
  if (!isObject(backupFile)) {
    return { valid: false, error: 'Yedek verisi geçerli bir JSON nesnesi değil.' }
  }

  if (typeof backupFile.formatVersion !== 'number' || backupFile.formatVersion !== 1) {
    return { valid: false, error: 'Yedek format versiyonu geçersiz veya desteklenmiyor.' }
  }

  if (typeof backupFile.checksum !== 'string' || !backupFile.checksum.trim()) {
    return { valid: false, error: 'Bütünlük sağlama anahtarı (checksum) eksik.' }
  }

  if (!isObject(backupFile.data)) {
    return { valid: false, error: 'Yedek veri gövdesi (data) eksik veya geçersiz.' }
  }

  const payloadJson = JSON.stringify(backupFile.data)
  if (!verifyChecksum(payloadJson, backupFile.checksum)) {
    return {
      valid: false,
      error: 'Bütünlük doğrulaması (checksum) başarısız! Yedek dosyası bozulmuş.',
    }
  }

  const { data } = backupFile
  if (!Array.isArray(data.tables)) {
    return { valid: false, error: 'Yedek içindeki "tables" alanı geçersiz.' }
  }
  if (!Array.isArray(data.completedOrders)) {
    return { valid: false, error: 'Yedek içindeki "completedOrders" alanı geçersiz.' }
  }
  if (!Array.isArray(data.businessDays)) {
    return { valid: false, error: 'Yedek içindeki "businessDays" alanı geçersiz.' }
  }
  if (!Array.isArray(data.menuProducts)) {
    return { valid: false, error: 'Yedek içindeki "menuProducts" alanı geçersiz.' }
  }
  if (!isObject(data.appSettings)) {
    return { valid: false, error: 'Yedek içindeki "appSettings" alanı geçersiz.' }
  }

  return { valid: true, backup: backupFile }
}

/**
 * Resolves default backup directory: Documents/LemoonYedek
 */
function getDefaultBackupDir(electronApp) {
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return path.join(electronApp.getPath('documents'), 'LemoonYedek')
    }
  } catch {}
  return path.join(os.homedir(), 'Documents', 'LemoonYedek')
}

/**
 * Formats filename: lemoon-YYYYMMDD-HHmmss-<tür>.json
 */
function formatBackupFilename(date, rawType) {
  const d = date instanceof Date ? date : new Date(date || Date.now())
  const safeType = sanitizeBackupType(rawType)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `lemoon-${yyyy}${mm}${dd}-${hh}${min}${ss}-${safeType}.json`
}

function sanitizeBackupType(rawType) {
  if (typeof rawType !== 'string') return 'manuel'
  const normalized = rawType
    .trim()
    .toLowerCase()
    .replace(/ü/g, 'u')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
  if (VALID_BACKUP_TYPES.has(normalized)) {
    return normalized
  }
  return 'manuel'
}

/**
 * Parses a backup filename to extract its timestamp (Date) and type.
 */
function parseBackupFilename(fileName) {
  const match = BACKUP_FILENAME_REGEX.exec(fileName)
  if (!match) return null
  const [, yyyy, mm, dd, hh, min, ss, type] = match
  const parsedDate = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  )
  if (Number.isNaN(parsedDate.getTime())) return null
  return {
    date: parsedDate,
    type: type.toLowerCase(),
  }
}

/**
 * Atomically writes backup JSON to disk:
 * 1) Writes to <file>.tmp
 * 2) Calls fsyncSync to flush OS buffers to disk
 * 3) Renames <file>.tmp -> <file>
 * 4) Reads back <file> from disk and verifies JSON + checksum
 */
function writeBackupFileAtomic(targetDir, fileName, backupObj, fsImpl = fs) {
  fsImpl.mkdirSync(targetDir, { recursive: true })

  const finalPath = path.join(targetDir, fileName)
  const tmpPath = `${finalPath}.tmp`
  const serialized = JSON.stringify(backupObj, null, 2)

  let fd = null
  try {
    fd = fsImpl.openSync(tmpPath, 'w')
    fsImpl.writeFileSync(fd, serialized, 'utf8')
    fsImpl.fsyncSync(fd)
    fsImpl.closeSync(fd)
    fd = null

    fsImpl.renameSync(tmpPath, finalPath)
  } catch (err) {
    if (fd !== null) {
      try {
        fsImpl.closeSync(fd)
      } catch {}
    }
    try {
      if (fsImpl.existsSync(tmpPath)) {
        fsImpl.unlinkSync(tmpPath)
      }
    } catch {}
    throw err
  }

  // Read back and verify integrity
  const readBackRaw = fsImpl.readFileSync(finalPath, 'utf8')
  let readBackParsed
  try {
    readBackParsed = JSON.parse(readBackRaw)
  } catch {
    try {
      fsImpl.unlinkSync(finalPath)
    } catch {}
    throw new Error('Yazılan yedek dosyası geri okunduğunda JSON ayrıştırma hatası verdi.')
  }

  const verification = validateBackupInMain(readBackParsed)
  if (!verification.valid) {
    try {
      fsImpl.unlinkSync(finalPath)
    } catch {}
    throw new Error(
      `Yazılan yedek dosyası geri okuma doğrulamasından geçemedi: ${verification.error}`,
    )
  }

  return finalPath
}

/**
 * Applies retention policy to a backup directory:
 * - "saatlik" (and transient startup/shutdown "acilis"/"kapanis") backups:
 *   keep last 48 hours AND at most 48 files.
 * - "gunluk" backups:
 *   keep last 30 days AND at most 30 files.
 * Returns list of deleted filenames.
 */
function applyRetentionPolicy(targetDir, options = {}, fsImpl = fs) {
  const nowMs = options.now instanceof Date ? options.now.getTime() : (options.now || Date.now())
  const deletedFiles = []

  if (!fsImpl.existsSync(targetDir)) {
    return deletedFiles
  }

  let entries = []
  try {
    entries = fsImpl.readdirSync(targetDir)
  } catch {
    return deletedFiles
  }

  const hourlyGroup = []
  const dailyGroup = []

  for (const name of entries) {
    // Clean up any leftover stale .tmp files older than 1 hour
    if (name.endsWith('.tmp')) {
      try {
        const tmpStat = fsImpl.statSync(path.join(targetDir, name))
        if (nowMs - tmpStat.mtimeMs > 60 * 60 * 1000) {
          fsImpl.unlinkSync(path.join(targetDir, name))
        }
      } catch {}
      continue
    }

    const parsed = parseBackupFilename(name)
    if (!parsed) continue

    const fullPath = path.join(targetDir, name)
    const timestampMs = parsed.date.getTime()

    if (parsed.type === 'saatlik' || parsed.type === 'acilis' || parsed.type === 'kapanis') {
      hourlyGroup.push({ name, fullPath, timestampMs, type: parsed.type })
    } else if (parsed.type === 'gunluk') {
      dailyGroup.push({ name, fullPath, timestampMs, type: parsed.type })
    }
  }

  // Sort newest first
  hourlyGroup.sort((a, b) => b.timestampMs - a.timestampMs || b.name.localeCompare(a.name))
  dailyGroup.sort((a, b) => b.timestampMs - a.timestampMs || b.name.localeCompare(a.name))

  // Prune hourly backups (older than 48h OR beyond 48 count)
  hourlyGroup.forEach((item, index) => {
    const ageMs = nowMs - item.timestampMs
    if (ageMs > HOURLY_RETENTION_MS || index >= HOURLY_MAX_COUNT) {
      try {
        fsImpl.unlinkSync(item.fullPath)
        deletedFiles.push(item.name)
      } catch {}
    }
  })

  // Prune daily backups (older than 30d OR beyond 30 count)
  dailyGroup.forEach((item, index) => {
    const ageMs = nowMs - item.timestampMs
    if (ageMs > DAILY_RETENTION_MS || index >= DAILY_MAX_COUNT) {
      try {
        fsImpl.unlinkSync(item.fullPath)
        deletedFiles.push(item.name)
      } catch {}
    }
  })

  return deletedFiles
}

/**
 * Full backup write operation:
 * 1) Validates payload & checksum in main process
 * 2) Writes atomically to primaryDir & verifies read-back
 * 3) Runs retention cleanup in primaryDir
 * 4) If secondaryDir is set, writes atomically to secondaryDir & runs retention cleanup;
 *    if secondaryDir fails, captures warning without failing the primary backup.
 */
function performBackupWrite(params, fsImpl = fs) {
  const {
    backup,
    type = 'manuel',
    primaryDir,
    secondaryDir,
    now,
  } = params || {}

  if (!primaryDir || typeof primaryDir !== 'string') {
    return {
      success: false,
      error: 'Birincil yedek klasörü belirtilmedi.',
    }
  }

  // Ensure checksum is present or verify existing checksum
  const validation = validateBackupInMain(backup)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error || 'Yedek verisi doğrulaması başarısız.',
    }
  }

  const timestampDate = now ? new Date(now) : new Date()
  const safeType = sanitizeBackupType(type)
  const fileName = formatBackupFilename(timestampDate, safeType)

  let primaryFilePath
  try {
    primaryFilePath = writeBackupFileAtomic(primaryDir, fileName, backup, fsImpl)
    applyRetentionPolicy(primaryDir, { now: timestampDate }, fsImpl)
  } catch (err) {
    return {
      success: false,
      error: `Birincil yedek yazılamadı: ${err && err.message ? err.message : String(err)}`,
    }
  }

  let secondaryCopied = false
  let secondaryFilePath
  let secondaryWarning

  if (typeof secondaryDir === 'string' && secondaryDir.trim().length > 0) {
    const trimmedSecondary = secondaryDir.trim()
    try {
      // Check if secondary directory is on a mounted/accessible volume when root/parent doesn't exist
      secondaryFilePath = writeBackupFileAtomic(trimmedSecondary, fileName, backup, fsImpl)
      applyRetentionPolicy(trimmedSecondary, { now: timestampDate }, fsImpl)
      secondaryCopied = true
    } catch (err) {
      secondaryCopied = false
      secondaryWarning = `İkinci yedek klasörüne (${trimmedSecondary}) yazılamadı: ${
        err && err.message ? err.message : 'Klasör veya USB bellek erişilemiyor.'
      }`
    }
  }

  return {
    success: true,
    fileName,
    filePath: primaryFilePath,
    type: safeType,
    createdAt: backup.createdAt || timestampDate.toISOString(),
    secondaryCopied,
    secondaryFilePath,
    secondaryWarning,
  }
}

/**
 * Lists backup files in primaryDir sorted newest-first.
 */
function listBackupsInDir(primaryDir, fsImpl = fs) {
  if (!primaryDir || typeof primaryDir !== 'string') {
    return { success: false, backups: [], error: 'Geçersiz yedek klasörü.' }
  }

  try {
    if (!fsImpl.existsSync(primaryDir)) {
      fsImpl.mkdirSync(primaryDir, { recursive: true })
      return { success: true, directory: primaryDir, backups: [] }
    }

    const entries = fsImpl.readdirSync(primaryDir)
    const backups = []

    for (const fileName of entries) {
      if (!fileName.endsWith('.json') || fileName.endsWith('.tmp')) continue

      const fullPath = path.join(primaryDir, fileName)
      let stat
      try {
        stat = fsImpl.statSync(fullPath)
      } catch {
        continue
      }
      if (!stat.isFile()) continue

      const parsed = parseBackupFilename(fileName)
      const createdAt = parsed ? parsed.date.toISOString() : new Date(stat.mtimeMs).toISOString()
      const type = parsed ? parsed.type : 'manuel'

      backups.push({
        fileName,
        filePath: fullPath,
        createdAt,
        sizeBytes: stat.size,
        type,
      })
    }

    backups.sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (timeDiff !== 0) return timeDiff
      return b.fileName.localeCompare(a.fileName)
    })

    return {
      success: true,
      directory: primaryDir,
      backups,
    }
  } catch (err) {
    return {
      success: false,
      directory: primaryDir,
      backups: [],
      error: `Yedek listesi okunamadı: ${err && err.message ? err.message : String(err)}`,
    }
  }
}

/**
 * Reads and validates a backup file from primaryDir for restoration.
 */
function readBackupForRestore(primaryDir, fileName, fsImpl = fs) {
  if (!primaryDir || typeof primaryDir !== 'string') {
    return { success: false, error: 'Yedek klasörü tanımsız.' }
  }
  if (!fileName || typeof fileName !== 'string') {
    return { success: false, error: 'Yedek dosya adı belirtilmedi.' }
  }

  // Prevent path traversal
  const baseName = path.basename(fileName)
  if (baseName !== fileName || !baseName.endsWith('.json')) {
    return { success: false, error: 'Geçersiz yedek dosya adı.' }
  }

  const fullPath = path.join(primaryDir, baseName)
  if (!fsImpl.existsSync(fullPath)) {
    return { success: false, error: 'Seçilen yedek dosyası bulunamadı.' }
  }

  try {
    const raw = fsImpl.readFileSync(fullPath, 'utf8')
    const parsed = JSON.parse(raw)
    const validation = validateBackupInMain(parsed)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || 'Yedek dosyası doğrulaması başarısız.',
      }
    }

    return {
      success: true,
      fileName: baseName,
      backup: validation.backup,
    }
  } catch (err) {
    return {
      success: false,
      error: `Yedek dosyası okunamadı veya bozuk: ${err && err.message ? err.message : String(err)}`,
    }
  }
}

module.exports = {
  VALID_BACKUP_TYPES,
  BACKUP_FILENAME_REGEX,
  computeChecksum,
  verifyChecksum,
  validateBackupInMain,
  getDefaultBackupDir,
  formatBackupFilename,
  sanitizeBackupType,
  parseBackupFilename,
  writeBackupFileAtomic,
  applyRetentionPolicy,
  performBackupWrite,
  listBackupsInDir,
  readBackupForRestore,
}
