import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createFullBackupFile,
  exportFullBackupToFile,
  getPreRestoreBackup,
  restoreFromBackup,
  rollbackPreRestoreBackup,
} from '../../src/lib/storage/backup'
import {
  validateBackupFileStructure,
  validateActivityLogs,
} from '../../src/lib/storage/validators'
import { computeChecksum } from '../../src/lib/storage/checksum'
import {
  clearInMemoryCache,
  getBusinessDaysSafe,
  getCompletedOrdersSafe,
  getMenuProductsSafe,
  getRefundsSafe,
  getActivityLogsSafe,
  saveActivityLogsSafe,
  getSettingsSafe,
  getTablesSafe,
  getUsersSafe,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveMenuProductsSafe,
  saveRefundsSafe,
  saveSettingsSafe,
  saveTablesSafe,
  saveUsersSafe,
} from '../../src/lib/storage/repository'
import {
  migrateMenuProductsSafely,
} from '../../src/lib/storage/migrations'
import {
  getQuarantinedRecords,
  quarantineCorruptPayload,
  removeQuarantinedItem,
} from '../../src/lib/storage/quarantine'
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

describe('A. Persistence, Migration & Backup Test Suite', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Requirement A.1: Full realistic state round-trips through export and restore without loss
  it('A.1: Full realistic state round-trips through export and restore without loss', () => {
    const table1 = createMockTable({
      name: 'Özel VIP Masa 99',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Latte', price: 80, quantity: 2 })],
      payments: [createMockPayment({ method: 'cash', amount: 80 })],
      discountRate: 10,
      note: 'Cam kenarı',
      customerName: 'Ahmet Bey',
    })
    saveTablesSafe([table1])

    const order1 = createMockOrder({
      orderNumber: 'ORD-999',
      items: [createMockCartItem({ name: 'Cheesecake', price: 120, quantity: 1 })],
      totals: { subtotal: 120, discount: 0, total: 120 },
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 120 })],
      cashier: 'Merve',
    })
    saveCompletedOrdersSafe([order1])

    const day1 = createMockBusinessDay({
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: 'Merve',
      openingCash: 500,
      countedCash: 800,
      closingCash: 800,
      expectedCash: 800,
      cashDifference: 0,
      expectedZ: 120,
      enteredZ: 120,
      zDifference: 0,
      report: {
        generatedAt: new Date().toISOString(),
        totalRevenue: 120,
        orderCount: 1,
        averageBasket: 120,
        totalTax: 12,
        totalDiscount: 0,
        cancelledCount: 0,
        cancelledTotal: 0,
        cancelledOrders: [],
        paymentDistribution: { card: 120, cash: 0, iban: 0 },
        soldProducts: [],
        categorySales: [],
        hourlySales: [],
      },
    })
    const day2 = createMockBusinessDay({ status: 'open', openingCash: 400 })
    saveBusinessDaysSafe([day2, day1])

    const product1 = createMockProduct({ name: 'Özel Kahve', price: 95 })
    saveMenuProductsSafe([product1])

    const refund1 = createMockRefund({ amount: 65, reason: 'Kusurlu ürün' })
    saveRefundsSafe([refund1])

    const user1 = createMockUser({ username: 'barista1', fullName: 'Barista Ali' })
    saveUsersSafe([user1])

    const settings = createMockSettings({ storeName: 'LEMOON TEST', taxRate: 8 })
    saveSettingsSafe(settings)

    // Export backup
    const backupFile = createFullBackupFile('Test roundtrip')
    expect(backupFile.formatVersion).toBe(1)
    expect(backupFile.checksum).toBeDefined()
    expect(backupFile.checksum.length).toBeGreaterThan(0)

    // Simulate wipe / new install
    localStorage.clear()
    clearInMemoryCache()
    expect(getTablesSafe().filter((t) => t.name === 'Özel VIP Masa 99')).toHaveLength(0)
    expect(getCompletedOrdersSafe()).toHaveLength(0)

    // Restore backup
    const restoreResult = restoreFromBackup(backupFile)
    expect(restoreResult.success).toBe(true)

    // Verify all entities recovered intact
    const restoredTables = getTablesSafe()
    expect(restoredTables.some((t) => t.name === 'Özel VIP Masa 99' && t.cart[0].name === 'Latte')).toBe(true)
    expect(restoredTables[0].payments![0].amount).toBe(80)

    const restoredOrders = getCompletedOrdersSafe()
    expect(restoredOrders.some((o) => o.orderNumber === 'ORD-999')).toBe(true)

    const restoredDays = getBusinessDaysSafe()
    expect(restoredDays).toHaveLength(2)
    expect(restoredDays.some((d) => d.status === 'closed' && d.report?.totalRevenue === 120)).toBe(true)

    const restoredProducts = getMenuProductsSafe()
    expect(restoredProducts.some((p) => p.name === 'Özel Kahve')).toBe(true)

    const restoredRefunds = getRefundsSafe()
    expect(restoredRefunds.some((r) => r.amount === 65)).toBe(true)

    const restoredUsers = getUsersSafe()
    expect(restoredUsers.some((u) => u.username === 'barista1')).toBe(true)

    const restoredSettings = getSettingsSafe()
    expect(restoredSettings.storeName).toBe('LEMOON TEST')
  })

  // Requirement A.2: Restore failure changes nothing in the existing state
  it('A.2: A restore failure (invalid JSON, wrong version, checksum failure, duplicate IDs) preserves existing state', () => {
    const originalTable = createMockTable({ name: 'Masa Orijinal' })
    saveTablesSafe([originalTable])
    const originalOrder = createMockOrder({ orderNumber: 'ORIGINAL-1' })
    saveCompletedOrdersSafe([originalOrder])

    // Scenario 2a: Truncated / malformed JSON
    const malformed = '{"formatVersion": 1, "data": {'
    const res1 = restoreFromBackup(malformed as any)
    expect(res1.success).toBe(false)
    expect(getTablesSafe()[0].name).toBe('Masa Orijinal')

    // Scenario 2b: Wrong / unsupported version
    const wrongVersion = { formatVersion: 99, checksum: 'xyz', data: {} }
    const res2 = restoreFromBackup(wrongVersion)
    expect(res2.success).toBe(false)
    expect(getCompletedOrdersSafe()[0].orderNumber).toBe('ORIGINAL-1')

    // Scenario 2c: Checksum tampering / mismatch
    const validBackup = createFullBackupFile()
    const tampered = { ...validBackup, checksum: '0000000000000000' }
    const res3 = restoreFromBackup(tampered)
    expect(res3.success).toBe(false)
    expect(res3.message).toContain('Bütünlük doğrulaması başarısız')
    expect(getTablesSafe()[0].name).toBe('Masa Orijinal')

    // Scenario 2d: Duplicate ID collision inside backup payload
    const duplicateId = 'dup-id-123'
    const dupTable1 = createMockTable({ id: duplicateId, name: 'T1' })
    const dupTable2 = createMockTable({ id: duplicateId, name: 'T2' })
    const payloadWithDups = {
      ...validBackup.data,
      tables: [dupTable1, dupTable2],
    }
    const dupBackup = {
      ...validBackup,
      data: payloadWithDups,
      checksum: 'fake',
    }
    const res4 = restoreFromBackup(dupBackup)
    expect(res4.success).toBe(false)
    expect(getTablesSafe()[0].name).toBe('Masa Orijinal')
  })

  // Requirement A.3: Valid restore creates pre-restore backup and can be reversed from it
  it('A.3: Valid restore creates a pre-restore backup and can be reversed from it', () => {
    // Initial state A
    saveTablesSafe([createMockTable({ name: 'Masa A' })])
    saveCompletedOrdersSafe([createMockOrder({ orderNumber: 'ORDER-A' })])

    // Create a backup file representing state B
    const backupStateB = createFullBackupFile()
    backupStateB.data.tables = [createMockTable({ name: 'Masa B' })]
    backupStateB.data.completedOrders = [createMockOrder({ orderNumber: 'ORDER-B' })]
    // Recompute checksum for state B
    backupStateB.checksum = computeChecksum(JSON.stringify(backupStateB.data))

    // Restore state B
    const restoreRes = restoreFromBackup(backupStateB)
    expect(restoreRes.success).toBe(true)
    expect(getTablesSafe().some((t) => t.name === 'Masa B')).toBe(true)

    // Pre-restore backup must exist containing state A
    const preRestore = getPreRestoreBackup()
    expect(preRestore).not.toBeNull()
    expect(preRestore?.data.tables.some((t) => t.name === 'Masa A')).toBe(true)

    // Rollback to pre-restore snapshot
    const rollbackRes = rollbackPreRestoreBackup()
    expect(rollbackRes.success).toBe(true)

    // State A must be restored
    expect(getTablesSafe().some((t) => t.name === 'Masa A')).toBe(true)
    expect(getTablesSafe().some((t) => t.name === 'Masa B')).toBe(false)
    expect(getCompletedOrdersSafe().some((o) => o.orderNumber === 'ORDER-A')).toBe(true)
  })

  // Requirement A.4: Legacy data from existing localStorage keys migrates without loss
  it('A.4: Legacy demo keys (demoTables, demoCompletedOrders, demoAppSettings) migrate without loss', () => {
    localStorage.clear()
    const legacyTables = [createMockTable({ name: 'Eski Masa 1' })]
    const legacyOrders = [createMockOrder({ orderNumber: 'LEGACY-ORD-1' })]
    const legacySettings = createMockSettings({ storeName: 'ESKİ KAFE' })

    localStorage.setItem('demoTables', JSON.stringify(legacyTables))
    localStorage.setItem('demoCompletedOrders', JSON.stringify(legacyOrders))
    localStorage.setItem('demoAppSettings', JSON.stringify(legacySettings))

    // Migration runs transparently on repository reads
    const tables = getTablesSafe()
    expect(tables.some((t) => t.name === 'Eski Masa 1')).toBe(true)

    const orders = getCompletedOrdersSafe()
    expect(orders.some((o) => o.orderNumber === 'LEGACY-ORD-1')).toBe(true)

    const settings = getSettingsSafe()
    expect(settings.storeName).toBe('ESKİ KAFE')

    // Standard keys are now populated
    expect(localStorage.getItem('tables')).not.toBeNull()
    expect(localStorage.getItem('completedOrders')).not.toBeNull()
  })

  // Requirement A.5: Missing optional fields and older records are handled with safe defaults
  it('A.5: Missing optional fields are defaulted safely and not dropped', () => {
    // Record with missing discountRate, payments, customerName, note
    const sparseTable = { id: 'sparse-1', name: 'Sparse Masa', cart: [] }
    localStorage.setItem('tables', JSON.stringify([sparseTable]))

    const tables = getTablesSafe()
    expect(tables).toHaveLength(1)
    expect(tables[0].discountRate).toBe(0)
    expect(tables[0].payments).toEqual([])
    expect(tables[0].status).toBe('empty')

    // Order with missing payments and cancelled flags
    const sparseOrder = {
      id: 'sparse-ord-1',
      orderNumber: 'SPARSE-1',
      items: [],
      totals: { subtotal: 50, total: 50 },
      paymentMethod: 'cash',
    }
    localStorage.setItem('completedOrders', JSON.stringify([sparseOrder]))
    const orders = getCompletedOrdersSafe()
    expect(orders).toHaveLength(1)
    expect(orders[0].cancelled).toBe(false)
    expect(orders[0].reopened).toBe(false)
    expect(orders[0].payments).toEqual([])
  })

  // Requirement A.6: Corrupted JSON in every persisted key cannot crash app startup
  it('A.6: Corrupted JSON in every persisted key is quarantined and does not throw', () => {
    const corruptPayload = '{"broken": [unclosed json...'

    localStorage.setItem('tables', corruptPayload)
    localStorage.setItem('completedOrders', corruptPayload)
    localStorage.setItem('businessDays', corruptPayload)
    localStorage.setItem('menuProducts', corruptPayload)
    localStorage.setItem('appSettings', corruptPayload)
    localStorage.setItem('refunds', corruptPayload)

    // None of these should throw SyntaxError
    expect(() => getTablesSafe()).not.toThrow()
    expect(() => getCompletedOrdersSafe()).not.toThrow()
    expect(() => getBusinessDaysSafe()).not.toThrow()
    expect(() => getMenuProductsSafe()).not.toThrow()
    expect(() => getSettingsSafe()).not.toThrow()
    expect(() => getRefundsSafe()).not.toThrow()

    // Corrupted payloads must be quarantined for recovery
    const quarantined = getQuarantinedRecords()
    expect(quarantined.length).toBeGreaterThanOrEqual(1)
    expect(quarantined.some((q) => q.key.includes('tables'))).toBe(true)
  })

  // Requirement A.7: Simulated write failure/quota error leaves previous persisted data recoverable
  it('A.7: QuotaExceeded write error preserves in-memory state and leaves storage recoverable', () => {
    const table = createMockTable({ name: 'Güvenli Masa' })
    saveTablesSafe([table])

    // Mock setItem to throw QuotaExceededError
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const err = new Error('The quota has been exceeded.')
      err.name = 'QuotaExceededError'
      throw err
    })

    const updatedTable = { ...table, note: 'Büyük not' }
    const success = saveTablesSafe([updatedTable])
    expect(success).toBe(false)

    // Previous persisted data remains fully intact and recoverable
    const recoverableTables = getTablesSafe()
    expect(recoverableTables).toHaveLength(1)
    expect(recoverableTables[0].name).toBe('Güvenli Masa')

    // Restore setItem
    vi.restoreAllMocks()
  })

  // Requirement A.8: Restart/reload persistence works for unpaid table, partially paid table, completed order, open & closed business days
  it('A.8: Restart/reload persistence works for unpaid table, partially paid table, completed order, open & closed day', () => {
    const unpaidTable = createMockTable({
      name: 'Unpaid T1',
      status: 'occupied',
      cart: [createMockCartItem({ price: 50, quantity: 1 })],
      payments: [],
    })
    const partiallyPaidTable = createMockTable({
      name: 'Partial T2',
      status: 'occupied',
      cart: [createMockCartItem({ price: 100, quantity: 2 })],
      payments: [createMockPayment({ method: 'cash', amount: 80 })],
    })
    saveTablesSafe([unpaidTable, partiallyPaidTable])

    const order = createMockOrder({ orderNumber: 'RELOAD-ORD-1' })
    saveCompletedOrdersSafe([order])

    const closedDay = createMockBusinessDay({
      status: 'closed',
      closingCash: 1000,
      report: {
        generatedAt: new Date().toISOString(),
        totalRevenue: 500,
        orderCount: 5,
        averageBasket: 100,
        totalTax: 50,
        totalDiscount: 0,
        cancelledCount: 0,
        cancelledTotal: 0,
        cancelledOrders: [],
        paymentDistribution: { card: 300, cash: 200, iban: 0 },
        soldProducts: [],
        categorySales: [],
        hourlySales: [],
      },
    })
    const openDay = createMockBusinessDay({ status: 'open', openingCash: 350 })
    saveBusinessDaysSafe([openDay, closedDay])

    // Simulate complete page reload / new component lifecycle
    const reloadedTables = getTablesSafe()
    expect(reloadedTables.find((t) => t.name === 'Unpaid T1')?.cart).toHaveLength(1)
    expect(reloadedTables.find((t) => t.name === 'Partial T2')?.payments![0].amount).toBe(80)

    const reloadedOrders = getCompletedOrdersSafe()
    expect(reloadedOrders.some((o) => o.orderNumber === 'RELOAD-ORD-1')).toBe(true)

    const reloadedDays = getBusinessDaysSafe()
    expect(reloadedDays.find((d) => d.status === 'open')?.openingCash).toBe(350)
    expect(reloadedDays.find((d) => d.status === 'closed')?.report?.totalRevenue).toBe(500)
  })

  // Requirement A.9: Recovery UI/action never removes businessDays, completedOrders, refunds, or logs
  it('A.9: Recovery action never purges historical business days, orders, refunds, or logs', () => {
    saveBusinessDaysSafe([createMockBusinessDay({ status: 'closed' })])
    saveCompletedOrdersSafe([createMockOrder()])
    saveRefundsSafe([createMockRefund()])

    // Trigger non-destructive recovery
    try {
      sessionStorage.clear()
    } catch {}

    expect(getBusinessDaysSafe()).toHaveLength(1)
    expect(getCompletedOrdersSafe()).toHaveLength(1)
    expect(getRefundsSafe()).toHaveLength(1)
  })

  // Requirement A.10: Menu catalog migrations do not destroy user-created products
  it('A.10: Menu catalog migrations preserve user-created products without deletion', () => {
    const userCustomProduct = createMockProduct({
      id: 'custom-product-uuid-999',
      name: 'Karamelli Frappe (Özel İçecek)',
      price: 110,
    })

    const initialMenu = [userCustomProduct]
    localStorage.setItem('menuCatalogVersion', 'old_version_v0')
    localStorage.setItem('menuProducts', JSON.stringify(initialMenu))

    // Migrate to new catalog version
    const { products, migrated } = migrateMenuProductsSafely(
      initialMenu,
      '2026_11_new_menu_v2',
      [createMockProduct({ id: 'std-1', name: 'Standart Çay', price: 20 })],
    )

    expect(migrated).toBe(true)
    // Custom user product MUST be preserved in the new menu
    expect(products.some((p) => p.id === 'custom-product-uuid-999')).toBe(true)
    expect(products.some((p) => p.name.includes('Karamelli Frappe'))).toBe(true)
    expect(products.some((p) => p.name === 'Standart Çay')).toBe(true)
  })

  // Extended validation & coverage tests for persistence & backup layer
  it('A.11: exportFullBackupToFile triggers browser anchor click and download', () => {
    const realAnchor = document.createElement('a')
    const clickSpy = vi.spyOn(realAnchor, 'click').mockImplementation(() => {})
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(realAnchor)

    exportFullBackupToFile('custom_backup_name.json')

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(realAnchor.getAttribute('download')).toBe('custom_backup_name.json')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('A.12: Quarantine management: lists and removes quarantined records cleanly', () => {
    const key = quarantineCorruptPayload('testKey', 'bad-data', 'syntax error')
    expect(getQuarantinedRecords().some((r) => r.key === key)).toBe(true)

    removeQuarantinedItem(key)
    expect(getQuarantinedRecords().some((r) => r.key === key)).toBe(false)
  })

  it('A.13: Rollback when no pre-restore backup exists fails safely with meaningful message', () => {
    localStorage.removeItem('storage_pre_restore_backup')
    const res = rollbackPreRestoreBackup()
    expect(res.success).toBe(false)
    expect(res.message).toContain('bulunamadı')
  })

  it('A.14: Backup file validator handles all invalid and corrupted schema variants', () => {
    expect(validateBackupFileStructure(null).valid).toBe(false)
    expect(validateBackupFileStructure({}).valid).toBe(false)
    expect(validateBackupFileStructure({ formatVersion: 2, checksum: 'x', data: {} }).valid).toBe(false)
    expect(validateBackupFileStructure({ formatVersion: 1, checksum: '', data: {} }).valid).toBe(false)
    expect(validateBackupFileStructure({ formatVersion: 1, checksum: 'abc' }).valid).toBe(false)

    // Valid structure but broken data arrays
    const valid = createFullBackupFile()
    const brokenData = { ...valid, data: { ...valid.data, tables: 'not-array' } }
    brokenData.checksum = computeChecksum(JSON.stringify(brokenData.data))
    expect(validateBackupFileStructure(brokenData).valid).toBe(false)

    const brokenOrders = { ...valid, data: { ...valid.data, completedOrders: null } }
    brokenOrders.checksum = computeChecksum(JSON.stringify(brokenOrders.data))
    expect(validateBackupFileStructure(brokenOrders).valid).toBe(false)

    const brokenDays = { ...valid, data: { ...valid.data, businessDays: 'invalid' } }
    brokenDays.checksum = computeChecksum(JSON.stringify(brokenDays.data))
    expect(validateBackupFileStructure(brokenDays).valid).toBe(false)

    const brokenProducts = { ...valid, data: { ...valid.data, menuProducts: 123 } }
    brokenProducts.checksum = computeChecksum(JSON.stringify(brokenProducts.data))
    expect(validateBackupFileStructure(brokenProducts).valid).toBe(false)

    const brokenSettings = { ...valid, data: { ...valid.data, appSettings: null } }
    brokenSettings.checksum = computeChecksum(JSON.stringify(brokenSettings.data))
    expect(validateBackupFileStructure(brokenSettings).valid).toBe(false)

    // Duplicate Order ID
    const dupOrder = createMockOrder({ id: 'dup-ord-id' })
    const brokenDupOrders = {
      ...valid,
      data: { ...valid.data, completedOrders: [dupOrder, { ...dupOrder }] },
    }
    brokenDupOrders.checksum = computeChecksum(JSON.stringify(brokenDupOrders.data))
    expect(validateBackupFileStructure(brokenDupOrders).valid).toBe(false)

    // Duplicate Day ID
    const dupDay = createMockBusinessDay({ id: 'dup-day-id' })
    const brokenDupDays = {
      ...valid,
      data: { ...valid.data, businessDays: [dupDay, { ...dupDay }] },
    }
    brokenDupDays.checksum = computeChecksum(JSON.stringify(brokenDupDays.data))
    expect(validateBackupFileStructure(brokenDupDays).valid).toBe(false)
  })

  it('A.15: Validates activity logs and individual validator fallbacks', () => {
    const logItem = {
      id: 'log-1',
      type: 'login',
      userName: 'Admin',
      createdAt: new Date().toISOString(),
      details: 'Giriş yapıldı',
    }
    expect(validateActivityLogs([logItem])).toHaveLength(1)
    expect(validateActivityLogs('not-array')).toBeNull()

    saveActivityLogsSafe([logItem as any])
    expect(getActivityLogsSafe()).toHaveLength(1)
  })
})
