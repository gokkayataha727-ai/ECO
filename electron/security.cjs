const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const {
  VALID_BACKUP_TYPES,
  BACKUP_FILENAME_REGEX,
  validateBackupInMain,
} = require('./backupManager.cjs')

const TABTIP_ABSOLUTE_PATH = 'C:\\Program Files\\Common Files\\microsoft shared\\ink\\TabTip.exe'
const OSK_ABSOLUTE_PATH = 'C:\\Windows\\System32\\osk.exe'
const MAX_CART_JSON_LENGTH = 256 * 1024 // 256 KB
const MAX_CART_ITEMS = 500
const MAX_SECONDARY_DIR_LENGTH = 512

function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/**
 * 1 & 2) Hardened BrowserWindow webPreferences factory.
 * - devTools: false in production, true in development
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - webSecurity: true (always enabled in both dev and prod)
 */
function createHardenedWebPreferences(preloadPath, isDev = false) {
  if (typeof preloadPath !== 'string' || !path.isAbsolute(preloadPath)) {
    throw new Error('preloadPath must be an absolute path')
  }
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: Boolean(isDev),
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    enableBlinkFeatures: '',
    navigateOnDragDrop: false,
    spellcheck: false,
    zoomFactor: 1.0,
  }
}

/**
 * 1 & 5) Determines whether a keyboard input event must be blocked in production / kiosk mode.
 * Blocks:
 * - DevTools shortcuts: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U (and Cmd equivalents)
 * - Reload shortcuts: F5, Ctrl+F5, Shift+F5, Ctrl+R, Ctrl+Shift+R (and Cmd equivalents)
 * - Window close / exit / kiosk escape shortcuts: Ctrl+W, Ctrl+Q, Alt+F4, Alt+Space, F11, Alt+Left/Right
 * Note: Ctrl+Shift+Q is intentionally allowed through to the renderer so the secret
 * Admin Password Exit Modal can be triggered by an administrator.
 */
function isBlockedShortcut(input, isDev = false) {
  if (isDev) return false
  if (!input || typeof input !== 'object') return false

  const key = typeof input.key === 'string' ? input.key : ''
  const upperKey = key.toUpperCase()
  const code = typeof input.code === 'string' ? input.code : ''
  const ctrlOrCmd = Boolean(input.control || input.meta)
  const shift = Boolean(input.shift)
  const alt = Boolean(input.alt)

  // Secret admin exit modal trigger (Ctrl+Shift+Q) is handled in renderer with admin password verification
  if (ctrlOrCmd && shift && !alt && upperKey === 'Q') {
    return false
  }

  // Block F12 (DevTools)
  if (upperKey === 'F12' || code === 'F12') {
    return true
  }

  // Block F5 (Reload) and F11 (Fullscreen toggle)
  if (upperKey === 'F5' || code === 'F5' || upperKey === 'F11' || code === 'F11') {
    return true
  }

  // Block Alt+F4 (Window close) and Alt+Space (Windows system window menu)
  if (alt && (upperKey === 'F4' || code === 'F4' || key === ' ' || code === 'Space')) {
    return true
  }

  // Block Alt+Left / Alt+Right / BrowserBack / BrowserForward (History navigation)
  if (
    (alt && (upperKey === 'ARROWLEFT' || upperKey === 'ARROWRIGHT' || upperKey === 'LEFT' || upperKey === 'RIGHT')) ||
    upperKey === 'BROWSERBACK' ||
    upperKey === 'BROWSERFORWARD' ||
    upperKey === 'BROWSERREFRESH'
  ) {
    return true
  }

  // Block Ctrl/Cmd + Shift + I / J / C (DevTools Inspector, Console, Element Picker)
  if (ctrlOrCmd && shift && (upperKey === 'I' || upperKey === 'J' || upperKey === 'C')) {
    return true
  }

  // Block Cmd + Option + I / J / C on macOS
  if (Boolean(input.meta) && alt && (upperKey === 'I' || upperKey === 'J' || upperKey === 'C')) {
    return true
  }

  // Block Ctrl/Cmd + R / Shift+R (Reload)
  if (ctrlOrCmd && upperKey === 'R') {
    return true
  }

  // Block Ctrl/Cmd + W (Close tab/window) and Ctrl/Cmd + Q (Quit without shift)
  if (ctrlOrCmd && !shift && (upperKey === 'W' || upperKey === 'Q' || upperKey === 'M' || upperKey === 'H')) {
    return true
  }

  // Block Ctrl/Cmd + U (View source), Ctrl/Cmd + S (Save page), Ctrl/Cmd + O (Open file), Ctrl/Cmd + P (Print dialog)
  if (ctrlOrCmd && (upperKey === 'U' || upperKey === 'S' || upperKey === 'O' || upperKey === 'P' || upperKey === 'G')) {
    return true
  }

  return false
}

/**
 * 3) Navigation lock validator for will-navigate and will-redirect.
 * - In development: only allows http://localhost:5173
 * - In production: only allows local application HTML files inside distDir via file:// protocol
 */
function isAllowedNavigation(navigationUrl, isDev = false, distDir = '') {
  if (typeof navigationUrl !== 'string' || !navigationUrl.trim()) {
    return false
  }

  let parsed
  try {
    parsed = new URL(navigationUrl)
  } catch {
    return false
  }

  if (isDev) {
    return parsed.origin === 'http://localhost:5173'
  }

  if (parsed.protocol !== 'file:') {
    return false
  }

  if (!distDir || typeof distDir !== 'string') {
    return false
  }

  try {
    const fileUrlToPath = require('url').fileURLToPath
    const targetPath = path.resolve(fileUrlToPath(parsed))
    const resolvedDist = path.resolve(distDir)
    const allowedIndex = path.join(resolvedDist, 'index.html')
    const allowedCustomer = path.join(resolvedDist, 'customer-display.html')

    const normTarget = process.platform === 'win32' ? targetPath.toLowerCase() : targetPath
    const normIndex = process.platform === 'win32' ? allowedIndex.toLowerCase() : allowedIndex
    const normCustomer = process.platform === 'win32' ? allowedCustomer.toLowerCase() : allowedCustomer

    return normTarget === normIndex || normTarget === normCustomer
  } catch {
    return false
  }
}

/**
 * 4) Builds Content-Security-Policy header value.
 * Enforces script-src 'self' in production.
 */
function buildContentSecurityPolicy(isDev = false) {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: http://localhost:8000 http://localhost:5173",
      "connect-src 'self' http://localhost:8000 http://localhost:5173 ws://localhost:5173",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: http://localhost:8000",
    "connect-src 'self' http://localhost:8000",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/**
 * 6) Launches Windows Touch Keyboard (TabTip.exe) or On-Screen Keyboard (osk.exe)
 * from fixed, hardcoded absolute paths with zero arguments and shell: false.
 */
function launchWindowsVirtualKeyboard(options = {}) {
  const platform = options.platform || process.platform
  const fsImpl = options.fsImpl || fs
  const execFileImpl = options.execFileImpl || execFile

  if (platform !== 'win32') {
    return { launched: false, reason: 'Unsupported platform (only win32)' }
  }

  const execOptions = {
    shell: false,
    windowsHide: false,
    timeout: 10000,
  }

  if (fsImpl.existsSync(TABTIP_ABSOLUTE_PATH)) {
    execFileImpl(TABTIP_ABSOLUTE_PATH, [], execOptions, (err) => {
      if (err && fsImpl.existsSync(OSK_ABSOLUTE_PATH)) {
        execFileImpl(OSK_ABSOLUTE_PATH, [], execOptions, () => {})
      }
    })
    return { launched: true, executable: TABTIP_ABSOLUTE_PATH, args: [] }
  }

  if (fsImpl.existsSync(OSK_ABSOLUTE_PATH)) {
    execFileImpl(OSK_ABSOLUTE_PATH, [], execOptions, () => {})
    return { launched: true, executable: OSK_ABSOLUTE_PATH, args: [] }
  }

  return { launched: false, reason: 'Neither TabTip.exe nor osk.exe found at fixed system paths' }
}

/**
 * 7) IPC Sender & Input Validation Helpers
 */
function isTrustedMainWindowSender(event, mainWindow) {
  if (!event || !event.sender || !mainWindow) return false
  if (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed()) return false
  if (event.sender !== mainWindow.webContents) return false
  // Ensure call originates from the top-level frame if senderFrame is populated
  if (event.senderFrame && event.senderFrame.parent !== null) return false
  return true
}

function validateNoArgsPayload(extraArgs, channelName) {
  if (!Array.isArray(extraArgs)) {
    return { valid: false, error: `${channelName}: Geçersiz argüman listesi.` }
  }
  if (extraArgs.length > 0 && extraArgs[0] !== undefined) {
    return { valid: false, error: `${channelName}: Bu kanal parametre kabul etmez.` }
  }
  return { valid: true }
}

function validateCartJsonPayload(cartJson) {
  if (typeof cartJson !== 'string') {
    return { valid: false, error: 'cartJson bir metin (string) olmalıdır.' }
  }
  if (cartJson.length === 0 || cartJson.length > MAX_CART_JSON_LENGTH) {
    return { valid: false, error: 'cartJson boyutu geçersiz veya sınırı aşıyor.' }
  }

  let parsed
  try {
    parsed = JSON.parse(cartJson)
  } catch {
    return { valid: false, error: 'cartJson geçerli bir JSON formatında değil.' }
  }

  if (!isPlainObject(parsed)) {
    return { valid: false, error: 'cartJson kök öğesi bir nesne olmalıdır.' }
  }

  if (!Array.isArray(parsed.items) || parsed.items.length > MAX_CART_ITEMS) {
    return { valid: false, error: 'cartJson.items geçerli bir dizi değil veya sınırı aşıyor.' }
  }

  const sanitizedItems = []
  for (const item of parsed.items) {
    if (!isPlainObject(item)) {
      return { valid: false, error: 'Sepet kalemi geçerli bir nesne değil.' }
    }
    if (typeof item.name !== 'string' || item.name.length === 0 || item.name.length > 200) {
      return { valid: false, error: 'Sepet kalemi adı geçersiz.' }
    }
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10000) {
      return { valid: false, error: 'Sepet kalemi miktarı geçersiz.' }
    }
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0 || item.price > 10000000) {
      return { valid: false, error: 'Sepet kalemi fiyatı geçersiz.' }
    }

    let sanitizedOptions
    if (item.selectedOptions !== undefined) {
      if (!Array.isArray(item.selectedOptions) || item.selectedOptions.length > 50) {
        return { valid: false, error: 'Sepet kalemi opsiyonları geçersiz.' }
      }
      sanitizedOptions = []
      for (const opt of item.selectedOptions) {
        if (
          !isPlainObject(opt) ||
          typeof opt.optionName !== 'string' ||
          opt.optionName.length > 200 ||
          typeof opt.priceDelta !== 'number' ||
          !Number.isFinite(opt.priceDelta)
        ) {
          return { valid: false, error: 'Sepet kalemi opsiyon detayı geçersiz.' }
        }
        sanitizedOptions.push({
          optionName: opt.optionName,
          priceDelta: opt.priceDelta,
        })
      }
    }

    sanitizedItems.push({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      ...(sanitizedOptions ? { selectedOptions: sanitizedOptions } : {}),
    })
  }

  if (
    typeof parsed.subtotal !== 'number' ||
    !Number.isFinite(parsed.subtotal) ||
    typeof parsed.discount !== 'number' ||
    !Number.isFinite(parsed.discount) ||
    typeof parsed.total !== 'number' ||
    !Number.isFinite(parsed.total)
  ) {
    return { valid: false, error: 'cartJson tutar alanları (subtotal/discount/total) geçersiz.' }
  }

  const storeName =
    typeof parsed.storeName === 'string' && parsed.storeName.length <= 150
      ? parsed.storeName
      : 'LEMOON KAFE'
  const storeSub =
    typeof parsed.storeSub === 'string' && parsed.storeSub.length <= 150
      ? parsed.storeSub
      : ''

  const sanitizedJson = JSON.stringify({
    items: sanitizedItems,
    subtotal: parsed.subtotal,
    discount: parsed.discount,
    total: parsed.total,
    storeName,
    storeSub,
  })

  return { valid: true, sanitizedJson }
}

function validateQuitAppPayload(payload) {
  if (!isPlainObject(payload)) {
    return { valid: false, error: 'Çıkış isteği doğrulama nesnesi eksik.' }
  }
  if (payload.authorized !== true) {
    return { valid: false, error: 'Uygulamadan çıkış için yönetici yetkilendirmesi gereklidir.' }
  }
  if (typeof payload.adminUsername !== 'string' || payload.adminUsername.trim().length === 0 || payload.adminUsername.length > 100) {
    return { valid: false, error: 'Onaylayan yönetici kullanıcı adı eksik veya geçersiz.' }
  }
  return { valid: true, adminUsername: payload.adminUsername.trim() }
}

function isAbsoluteWindowsOrPosixPath(dirPath) {
  if (typeof dirPath !== 'string') return false
  if (path.isAbsolute(dirPath)) return true
  // Also allow Windows drive path (e.g. E:\LemoonYedek) when validated on non-Windows test runner
  return /^[a-zA-Z]:[\\/]/.test(dirPath)
}

function validateBackupWritePayload(payload) {
  if (!isPlainObject(payload)) {
    return { valid: false, error: 'Yedekleme isteği geçerli bir nesne değil.' }
  }

  const { backup, type, secondaryDir } = payload
  const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : 'manuel'
  if (!VALID_BACKUP_TYPES.has(normalizedType)) {
    return { valid: false, error: 'Geçersiz yedekleme türü.' }
  }

  let validatedSecondaryDir
  if (secondaryDir !== undefined && secondaryDir !== null && secondaryDir !== '') {
    if (typeof secondaryDir !== 'string') {
      return { valid: false, error: 'İkinci yedek klasörü yolu metin olmalıdır.' }
    }
    const trimmed = secondaryDir.trim()
    if (trimmed.length > MAX_SECONDARY_DIR_LENGTH || trimmed.includes('\0')) {
      return { valid: false, error: 'İkinci yedek klasörü yolu geçersiz karakter içeriyor veya çok uzun.' }
    }
    if (!isAbsoluteWindowsOrPosixPath(trimmed)) {
      return { valid: false, error: 'İkinci yedek klasörü sabit bir mutlak yol olmalıdır.' }
    }
    validatedSecondaryDir = trimmed
  }

  const backupValidation = validateBackupInMain(backup)
  if (!backupValidation.valid) {
    return { valid: false, error: backupValidation.error }
  }

  return {
    valid: true,
    backup: backupValidation.backup,
    type: normalizedType,
    secondaryDir: validatedSecondaryDir,
  }
}

function validateBackupRestoreReadPayload(fileName) {
  if (typeof fileName !== 'string') {
    return { valid: false, error: 'Yedek dosya adı bir metin olmalıdır.' }
  }
  const trimmed = fileName.trim()
  if (trimmed.length === 0 || trimmed.length > 128 || trimmed.includes('\0')) {
    return { valid: false, error: 'Yedek dosya adı uzunluğu veya içeriği geçersiz.' }
  }
  if (
    path.basename(trimmed) !== trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    return { valid: false, error: 'Yedek dosya adında dizin geçişine (path traversal) izin verilmez.' }
  }
  if (!BACKUP_FILENAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Yedek dosya adı beklenen lemoon-YYYYMMDD-HHmmss-<tür>.json formatında değil.' }
  }
  return { valid: true, fileName: trimmed }
}

const VALID_DB_ACTIONS = new Set([
  'status',
  'getAllState',
  'getTables',
  'saveTables',
  'getCompletedOrders',
  'saveCompletedOrders',
  'getBusinessDays',
  'saveBusinessDays',
  'getMenuProducts',
  'saveMenuProducts',
  'getSettings',
  'saveSettings',
  'getRefunds',
  'saveRefunds',
  'getActivityLogs',
  'saveActivityLogs',
  'prependActivityLog',
  'archiveActivityLogs',
  'getArchivedActivityLogs',
  'getUsers',
  'saveUsers',
  'getUserPermissionOverrides',
  'saveUserPermissionOverrides',
  'getKvItem',
  'setKvItem',
  'removeKvItem',
  'getMeta',
  'setMeta',
  'clearAllOperationalData',
  'migrateFromLocalStorage',
  'tx:completeOrder',
  'tx:updateTablePayments',
  'tx:refund',
  'tx:reopenOrder',
  'tx:openBusinessDay',
  'tx:closeBusinessDay',
  'tx:transferMergeSplitTable',
])

function validateDbActionPayload(action) {
  if (typeof action !== 'string' || !VALID_DB_ACTIONS.has(action)) {
    return { valid: false, error: `Geçersiz veritabanı işlemi: ${String(action)}` }
  }
  return { valid: true, action }
}

const VALID_LOG_LEVELS = new Set(['info', 'warn', 'error'])

function validateSystemLogPayload(payload) {
  if (!isPlainObject(payload)) {
    return { valid: false, error: 'Log verisi geçerli bir nesne olmalıdır.' }
  }
  const level = typeof payload.level === 'string' ? payload.level.toLowerCase() : 'info'
  if (!VALID_LOG_LEVELS.has(level)) {
    return { valid: false, error: 'Geçersiz log seviyesi.' }
  }
  const category =
    typeof payload.category === 'string' && payload.category.trim().length <= 64
      ? payload.category.trim()
      : 'RENDERER'
  if (typeof payload.message !== 'string' || payload.message.trim().length === 0 || payload.message.length > 4096) {
    return { valid: false, error: 'Log mesajı geçersiz veya sınırı aşıyor.' }
  }
  return {
    valid: true,
    entry: {
      level,
      category,
      message: payload.message,
      meta: payload.meta,
    },
  }
}

module.exports = {
  TABTIP_ABSOLUTE_PATH,
  OSK_ABSOLUTE_PATH,
  VALID_DB_ACTIONS,
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
}
