import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LoginScreen } from '../../src/components/LoginScreen'
import { ForceChangePasswordModal } from '../../src/components/ForceChangePasswordModal'
import {
  createInitialAdmin,
  forceChangePassword,
  getAllUsers,
  getAuthStorageState,
  initializeAuthSystem,
  loginWithPassword,
  logoutUser,
  resetUserPassword,
} from '../../src/lib/auth'
import {
  clearInMemoryCache,
  getBusinessDaysSafe,
  getCompletedOrdersSafe,
  getTablesSafe,
  getUsersWithStatus,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveTablesSafe,
  saveUsersSafe,
} from '../../src/lib/storage/repository'
import { setCustomSqliteDispatcher } from '../../src/lib/storage/sqliteClient'
import {
  MIGRATED_TO_SQLITE_KEY,
  MIGRATION_IN_PROGRESS_KEY,
  runLocalStorageToSqliteMigration,
} from '../../src/lib/storage/sqliteMigration'
import { createMockCartItem, createMockOrder, createMockTable } from '../fixtures/factories'
import { setResetSqliteOnStorageClear } from '../setup'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const require = createRequire(import.meta.url)
const { openDatabase, closeDatabase, executeDbAction } = require('../../electron/db/index.cjs')

async function flushMicrotasks(ticks = 6): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })
  }
}

describe('Admin Password & Auth Persistence Across Restarts & Upgrades', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null
  const tempDirs: string[] = []
  const openDiskDbs: any[] = []

  function createDiskSqliteContext(dbFilePath: string) {
    const ctx = openDatabase({ dbPath: dbFilePath })
    openDiskDbs.push(ctx)
    setCustomSqliteDispatcher((action, payload) => executeDbAction(ctx, action, payload))
    return ctx
  }

  beforeEach(() => {
    rootContainer = document.createElement('div')
    document.body.appendChild(rootContainer)
    root = createRoot(rootContainer)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    if (rootContainer && rootContainer.parentNode) {
      rootContainer.parentNode.removeChild(rootContainer)
    }
    rootContainer = null

    while (openDiskDbs.length > 0) {
      const ctx = openDiskDbs.pop()
      try {
        closeDatabase(ctx)
      } catch {}
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('Scenario 1: Clean install creates hashed admin password in SQLite and never prompts setup again after DB close/reopen', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'lemoon-auth-s1-'))
    tempDirs.push(appDataDir)
    const dbPath = join(appDataDir, 'lemoon-pos.sqlite')

    // First launch on clean DB
    const ctx1 = createDiskSqliteContext(dbPath)
    act(() => {
      root!.render(
        <LoginScreen
          onLoginSuccess={vi.fn()}
          storeName="LEMOON KAFE"
          storeSub="Kahvenin iyi hali"
        />,
      )
    })
    await flushMicrotasks()

    expect(rootContainer!.textContent).toContain('İlk Sistem Kurulumu')

    const created = await createInitialAdmin({
      fullName: 'Kafe Yöneticisi',
      username: 'patron',
      password: 'KafeYonetim!2026',
    })
    expect(created.success).toBe(true)
    expect(created.user?.passwordHash.startsWith('pbkdf2$')).toBe(true)
    expect(created.user?.passwordHash).not.toContain('KafeYonetim!2026')

    // Close DB and unmount LoginScreen (simulate full app shutdown)
    act(() => {
      root?.unmount()
    })
    root = createRoot(rootContainer!)
    closeDatabase(ctx1)
    setResetSqliteOnStorageClear(false)
    localStorage.clear()
    clearInMemoryCache()

    // Second launch against same persisted AppData SQLite file
    createDiskSqliteContext(dbPath)
    act(() => {
      root!.render(
        <LoginScreen
          onLoginSuccess={vi.fn()}
          storeName="LEMOON KAFE"
          storeSub="Kahvenin iyi hali"
        />,
      )
    })
    await flushMicrotasks()

    expect(rootContainer!.textContent).not.toContain('İlk Sistem Kurulumu')
    expect(rootContainer!.textContent).toContain('Yönetici Girişi')

    const loginRes = await loginWithPassword('patron', 'KafeYonetim!2026', 'admin')
    expect(loginRes.success).toBe(true)
    expect(loginRes.mustChangePassword).toBe(false)
  })

  it('Scenario 2: Logout -> re-login shows password login screen, never initial setup', async () => {
    const created = await createInitialAdmin({
      fullName: 'Kafe Yöneticisi',
      username: 'patron',
      password: 'KafeYonetim!2026',
    })
    expect(created.success).toBe(true)

    const loginRes = await loginWithPassword('patron', 'KafeYonetim!2026', 'admin')
    expect(loginRes.success).toBe(true)

    logoutUser('manual')

    act(() => {
      root!.render(
        <LoginScreen
          onLoginSuccess={vi.fn()}
          storeName="LEMOON KAFE"
          storeSub="Kahvenin iyi hali"
        />,
      )
    })
    await flushMicrotasks()

    expect(rootContainer!.textContent).not.toContain('İlk Sistem Kurulumu')
    expect(rootContainer!.textContent).toContain('Yönetici Girişi')

    const reloginRes = await loginWithPassword('patron', 'KafeYonetim!2026', 'admin')
    expect(reloginRes.success).toBe(true)
  })

  it('Scenario 3: Version upgrade / lost localStorage migration flag with legacy orders in localStorage does NOT wipe SQLite admin or operational data', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'lemoon-auth-s3-'))
    tempDirs.push(appDataDir)
    const dbPath = join(appDataDir, 'lemoon-pos.sqlite')

    // v1.4.0 legacy data remained in localStorage, then user upgraded to v1.5.0+ and created admin in SQLite
    const legacyTable = createMockTable({
      id: 'table-legacy-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Latte', price: 95, quantity: 2 })],
    })
    const legacyOrder = createMockOrder({ id: 'order-legacy-1' })

    const ctx1 = createDiskSqliteContext(dbPath)
    localStorage.setItem('tables', JSON.stringify([legacyTable]))
    localStorage.setItem('completedOrders', JSON.stringify([legacyOrder]))

    const initialMig = runLocalStorageToSqliteMigration()
    expect(initialMig.success).toBe(true)

    // Admin created AFTER SQLite became active (so localStorage['appUsers'] does NOT exist)
    const adminRes = await createInitialAdmin({
      fullName: 'İşletme Sahibi',
      username: 'patron',
      password: 'UpdateSafe!2026Pass',
    })
    expect(adminRes.success).toBe(true)

    // Add a new order in SQLite as well
    const sqliteOrder = createMockOrder({ id: 'order-sqlite-2' })
    expect(saveCompletedOrdersSafe([sqliteOrder, legacyOrder])).toBe(true)
    expect(saveBusinessDaysSafe([{
      id: 'day-1',
      status: 'closed',
      openedAt: '2026-11-14T08:00:00.000Z',
      openedBy: 'İşletme Sahibi',
      openingCash: 500,
      closedAt: '2026-11-14T22:00:00.000Z',
      closedBy: 'İşletme Sahibi',
    }])).toBe(true)

    closeDatabase(ctx1)

    // Simulate installing new version where localStorage lost 'migrated_to_sqlite' (or had stale in-progress marker)
    // while legacy 'tables'/'completedOrders' keys still sit in localStorage without 'appUsers'!
    setResetSqliteOnStorageClear(false)
    localStorage.removeItem(MIGRATED_TO_SQLITE_KEY)
    localStorage.setItem(MIGRATION_IN_PROGRESS_KEY, '2026-11-14T10:00:00.000Z')
    localStorage.removeItem('appUsers')
    clearInMemoryCache()

    // New version opens same AppData SQLite DB
    createDiskSqliteContext(dbPath)
    const migOnUpgrade = runLocalStorageToSqliteMigration()
    expect(migOnUpgrade.success).toBe(true)
    expect(migOnUpgrade.alreadyMigrated).toBe(true)

    // Active orders, tables, business days AND admin account MUST all still be intact
    expect(getTablesSafe().some((t) => t.id === 'table-legacy-1' && t.cart.length === 1)).toBe(true)
    expect(getCompletedOrdersSafe().map((o) => o.id)).toEqual(['order-sqlite-2', 'order-legacy-1'])
    expect(getBusinessDaysSafe()).toHaveLength(1)
    expect(getAuthStorageState().hasAdmin).toBe(true)

    act(() => {
      root!.render(
        <LoginScreen
          onLoginSuccess={vi.fn()}
          storeName="LEMOON KAFE"
          storeSub="Kahvenin iyi hali"
        />,
      )
    })
    await flushMicrotasks()

    expect(rootContainer!.textContent).not.toContain('İlk Sistem Kurulumu')
    const loginAfterUpgrade = await loginWithPassword('patron', 'UpdateSafe!2026Pass', 'admin')
    expect(loginAfterUpgrade.success).toBe(true)
  })

  it('Scenario 3b: Migrates legacy admin from localStorage["appUsers"] into SQLite even if SQLite only has Garson 1..4', async () => {
    // Seed Garson 1..4 in SQLite (no admin in SQLite yet)
    await initializeAuthSystem()
    expect(getAuthStorageState().hasAdmin).toBe(false)

    // Simulate legacy admin still sitting in localStorage['appUsers']
    const legacyAdmin = {
      id: 'legacy-admin-id',
      fullName: 'Eski Yönetici',
      username: 'eskipatron',
      role: 'admin',
      passwordHash: 'pbkdf2$100000$00112233445566778899aabbccddeeff$deadbeef',
      status: 'active',
      isDeleted: false,
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    localStorage.setItem('appUsers', JSON.stringify([legacyAdmin]))

    const state = getAuthStorageState()
    expect(state.storageError).toBeNull()
    expect(state.hasAdmin).toBe(true)
    expect(state.users.some((u) => u.username === 'eskipatron' && u.role === 'admin')).toBe(true)
    expect(state.users.some((u) => u.username === 'garson1')).toBe(true)
  })

  it('Scenario 4: Wrong password rejects login and leaves stored hash untouched', async () => {
    const created = await createInitialAdmin({
      fullName: 'Kafe Yöneticisi',
      username: 'patron',
      password: 'DogruGiris!2026Kod',
    })
    expect(created.success).toBe(true)
    const originalHash = getAllUsers().find((u) => u.username === 'patron')?.passwordHash

    const wrongRes = await loginWithPassword('patron', 'YanlisGiris!999', 'admin')
    expect(wrongRes.success).toBe(false)

    const hashAfterWrong = getAllUsers().find((u) => u.username === 'patron')?.passwordHash
    expect(hashAfterWrong).toBe(originalHash)

    const rightRes = await loginWithPassword('patron', 'DogruGiris!2026Kod', 'admin')
    expect(rightRes.success).toBe(true)
  })

  it('Scenario 5: SQLite or JSON read failure NEVER triggers initial setup or overwrites existing users, and Retry recovers', async () => {
    const created = await createInitialAdmin({
      fullName: 'Kafe Yöneticisi',
      username: 'patron',
      password: 'KafeYonetim!2026',
    })
    expect(created.success).toBe(true)

    // Simulate transient SQLite read error on getUsers while DB actually still holds admin
    const appDataDir = mkdtempSync(join(tmpdir(), 'lemoon-auth-s5-'))
    tempDirs.push(appDataDir)
    const dbPath = join(appDataDir, 'lemoon-pos.sqlite')
    const diskCtx = openDatabase({ dbPath })
    openDiskDbs.push(diskCtx)

    const persistedUsers = getAllUsers()
    expect(persistedUsers.some((u) => u.username === 'patron')).toBe(true)

    // Persist admin + table + order to disk SQLite
    setCustomSqliteDispatcher((action, payload) => executeDbAction(diskCtx, action, payload))
    expect(saveUsersSafe(persistedUsers)).toBe(true)
    expect(saveTablesSafe([createMockTable({ name: 'Masa 5' })])).toBe(true)

    let failReads = true
    setCustomSqliteDispatcher((action, payload) => {
      if (failReads && action === 'getUsers') {
        return { success: false, error: 'SQLITE_BUSY: database is locked' }
      }
      return executeDbAction(diskCtx, action, payload)
    })

    act(() => {
      root!.render(
        <LoginScreen
          onLoginSuccess={vi.fn()}
          storeName="LEMOON KAFE"
          storeSub="Kahvenin iyi hali"
        />,
      )
    })
    await flushMicrotasks()

    // MUST NOT prompt initial setup, MUST display safe error message
    expect(rootContainer!.textContent).not.toContain('İlk Sistem Kurulumu')
    expect(rootContainer!.textContent).toContain('Kullanıcı Veritabanı Okunamadı')
    expect(rootContainer!.textContent).toContain('SQLITE_BUSY')

    // Attempting createInitialAdmin while storageError is active MUST also be rejected
    const blockedCreate = await createInitialAdmin({
      fullName: 'Saldırgan',
      username: 'hacker',
      password: 'Another!2026Password',
    })
    expect(blockedCreate.success).toBe(false)

    // Verify underlying SQLite users row was NOT wiped by initializeAuthSystem!
    failReads = false
    const directDbUsers = executeDbAction(diskCtx, 'getUsers')
    expect(directDbUsers.success).toBe(true)
    expect(directDbUsers.data.some((u: any) => u.username === 'patron' && u.role === 'admin')).toBe(
      true,
    )

    // Click "Tekrar Dene" -> recovers cleanly to login form
    const retryBtn = Array.from(rootContainer!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tekrar Dene'),
    )
    expect(retryBtn).toBeTruthy()
    act(() => {
      retryBtn!.click()
    })
    await flushMicrotasks()

    expect(rootContainer!.textContent).not.toContain('Kullanıcı Veritabanı Okunamadı')
    expect(rootContainer!.textContent).not.toContain('İlk Sistem Kurulumu')
    expect(rootContainer!.textContent).toContain('Yönetici Girişi')

    // Also test corrupt JSON in localStorage fallback mode
    setCustomSqliteDispatcher(null)
    localStorage.setItem('appUsers', '{corrupt-json')
    const fallbackRead = getUsersWithStatus()
    expect(fallbackRead.storageError).toBe(true)
    expect(localStorage.getItem('appUsers')).toBe('{corrupt-json')
  })

  it('Scenario 6: Intentional password change (reset & forceChangePassword) persists across restarts and checks write failures', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'lemoon-auth-s6-'))
    tempDirs.push(appDataDir)
    const dbPath = join(appDataDir, 'lemoon-pos.sqlite')

    const ctx1 = createDiskSqliteContext(dbPath)
    const created = await createInitialAdmin({
      fullName: 'Kafe Yöneticisi',
      username: 'patron',
      password: 'EskiKod!2026Guvenli',
    })
    expect(created.success).toBe(true)

    const changeRes = await resetUserPassword(created.user!.id, 'YeniKod!2027Guvenli', undefined, false)
    expect(changeRes.success).toBe(true)

    // Simulate failed write during forceChangePassword -> must return success: false
    setCustomSqliteDispatcher((action, payload) => {
      if (action === 'saveUsers') {
        return { success: false, error: 'SQLITE_FULL: disk full' }
      }
      return executeDbAction(ctx1, action, payload)
    })
    const failedForce = await forceChangePassword(created.user!.id, 'Kaydedilmeyecek!2028')
    expect(failedForce.success).toBe(false)

    // Reopen DB from disk (simulate restart)
    closeDatabase(ctx1)
    clearInMemoryCache()
    createDiskSqliteContext(dbPath)

    const oldLogin = await loginWithPassword('patron', 'EskiKod!2026Guvenli', 'admin')
    expect(oldLogin.success).toBe(false)

    const newLogin = await loginWithPassword('patron', 'YeniKod!2027Guvenli', 'admin')
    expect(newLogin.success).toBe(true)

    // Also verify ForceChangePasswordModal exists and imports cleanly
    expect(ForceChangePasswordModal).toBeTypeOf('function')
  })
})
