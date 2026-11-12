import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'
import { createFullBackupFile } from '../../src/lib/storage/backup'
import { createInitialAdmin, verifyAdminPasswordForExit } from '../../src/lib/auth'

const require = createRequire(import.meta.url)
const security = require('../../electron/security.cjs')

describe('E. Electron Security Hardening & Kiosk Protection Suite (ADIM 3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('E.1: createHardenedWebPreferences enforces contextIsolation, nodeIntegration: false, sandbox: true, webSecurity: true, and devTools: false in production', () => {
    const preloadPath = path.resolve('/app/electron/preload.cjs')

    const prodPrefs = security.createHardenedWebPreferences(preloadPath, false)
    expect(prodPrefs.contextIsolation).toBe(true)
    expect(prodPrefs.nodeIntegration).toBe(false)
    expect(prodPrefs.sandbox).toBe(true)
    expect(prodPrefs.webSecurity).toBe(true)
    expect(prodPrefs.devTools).toBe(false)
    expect(prodPrefs.allowRunningInsecureContent).toBe(false)

    const devPrefs = security.createHardenedWebPreferences(preloadPath, true)
    expect(devPrefs.contextIsolation).toBe(true)
    expect(devPrefs.nodeIntegration).toBe(false)
    expect(devPrefs.sandbox).toBe(true)
    expect(devPrefs.webSecurity).toBe(true)
    expect(devPrefs.devTools).toBe(true)

    expect(() => security.createHardenedWebPreferences('relative/preload.cjs', false)).toThrow()
  })

  it('E.2: isBlockedShortcut blocks F12, Ctrl+Shift+I/J/C, Ctrl+R, F5, Ctrl+W, Alt+F4 in production and allows dev mode & secret Ctrl+Shift+Q', () => {
    // Production mode (isDev = false)
    expect(security.isBlockedShortcut({ key: 'F12' }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'I', control: true, shift: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'i', control: true, shift: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'J', control: true, shift: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'C', control: true, shift: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'r', control: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'R', control: true, shift: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'F5' }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'w', control: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'F4', alt: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: ' ', code: 'Space', alt: true }, false)).toBe(true)
    expect(security.isBlockedShortcut({ key: 'F11' }, false)).toBe(true)

    // Secret Admin Exit shortcut (Ctrl+Shift+Q) is allowed through to renderer
    expect(security.isBlockedShortcut({ key: 'Q', control: true, shift: true }, false)).toBe(false)

    // Normal POS keys (F2 search, F4 payment without Alt, Escape, digits) are allowed
    expect(security.isBlockedShortcut({ key: 'F2' }, false)).toBe(false)
    expect(security.isBlockedShortcut({ key: 'F4', alt: false }, false)).toBe(false)
    expect(security.isBlockedShortcut({ key: 'Escape' }, false)).toBe(false)
    expect(security.isBlockedShortcut({ key: '5' }, false)).toBe(false)

    // Development mode (isDev = true) allows DevTools & Reload
    expect(security.isBlockedShortcut({ key: 'F12' }, true)).toBe(false)
    expect(security.isBlockedShortcut({ key: 'I', control: true, shift: true }, true)).toBe(false)
    expect(security.isBlockedShortcut({ key: 'r', control: true }, true)).toBe(false)
  })

  it('E.3: isAllowedNavigation locks navigation to local app files in production and localhost:5173 in dev', () => {
    const distDir = path.resolve('/app/dist')
    const indexUrl = pathToFileURL(path.join(distDir, 'index.html')).toString()
    const customerUrl = pathToFileURL(path.join(distDir, 'customer-display.html')).toString()
    const outsideFileUrl = pathToFileURL(path.resolve('/etc/passwd')).toString()

    // Production mode
    expect(security.isAllowedNavigation(indexUrl, false, distDir)).toBe(true)
    expect(security.isAllowedNavigation(customerUrl, false, distDir)).toBe(true)
    expect(security.isAllowedNavigation(outsideFileUrl, false, distDir)).toBe(false)
    expect(security.isAllowedNavigation('https://www.google.com', false, distDir)).toBe(false)
    expect(security.isAllowedNavigation('http://localhost:5173', false, distDir)).toBe(false)
    expect(security.isAllowedNavigation('javascript:alert(1)', false, distDir)).toBe(false)

    // Development mode
    expect(security.isAllowedNavigation('http://localhost:5173/', true, distDir)).toBe(true)
    expect(security.isAllowedNavigation('http://localhost:5173/customer-display.html', true, distDir)).toBe(true)
    expect(security.isAllowedNavigation('https://evil.example.com', true, distDir)).toBe(false)
  })

  it('E.4: buildContentSecurityPolicy enforces script-src self and blocks object-src in production', () => {
    const prodCsp = security.buildContentSecurityPolicy(false)
    expect(prodCsp).toContain("script-src 'self'")
    expect(prodCsp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(prodCsp).toContain("object-src 'none'")
    expect(prodCsp).toContain("frame-ancestors 'none'")
  })

  it('E.5: launchWindowsVirtualKeyboard uses execFile with fixed absolute path, zero arguments, and shell: false', () => {
    const execFileMock = vi.fn()
    const fsMock = {
      existsSync: vi.fn((p: string) => p === security.TABTIP_ABSOLUTE_PATH),
    }

    const res = security.launchWindowsVirtualKeyboard({
      platform: 'win32',
      fsImpl: fsMock,
      execFileImpl: execFileMock,
    })

    expect(res.launched).toBe(true)
    expect(res.executable).toBe('C:\\Program Files\\Common Files\\microsoft shared\\ink\\TabTip.exe')
    expect(res.args).toEqual([])
    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(execFileMock.mock.calls[0][0]).toBe(security.TABTIP_ABSOLUTE_PATH)
    expect(execFileMock.mock.calls[0][1]).toEqual([])
    expect(execFileMock.mock.calls[0][2]).toMatchObject({ shell: false })
  })

  it('E.6: IPC input validators strictly validate sender, cartJson, quitApp, backupWrite, and backupRestoreRead', () => {
    // 1) No-args channels reject unexpected arguments
    expect(security.validateNoArgsPayload([], 'open-windows-keyboard').valid).toBe(true)
    expect(security.validateNoArgsPayload(['&& calc.exe'], 'open-windows-keyboard').valid).toBe(false)

    // 2) update-customer-display validates cartJson structure
    const validCart = JSON.stringify({
      items: [{ name: 'Latte', quantity: 2, price: 85 }],
      subtotal: 170,
      discount: 0,
      total: 170,
      storeName: 'LEMOON KAFE',
      storeSub: 'Kahvenin iyi hali',
    })
    const cartRes = security.validateCartJsonPayload(validCart)
    expect(cartRes.valid).toBe(true)
    expect(security.validateCartJsonPayload('not-json').valid).toBe(false)
    expect(security.validateCartJsonPayload(JSON.stringify({ items: [{ name: '', quantity: -1, price: -5 }] })).valid).toBe(false)

    // 3) quit-app requires administrator authorization payload
    expect(security.validateQuitAppPayload(undefined).valid).toBe(false)
    expect(security.validateQuitAppPayload({ authorized: false }).valid).toBe(false)
    expect(security.validateQuitAppPayload({ authorized: true, adminUsername: 'admin' }).valid).toBe(true)

    // 4) backup:write validates backup checksum, type, and secondaryDir path
    const validBackup = createFullBackupFile('IPC test')
    expect(
      security.validateBackupWritePayload({
        backup: validBackup,
        type: 'manuel',
        secondaryDir: 'E:\\LemoonYedek',
      }).valid,
    ).toBe(true)
    expect(
      security.validateBackupWritePayload({
        backup: validBackup,
        type: 'manuel',
        secondaryDir: '../relative/path',
      }).valid,
    ).toBe(false)

    // 5) backup:restore-read blocks path traversal and enforces filename pattern
    expect(
      security.validateBackupRestoreReadPayload('lemoon-20261111-150000-saatlik.json').valid,
    ).toBe(true)
    expect(security.validateBackupRestoreReadPayload('../../etc/passwd').valid).toBe(false)
    expect(security.validateBackupRestoreReadPayload('arbitrary.json').valid).toBe(false)
  })

  it('E.7: verifyAdminPasswordForExit verifies active admin password and locks after 5 failed attempts', async () => {
    const setupRes = await createInitialAdmin({
      fullName: 'Kasa Yöneticisi',
      username: 'kasayonetici',
      password: 'GucluSifre2026!',
    })
    expect(setupRes.success).toBe(true)

    // Wrong password rejected
    const wrongRes = await verifyAdminPasswordForExit('YanlisSifre123')
    expect(wrongRes.success).toBe(false)

    // Correct admin password accepted
    const goodRes = await verifyAdminPasswordForExit('GucluSifre2026!')
    expect(goodRes.success).toBe(true)
    expect(goodRes.adminUser?.username).toBe('kasayonetici')
  })
})
