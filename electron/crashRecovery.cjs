const fs = require('fs')
const path = require('path')
const os = require('os')
const { writeLogEntry } = require('./logger.cjs')
const { checkDatabaseIntegrity } = require('./db/connection.cjs')
const { listBackupsInDir } = require('./backupManager.cjs')

const MAX_CONSECUTIVE_CRASHES = 3
const DEFAULT_RELOAD_DELAY_MS = 1500 // 1.5 seconds (within 1-2s requirement)
const SESSION_STATE_FILENAME = 'session-state.json'
const RECOVERY_NOTIFICATION_TEXT =
  'Uygulama beklenmedik şekilde kapandı, veriler kontrol edildi'

function getDefaultUserDataDir(electronApp) {
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return electronApp.getPath('userData')
    }
  } catch {}
  const fallbackAppData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'))
  return path.join(fallbackAppData, 'LEMOON KAFE POS')
}

/**
 * Generates a self-contained HTML error screen displayed when the renderer crashes 3 times in a row.
 */
function buildCrashErrorScreenHtml(crashDetails = {}) {
  const reason = String(crashDetails.reason || 'unexpected-crash')
  const timeStr = new Date().toLocaleTimeString('tr-TR')
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>LEMOON KAFE POS — Güvenli Kurtarma Ekranı</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1c1917;
      color: #f5f5f4;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .card {
      max-width: 520px;
      background: #292524;
      border: 2px solid #dc2626;
      border-radius: 20px;
      padding: 36px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }
    .badge {
      display: inline-block;
      background: #dc2626;
      color: #fff;
      font-weight: 800;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 999px;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 12px;
      color: #fafaf9;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #d6d3d1;
      margin: 0 0 20px;
    }
    .meta {
      background: #1c1917;
      border-radius: 10px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      color: #a8a29e;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">GÜVENLİ KORUMA MODU</div>
    <h1>Ekran Arka Arkaya 3 Kez Beklenmedik Şekilde Durdu</h1>
    <p>
      Veritabanınız ve açık adisyonlarınız güvendedir. Otomatik yenileme döngüsü
      veri güvenliği için durduruldu. Lütfen uygulamayı yeniden başlatın veya teknik destek için
      hata kayıtlarını paylaşın.
    </p>
    <div class="meta">
      Durum Kodu: ${reason} · Saat: ${timeStr}
    </div>
  </div>
</body>
</html>`
}

/**
 * Creates a stateful Crash & Session Recovery Manager for the Electron main process.
 * Fully unit-testable with custom options (timers, fsImpl, logsDir, etc.).
 */
function createCrashRecoveryManager(options = {}) {
  const fsImpl = options.fsImpl || fs
  const userDataDir = options.userDataDir || getDefaultUserDataDir(options.electronApp)
  const logsDir = options.logsDir || path.join(userDataDir, 'logs')
  const maxCrashes =
    typeof options.maxConsecutiveCrashes === 'number'
      ? options.maxConsecutiveCrashes
      : MAX_CONSECUTIVE_CRASHES
  const reloadDelayMs =
    typeof options.reloadDelayMs === 'number'
      ? options.reloadDelayMs
      : DEFAULT_RELOAD_DELAY_MS
  const scheduleTimer = options.setTimeoutImpl || setTimeout

  let consecutiveCrashes = 0
  let autoReloadStopped = false
  let unresponsive = false
  let pendingReloadTimer = null
  let startupRecoveryStatus = {
    recovered: false,
    message: null,
    integrityOk: true,
    integrityMessages: ['ok'],
    checkedAt: null,
    acknowledged: false,
  }

  const sessionStatePath = path.join(userDataDir, SESSION_STATE_FILENAME)

  function readSessionState() {
    try {
      if (!fsImpl.existsSync(sessionStatePath)) return null
      const raw = fsImpl.readFileSync(sessionStatePath, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function writeSessionState(state) {
    try {
      fsImpl.mkdirSync(userDataDir, { recursive: true })
      fsImpl.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2), 'utf8')
    } catch {}
  }

  /**
   * Checks if the previous session ended unexpectedly (crash or power loss),
   * runs SQLite `PRAGMA integrity_check`, logs the check, and prepares the startup banner.
   */
  function initializeSession(dbInstance) {
    const prevState = readSessionState()
    const nowIso = new Date().toISOString()
    const wasDirtyShutdown = Boolean(
      prevState && (prevState.active === true || prevState.cleanExit === false || prevState.hadRendererCrash === true),
    )

    let integrity = { ok: true, messages: ['ok'] }
    if (dbInstance) {
      integrity = checkDatabaseIntegrity(dbInstance)
    }

    if (wasDirtyShutdown) {
      startupRecoveryStatus = {
        recovered: true,
        message: RECOVERY_NOTIFICATION_TEXT,
        integrityOk: integrity.ok,
        integrityMessages: integrity.messages,
        checkedAt: nowIso,
        acknowledged: false,
      }

      writeLogEntry(
        {
          level: integrity.ok ? 'warn' : 'error',
          category: 'CRASH_RECOVERY',
          message: RECOVERY_NOTIFICATION_TEXT,
          meta: {
            previousStartedAt: prevState?.startedAt,
            hadRendererCrash: Boolean(prevState?.hadRendererCrash),
            integrityOk: integrity.ok,
            integrityMessages: integrity.messages,
          },
        },
        { fsImpl, logsDir },
      )
    }

    writeSessionState({
      active: true,
      cleanExit: false,
      hadRendererCrash: false,
      startedAt: nowIso,
    })

    return startupRecoveryStatus
  }

  function markCleanShutdown() {
    writeSessionState({
      active: false,
      cleanExit: true,
      hadRendererCrash: false,
      stoppedAt: new Date().toISOString(),
    })
  }

  function getStartupRecovery() {
    return { ...startupRecoveryStatus }
  }

  function acknowledgeStartupRecovery() {
    startupRecoveryStatus = {
      ...startupRecoveryStatus,
      recovered: false,
      acknowledged: true,
    }
    return { ...startupRecoveryStatus }
  }

  /**
   * Handles renderer process termination (`render-process-gone`).
   * - Reloads automatically within 1-2s for crashes 1 and 2.
   * - Stops reloading on the 3rd consecutive crash and shows the error screen.
   */
  function handleRenderProcessGone(win, details = {}, dbInstance = null) {
    const reason = details && details.reason ? details.reason : 'crashed'
    if (reason === 'clean-exit') {
      return { action: 'ignored', consecutiveCrashes }
    }

    consecutiveCrashes += 1
    const nowIso = new Date().toISOString()

    // Run DB integrity check immediately after renderer crash
    const integrity = dbInstance ? checkDatabaseIntegrity(dbInstance) : { ok: true, messages: ['ok'] }

    startupRecoveryStatus = {
      recovered: true,
      message: RECOVERY_NOTIFICATION_TEXT,
      integrityOk: integrity.ok,
      integrityMessages: integrity.messages,
      checkedAt: nowIso,
      acknowledged: false,
    }

    writeSessionState({
      active: true,
      cleanExit: false,
      hadRendererCrash: true,
      lastCrashAt: nowIso,
      lastCrashReason: reason,
    })

    writeLogEntry(
      {
        level: 'error',
        category: 'RENDERER_CRASH',
        message: `Renderer süreci beklenmedik şekilde sonlandı (${reason}). Ardışık çökme: ${consecutiveCrashes}/${maxCrashes}`,
        meta: {
          reason,
          exitCode: details.exitCode,
          consecutiveCrashes,
          integrityOk: integrity.ok,
        },
      },
      { fsImpl, logsDir },
    )

    if (consecutiveCrashes >= maxCrashes) {
      autoReloadStopped = true
      writeLogEntry(
        {
          level: 'error',
          category: 'RENDERER_CRASH_FATAL',
          message: `Ardışık ${consecutiveCrashes} çökme sonrası otomatik yenileme durduruldu; güvenli hata ekranı gösteriliyor.`,
          meta: { reason, consecutiveCrashes },
        },
        { fsImpl, logsDir },
      )

      if (win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed())) {
        const html = buildCrashErrorScreenHtml({ reason })
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        if (typeof win.loadURL === 'function') {
          win.loadURL(dataUrl)
        }
      }

      return {
        action: 'error-screen',
        consecutiveCrashes,
        autoReloadStopped: true,
      }
    }

    autoReloadStopped = false
    pendingReloadTimer = scheduleTimer(() => {
      if (win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed())) {
        if (typeof win.reload === 'function') {
          win.reload()
        } else if (win.webContents && typeof win.webContents.reload === 'function') {
          win.webContents.reload()
        }
      }
    }, reloadDelayMs)

    return {
      action: 'reload-scheduled',
      reloadDelayMs,
      consecutiveCrashes,
      autoReloadStopped: false,
    }
  }

  function handleUnresponsive() {
    unresponsive = true
    writeLogEntry(
      {
        level: 'warn',
        category: 'RENDERER_UNRESPONSIVE',
        message: 'Renderer süreci yanıt vermiyor (unresponsive).',
      },
      { fsImpl, logsDir },
    )
    return { unresponsive: true }
  }

  function handleResponsive() {
    unresponsive = false
    consecutiveCrashes = 0
    autoReloadStopped = false
    writeLogEntry(
      {
        level: 'info',
        category: 'RENDERER_RESPONSIVE',
        message: 'Renderer süreci tekrar yanıt veriyor (responsive).',
      },
      { fsImpl, logsDir },
    )
    return { unresponsive: false, consecutiveCrashes: 0 }
  }

  function resetCrashCounter() {
    consecutiveCrashes = 0
    autoReloadStopped = false
  }

  function handleUncaughtException(error) {
    writeLogEntry(
      {
        level: 'error',
        category: 'UNCAUGHT_EXCEPTION',
        message: error && error.message ? error.message : String(error),
        meta: error,
      },
      { fsImpl, logsDir },
    )
    return { handled: true, logged: true }
  }

  function handleUnhandledRejection(reason) {
    writeLogEntry(
      {
        level: 'error',
        category: 'UNHANDLED_REJECTION',
        message: reason && reason.message ? reason.message : String(reason),
        meta: reason,
      },
      { fsImpl, logsDir },
    )
    return { handled: true, logged: true }
  }

  function attachToWindow(win, getDbInstance) {
    if (!win || !win.webContents) return
    const contents = win.webContents

    contents.on('render-process-gone', (_event, details) => {
      const db = typeof getDbInstance === 'function' ? getDbInstance() : null
      handleRenderProcessGone(win, details, db)
    })

    contents.on('unresponsive', () => {
      handleUnresponsive()
    })

    contents.on('responsive', () => {
      handleResponsive()
    })
  }

  function attachProcessListeners(proc = process) {
    const onUncaught = (err) => {
      handleUncaughtException(err)
    }
    const onRejection = (reason) => {
      handleUnhandledRejection(reason)
    }
    proc.on('uncaughtException', onUncaught)
    proc.on('unhandledRejection', onRejection)
    return () => {
      proc.removeListener('uncaughtException', onUncaught)
      proc.removeListener('unhandledRejection', onRejection)
    }
  }

  function getState() {
    return {
      consecutiveCrashes,
      autoReloadStopped,
      unresponsive,
      startupRecoveryStatus: { ...startupRecoveryStatus },
      pendingReloadTimer,
    }
  }

  return {
    initializeSession,
    markCleanShutdown,
    getStartupRecovery,
    acknowledgeStartupRecovery,
    handleRenderProcessGone,
    handleUnresponsive,
    handleResponsive,
    resetCrashCounter,
    handleUncaughtException,
    handleUnhandledRejection,
    attachToWindow,
    attachProcessListeners,
    getState,
  }
}

/**
 * Collects disk, database size, backup recency, and secondary backup directory accessibility
 * from the main process for the System Health Indicator (Adım 5.3).
 */
function collectSystemHealthMetrics(options = {}) {
  const fsImpl = options.fsImpl || fs
  const dbPath = options.dbPath || ''
  const primaryBackupDir = options.primaryBackupDir || ''
  const secondaryBackupDir = options.secondaryBackupDir || ''

  let dbSizeBytes = 0
  if (dbPath && dbPath !== ':memory:') {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${dbPath}${suffix}`
      try {
        if (fsImpl.existsSync(p)) {
          const st = fsImpl.statSync(p)
          dbSizeBytes += st.size || 0
        }
      } catch {}
    }
  }

  let freeDiskBytes = null
  let totalDiskBytes = null
  try {
    const targetDir =
      dbPath && dbPath !== ':memory:'
        ? path.dirname(dbPath)
        : primaryBackupDir || os.tmpdir()
    if (typeof fsImpl.statfsSync === 'function' && fsImpl.existsSync(targetDir)) {
      const statFs = fsImpl.statfsSync(targetDir)
      const bsize = Number(statFs.bsize || statFs.frsize || 4096)
      freeDiskBytes = Number(statFs.bavail ?? statFs.bfree ?? 0) * bsize
      totalDiskBytes = Number(statFs.blocks ?? 0) * bsize
    }
  } catch {}

  let lastBackupAt = null
  let backupCount = 0
  if (primaryBackupDir) {
    try {
      const listRes = listBackupsInDir(primaryBackupDir, fsImpl)
      if (listRes.success && Array.isArray(listRes.backups) && listRes.backups.length > 0) {
        backupCount = listRes.backups.length
        lastBackupAt = listRes.backups[0].createdAt
      }
    } catch {}
  }

  let secondaryDirConfigured = Boolean(secondaryBackupDir && String(secondaryBackupDir).trim())
  let secondaryDirAccessible = true
  if (secondaryDirConfigured) {
    const trimmed = String(secondaryBackupDir).trim()
    try {
      if (fsImpl.existsSync(trimmed)) {
        const st = fsImpl.statSync(trimmed)
        if (!st.isDirectory()) {
          secondaryDirAccessible = false
        } else if (typeof fsImpl.accessSync === 'function') {
          fsImpl.accessSync(trimmed, fsImpl.constants ? fsImpl.constants.W_OK : 2)
          secondaryDirAccessible = true
        }
      } else {
        // Check if parent directory exists and is writable
        const parentDir = path.dirname(trimmed)
        if (fsImpl.existsSync(parentDir) && typeof fsImpl.statSync === 'function') {
          secondaryDirAccessible = fsImpl.statSync(parentDir).isDirectory()
        } else {
          secondaryDirAccessible = false
        }
      }
    } catch {
      secondaryDirAccessible = false
    }
  }

  return {
    dbSizeBytes,
    freeDiskBytes,
    totalDiskBytes,
    lastBackupAt,
    backupCount,
    secondaryDirConfigured,
    secondaryDirAccessible,
    serverTimeIso: new Date().toISOString(),
  }
}

module.exports = {
  MAX_CONSECUTIVE_CRASHES,
  DEFAULT_RELOAD_DELAY_MS,
  SESSION_STATE_FILENAME,
  RECOVERY_NOTIFICATION_TEXT,
  buildCrashErrorScreenHtml,
  createCrashRecoveryManager,
  collectSystemHealthMetrics,
}
