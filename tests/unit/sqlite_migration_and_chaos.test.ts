import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  clearInMemoryCache,
  createFullBackupFile,
  executeCloseBusinessDaySqliteTx,
  executeCompleteOrderSqliteTx,
  executeOpenBusinessDaySqliteTx,
  executeRefundSqliteTx,
  executeReopenOrderSqliteTx,
  executeTransferMergeSplitTableSqliteTx,
  executeUpdateTablePaymentsSqliteTx,
  getActivityLogsSafe,
  getBusinessDaysSafe,
  getCompletedOrdersSafe,
  getMenuProductsSafe,
  getMigrationFlagRecord,
  getQuarantinedRecords,
  getRefundsSafe,
  getSettingsSafe,
  getSqliteDatabaseStatus,
  getTablesSafe,
  getUserPermissionOverridesSafe,
  getUsersSafe,
  migrateLocalStorageToSqliteIfNeeded,
  MIGRATED_TO_SQLITE_KEY,
  MIGRATION_IN_PROGRESS_KEY,
  PRE_SQLITE_MIGRATION_BACKUP_KEY,
  prependActivityLogSqlite,
  removeKvItemSqlite,
  runLocalStorageToSqliteMigration,
  safeRemoveItem,
  saveActivityLogsSafe,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveMenuProductsSafe,
  saveRefundsSafe,
  saveSettingsSafe,
  saveTablesSafe,
  saveUserPermissionOverridesSafe,
  saveUsersSafe,
  setCustomSqliteDispatcher,
  setKvItemSqlite,
  shouldRetainLegacyLocalStorage,
  validateBackupFileStructure,
} from '../../src/lib/storage'
import { getActiveTestDbContext, setResetSqliteOnStorageClear } from '../setup'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockProduct,
  createMockRefund,
  createMockSettings,
  createMockTable,
  createMockUser,
} from '../fixtures/factories'

const require = createRequire(import.meta.url)
const {
  toKurus,
  fromKurus,
  checkKurusPrecision,
  getSchemaVersion,
  runSchemaMigrations,
  openDatabase,
  closeDatabase,
  executeDbAction,
  computeFinancialSummary,
  compareFinancialSummaries,
  OPEN_TABLE_ORDER_PREFIX,
} = require('../../electron/db/index.cjs')
const { performBackupWrite } = require('../../electron/backupManager.cjs')

describe('F. SQLite Infrastructure, Migration & Chaos Test Suite (ADIM 4B, 4C, 4D)', () => {
  beforeEach(() => {
    setResetSqliteOnStorageClear(true)
    localStorage.clear()
    clearInMemoryCache()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // ADIM 4B: Veritabanı Katmanı, PRAGMA, Şema Migrasyonu, Bütünlük & Transaction
  // ──────────────────────────────────────────────────────────────────────────

  it('F.1: Configures WAL, synchronous=FULL, foreign_keys=ON, busy_timeout=5000 on disk DB file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemoon-sqlite-test-'))
    const dbPath = path.join(tmpDir, 'lemoon-pos.sqlite')

    const ctx = openDatabase({ dbPath, primaryBackupDir: tmpDir })
    try {
      expect(ctx.integrityOk).toBe(true)
      expect(ctx.pragmas.journalMode).toBe('wal')
      expect(ctx.pragmas.synchronous).toBe(2) // FULL = 2
      expect(ctx.pragmas.foreignKeys).toBe(1) // ON = 1
      expect(ctx.pragmas.busyTimeout).toBe(5000)
      expect(getSchemaVersion(ctx.db)).toBe(1)
      expect(fs.existsSync(dbPath)).toBe(true)
    } finally {
      closeDatabase(ctx)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('F.2: Schema migrations track PRAGMA user_version and roll back completely if a migration fails', () => {
    const ctx = getActiveTestDbContext()
    expect(getSchemaVersion(ctx.db)).toBe(1)

    // Successful custom migration v1 -> v2
    const migrationsSuccess = [
      {
        version: 1,
        description: 'v1 base',
        up: () => {},
      },
      {
        version: 2,
        description: 'v2 add test column to settings',
        up: (db: any) => {
          db.exec(`CREATE TABLE IF NOT EXISTS test_v2_table (id TEXT PRIMARY KEY)`)
        },
      },
    ]
    const newVer = runSchemaMigrations(ctx.db, {
      migrations: migrationsSuccess,
      targetVersion: 2,
    })
    expect(newVer.currentVersion).toBe(2)
    expect(getSchemaVersion(ctx.db)).toBe(2)

    // Failed migration v2 -> v3 must roll back DDL and keep user_version = 2
    const migrationsFail = [
      ...migrationsSuccess,
      {
        version: 3,
        description: 'v3 broken migration',
        up: (db: any) => {
          db.exec(`CREATE TABLE test_v3_should_rollback (id TEXT PRIMARY KEY)`)
          throw new Error('Simulated v3 schema migration failure')
        },
      },
    ]

    expect(() =>
      runSchemaMigrations(ctx.db, { migrations: migrationsFail, targetVersion: 3 }),
    ).toThrow('Simulated v3 schema migration failure')
    expect(getSchemaVersion(ctx.db)).toBe(2)
    const tableExists = ctx.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='test_v3_should_rollback'`,
      )
      .get()
    expect(tableExists).toBeUndefined()
  })

  it('F.3: Startup PRAGMA integrity_check quarantines corrupt DB without crashing and suggests latest valid automatic backup', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemoon-corrupt-db-'))
    const dbPath = path.join(tmpDir, 'lemoon-pos.sqlite')
    const backupDir = path.join(tmpDir, 'LemoonYedek')
    fs.mkdirSync(backupDir, { recursive: true })

    // 1. Write a valid automatic backup into LemoonYedek
    const sampleBackup = createFullBackupFile('Acilis yedegi')
    const writeRes = performBackupWrite({
      backup: sampleBackup,
      type: 'acilis',
      primaryDir: backupDir,
    })
    expect(writeRes.success).toBe(true)

    // 2. Write a corrupted SQLite file (invalid header/random bytes) to dbPath
    fs.writeFileSync(
      dbPath,
      Buffer.from('CORRUPTED_SQLITE_FILE_HEADER_NOT_VALID_AT_ALL_1234567890'),
    )

    // 3. Open database: must NOT throw, must quarantine corrupt file and suggest the valid backup
    const ctx = openDatabase({ dbPath, primaryBackupDir: backupDir })
    try {
      expect(ctx.integrityOk).toBe(false)
      expect(ctx.corruptionError).toBeTruthy()
      expect(ctx.quarantinedDbPath).toBeTruthy()
      expect(fs.existsSync(ctx.quarantinedDbPath)).toBe(true)
      expect(ctx.suggestedBackup).not.toBeNull()
      expect(ctx.suggestedBackup.fileName).toBe(writeRes.fileName)

      // Verify dispatcher status emits critical storage error event with suggestedBackup
      const events: any[] = []
      const handler = (e: Event) => events.push((e as CustomEvent).detail)
      window.addEventListener('pos-storage-error', handler)
      setCustomSqliteDispatcher((action, payload) => executeDbAction(ctx, action, payload))

      const status = getSqliteDatabaseStatus()
      window.removeEventListener('pos-storage-error', handler)

      expect(status?.integrityOk).toBe(false)
      expect(status?.corruptReplaced).toBe(true)
      expect(status?.suggestedBackup?.fileName).toBe(writeRes.fileName)
      expect(events.length).toBeGreaterThanOrEqual(1)
      expect(events[0].suggestedBackup).toBeDefined()
    } finally {
      closeDatabase(ctx)
      setCustomSqliteDispatcher((action, payload) =>
        executeDbAction(getActiveTestDbContext(), action, payload),
      )
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('F.4: Stores all monetary values as integer kuruş (INTEGER) with zero floating-point drift', () => {
    expect(toKurus(19.99)).toBe(1999)
    expect(toKurus(0.1 + 0.2)).toBe(30)
    expect(fromKurus(1999)).toBe(19.99)
    expect(checkKurusPrecision(145.75).exact).toBe(true)

    const table = createMockTable({
      id: 'tbl-kurus-1',
      name: 'Bahçe 1',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Cortado', price: 87.5, quantity: 2 })],
      payments: [createMockPayment({ method: 'cash', amount: 75.25 })],
    })
    saveTablesSafe([table])

    const ctx = getActiveTestDbContext()
    const openOrderId = `${OPEN_TABLE_ORDER_PREFIX}tbl-kurus-1`
    const rawItem = ctx.db
      .prepare(`SELECT unit_price_kurus FROM order_items WHERE order_id = ?`)
      .get(openOrderId)
    const rawPay = ctx.db
      .prepare(`SELECT amount_kurus FROM payments WHERE order_id = ?`)
      .get(openOrderId)

    expect(rawItem.unit_price_kurus).toBe(8750)
    expect(Number.isInteger(rawItem.unit_price_kurus)).toBe(true)
    expect(rawPay.amount_kurus).toBe(7525)
    expect(Number.isInteger(rawPay.amount_kurus)).toBe(true)

    const readBack = getTablesSafe().find((t) => t.id === 'tbl-kurus-1')!
    expect(readBack.cart[0].price).toBe(87.5)
    expect(readBack.payments![0].amount).toBe(75.25)
  })

  it('F.5: Multi-step transactions commit atomically and roll back 100% on mid-transaction failure', () => {
    // 1. Open Business Day Transaction + rollback test
    const day = createMockBusinessDay({ id: 'day-tx-1', status: 'open', openingCash: 600 })
    const failedOpenDay = executeOpenBusinessDaySqliteTx({
      businessDay: day,
      activityLog: {
        id: 'log-day-open-1',
        type: 'day_open',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
      options: { failAtStep: 'after_insert_open_day' },
    })
    expect(failedOpenDay.success).toBe(false)
    expect(getBusinessDaysSafe()).toHaveLength(0)
    expect(getActivityLogsSafe()).toHaveLength(0)

    const okOpenDay = executeOpenBusinessDaySqliteTx({
      businessDay: day,
      activityLog: {
        id: 'log-day-open-1',
        type: 'day_open',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
    })
    expect(okOpenDay.success).toBe(true)
    expect(getBusinessDaysSafe()).toHaveLength(1)

    // 2. Table Partial Payment Transaction + rollback test
    const item1 = createMockCartItem({ id: 'item-1', name: 'Mocha', price: 110, quantity: 2 })
    const initialTable = createMockTable({
      id: 'tbl-tx-1',
      name: 'Masa TX 1',
      status: 'occupied',
      cart: [item1],
      payments: [],
    })
    saveTablesSafe([initialTable])

    const tableWithPayment = {
      ...initialTable,
      payments: [createMockPayment({ id: 'pay-partial-1', method: 'card', amount: 100 })],
    }
    const failedPayTx = executeUpdateTablePaymentsSqliteTx({
      table: tableWithPayment,
      activityLog: {
        id: 'log-pay-1',
        type: 'payment',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
      options: { failAtStep: 'after_update_payments' },
    })
    expect(failedPayTx.success).toBe(false)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.payments).toHaveLength(0)

    const okPayTx = executeUpdateTablePaymentsSqliteTx({
      table: tableWithPayment,
      activityLog: {
        id: 'log-pay-1',
        type: 'payment',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
    })
    expect(okPayTx.success).toBe(true)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.payments).toHaveLength(1)

    // 3. Complete Order Transaction + rollback test
    const completedOrder = createMockOrder({
      id: 'ord-tx-1',
      orderNumber: 'TX-ORD-01',
      tableId: 'tbl-tx-1',
      tableName: 'Masa TX 1',
      businessDayId: day.id,
      items: [item1],
      totals: { subtotal: 220, discount: 0, total: 220 },
      paymentMethod: 'mixed',
      payments: [
        createMockPayment({ id: 'pay-partial-1', method: 'card', amount: 100 }),
        createMockPayment({ id: 'pay-final-2', method: 'cash', amount: 120 }),
      ],
    })

    const failedComplete = executeCompleteOrderSqliteTx({
      order: completedOrder,
      tableId: 'tbl-tx-1',
      activityLog: {
        id: 'log-complete-1',
        type: 'payment',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
      options: { failAtStep: 'after_clear_table' },
    })
    expect(failedComplete.success).toBe(false)
    // Table MUST still be occupied with its items and partial payment; completedOrders MUST be empty
    expect(getCompletedOrdersSafe()).toHaveLength(0)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.status).toBe('occupied')
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.cart).toHaveLength(1)

    const okComplete = executeCompleteOrderSqliteTx({
      order: completedOrder,
      tableId: 'tbl-tx-1',
      activityLog: {
        id: 'log-complete-1',
        type: 'payment',
        userName: 'Admin',
        createdAt: new Date().toISOString(),
      },
    })
    expect(okComplete.success).toBe(true)
    expect(getCompletedOrdersSafe()).toHaveLength(1)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.status).toBe('empty')
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.cart).toHaveLength(0)

    // 4. Reopen Order Transaction + rollback test
    const reopenedTables = getTablesSafe().map((t) =>
      t.id === 'tbl-tx-1'
        ? { ...t, status: 'occupied' as const, cart: [item1], payments: completedOrder.payments }
        : t,
    )
    const failedReopen = executeReopenOrderSqliteTx({
      orderId: 'ord-tx-1',
      reopenedAt: new Date().toISOString(),
      reopenedBy: 'Admin',
      reopenReason: 'Ek sipariş',
      updatedTables: reopenedTables,
      options: { failAtStep: 'after_restore_table' },
    })
    expect(failedReopen.success).toBe(false)
    expect(getCompletedOrdersSafe()[0].reopened).toBe(false)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.status).toBe('empty')

    const okReopen = executeReopenOrderSqliteTx({
      orderId: 'ord-tx-1',
      reopenedAt: new Date().toISOString(),
      reopenedBy: 'Admin',
      reopenReason: 'Ek sipariş',
      updatedTables: reopenedTables,
    })
    expect(okReopen.success).toBe(true)
    expect(getCompletedOrdersSafe()[0].reopened).toBe(true)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.status).toBe('occupied')

    // 5. Refund Transaction + rollback test
    const refund = createMockRefund({ id: 'ref-tx-1', businessDayId: day.id, amount: 55 })
    const failedRefund = executeRefundSqliteTx({
      refund,
      updatedTables: getTablesSafe(),
      options: { failAtStep: 'after_insert_refund' },
    })
    expect(failedRefund.success).toBe(false)
    expect(getRefundsSafe()).toHaveLength(0)

    const okRefund = executeRefundSqliteTx({
      refund,
      updatedTables: getTablesSafe(),
    })
    expect(okRefund.success).toBe(true)
    expect(getRefundsSafe()).toHaveLength(1)

    // 6. Table Transfer/Merge/Split Transaction + rollback test
    const movedTables = getTablesSafe().map((t) =>
      t.id === 'tbl-tx-1' ? { ...t, name: 'Masa Taşındı' } : t,
    )
    const failedMove = executeTransferMergeSplitTableSqliteTx({
      updatedTables: movedTables,
      options: { failAtStep: 'after_save_tables' },
    })
    expect(failedMove.success).toBe(false)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.name).toBe('Masa TX 1')

    const okMove = executeTransferMergeSplitTableSqliteTx({
      updatedTables: movedTables,
    })
    expect(okMove.success).toBe(true)
    expect(getTablesSafe().find((t) => t.id === 'tbl-tx-1')?.name).toBe('Masa Taşındı')

    // 7. Close Business Day Transaction + rollback test
    const closedDay = {
      ...day,
      status: 'closed' as const,
      closedAt: new Date().toISOString(),
      closedBy: 'Admin',
      closingCash: 720,
    }
    const failedCloseDay = executeCloseBusinessDaySqliteTx({
      closedDay,
      options: { failAtStep: 'after_save_z_report' },
    })
    expect(failedCloseDay.success).toBe(false)
    expect(getBusinessDaysSafe()[0].status).toBe('open')

    const okCloseDay = executeCloseBusinessDaySqliteTx({
      closedDay,
    })
    expect(okCloseDay.success).toBe(true)
    expect(getBusinessDaysSafe()[0].status).toBe('closed')
  })

  // ──────────────────────────────────────────────────────────────────────────
  // ADIM 4C: Veri Aktarımı (localStorage -> SQLite Migrasyonu)
  // ──────────────────────────────────────────────────────────────────────────

  it('F.6: End-to-end localStorage -> SQLite migration validates data, quarantines corrupt records, verifies backup & retains legacy data for 30 days', () => {
    setResetSqliteOnStorageClear(false)

    const validTable = createMockTable({
      id: 'legacy-tbl-1',
      name: 'Teras 1',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Türk Kahvesi', price: 65, quantity: 2 })],
      payments: [createMockPayment({ method: 'cash', amount: 50 })],
    })
    const corruptTableEntry = { id: null, name: 12345, cart: 'invalid-cart' }

    const validOrder = createMockOrder({
      id: 'legacy-ord-1',
      orderNumber: 'LEG-101',
      items: [createMockCartItem({ name: 'San Sebastian', price: 150, quantity: 1 })],
      totals: { subtotal: 150, discount: 0, total: 150 },
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 150 })],
    })
    const corruptOrderEntry = { brokenOrder: true }

    const validDay = createMockBusinessDay({
      id: 'legacy-day-1',
      status: 'open',
      openingCash: 500,
    })
    const validProduct = createMockProduct({ id: 'legacy-prod-1', name: 'Limonata', price: 75 })
    const validRefund = createMockRefund({ id: 'legacy-ref-1', amount: 30, paymentMethod: 'cash' })
    const validUser = createMockUser({ id: 'legacy-usr-1', username: 'kasiyer1', fullName: 'Ayşe' })
    const validSettings = createMockSettings({ storeName: 'LEMOON MIGRATED KAFE', taxRate: 10 })

    localStorage.setItem('tables', JSON.stringify([validTable, corruptTableEntry]))
    localStorage.setItem('completedOrders', JSON.stringify([validOrder, corruptOrderEntry]))
    localStorage.setItem('businessDays', JSON.stringify([validDay]))
    localStorage.setItem('menuProducts', JSON.stringify([validProduct]))
    localStorage.setItem('refunds', JSON.stringify([validRefund]))
    localStorage.setItem('appUsers', JSON.stringify([validUser]))
    localStorage.setItem('appSettings', JSON.stringify(validSettings))

    const migRes = runLocalStorageToSqliteMigration()
    expect(migRes.success).toBe(true)
    expect(migRes.rolledBack).toBe(false)

    // 1. Pre-migration automatic backup was taken and is valid
    const rawPreBackup = localStorage.getItem(PRE_SQLITE_MIGRATION_BACKUP_KEY)
    expect(rawPreBackup).not.toBeNull()
    const preBackupValidation = validateBackupFileStructure(JSON.parse(rawPreBackup!))
    expect(preBackupValidation.valid).toBe(true)

    // 2. Corrupt records were quarantined without stopping migration
    expect(migRes.quarantinedKeys.length).toBeGreaterThanOrEqual(2)
    const quarantined = getQuarantinedRecords()
    expect(quarantined.some((q) => q.key.includes('tables_item_1'))).toBe(true)
    expect(quarantined.some((q) => q.key.includes('completedOrders_item_1'))).toBe(true)

    // 3. All valid records migrated to SQLite with 100% financial match
    expect(getTablesSafe().some((t) => t.id === 'legacy-tbl-1' && t.name === 'Teras 1')).toBe(true)
    expect(getCompletedOrdersSafe().some((o) => o.id === 'legacy-ord-1')).toBe(true)
    expect(getBusinessDaysSafe().some((d) => d.id === 'legacy-day-1')).toBe(true)
    expect(getMenuProductsSafe().some((p) => p.id === 'legacy-prod-1')).toBe(true)
    expect(getRefundsSafe().some((r) => r.id === 'legacy-ref-1')).toBe(true)
    expect(getUsersSafe().some((u) => u.id === 'legacy-usr-1')).toBe(true)
    expect(getSettingsSafe().storeName).toBe('LEMOON MIGRATED KAFE')

    // 4. Legacy localStorage data is NOT deleted and "migrated_to_sqlite" flag has 30-day retention
    expect(localStorage.getItem('tables')).not.toBeNull()
    expect(localStorage.getItem('completedOrders')).not.toBeNull()
    expect(localStorage.getItem('businessDays')).not.toBeNull()
    expect(localStorage.getItem(MIGRATED_TO_SQLITE_KEY)).not.toBeNull()

    const flag = getMigrationFlagRecord()
    expect(flag?.migrated).toBe(true)
    expect(flag?.retentionDays).toBe(30)
    expect(shouldRetainLegacyLocalStorage(Date.now())).toBe(true)
    // After 31 days, retention window expires
    expect(shouldRetainLegacyLocalStorage(Date.now() + 31 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('F.7: Post-migration financial mismatch (even by 1 kuruş) rolls back SQLite migration and emits critical error', () => {
    setResetSqliteOnStorageClear(false)

    const order = createMockOrder({
      id: 'ord-fin-1',
      totals: { subtotal: 250, discount: 0, total: 250 },
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 250 })],
    })
    localStorage.setItem('completedOrders', JSON.stringify([order]))

    // Verify computeFinancialSummary and compareFinancialSummaries directly
    const s1 = computeFinancialSummary({
      completedOrders: [order],
      tables: [],
      refunds: [],
      businessDays: [],
    })
    expect(s1.completedOrdersGrossKurus).toBe(25000)
    expect(s1.cardPaymentsKurus).toBe(25000)
    expect(
      compareFinancialSummaries(s1, { ...s1, completedOrdersGrossKurus: 25001 }).matches,
    ).toBe(false)

    // Inject a 1-kuruş tamper right after SQLite write before verification completes
    const errorEvents: any[] = []
    const onErr = (e: Event) => errorEvents.push((e as CustomEvent).detail)
    window.addEventListener('pos-storage-error', onErr)

    const migRes = runLocalStorageToSqliteMigration({
      force: true,
      tamperAfterWrite: (db: any) => {
        db.prepare(`UPDATE orders SET total_kurus = total_kurus + 1 WHERE id = 'ord-fin-1'`).run()
      },
    })
    window.removeEventListener('pos-storage-error', onErr)

    expect(migRes.success).toBe(false)
    expect(migRes.rolledBack).toBe(true)
    expect(migRes.error).toContain('Aktarım sonrası finansal toplam uyuşmazlığı tespit edildi')
    expect(localStorage.getItem(MIGRATED_TO_SQLITE_KEY)).toBeNull()
    expect(errorEvents.length).toBeGreaterThanOrEqual(1)

    // SQLite orders table must have been rolled back to empty
    const ctx = getActiveTestDbContext()
    const countRow = ctx.db.prepare(`SELECT COUNT(*) AS cnt FROM orders`).get()
    expect(countRow.cnt).toBe(0)
  })

  it('F.8: Interrupted migration (simulated power outage mid-migration) rolls back and restarts cleanly on next launch', () => {
    setResetSqliteOnStorageClear(false)

    const table = createMockTable({
      id: 'tbl-int-1',
      name: 'Bahçe 5',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Espresso', price: 55, quantity: 2 })],
    })
    const order = createMockOrder({
      id: 'ord-int-1',
      totals: { subtotal: 180, discount: 0, total: 180 },
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 180 })],
    })
    localStorage.setItem('tables', JSON.stringify([table]))
    localStorage.setItem('completedOrders', JSON.stringify([order]))

    // 1. First launch: power cut right after orders are inserted ('after_orders')
    const interruptedRes = runLocalStorageToSqliteMigration({
      failAtStep: 'after_orders',
    })
    expect(interruptedRes.success).toBe(false)
    expect(interruptedRes.rolledBack).toBe(true)
    // In-progress marker remains in localStorage because power was lost before completion
    expect(localStorage.getItem(MIGRATION_IN_PROGRESS_KEY)).not.toBeNull()
    expect(localStorage.getItem(MIGRATED_TO_SQLITE_KEY)).toBeNull()

    // 2. Next launch after power is restored: detects interruption and restarts cleanly from scratch
    const recoveryRes = runLocalStorageToSqliteMigration()
    expect(recoveryRes.success).toBe(true)
    expect(recoveryRes.recoveredFromInterruption).toBe(true)
    expect(localStorage.getItem(MIGRATION_IN_PROGRESS_KEY)).toBeNull()
    expect(getMigrationFlagRecord()?.migrated).toBe(true)

    // Verify zero duplicate records and exact financial totals
    const ordersInDb = getCompletedOrdersSafe()
    expect(ordersInDb).toHaveLength(1)
    expect(ordersInDb[0].id).toBe('ord-int-1')
    expect(ordersInDb[0].totals.total).toBe(180)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // ADIM 4D: Kaos Testi (Chaos Test) ve Kritik Kırmızı Yazma Hatası Uyarısı
  // ──────────────────────────────────────────────────────────────────────────

  it('F.9: CHAOS TEST — Random power cuts at any step during order completion never leave an order half-closed', () => {
    const possibleFailureSteps = [
      'before_insert_order',
      'after_insert_order',
      'after_delete_open_order',
      'after_clear_table',
      'before_commit',
      null, // no failure (completes normally)
    ]

    for (let i = 0; i < 30; i++) {
      // Reset DB state for iteration i
      localStorage.clear()
      clearInMemoryCache()

      const tableId = `chaos-table-${i}`
      const orderId = `chaos-order-${i}`
      const cartItem1 = createMockCartItem({
        id: `c-item-1-${i}`,
        name: 'Filtre Kahve',
        price: 65,
        quantity: 2,
      })
      const cartItem2 = createMockCartItem({
        id: `c-item-2-${i}`,
        name: 'Kruvasan',
        price: 85,
        quantity: 1,
      })
      const partialPay = createMockPayment({
        id: `c-pay-1-${i}`,
        method: 'card',
        amount: 100,
      })
      const finalPay = createMockPayment({
        id: `c-pay-2-${i}`,
        method: 'cash',
        amount: 115,
      })

      const occupiedTable = createMockTable({
        id: tableId,
        name: `Kaos Masa ${i}`,
        status: 'occupied',
        cart: [cartItem1, cartItem2],
        payments: [partialPay],
      })
      saveTablesSafe([occupiedTable])

      const completedOrder = createMockOrder({
        id: orderId,
        orderNumber: `KAOS-${i}`,
        tableId,
        tableName: occupiedTable.name,
        items: [cartItem1, cartItem2],
        totals: { subtotal: 215, discount: 0, total: 215 },
        paymentMethod: 'mixed',
        payments: [partialPay, finalPay],
      })

      // Deterministically cycle through all failure points + random selection
      const failStep = possibleFailureSteps[i % possibleFailureSteps.length]

      const res = executeCompleteOrderSqliteTx({
        order: completedOrder,
        tableId,
        activityLog: {
          id: `chaos-log-${i}`,
          type: 'payment',
          tableId,
          tableName: occupiedTable.name,
          amount: 215,
          userName: 'Kasiyer',
          createdAt: new Date().toISOString(),
        },
        options: failStep ? { failAtStep: failStep } : undefined,
      })

      const currentTable = getTablesSafe().find((t) => t.id === tableId)!
      const currentOrders = getCompletedOrdersSafe()
      const currentLogs = getActivityLogsSafe()

      if (failStep !== null) {
        // Power failed mid-payment: order MUST be 100% open on the table, NOT in completedOrders!
        expect(res.success).toBe(false)
        expect(currentOrders.some((o) => o.id === orderId)).toBe(false)
        expect(currentTable.status).toBe('occupied')
        expect(currentTable.cart).toHaveLength(2)
        expect(currentTable.payments).toHaveLength(1)
        expect(currentTable.payments![0].amount).toBe(100)
        expect(currentLogs.some((l) => l.id === `chaos-log-${i}`)).toBe(false)
      } else {
        // Completed without power loss: order MUST be 100% closed in completedOrders, table MUST be empty!
        expect(res.success).toBe(true)
        expect(currentOrders).toHaveLength(1)
        expect(currentOrders[0].id).toBe(orderId)
        expect(currentOrders[0].items).toHaveLength(2)
        expect(currentOrders[0].payments).toHaveLength(2)
        expect(currentTable.status).toBe('empty')
        expect(currentTable.cart).toHaveLength(0)
        expect(currentTable.payments).toHaveLength(0)
        expect(currentLogs.some((l) => l.id === `chaos-log-${i}`)).toBe(true)
      }
    }
  })

  it('F.10: SQLite write failure (e.g. disk full) does NOT silently mask sale in memory and emits critical red warning', () => {
    const initialTable = createMockTable({
      id: 'tbl-diskfull-1',
      name: 'Masa Disk',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Çay', price: 25, quantity: 2 })],
    })
    expect(saveTablesSafe([initialTable])).toBe(true)

    const criticalAlerts: any[] = []
    const onStorageError = (e: Event) => criticalAlerts.push((e as CustomEvent).detail)
    window.addEventListener('pos-storage-error', onStorageError)

    // Simulate SQLITE_FULL on write actions while allowing reads
    const realCtx = getActiveTestDbContext()
    setCustomSqliteDispatcher((action, payload) => {
      if (action === 'saveTables' || action === 'tx:completeOrder') {
        return {
          success: false,
          code: 'SQLITE_FULL',
          error: 'database or disk is full (SQLITE_FULL)',
        }
      }
      return executeDbAction(realCtx, action, payload)
    })

    try {
      const modifiedTable = {
        ...initialTable,
        cart: [createMockCartItem({ name: 'Pahalı Kahve', price: 200, quantity: 5 })],
      }
      const writeOk = saveTablesSafe([modifiedTable])
      expect(writeOk).toBe(false)

      // Critical red warning event MUST be emitted to the UI
      expect(criticalAlerts).toHaveLength(1)
      expect(criticalAlerts[0].critical).toBe(true)
      expect(criticalAlerts[0].message).toContain('SQLITE_FULL')

      // Reading back from repository MUST return what is actually on disk, NOT the failed in-memory write
      const persistedTables = getTablesSafe()
      const diskTable = persistedTables.find((t) => t.id === 'tbl-diskfull-1')!
      expect(diskTable.cart).toHaveLength(1)
      expect(diskTable.cart[0].name).toBe('Çay')
    } finally {
      window.removeEventListener('pos-storage-error', onStorageError)
      setCustomSqliteDispatcher((action, payload) => executeDbAction(realCtx, action, payload))
    }
  })

  it('F.11: Exercises all repository collections, permission overrides, KV helpers, and write error handlers across both SQLite and fallback modes', async () => {
    const realCtx = getActiveTestDbContext()

    // 1. Test permission overrides and KV operations in SQLite mode
    expect(saveUserPermissionOverridesSafe({ usr1: { refund_item: true } })).toBe(true)
    expect(getUserPermissionOverridesSafe()).toEqual({ usr1: { refund_item: true } })
    expect(setKvItemSqlite('test_kv', 'val1')).toBe(true)
    expect(removeKvItemSqlite('test_kv')).toBe(true)
    safeRemoveItem('test_kv')

    // Async migration helper check
    const asyncMig = await migrateLocalStorageToSqliteIfNeeded()
    expect(asyncMig.success).toBe(true)

    // 2. Test write error branches across all SQLite repository writers
    setCustomSqliteDispatcher(() => ({
      success: false,
      error: 'Simulated SQLite IO error',
    }))
    expect(saveCompletedOrdersSafe([createMockOrder()])).toBe(false)
    expect(saveBusinessDaysSafe([createMockBusinessDay()])).toBe(false)
    expect(saveMenuProductsSafe([createMockProduct()])).toBe(false)
    expect(saveSettingsSafe(createMockSettings())).toBe(false)
    expect(saveRefundsSafe([createMockRefund()])).toBe(false)
    expect(
      saveActivityLogsSafe([
        { id: 'l1', type: 'login', userName: 'A', createdAt: new Date().toISOString() },
      ]),
    ).toBe(false)
    expect(
      prependActivityLogSqlite({
        id: 'l2',
        type: 'login',
        userName: 'A',
        createdAt: new Date().toISOString(),
      }),
    ).toBe(false)
    expect(saveUsersSafe([createMockUser()])).toBe(false)
    expect(saveUserPermissionOverridesSafe({ u1: { day_open: true } })).toBe(false)
    expect(setKvItemSqlite('k', 'v')).toBe(false)

    // 3. Test browser fallback mode when SQLite IPC is not present
    setCustomSqliteDispatcher(null)
    localStorage.clear()

    const noSqliteMig = runLocalStorageToSqliteMigration()
    expect(noSqliteMig.success).toBe(false)
    expect(noSqliteMig.skipped).toBe(true)

    expect(saveTablesSafe([createMockTable({ name: 'Fallback Masa' })])).toBe(true)
    expect(getTablesSafe()[0].name).toBe('Fallback Masa')

    expect(saveCompletedOrdersSafe([createMockOrder({ orderNumber: 'FB-1' })])).toBe(true)
    expect(getCompletedOrdersSafe()[0].orderNumber).toBe('FB-1')

    expect(saveBusinessDaysSafe([createMockBusinessDay({ openingCash: 123 })])).toBe(true)
    expect(getBusinessDaysSafe()[0].openingCash).toBe(123)

    expect(saveMenuProductsSafe([createMockProduct({ name: 'FB Ürün' })])).toBe(true)
    expect(getMenuProductsSafe().some((p) => p.name === 'FB Ürün')).toBe(true)

    expect(saveSettingsSafe(createMockSettings({ storeName: 'FB KAFE' }))).toBe(true)
    expect(getSettingsSafe().storeName).toBe('FB KAFE')

    expect(saveRefundsSafe([createMockRefund({ amount: 42 })])).toBe(true)
    expect(getRefundsSafe()[0].amount).toBe(42)

    expect(
      saveActivityLogsSafe([
        { id: 'fb-log', type: 'login', userName: 'Admin', createdAt: new Date().toISOString() },
      ]),
    ).toBe(true)
    expect(getActivityLogsSafe()[0].id).toBe('fb-log')

    expect(saveUsersSafe([createMockUser({ username: 'fbuser' })])).toBe(true)
    expect(getUsersSafe()[0].username).toBe('fbuser')

    expect(saveUserPermissionOverridesSafe({ fbuser: { day_close: true } })).toBe(true)
    expect(getUserPermissionOverridesSafe()).toEqual({ fbuser: { day_close: true } })

    // Corrupt fallback JSON handling
    localStorage.setItem('tables', '{bad')
    localStorage.setItem('completedOrders', '{bad')
    localStorage.setItem('businessDays', '{bad')
    localStorage.setItem('menuProducts', '{bad')
    localStorage.setItem('appSettings', '{bad')
    localStorage.setItem('refunds', '{bad')
    localStorage.setItem('activityLogs', '{bad')
    localStorage.setItem('appUsers', '{bad')
    expect(() => getTablesSafe()).not.toThrow()
    expect(() => getCompletedOrdersSafe()).not.toThrow()
    expect(() => getBusinessDaysSafe()).not.toThrow()
    expect(() => getMenuProductsSafe()).not.toThrow()
    expect(() => getSettingsSafe()).not.toThrow()
    expect(() => getRefundsSafe()).not.toThrow()
    expect(() => getActivityLogsSafe()).not.toThrow()
    expect(() => getUsersSafe()).not.toThrow()

    setCustomSqliteDispatcher((action, payload) => executeDbAction(realCtx, action, payload))
  })
})
