const path = require('path')
const fs = require('fs')
const os = require('os')
const Database = require('better-sqlite3')
const { runSchemaMigrations } = require('./schema.cjs')
const {
  getDefaultBackupDir,
  listBackupsInDir,
  readBackupForRestore,
} = require('../backupManager.cjs')

const DEFAULT_DB_FILENAME = 'lemoon-pos.sqlite'
const DEFAULT_BUSY_TIMEOUT_MS = 5000

/**
 * Resolves the database file path inside %APPDATA% / userData directory.
 * @param {any} [electronApp]
 * @returns {string}
 */
function getDefaultDbPath(electronApp) {
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      const userDataDir = electronApp.getPath('userData')
      return path.join(userDataDir, DEFAULT_DB_FILENAME)
    }
  } catch {}
  const fallbackAppData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'))
  return path.join(fallbackAppData, 'LEMOON KAFE POS', DEFAULT_DB_FILENAME)
}

/**
 * Applies required durability and concurrency PRAGMAs:
 * - journal_mode = WAL
 * - synchronous = FULL
 * - foreign_keys = ON
 * - busy_timeout = 5000
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} [busyTimeoutMs]
 */
function configurePragmas(db, busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS) {
  const timeout = typeof busyTimeoutMs === 'number' && busyTimeoutMs > 0 ? busyTimeoutMs : DEFAULT_BUSY_TIMEOUT_MS
  db.pragma(`busy_timeout = ${timeout}`)
  // In-memory databases return 'memory' for journal_mode; file databases return 'wal'
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')

  return {
    journalMode: String(db.pragma('journal_mode', { simple: true }) || '').toLowerCase(),
    synchronous: db.pragma('synchronous', { simple: true }), // FULL = 2
    foreignKeys: db.pragma('foreign_keys', { simple: true }), // ON = 1
    busyTimeout: db.pragma('busy_timeout', { simple: true }),
  }
}

/**
 * Runs PRAGMA integrity_check on the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ ok: boolean, messages: string[] }}
 */
function checkDatabaseIntegrity(db) {
  try {
    const rows = db.pragma('integrity_check')
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, messages: ['integrity_check returned empty result'] }
    }
    const messages = rows.map((r) =>
      typeof r === 'string' ? r : String(r.integrity_check ?? JSON.stringify(r)),
    )
    const ok = messages.length === 1 && messages[0].toLowerCase() === 'ok'
    return { ok, messages }
  } catch (err) {
    return {
      ok: false,
      messages: [err && err.message ? err.message : String(err)],
    }
  }
}

/**
 * Finds the most recent valid automatic backup from the primary backup directory (Adım 2).
 * @param {string} primaryBackupDir
 * @param {typeof fs} [fsImpl]
 * @returns {{ fileName: string, filePath: string, createdAt: string, type: string, backup: any } | null}
 */
function findLatestValidBackup(primaryBackupDir, fsImpl = fs) {
  if (!primaryBackupDir || typeof primaryBackupDir !== 'string') return null
  try {
    const listRes = listBackupsInDir(primaryBackupDir, fsImpl)
    if (!listRes.success || !Array.isArray(listRes.backups) || listRes.backups.length === 0) {
      return null
    }
    for (const item of listRes.backups) {
      const readRes = readBackupForRestore(primaryBackupDir, item.fileName, fsImpl)
      if (readRes.success && readRes.backup) {
        return {
          fileName: item.fileName,
          filePath: item.filePath,
          createdAt: item.createdAt,
          type: item.type,
          backup: readRes.backup,
        }
      }
    }
  } catch {}
  return null
}

/**
 * Moves a corrupted SQLite database file (and its -wal / -shm sidecars) aside so the app
 * can continue starting cleanly without losing the forensic corrupt file.
 * @param {string} dbPath
 * @param {typeof fs} [fsImpl]
 * @returns {string | null}
 */
function quarantineCorruptDatabaseFile(dbPath, fsImpl = fs) {
  if (!dbPath || dbPath === ':memory:') return null
  try {
    if (!fsImpl.existsSync(dbPath)) return null
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const quarantinedPath = `${dbPath}.corrupt-${stamp}`
    fsImpl.renameSync(dbPath, quarantinedPath)

    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${dbPath}${suffix}`
      if (fsImpl.existsSync(sidecar)) {
        try {
          fsImpl.renameSync(sidecar, `${quarantinedPath}${suffix}`)
        } catch {}
      }
    }
    return quarantinedPath
  } catch {
    return null
  }
}

/**
 * Opens the SQLite database, runs PRAGMA integrity_check, configures WAL/FULL/FK/busy_timeout,
 * and applies schema migrations.
 * If the database file is corrupted, quarantines it, opens a fresh database without crashing,
 * and locates the latest valid automatic backup to offer recovery.
 *
 * @param {object} [options]
 * @param {string} [options.dbPath]
 * @param {any} [options.electronApp]
 * @param {string} [options.primaryBackupDir]
 * @param {number} [options.busyTimeoutMs]
 * @param {typeof fs} [options.fsImpl]
 */
function openDatabase(options = {}) {
  const fsImpl = options.fsImpl || fs
  const dbPath = options.dbPath || getDefaultDbPath(options.electronApp)
  const primaryBackupDir =
    options.primaryBackupDir || getDefaultBackupDir(options.electronApp)

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath)
    fsImpl.mkdirSync(dir, { recursive: true })
  }

  let db = null
  let integrityOk = true
  let corruptionError = null
  let quarantinedDbPath = null
  let suggestedBackup = null

  try {
    db = new Database(dbPath)
    const integrity = checkDatabaseIntegrity(db)
    if (!integrity.ok) {
      throw new Error(`SQLite integrity_check başarısız: ${integrity.messages.join('; ')}`)
    }
    configurePragmas(db, options.busyTimeoutMs)
    runSchemaMigrations(db)
  } catch (err) {
    integrityOk = false
    corruptionError = err && err.message ? err.message : String(err)

    if (db) {
      try {
        db.close()
      } catch {}
      db = null
    }

    quarantinedDbPath = quarantineCorruptDatabaseFile(dbPath, fsImpl)
    suggestedBackup = findLatestValidBackup(primaryBackupDir, fsImpl)

    // Open a clean fallback database so the POS application never crashes on startup
    db = new Database(dbPath)
    configurePragmas(db, options.busyTimeoutMs)
    runSchemaMigrations(db)
  }

  const pragmas = configurePragmas(db, options.busyTimeoutMs)

  return {
    db,
    dbPath,
    pragmas,
    integrityOk,
    corruptionError,
    quarantinedDbPath,
    suggestedBackup,
  }
}

function closeDatabase(dbOrContext) {
  if (!dbOrContext) return
  try {
    const dbInstance = dbOrContext.db ? dbOrContext.db : dbOrContext
    if (dbInstance && typeof dbInstance.close === 'function' && dbInstance.open !== false) {
      dbInstance.close()
    }
  } catch {}
}

module.exports = {
  DEFAULT_DB_FILENAME,
  DEFAULT_BUSY_TIMEOUT_MS,
  getDefaultDbPath,
  configurePragmas,
  checkDatabaseIntegrity,
  findLatestValidBackup,
  quarantineCorruptDatabaseFile,
  openDatabase,
  closeDatabase,
}
