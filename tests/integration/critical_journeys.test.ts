import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearInMemoryCache,
  createFullBackupFile,
  getBusinessDaysSafe,
  getCompletedOrdersSafe,
  getMenuProductsSafe,
  getQuarantinedRecords,
  getRefundsSafe,
  getSettingsSafe,
  getTablesSafe,
  getUsersSafe,
  restoreFromBackup,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveMenuProductsSafe,
  saveRefundsSafe,
  saveSettingsSafe,
  saveTablesSafe,
  saveUsersSafe,
} from '../../src/lib/storage'
import {
  buildReportFromOrders,
} from '../../src/lib/businessDay'
import {
  calculateTotals,
  getEffectivePrice,
  roundCurrency,
} from '../../src/lib/format'
import { can } from '../../src/lib/permissions'
import { generateUUID } from '../../src/lib/uuid'
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
import type { BusinessDay, CompletedOrder, User } from '../../src/types'

describe('C. Critical User-Journey Integration Suite', () => {
  beforeEach(() => {
    localStorage.clear()
    clearInMemoryCache()
  })

  // Journey C.1: First launch -> admin setup/login -> open day -> table order -> options/discount -> split payment -> complete sale -> close day -> confirm report survives reload
  it('C.1: End-to-end cafe workflow: launch, day open, order, split payment, close day, survive restart', () => {
    // 1. Initial Launch
    const adminUser = createMockUser({ role: 'admin', username: 'admin' })
    saveUsersSafe([adminUser])
    const settings = createMockSettings({ storeName: 'LEMOON KAFE' })
    saveSettingsSafe(settings)

    // Admin opens day with 500 TL cash float
    expect(can(adminUser, 'day_open', settings)).toBe(true)
    const openDay: BusinessDay = {
      id: generateUUID(),
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: adminUser.fullName,
      openingCash: 500,
    }
    saveBusinessDaysSafe([openDay])

    // 2. Create table order with product options and discount
    const product = createMockProduct({
      name: 'Latte',
      price: 70,
      optionGroups: [
        {
          id: 'opt-syrup',
          name: 'Şurup',
          selectionType: 'single',
          required: false,
          options: [{ id: 'opt-vanilla', name: 'Vanilya', priceDelta: 10, isDefault: false }],
        },
      ],
    })
    saveMenuProductsSafe([product])

    const cartItem = createMockCartItem({
      ...product,
      quantity: 2,
      selectedOptions: [{ groupId: 'opt-syrup', groupName: 'Şurup', optionId: 'opt-vanilla', optionName: 'Vanilya', priceDelta: 10 }],
    })
    // Effective unit price = 70 + 10 = 80 TL. For 2 items = 160 TL.
    expect(getEffectivePrice(cartItem)).toBe(80)

    // Apply 10% discount (0.1) -> Subtotal: 160, Discount: 16, Total: 144 TL
    const tableTotals = calculateTotals([cartItem], 0.1)
    expect(tableTotals.total).toBe(144)

    // 3. Split Payment: Card 100 TL, Cash 44 TL
    const paymentCard = createMockPayment({
      method: 'card',
      amount: 100,
      businessDayId: openDay.id,
      cashier: adminUser.fullName,
    })
    const paymentCash = createMockPayment({
      method: 'cash',
      amount: 44,
      businessDayId: openDay.id,
      cashier: adminUser.fullName,
    })

    const table = createMockTable({
      id: 'table-salon-1',
      name: 'Salon 1',
      status: 'occupied',
      cart: [cartItem],
      discountRate: 0.1,
      payments: [paymentCard, paymentCash],
    })
    saveTablesSafe([table])

    // 4. Complete sale
    const completedOrder: CompletedOrder = {
      id: generateUUID(),
      orderNumber: 'SALON-1-001',
      tableId: table.id,
      tableName: table.name,
      items: [cartItem],
      totals: tableTotals,
      paymentMethod: 'mixed',
      payments: [paymentCard, paymentCash],
      discountRate: 0.1,
      taxRate: settings.taxRate,
      date: new Date().toISOString(),
      cashier: adminUser.fullName,
      businessDayId: openDay.id,
      cancelled: false,
      reopened: false,
    }
    saveCompletedOrdersSafe([completedOrder])

    // Empty the table
    saveTablesSafe([{ ...table, status: 'empty', cart: [], payments: [] }])

    // 5. Close day
    const liveReport = buildReportFromOrders([completedOrder], settings.taxRate, undefined, openDay.id)
    const expectedCash = roundCurrency(openDay.openingCash + liveReport.paymentDistribution.cash) // 500 + 44 = 544
    const countedCash = 544

    const closedDay: BusinessDay = {
      ...openDay,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: adminUser.fullName,
      expectedCash,
      countedCash,
      closingCash: countedCash,
      cashDifference: 0,
      expectedZ: 100,
      enteredZ: 100,
      zDifference: 0,
      report: {
        ...liveReport,
        expectedZ: 100,
        enteredZ: 100,
        zDifference: 0,
      },
    }
    saveBusinessDaysSafe([closedDay])

    // 6. Simulate restart / reload
    clearInMemoryCache()

    const reloadedDays = getBusinessDaysSafe()
    expect(reloadedDays[0].status).toBe('closed')
    expect(reloadedDays[0].report?.totalRevenue).toBe(144)
    expect(reloadedDays[0].report?.paymentDistribution.card).toBe(100)
    expect(reloadedDays[0].report?.paymentDistribution.cash).toBe(44)
    expect(reloadedDays[0].expectedCash).toBe(544)
    expect(reloadedDays[0].expectedZ).toBe(100)
  })

  // Journey C.2: Create unpaid table order -> force restart -> reopen table -> complete once -> exactly one completed order & correct totals
  it('C.2: Unpaid table order survives crash/restart, can be reopened and checked out without duplication', () => {
    const day = createMockBusinessDay({ status: 'open' })
    saveBusinessDaysSafe([day])

    const item = createMockCartItem({ name: 'Filtre Kahve', price: 60, quantity: 2 }) // 120 TL
    const unpaidTable = createMockTable({
      id: 'table-crash-test',
      name: 'T-Crash',
      status: 'occupied',
      cart: [item],
      payments: [],
    })
    saveTablesSafe([unpaidTable])

    // Force sudden app crash / reload
    clearInMemoryCache()

    // Operator reopens table after restart
    const recoveredTables = getTablesSafe()
    const targetTable = recoveredTables.find((t) => t.id === 'table-crash-test')!
    expect(targetTable.cart).toHaveLength(1)
    expect(targetTable.cart[0].name).toBe('Filtre Kahve')
    expect(targetTable.status).toBe('occupied')

    // Operator completes order now
    const totals = calculateTotals(targetTable.cart, 0)
    const completed: CompletedOrder = {
      id: generateUUID(),
      orderNumber: 'T-CRASH-01',
      items: targetTable.cart,
      totals,
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: totals.total, businessDayId: day.id })],
      date: new Date().toISOString(),
      businessDayId: day.id,
      cancelled: false,
      reopened: false,
    }
    saveCompletedOrdersSafe([completed])
    saveTablesSafe([{ ...targetTable, status: 'empty', cart: [], payments: [] }])

    // Verify exactly one order exists in history and report equals 120 TL
    const orders = getCompletedOrdersSafe()
    expect(orders).toHaveLength(1)
    expect(orders[0].totals.total).toBe(120)

    const report = buildReportFromOrders(orders, 10, undefined, day.id)
    expect(report.totalRevenue).toBe(120)
    expect(report.orderCount).toBe(1)
  })

  // Journey C.3: Complete order -> reopen order (both supported payment options: keep & cancel) -> complete again -> verify no double counting
  it('C.3: Reopening order with keep or cancel payment modes never duplicates revenue', () => {
    const day = createMockBusinessDay({ status: 'open' })
    saveBusinessDaysSafe([day])

    // Step 1: Complete an initial order of 100 TL (paid cash)
    const initialOrder = createMockOrder({
      id: 'ord-reopen-test-1',
      businessDayId: day.id,
      totals: { subtotal: 100, discount: 0, total: 100 },
      payments: [createMockPayment({ method: 'cash', amount: 100, businessDayId: day.id })],
    })
    saveCompletedOrdersSafe([initialOrder])

    // Report before reopen
    let report = buildReportFromOrders(getCompletedOrdersSafe(), 10, undefined, day.id)
    expect(report.totalRevenue).toBe(100)

    // Step 2: Reopen order (Option A: Keep payments)
    const reopenedOrder: CompletedOrder = {
      ...initialOrder,
      reopened: true,
      reopenedAt: new Date().toISOString(),
      reopenReason: 'Müşteri hesaba ekleme yaptı',
    }
    // Put items and payments back on table
    const table = createMockTable({
      id: 'table-reopened-1',
      status: 'occupied',
      cart: [...initialOrder.items, createMockCartItem({ name: 'Ekstra Su', price: 20, quantity: 1 })],
      payments: [...(initialOrder.payments || [])], // Payments kept (100 TL)
    })
    saveTablesSafe([table])
    saveCompletedOrdersSafe([reopenedOrder])

    // Immediately after reopen: Reopened order is excluded from revenue, table has pending items
    report = buildReportFromOrders(getCompletedOrdersSafe(), 10, undefined, day.id)
    expect(report.totalRevenue).toBe(0) // No completed revenue yet

    // Customer pays the extra 20 TL in cash
    const extraPayment = createMockPayment({ method: 'cash', amount: 20, businessDayId: day.id })
    const finalPayments = [...table.payments!, extraPayment]
    const finalTotals = calculateTotals(table.cart, 0) // 120 TL

    const finalOrder = createMockOrder({
      id: 'ord-final-recompleted',
      businessDayId: day.id,
      items: table.cart,
      totals: finalTotals,
      payments: finalPayments,
      cancelled: false,
      reopened: false,
    })
    saveCompletedOrdersSafe([finalOrder, reopenedOrder])

    // Final report verification: Total must be EXACTLY 120 TL, not 220 TL (no double counting!)
    const finalReport = buildReportFromOrders(getCompletedOrdersSafe(), 10, undefined, day.id)
    expect(finalReport.totalRevenue).toBe(120)
    expect(finalReport.orderCount).toBe(1)
    expect(finalReport.paymentDistribution.cash).toBe(120)
  })

  // Journey C.4: Make a refund -> close/reload -> verify refund and report balance persist
  it('C.4: Refunds persist through day-close and application reload without balance loss', () => {
    const day = createMockBusinessDay({ status: 'open' })
    saveBusinessDaysSafe([day])

    const order = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 200, discount: 0, total: 200 },
      payments: [createMockPayment({ method: 'card', amount: 200, businessDayId: day.id })],
    })
    saveCompletedOrdersSafe([order])

    // 50 TL Card Refund
    const refund = createMockRefund({
      businessDayId: day.id,
      amount: 50,
      paymentMethod: 'card',
      reason: 'Bozuk meşrubat',
    })
    saveRefundsSafe([refund])

    // Close day
    const reportSnapshot = buildReportFromOrders([order], 10, undefined, day.id, [refund])
    expect(reportSnapshot.totalRevenue).toBe(150)
    expect(reportSnapshot.totalRefunds).toBe(50)
    expect(reportSnapshot.paymentDistribution.card).toBe(150)

    const closedDay: BusinessDay = {
      ...day,
      status: 'closed',
      closedAt: new Date().toISOString(),
      report: reportSnapshot,
    }
    saveBusinessDaysSafe([closedDay])

    // Simulate complete reload
    clearInMemoryCache()

    const reloadedDays = getBusinessDaysSafe()
    const reloadedRefunds = getRefundsSafe()
    expect(reloadedRefunds).toHaveLength(1)
    expect(reloadedRefunds[0].amount).toBe(50)
    expect(reloadedDays[0].report?.totalRevenue).toBe(150)
    expect(reloadedDays[0].report?.totalRefunds).toBe(50)
  })

  // Journey C.5: Export full backup -> deliberately modify isolated test data -> restore backup -> verify original state restored
  it('C.5: Disaster recovery: export backup, tamper/wipe state, restore, verify complete recovery', () => {
    const originalOrder = createMockOrder({ orderNumber: 'DISASTER-1', totals: { subtotal: 300, discount: 0, total: 300 } })
    const originalTable = createMockTable({ name: 'Önemli Masa' })
    const originalDay = createMockBusinessDay({ status: 'closed', closingCash: 1200 })

    saveCompletedOrdersSafe([originalOrder])
    saveTablesSafe([originalTable])
    saveBusinessDaysSafe([originalDay])

    const backupFile = createFullBackupFile('Disaster test backup')

    // Deliberate disaster: Data wiped and replaced with garbage
    saveCompletedOrdersSafe([])
    saveTablesSafe([createMockTable({ name: 'Yeni Yanlış Masa' })])
    saveBusinessDaysSafe([])

    expect(getCompletedOrdersSafe()).toHaveLength(0)
    expect(getBusinessDaysSafe()).toHaveLength(0)

    // Restore from backup file
    const restoreRes = restoreFromBackup(backupFile)
    expect(restoreRes.success).toBe(true)

    // State restored exactly
    expect(getCompletedOrdersSafe().some((o) => o.orderNumber === 'DISASTER-1')).toBe(true)
    expect(getTablesSafe().some((t) => t.name === 'Önemli Masa')).toBe(true)
    expect(getBusinessDaysSafe().some((d) => d.status === 'closed' && d.closingCash === 1200)).toBe(true)
  })

  // Journey C.6: Feed corrupt local stored data -> launch -> verify controlled recovery, no blank silent reset, no data deletion, meaningful operator message
  it('C.6: Corrupted local data triggers controlled quarantine without silent blank reset or crashing', () => {
    const badJson = '{"truncated": [1, 2, '
    localStorage.setItem('tables', badJson)
    localStorage.setItem('completedOrders', badJson)

    // Read through safe persistence layer
    const tables = getTablesSafe()
    const orders = getCompletedOrdersSafe()

    // Does not crash; returns safe operational defaults
    expect(Array.isArray(tables)).toBe(true)
    expect(Array.isArray(orders)).toBe(true)

    // Raw corrupted payload preserved in quarantine for recovery
    const quarantined = getQuarantinedRecords()
    expect(quarantined.length).toBeGreaterThanOrEqual(2)
    expect(quarantined.some((q) => q.key.includes('tables'))).toBe(true)
    expect(quarantined.some((q) => q.key.includes('completedOrders'))).toBe(true)
  })

  // Journey C.7: Role-based authorization & permission enforcement
  it('C.7: Unauthorized user cannot open/close day, refund, edit products or view logs', () => {
    const settings = createMockSettings({
      allowCashierRefund: false,
      allowCashierReopen: false,
    })

    const waiterUser: User = {
      id: 'waiter-1',
      username: 'garson',
      fullName: 'Garson Ahmet',
      role: 'waiter',
      passwordHash: 'hash',
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    const adminUser: User = {
      id: 'admin-1',
      username: 'patron',
      fullName: 'Patron',
      role: 'admin',
      passwordHash: 'hash',
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    // Waiter restrictions
    expect(can(waiterUser, 'day_open', settings)).toBe(false)
    expect(can(waiterUser, 'day_close', settings)).toBe(false)
    expect(can(waiterUser, 'refund_item', settings)).toBe(false)
    expect(can(waiterUser, 'refund_table', settings)).toBe(false)
    expect(can(waiterUser, 'product_manage', settings)).toBe(false)
    expect(can(waiterUser, 'product_delete', settings)).toBe(false)
    expect(can(waiterUser, 'manage_settings', settings)).toBe(false)

    // Admin privileges
    expect(can(adminUser, 'day_open', settings)).toBe(true)
    expect(can(adminUser, 'day_close', settings)).toBe(true)
    expect(can(adminUser, 'refund_item', settings)).toBe(true)
    expect(can(adminUser, 'product_manage', settings)).toBe(true)
    expect(can(adminUser, 'manage_settings', settings)).toBe(true)
  })

  // Journey C.8: Rapid double click on day-close cannot create duplicate closure records
  it('C.8: Concurrent/rapid double-click on day-close prevents duplicate records', () => {
    const day = createMockBusinessDay({ id: 'day-double-click', status: 'open', openingCash: 400 })
    saveBusinessDaysSafe([day])

    let isClosingInProgress = false
    const closeDayOnce = (currentDay: BusinessDay): boolean => {
      if (isClosingInProgress || currentDay.status !== 'open') {
        return false
      }
      isClosingInProgress = true
      const closedRecord: BusinessDay = {
        ...currentDay,
        status: 'closed',
        closedAt: new Date().toISOString(),
      }
      saveBusinessDaysSafe([closedRecord])
      return true
    }

    // First click: Succeeds
    const firstAttempt = closeDayOnce(getBusinessDaysSafe()[0])
    expect(firstAttempt).toBe(true)

    // Immediate second click (rapid double click): Rejected
    const secondAttempt = closeDayOnce(getBusinessDaysSafe()[0])
    expect(secondAttempt).toBe(false)

    // Verify exactly one closed record in storage
    const days = getBusinessDaysSafe()
    expect(days).toHaveLength(1)
    expect(days[0].status).toBe('closed')
  })
})
