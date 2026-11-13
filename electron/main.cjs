const { app, BrowserWindow, ipcMain, screen, dialog, session, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const {
  getDefaultBackupDir,
  performBackupWrite,
  listBackupsInDir,
  readBackupForRestore,
} = require('./backupManager.cjs')
const {
  openDatabase,
  executeDbAction,
} = require('./db/index.cjs')
const {
  writeLogEntry,
  createLogsZipBundle,
} = require('./logger.cjs')
const {
  createCrashRecoveryManager,
  collectSystemHealthMetrics,
} = require('./crashRecovery.cjs')
const {
  createHardenedWebPreferences,
  isBlockedShortcut,
  isAllowedNavigation,
  buildContentSecurityPolicy,
  launchWindowsVirtualKeyboard,
  isTrustedMainWindowSender,
  validateNoArgsPayload,
  validateCartJsonPayload,
  validateQuitAppPayload,
  validateBackupWritePayload,
  validateBackupRestoreReadPayload,
  validateDbActionPayload,
  validateSystemLogPayload,
} = require('./security.cjs')

const crashManager = createCrashRecoveryManager({ electronApp: app })
crashManager.attachProcessListeners(process)

// Single Instance Lock — prevent opening multiple app instances on POS hardware
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

// Enable GPU hardware acceleration for smooth rendering on Windows POS hardware
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// Windows DPI awareness — force 1:1 pixel ratio to prevent element drift on POS displays
app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

/** @type {BrowserWindow | null} */
let mainWindow = null

/** @type {BrowserWindow | null} */
let customerWindow = null

/** @type {ReturnType<typeof openDatabase> | null} */
let dbContext = null

function ensureDbContext() {
  if (!dbContext) {
    dbContext = openDatabase({
      electronApp: app,
      primaryBackupDir: getDefaultBackupDir(app),
    })
  }
  return dbContext
}

const isDev = !app.isPackaged
const iconPath = path.join(__dirname, 'icons', 'icon.png')
const preloadPath = path.join(__dirname, 'preload.cjs')
const distDir = path.join(__dirname, '..', 'dist')

// Track whether application quit was explicitly authorized by an administrator
app.isAuthorizedQuit = false
app.isQuitting = false

/**
 * Attach navigation locks, DevTools blocks, context-menu blocks, and shortcut guards
 * to a WebContents instance.
 */
function attachWebContentsSecurityGuards(contents) {
  if (!contents) return

  // 3) Block all window.open() / target="_blank" external window creation
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // 3) Lock navigation to prevent leaving the POS application
  contents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, isDev, distDir)) {
      event.preventDefault()
    }
  })

  contents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, isDev, distDir)) {
      event.preventDefault()
    }
  })

  // Prevent embedding arbitrary <webview> tags
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // 1) Disable right-click context menu in production
  contents.on('context-menu', (event) => {
    if (!isDev) {
      event.preventDefault()
    }
  })

  // 1) Force-close DevTools if opened by any means in production
  contents.on('devtools-opened', () => {
    if (!isDev) {
      contents.closeDevTools()
    }
  })

  // 1 & 5) Block DevTools, reload, close, and kiosk-escape keyboard shortcuts in production
  contents.on('before-input-event', (event, input) => {
    if (isBlockedShortcut(input, isDev)) {
      event.preventDefault()
    }
  })
}

// Apply guards globally to all created webContents
app.on('web-contents-created', (_event, contents) => {
  attachWebContentsSecurityGuards(contents)
})

/**
 * Load main window content
 */
function loadMainContent(win) {
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(distDir, 'index.html'))
  }
}

/**
 * Load customer display window content
 */
function loadCustomerDisplayContent(win) {
  if (isDev) {
    win.loadURL('http://localhost:5173/customer-display.html')
  } else {
    win.loadFile(path.join(distDir, 'customer-display.html'))
  }
}

/**
 * Execute graceful shutdown with final backup flush once authorized
 */
function performGracefulQuit() {
  if (app.isQuitting) return
  app.isQuitting = true
  app.isAuthorizedQuit = true
  crashManager.markCleanShutdown()

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-before-quit')
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy()
      }
      app.quit()
    }, 1200)
  } else {
    app.quit()
  }
}

/**
 * Create the main application window
 */
function createMainWindow() {
  const { workArea } = screen.getPrimaryDisplay()

  mainWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    show: false,
    fullscreen: false,
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    movable: true,
    closable: true,
    title: 'LEMOON KAFE - Kasa & Restoran Otomasyonu',
    icon: iconPath,
    webPreferences: createHardenedWebPreferences(preloadPath, isDev),
  })

  loadMainContent(mainWindow)

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize()
      mainWindow.show()
    }
  })

  // Attach crash & unresponsive recovery handlers (Adım 5)
  crashManager.attachToWindow(mainWindow, () => ensureDbContext().db)

  // Lock zoom level to prevent DPI drift on Windows POS devices
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(1.0)
      mainWindow.webContents.setZoomLevel(0)
    }
  })

  // Open DevTools only in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Block unauthorized window close (e.g. Alt+F4 or taskbar close) in production
  mainWindow.on('close', (event) => {
    if (!isDev && !app.isAuthorizedQuit) {
      event.preventDefault()
      return
    }

    if (!app.isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault()
      performGracefulQuit()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.destroy()
    }
  })
}

/**
 * Open customer display on second monitor (if available)
 */
function openCustomerDisplay() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    if (customerWindow.isMinimized()) customerWindow.restore()
    customerWindow.focus()
    return { success: true }
  }

  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const externalDisplay = displays.find((display) => display.id !== primary.id)
  const targetDisplay = externalDisplay || primary
  const { workArea } = targetDisplay

  const windowOptions = {
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    show: false,
    fullscreen: false,
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    movable: true,
    title: 'LEMOON KAFE - Müşteri Ekranı',
    icon: iconPath,
    webPreferences: createHardenedWebPreferences(preloadPath, isDev),
  }

  customerWindow = new BrowserWindow(windowOptions)
  loadCustomerDisplayContent(customerWindow)

  customerWindow.once('ready-to-show', () => {
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.maximize()
      customerWindow.show()
    }
  })

  customerWindow.on('close', (event) => {
    if (!isDev && !app.isAuthorizedQuit && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault()
    }
  })

  customerWindow.on('closed', () => {
    customerWindow = null
  })

  return { success: true }
}

// ── IPC Handlers (All Validated) ──────────────────────

ipcMain.handle('open-customer-display', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'open-customer-display')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }
  return openCustomerDisplay()
})

ipcMain.handle('update-customer-display', (event, cartJson) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const validation = validateCartJsonPayload(cartJson)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('cart-update', validation.sanitizedJson)
  }
  return { success: true }
})

ipcMain.handle('quit-app', (event, payload) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const validation = validateQuitAppPayload(payload)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }
  app.isAuthorizedQuit = true
  performGracefulQuit()
  return { success: true }
})

ipcMain.handle('minimize-app', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'minimize-app')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize()
  }
  return { success: true }
})

ipcMain.handle('toggle-fullscreen', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'toggle-fullscreen')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }
  // In packaged kiosk mode, leaving fullscreen is disabled
  if (!isDev) {
    return { success: false, error: 'Kiosk modunda tam ekrandan çıkış devre dışıdır.' }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
  }
  return { success: true }
})

ipcMain.handle('open-windows-keyboard', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'open-windows-keyboard')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }
  const res = launchWindowsVirtualKeyboard()
  return { success: res.launched, ...res }
})

// ── Automated & Dual-Location Backup IPC Handlers ─────

ipcMain.handle('backup:write', (event, payload) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const validation = validateBackupWritePayload(payload)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }
  const primaryDir = getDefaultBackupDir(app)
  return performBackupWrite({
    backup: validation.backup,
    type: validation.type,
    primaryDir,
    secondaryDir: validation.secondaryDir,
  })
})

ipcMain.handle('backup:list', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, backups: [], error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'backup:list')
  if (!argCheck.valid) {
    return { success: false, backups: [], error: argCheck.error }
  }
  const primaryDir = getDefaultBackupDir(app)
  return listBackupsInDir(primaryDir)
})

ipcMain.handle('backup:restore-read', (event, fileName) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const validation = validateBackupRestoreReadPayload(fileName)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }
  const primaryDir = getDefaultBackupDir(app)
  return readBackupForRestore(primaryDir, validation.fileName)
})

ipcMain.handle('backup:select-dir', async (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { canceled: true, path: null, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'backup:select-dir')
  if (!argCheck.valid) {
    return { canceled: true, path: null, error: argCheck.error }
  }
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'İkinci Yedek Klasörü Seçin (USB Bellek / Bulut Klasörü)',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true, path: null }
  }
  return { canceled: false, path: result.filePaths[0] }
})

// ── SQLite Database IPC Handlers (Sync & Async) ───────

ipcMain.on('db:sync', (event, action, payload) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    event.returnValue = { success: false, error: 'Yetkisiz IPC göndericisi.' }
    return
  }
  const actionCheck = validateDbActionPayload(action)
  if (!actionCheck.valid) {
    event.returnValue = { success: false, error: actionCheck.error }
    return
  }
  const ctx = ensureDbContext()
  event.returnValue = executeDbAction(ctx, actionCheck.action, payload)
})

ipcMain.handle('db:invoke', (event, action, payload) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const actionCheck = validateDbActionPayload(action)
  if (!actionCheck.valid) {
    return { success: false, error: actionCheck.error }
  }
  const ctx = ensureDbContext()
  return executeDbAction(ctx, actionCheck.action, payload)
})

// ── File Logger, Crash Recovery & System Health IPC Handlers (Adım 5) ──

ipcMain.handle('logs:write', (event, payload) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const validation = validateSystemLogPayload(payload)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }
  return writeLogEntry(validation.entry, { electronApp: app })
})

ipcMain.handle('logs:export', async (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'logs:export')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }

  try {
    const bundle = createLogsZipBundle({ electronApp: app })
    const dateStr = new Date().toISOString().slice(0, 10)
    const defaultFileName = `lemoon-hata-kayitlari-${dateStr}.zip`

    const saveRes = await dialog.showSaveDialog(mainWindow || undefined, {
      title: 'Hata Kayıtlarını Dışa Aktar (.zip)',
      defaultPath: defaultFileName,
      filters: [{ name: 'ZIP Arşivi', extensions: ['zip'] }],
    })

    if (saveRes.canceled || !saveRes.filePath) {
      return {
        success: false,
        canceled: true,
        base64Zip: bundle.zipBuffer.toString('base64'),
        fileName: defaultFileName,
        fileCount: bundle.fileCount,
      }
    }

    fs.writeFileSync(saveRes.filePath, bundle.zipBuffer)
    return {
      success: true,
      filePath: saveRes.filePath,
      fileName: path.basename(saveRes.filePath),
      fileCount: bundle.fileCount,
    }
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : 'Hata kayıtları dışa aktarılamadı.',
    }
  }
})

ipcMain.handle('system:health-metrics', (event, payload) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const ctx = ensureDbContext()
  const secondaryBackupDir =
    payload && typeof payload.secondaryBackupDir === 'string'
      ? payload.secondaryBackupDir
      : ''
  const metrics = collectSystemHealthMetrics({
    dbPath: ctx.dbPath,
    primaryBackupDir: getDefaultBackupDir(app),
    secondaryBackupDir,
  })
  return { success: true, data: metrics }
})

ipcMain.handle('system:startup-recovery', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'system:startup-recovery')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }
  return { success: true, data: crashManager.getStartupRecovery() }
})

ipcMain.handle('system:acknowledge-recovery', (event, ...args) => {
  if (!isTrustedMainWindowSender(event, mainWindow)) {
    return { success: false, error: 'Yetkisiz IPC göndericisi.' }
  }
  const argCheck = validateNoArgsPayload(args, 'system:acknowledge-recovery')
  if (!argCheck.valid) {
    return { success: false, error: argCheck.error }
  }
  return { success: true, data: crashManager.acknowledgeStartupRecovery() }
})

// ── App Lifecycle ─────────────────────────────────────

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  // Initialize SQLite database in %APPDATA% / userData with WAL, FULL sync, FK=ON, and integrity_check
  const ctx = ensureDbContext()
  crashManager.initializeSession(ctx.db)

  // 1) Remove default application menu in production so built-in menu shortcuts cannot open DevTools or reload
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  // 4) Enforce Content-Security-Policy header on all HTTP/HTTPS/file responses
  const cspHeader = buildContentSecurityPolicy(isDev)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspHeader],
      },
    })
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (isDev || app.isAuthorizedQuit) {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (!isDev && !app.isAuthorizedQuit) {
    event.preventDefault()
    return
  }
  app.isQuitting = true
  crashManager.markCleanShutdown()
})
