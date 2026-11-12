const fs = require('fs')
const path = require('path')
const os = require('os')
const zlib = require('zlib')

const MAX_LOG_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_LOG_FILES = 10
const DEFAULT_LOG_FILENAME = 'lemoon-pos.log'

// Sensitive keys that must NEVER be logged
const SENSITIVE_KEY_REGEX =
  /^(password|parola|sifre|şifre|pin|pinhash|passwordhash|secret|token|authorization|auth|credential|pass|newpassword|oldpassword|currentpassword|adminpassword|waiterpin)$/i

// Regex patterns for inline secrets in strings
const PBKDF2_HASH_REGEX = /pbkdf2\$\d+\$[a-fA-F0-9]+\$[a-fA-F0-9]+/g
const INLINE_SECRET_KV_REGEX =
  /((?:password|parola|sifre|şifre|pin|pinHash|passwordHash|pin_hash|password_hash)\s*["']?\s*[:=]\s*["']?)([^"',\s}\]]+)/gi

/**
 * Resolves the logs directory inside %APPDATA% / userData.
 * @param {any} [electronApp]
 * @returns {string}
 */
function getDefaultLogsDir(electronApp) {
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return path.join(electronApp.getPath('userData'), 'logs')
    }
  } catch {}
  const fallbackAppData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'))
  return path.join(fallbackAppData, 'LEMOON KAFE POS', 'logs')
}

/**
 * Scrubs any password, PIN, or PBKDF2 hash from a string.
 * @param {string} text
 * @returns {string}
 */
function redactSensitiveString(text) {
  if (typeof text !== 'string') return String(text ?? '')
  return text
    .replace(PBKDF2_HASH_REGEX, '[REDACTED_HASH]')
    .replace(INLINE_SECRET_KV_REGEX, '$1[REDACTED]')
}

/**
 * Deeply clones and redacts sensitive fields from any object or value before logging.
 * @param {any} value
 * @param {number} [depth]
 * @returns {any}
 */
function sanitizeLogData(value, depth = 0) {
  if (depth > 6) return '[MAX_DEPTH]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactSensitiveString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message || ''),
      stack: redactSensitiveString(value.stack || ''),
      ...(value.code ? { code: value.code } : {}),
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogData(item, depth + 1))
  }

  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_REGEX.test(k) || /password|parola|sifre|şifre|pin/i.test(k)) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = sanitizeLogData(v, depth + 1)
      }
    }
    return out
  }

  return String(value)
}

/**
 * Rotates log files in `logsDir` when the active log file reaches `maxFileSizeBytes`.
 * Keeps at most `maxFiles` files:
 * - `lemoon-pos.log` (active)
 * - `lemoon-pos.1.log` ... `lemoon-pos.<maxFiles-1>.log` (rotated archives)
 */
function rotateLogFilesIfNeeded(options = {}) {
  const fsImpl = options.fsImpl || fs
  const logsDir = options.logsDir || getDefaultLogsDir(options.electronApp)
  const fileName = options.fileName || DEFAULT_LOG_FILENAME
  const maxFileSizeBytes =
    typeof options.maxFileSizeBytes === 'number' && options.maxFileSizeBytes > 0
      ? options.maxFileSizeBytes
      : MAX_LOG_FILE_SIZE_BYTES
  const maxFiles =
    typeof options.maxFiles === 'number' && options.maxFiles >= 2
      ? options.maxFiles
      : MAX_LOG_FILES

  const activeLogPath = path.join(logsDir, fileName)
  if (!fsImpl.existsSync(activeLogPath)) return false

  let stat
  try {
    stat = fsImpl.statSync(activeLogPath)
  } catch {
    return false
  }

  if (stat.size < maxFileSizeBytes) {
    return false
  }

  const baseName = fileName.replace(/\.log$/i, '')

  // Delete the oldest archive if it exists (e.g. lemoon-pos.9.log when maxFiles = 10)
  const maxArchiveIndex = maxFiles - 1
  const oldestPath = path.join(logsDir, `${baseName}.${maxArchiveIndex}.log`)
  if (fsImpl.existsSync(oldestPath)) {
    try {
      fsImpl.unlinkSync(oldestPath)
    } catch {}
  }

  // Shift .8 -> .9, .7 -> .8, ..., .1 -> .2
  for (let i = maxArchiveIndex - 1; i >= 1; i--) {
    const src = path.join(logsDir, `${baseName}.${i}.log`)
    const dest = path.join(logsDir, `${baseName}.${i + 1}.log`)
    if (fsImpl.existsSync(src)) {
      try {
        fsImpl.renameSync(src, dest)
      } catch {}
    }
  }

  // Move active lemoon-pos.log -> lemoon-pos.1.log
  const firstArchive = path.join(logsDir, `${baseName}.1.log`)
  try {
    fsImpl.renameSync(activeLogPath, firstArchive)
    return true
  } catch {
    return false
  }
}

/**
 * Writes a sanitized log entry to `%APPDATA%/.../logs/lemoon-pos.log`, rotating if >= 5 MB.
 * @param {object} entry
 * @param {'info'|'warn'|'error'} [entry.level]
 * @param {string} [entry.category]
 * @param {string} entry.message
 * @param {any} [entry.meta]
 * @param {object} [options]
 */
function writeLogEntry(entry, options = {}) {
  const fsImpl = options.fsImpl || fs
  const logsDir = options.logsDir || getDefaultLogsDir(options.electronApp)
  const fileName = options.fileName || DEFAULT_LOG_FILENAME

  try {
    fsImpl.mkdirSync(logsDir, { recursive: true })
    rotateLogFilesIfNeeded({ ...options, fsImpl, logsDir, fileName })

    const timestamp = entry.timestamp || new Date().toISOString()
    const level = String(entry.level || 'info').toUpperCase()
    const category = String(entry.category || 'APP').toUpperCase()
    const safeMessage = redactSensitiveString(String(entry.message || ''))
    const safeMeta =
      entry.meta !== undefined ? JSON.stringify(sanitizeLogData(entry.meta)) : ''

    const line = `[${timestamp}] [${level}] [${category}] ${safeMessage}${safeMeta ? ` | ${safeMeta}` : ''}\n`
    const activeLogPath = path.join(logsDir, fileName)
    fsImpl.appendFileSync(activeLogPath, line, 'utf8')

    // Check if the append pushed the file over maxFileSizeBytes
    rotateLogFilesIfNeeded({ ...options, fsImpl, logsDir, fileName })
    return { success: true, logPath: activeLogPath }
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    }
  }
}

/**
 * Lists all `.log` files in `logsDir` sorted newest first.
 */
function listLogFiles(options = {}) {
  const fsImpl = options.fsImpl || fs
  const logsDir = options.logsDir || getDefaultLogsDir(options.electronApp)

  try {
    if (!fsImpl.existsSync(logsDir)) return []
    const names = fsImpl.readdirSync(logsDir).filter((n) => n.endsWith('.log'))
    const files = []
    for (const name of names) {
      const fullPath = path.join(logsDir, name)
      try {
        const st = fsImpl.statSync(fullPath)
        if (st.isFile()) {
          files.push({
            fileName: name,
            filePath: fullPath,
            sizeBytes: st.size,
            mtimeMs: st.mtimeMs,
          })
        }
      } catch {}
    }
    return files.sort((a, b) => a.fileName.localeCompare(b.fileName))
  } catch {
    return []
  }
}

// ────────────────────────────────────────────────────────────
// Pure Node Standard ZIP Archive Builder (Zero Dependencies)
// ────────────────────────────────────────────────────────────

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Packs an array of `{ name: string, data: Buffer | string }` into a valid ZIP Buffer.
 * @param {Array<{ name: string, data: Buffer | string }>} entries
 * @returns {Buffer}
 */
function buildZipBuffer(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(String(entry.name).replace(/\\/g, '/'), 'utf8')
    const rawBuf = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data || ''), 'utf8')
    const crc = crc32(rawBuf)
    const compressedBuf = zlib.deflateRawSync(rawBuf)

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0) // signature
    localHeader.writeUInt16LE(20, 4) // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6) // UTF-8 flag
    localHeader.writeUInt16LE(8, 8) // compression method: deflate (8)
    localHeader.writeUInt16LE(0, 10) // mod time
    localHeader.writeUInt16LE(0, 12) // mod date
    localHeader.writeUInt32LE(crc, 14) // crc32
    localHeader.writeUInt32LE(compressedBuf.length, 18) // compressed size
    localHeader.writeUInt32LE(rawBuf.length, 22) // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26) // file name length
    localHeader.writeUInt16LE(0, 28) // extra field length

    localParts.push(localHeader, nameBuf, compressedBuf)

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0) // signature
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0x0800, 8) // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10) // deflate
    centralHeader.writeUInt16LE(0, 12) // mod time
    centralHeader.writeUInt16LE(0, 14) // mod date
    centralHeader.writeUInt32LE(crc, 16) // crc32
    centralHeader.writeUInt32LE(compressedBuf.length, 20)
    centralHeader.writeUInt32LE(rawBuf.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra length
    centralHeader.writeUInt16LE(0, 32) // comment length
    centralHeader.writeUInt16LE(0, 34) // disk number
    centralHeader.writeUInt16LE(0, 36) // internal attrs
    centralHeader.writeUInt32LE(0, 38) // external attrs
    centralHeader.writeUInt32LE(offset, 42) // local header offset

    centralParts.push(centralHeader, nameBuf)
    offset += localHeader.length + nameBuf.length + compressedBuf.length
  }

  const centralDirBuf = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // EOCD signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // central dir start disk
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirBuf, eocd])
}

/**
 * Bundles all log files in `logsDir` (scrubbed for any sensitive data) into a single `.zip` buffer.
 * @param {object} [options]
 * @returns {{ zipBuffer: Buffer, fileCount: number, fileNames: string[] }}
 */
function createLogsZipBundle(options = {}) {
  const fsImpl = options.fsImpl || fs
  const logsDir = options.logsDir || getDefaultLogsDir(options.electronApp)
  const logFiles = listLogFiles({ fsImpl, logsDir })

  const zipEntries = []
  for (const lf of logFiles) {
    try {
      const content = fsImpl.readFileSync(lf.filePath, 'utf8')
      const scrubbed = redactSensitiveString(content)
      zipEntries.push({
        name: lf.fileName,
        data: Buffer.from(scrubbed, 'utf8'),
      })
    } catch {}
  }

  const summary = {
    exportedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    logFileCount: zipEntries.length,
    files: logFiles.map((f) => ({
      fileName: f.fileName,
      sizeBytes: f.sizeBytes,
    })),
  }

  zipEntries.push({
    name: 'system-diagnostics.json',
    data: Buffer.from(JSON.stringify(summary, null, 2), 'utf8'),
  })

  const zipBuffer = buildZipBuffer(zipEntries)
  return {
    zipBuffer,
    fileCount: logFiles.length,
    fileNames: logFiles.map((f) => f.fileName),
  }
}

module.exports = {
  MAX_LOG_FILE_SIZE_BYTES,
  MAX_LOG_FILES,
  DEFAULT_LOG_FILENAME,
  getDefaultLogsDir,
  redactSensitiveString,
  sanitizeLogData,
  rotateLogFilesIfNeeded,
  writeLogEntry,
  listLogFiles,
  buildZipBuffer,
  createLogsZipBundle,
}
