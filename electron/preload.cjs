const { contextBridge, ipcRenderer } = require('electron')

/**
 * Expose a minimal, frozen, input-validated API to the renderer process via contextBridge.
 * Compatible with sandbox: true and contextIsolation: true.
 */
const electronAPI = Object.freeze({
  /**
   * Open the customer display window on the second monitor
   */
  openCustomerDisplay: () => ipcRenderer.invoke('open-customer-display'),

  /**
   * Send cart data to the customer display window
   * @param {string} cartJson - JSON string of the cart data
   */
  updateCustomerDisplay: (cartJson) => {
    if (typeof cartJson !== 'string' || cartJson.length === 0 || cartJson.length > 256 * 1024) {
      return Promise.resolve({ success: false, error: 'Geçersiz sepet verisi.' })
    }
    return ipcRenderer.invoke('update-customer-display', cartJson)
  },

  /**
   * Listen for cart updates (used by the customer display window)
   * @param {Function} callback - Called with cart JSON data when updated
   * @returns {Function} Cleanup function to remove the listener
   */
  onCartUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const handler = (_event, cartJson) => {
      if (typeof cartJson === 'string') {
        callback(cartJson)
      }
    }
    ipcRenderer.on('cart-update', handler)
    return () => ipcRenderer.removeListener('cart-update', handler)
  },

  /**
   * Quit application cleanly (requires administrator authorization payload)
   * @param {{ authorized: boolean, adminUsername: string }} authPayload
   */
  quitApp: (authPayload) => {
    if (
      !authPayload ||
      typeof authPayload !== 'object' ||
      authPayload.authorized !== true ||
      typeof authPayload.adminUsername !== 'string' ||
      !authPayload.adminUsername.trim()
    ) {
      return Promise.resolve({
        success: false,
        error: 'Uygulamadan çıkış için yönetici doğrulaması gereklidir.',
      })
    }
    return ipcRenderer.invoke('quit-app', {
      authorized: true,
      adminUsername: authPayload.adminUsername.trim(),
    })
  },

  /**
   * Minimize the main application window
   */
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),

  /**
   * Toggle window fullscreen state (only allowed in development mode)
   */
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  /**
   * Open Windows touch keyboard (TabTip.exe / OSK) with zero arguments
   */
  openWindowsKeyboard: () => ipcRenderer.invoke('open-windows-keyboard'),

  /**
   * Write a validated backup file to primary (Documents\LemoonYedek) and optional secondary directory
   * @param {{ backup: object, type: string, secondaryDir?: string }} payload
   */
  backupWrite: (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Promise.resolve({ success: false, error: 'Geçersiz yedekleme verisi.' })
    }
    return ipcRenderer.invoke('backup:write', {
      backup: payload.backup,
      type: typeof payload.type === 'string' ? payload.type : 'manuel',
      secondaryDir: typeof payload.secondaryDir === 'string' ? payload.secondaryDir : undefined,
    })
  },

  /**
   * List backup files in primary backup directory
   */
  backupList: () => ipcRenderer.invoke('backup:list'),

  /**
   * Read and verify a backup file from primary backup directory for restoration
   * @param {string} fileName
   */
  backupRestoreRead: (fileName) => {
    if (typeof fileName !== 'string' || !fileName.trim()) {
      return Promise.resolve({ success: false, error: 'Geçersiz yedek dosya adı.' })
    }
    return ipcRenderer.invoke('backup:restore-read', fileName.trim())
  },

  /**
   * Open native directory picker for selecting secondary backup directory
   */
  backupSelectDir: () => ipcRenderer.invoke('backup:select-dir'),

  /**
   * Listen for app-before-quit signal from main process to flush shutdown backup
   * @param {Function} callback
   */
  onBeforeQuit: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const handler = () => callback()
    ipcRenderer.on('app-before-quit', handler)
    return () => ipcRenderer.removeListener('app-before-quit', handler)
  },

  /**
   * Synchronous SQLite database operation via Electron main process
   * @param {string} action
   * @param {any} [payload]
   */
  dbSync: (action, payload) => {
    if (typeof action !== 'string' || !action.trim()) {
      return { success: false, error: 'Geçersiz veritabanı işlemi.' }
    }
    return ipcRenderer.sendSync('db:sync', action.trim(), payload)
  },

  /**
   * Asynchronous SQLite database operation via Electron main process
   * @param {string} action
   * @param {any} [payload]
   */
  dbInvoke: (action, payload) => {
    if (typeof action !== 'string' || !action.trim()) {
      return Promise.resolve({ success: false, error: 'Geçersiz veritabanı işlemi.' })
    }
    return ipcRenderer.invoke('db:invoke', action.trim(), payload)
  },

  /**
   * Write a sanitized error/system log entry to the rotating file logger in %APPDATA%/.../logs/
   * @param {{ level?: 'info'|'warn'|'error', category?: string, message: string, meta?: any }} payload
   */
  writeSystemLog: (payload) => {
    if (!payload || typeof payload !== 'object' || typeof payload.message !== 'string') {
      return Promise.resolve({ success: false, error: 'Geçersiz log verisi.' })
    }
    return ipcRenderer.invoke('logs:write', payload)
  },

  /**
   * Export rotating error/system logs as a single .zip bundle
   */
  exportSystemLogs: () => ipcRenderer.invoke('logs:export'),

  /**
   * Fetch disk free space, database size, backup recency, and secondary backup directory status
   * @param {string} [secondaryBackupDir]
   */
  getSystemHealthMetrics: (secondaryBackupDir) =>
    ipcRenderer.invoke('system:health-metrics', {
      secondaryBackupDir: typeof secondaryBackupDir === 'string' ? secondaryBackupDir : '',
    }),

  /**
   * Check whether the application recovered from an unexpected shutdown or renderer crash
   */
  getStartupRecoveryStatus: () => ipcRenderer.invoke('system:startup-recovery'),

  /**
   * Acknowledge the startup crash recovery notification
   */
  acknowledgeStartupRecovery: () => ipcRenderer.invoke('system:acknowledge-recovery'),

  /**
   * Flag indicating we're in Electron environment
   */
  isElectron: true,
})

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
