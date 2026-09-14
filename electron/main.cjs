const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')

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

/** @type {BrowserWindow | null} */
let mainWindow = null

/** @type {BrowserWindow | null} */
let customerWindow = null

const isDev = !app.isPackaged
const iconPath = path.join(__dirname, 'icons', 'icon.png')

/**
 * Load main window content
 */
function loadMainContent(win) {
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    // loadFile ensures cross-platform path resolution (especially Windows backslashes)
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

/**
 * Load customer display window content
 */
function loadCustomerDisplayContent(win) {
  if (isDev) {
    win.loadURL('http://localhost:5173/customer-display.html')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'customer-display.html'))
  }
}

/**
 * Create the main application window
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    title: 'ECO COFFEE - Kasa & Restoran Otomasyonu',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
    },
  })

  loadMainContent(mainWindow)

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    // Close customer display when main window closes
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.close()
    }
  })
}

/**
 * Open customer display on second monitor (if available)
 */
function openCustomerDisplay() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.focus()
    return
  }

  const displays = screen.getAllDisplays()
  const externalDisplay = displays.find((display) => {
    const primary = screen.getPrimaryDisplay()
    return display.id !== primary.id
  })

  const windowOptions = {
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    title: 'ECO COFFEE - Müşteri Ekranı',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  // Position on external display if available
  if (externalDisplay) {
    windowOptions.x = externalDisplay.bounds.x
    windowOptions.y = externalDisplay.bounds.y
  }

  customerWindow = new BrowserWindow(windowOptions)
  loadCustomerDisplayContent(customerWindow)

  customerWindow.on('closed', () => {
    customerWindow = null
  })
}

// ── IPC Handlers ──────────────────────────────────────

ipcMain.handle('open-customer-display', () => {
  openCustomerDisplay()
})

ipcMain.handle('update-customer-display', (_event, cartJson) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('cart-update', cartJson)
  }
})

ipcMain.handle('quit-app', () => {
  app.isQuitting = true
  app.quit()
})

ipcMain.handle('minimize-app', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize()
  }
})

ipcMain.handle('toggle-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
  }
})

ipcMain.handle('open-windows-keyboard', () => {
  if (process.platform === 'win32') {
    const { exec } = require('child_process')
    const tabTipPath = 'C:\\Program Files\\Common Files\\microsoft shared\\ink\\TabTip.exe'
    exec(`start "" "${tabTipPath}" || osk`, (err) => {
      if (err) console.warn('Could not launch Windows virtual keyboard:', err)
    })
  }
})

// ── App Lifecycle ─────────────────────────────────────

app.on('second-instance', () => {
  // Focus main window if user tries to open a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
})

