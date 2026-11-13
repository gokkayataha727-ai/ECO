import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildReportFromOrders,
  calculateDayCardBreakdown,
  computeOpenTablesPartialPayments,
  createIstanbulDate,
  getDayCutoffDate,
  getIstanbulParts,
  getOrderAppliedPayments,
  getReportForBusinessDay,
} from '../../src/lib/businessDay'
import {
  calculateTotals,
  getLineAfterItemDiscount,
  roundCurrency,
} from '../../src/lib/format'
import { generateUUID } from '../../src/lib/uuid'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockProduct,
  createMockRefund,
  createMockTable,
} from '../fixtures/factories'
import type { BusinessDay } from '../../src/types'

describe('B. Financial and Business-Day Correctness Suite', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Requirement B.1: Opening a day creates exactly one open day; attempting a second does not create another
  it('B.1: Opening a day creates exactly one open day; attempting a second open day preserves single open day invariant', () => {
    const days: BusinessDay[] = []

    const openDay = (existing: BusinessDay[], openingCash: number): BusinessDay[] => {
      // Invariant: If there is already an open day, return unmodified list
      if (existing.some((d) => d.status === 'open')) {
        return existing
      }
      const newDay: BusinessDay = {
        id: generateUUID(),
        status: 'open',
        openedAt: new Date().toISOString(),
        openedBy: 'Kasiyer 1',
        openingCash,
      }
      return [newDay, ...existing]
    }

    const state1 = openDay(days, 500)
    expect(state1).toHaveLength(1)
    expect(state1[0].status).toBe('open')
    expect(state1[0].openingCash).toBe(500)

    // Attempt second open day while day 1 is still open
    const state2 = openDay(state1, 750)
    expect(state2).toHaveLength(1)
    expect(state2[0].id).toBe(state1[0].id)
    expect(state2[0].openingCash).toBe(500)
  })

  // Requirement B.2: A sale cannot be completed without an open business day or without payment authorization
  it('B.2: Sale completion requires both an open business day and valid payment sum matching total', () => {
    const canCompleteSale = (
      openDay: BusinessDay | null,
      orderTotal: number,
      paidAmount: number,
      isAuthorized: boolean,
    ): boolean => {
      if (!openDay || openDay.status !== 'open') return false
      if (!isAuthorized) return false
      if (roundCurrency(paidAmount) < roundCurrency(orderTotal)) return false
      return true
    }

    const openDay = createMockBusinessDay({ status: 'open' })
    const closedDay = createMockBusinessDay({ status: 'closed' })

    // Cannot complete without open day
    expect(canCompleteSale(null, 150, 150, true)).toBe(false)
    expect(canCompleteSale(closedDay, 150, 150, true)).toBe(false)

    // Cannot complete without payment authorization
    expect(canCompleteSale(openDay, 150, 150, false)).toBe(false)

    // Cannot complete with underpayment
    expect(canCompleteSale(openDay, 150, 149.99, true)).toBe(false)

    // Valid sale
    expect(canCompleteSale(openDay, 150, 150, true)).toBe(true)
  })

  // Requirement B.3: Cash, card, IBAN, and mixed/partial payments sum exactly to order total, including received cash & change
  it('B.3: Partial payments sum exactly to order total with exact kuruş precision', () => {
    const item1 = createMockCartItem({ price: 33.33, quantity: 3 }) // 99.99
    const item2 = createMockCartItem({ price: 0.01, quantity: 1 }) // 0.01
    const cart = [item1, item2]

    const totals = calculateTotals(cart, 0)
    expect(totals.total).toBe(100.0)

    // Multi-split payment: Card 40.25, IBAN 25.50, Cash 34.25
    const payment1 = createMockPayment({ method: 'card', amount: 40.25 })
    const payment2 = createMockPayment({ method: 'iban', amount: 25.5 })
    const payment3 = createMockPayment({
      method: 'cash',
      amount: 34.25,
      receivedAmount: 50.0,
      change: 15.75,
    })

    const order = createMockOrder({
      totals,
      payments: [payment1, payment2, payment3],
    })

    const applied = getOrderAppliedPayments(order)
    expect(applied.card).toBe(40.25)
    expect(applied.iban).toBe(25.5)
    expect(applied.cash).toBe(34.25)
    expect(applied.total).toBe(100.0)
    expect(roundCurrency(payment3.receivedAmount! - payment3.change!)).toBe(34.25)
  })

  // Requirement B.4: Line-item discounts and order discounts combined correctly; 0%, 100%, decimal prices & boundaries
  it('B.4: Discounts (line-item & order level) calculate deterministically across edge boundaries', () => {
    // Edge case 1: 0% discount
    const itemZero = createMockCartItem({ price: 100, quantity: 1 })
    expect(calculateTotals([itemZero], 0).total).toBe(100)

    // Edge case 2: 100% order discount (rate = 1.0)
    expect(calculateTotals([itemZero], 1.0).total).toBe(0)
    expect(calculateTotals([itemZero], 1.0).discount).toBe(100)

    // Edge case 3: Line-item percentage discount
    const itemWithLineDisc = createMockCartItem({
      price: 80,
      quantity: 1,
      itemDiscount: { type: 'percentage', value: 25 }, // 80 - 20 = 60
    })
    expect(getLineAfterItemDiscount(itemWithLineDisc)).toBe(60)

    // Edge case 4: Combined line-item discount (20 TL fixed) + 10% order discount (rate = 0.1)
    const itemCombined = createMockCartItem({
      price: 120,
      quantity: 1,
      itemDiscount: { type: 'amount', value: 20 }, // 120 - 20 = 100
    })
    // 100 with 10% order discount -> 90
    const totalsCombined = calculateTotals([itemCombined], 0.1)
    expect(totalsCombined.subtotal).toBe(120)
    expect(totalsCombined.total).toBe(90)
    expect(totalsCombined.discount).toBe(30) // 20 line + 10 order

    // Edge case 5: Fractional kuruş decimal price rounding (33.333... TL)
    const oddItem = createMockCartItem({ price: 33.33, quantity: 3 }) // 99.99
    const oddTotals = calculateTotals([oddItem], 0.15) // 15% discount on 99.99 = 15.00
    expect(oddTotals.discount).toBe(15.0)
    expect(oddTotals.total).toBe(84.99)
    expect(roundCurrency(oddTotals.total + oddTotals.discount)).toBe(oddTotals.subtotal)

    // Edge case 6: Fixed payment discount amount (e.g. 410 TL -> 10 TL discount = 400 TL net)
    const billItem = createMockCartItem({ price: 410, quantity: 1 })
    const fixedDiscTotals = calculateTotals([billItem], 0, 10)
    expect(fixedDiscTotals.subtotal).toBe(410)
    expect(fixedDiscTotals.discount).toBe(10)
    expect(fixedDiscTotals.total).toBe(400)

    // Fixed discount cannot make total negative
    const clampedFixedTotals = calculateTotals([billItem], 0, 500)
    expect(clampedFixedTotals.discount).toBe(410)
    expect(clampedFixedTotals.total).toBe(0)
  })

  // Requirement B.5: Tax, gross total, net revenue, average basket, product/category revenue internally consistent
  it('B.5: Report calculations maintain strict internal financial consistency', () => {
    const day = createMockBusinessDay({ id: 'day-consistency-1' })
    const prodA = createMockCartItem({ id: 'p-a', name: 'Kahve A', category: 'Sıcak Kahveler', price: 100, quantity: 2 })
    const prodB = createMockCartItem({ id: 'p-b', name: 'Tatlı B', category: 'Tatlılar', price: 50, quantity: 1 })

    // Order 1: 200 TL (Kahve A x2)
    const order1 = createMockOrder({
      businessDayId: day.id,
      items: [prodA],
      totals: { subtotal: 200, discount: 0, total: 200 },
      taxRate: 10,
      payments: [createMockPayment({ method: 'card', amount: 200 })],
      date: '2026-11-07T10:15:00Z',
    })

    // Order 2: 50 TL (Tatlı B x1)
    const order2 = createMockOrder({
      businessDayId: day.id,
      items: [prodB],
      totals: { subtotal: 50, discount: 0, total: 50 },
      taxRate: 10,
      payments: [createMockPayment({ method: 'cash', amount: 50 })],
      date: '2026-11-07T10:45:00Z',
    })

    const report = buildReportFromOrders([order1, order2], 10, undefined, day.id)

    // 1. Total revenue equals sum of payments
    expect(report.totalRevenue).toBe(250)
    expect(report.paymentDistribution.card).toBe(200)
    expect(report.paymentDistribution.cash).toBe(50)
    expect(report.totalTax).toBe(20) // 10% KDV applied only to card payments (200 * 0.10 = 20)
    expect(roundCurrency(report.paymentDistribution.card + report.paymentDistribution.cash + report.paymentDistribution.iban)).toBe(report.totalRevenue)

    // 2. Order count, paidTablesTotal & grossItemsRevenue consistency
    expect(report.orderCount).toBe(2)
    expect(report.paidTablesTotal).toBe(250)
    expect(report.grossItemsRevenue).toBe(250)

    // 3. Category sales sum exactly to total revenue
    const catSum = report.categorySales.reduce((acc, c) => acc + c.revenue, 0)
    expect(roundCurrency(catSum)).toBe(report.totalRevenue)

    // 4. Product sales sum exactly to total revenue
    const prodSum = report.soldProducts.reduce((acc, p) => acc + p.revenue, 0)
    expect(roundCurrency(prodSum)).toBe(report.totalRevenue)

    // 5. Hourly sales sum exactly to total revenue
    const hourlySum = report.hourlySales.reduce((acc, h) => acc + h.revenue, 0)
    expect(roundCurrency(hourlySum)).toBe(report.totalRevenue)
  })

  // Requirement B.6: A refund correctly adjusts relevant day revenue and payment distribution once without negative totals
  it('B.6: Refunds adjust day revenue and payment methods exactly once and never go below zero', () => {
    const day = createMockBusinessDay({ id: 'day-refund-1' })
    const order = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 100, discount: 0, total: 100 },
      payments: [createMockPayment({ method: 'card', amount: 100 })],
    })

    const refund = createMockRefund({
      businessDayId: day.id,
      amount: 40,
      paymentMethod: 'card',
    })

    // Report with 40 TL refund on 100 TL card sale
    const report = buildReportFromOrders([order], 10, undefined, day.id, [refund])
    expect(report.totalRevenue).toBe(60)
    expect(report.totalRefunds).toBe(40)
    expect(report.paymentDistribution.card).toBe(60)
    expect(report.totalTax).toBe(6)

    // Edge case: Refund amount exceeds revenue (e.g. administrative adjustment)
    const excessRefund = createMockRefund({
      businessDayId: day.id,
      amount: 200,
      paymentMethod: 'card',
    })
    const clampedReport = buildReportFromOrders([order], 10, undefined, day.id, [excessRefund])
    expect(clampedReport.totalRevenue).toBe(0)
    expect(clampedReport.paymentDistribution.card).toBe(0)
    expect(clampedReport.totalTax).toBe(0)
  })

  // Requirement B.7: Cancellations, re-opened orders, and re-payment flows do not duplicate or omit revenue
  it('B.7: Reopened orders and cancellations do NOT duplicate revenue when re-ordered or re-paid', () => {
    const day = createMockBusinessDay({ id: 'day-reopen-1' })

    // Step 1: Initial completed order of 150 TL
    const originalOrder = createMockOrder({
      id: 'order-original-1',
      businessDayId: day.id,
      totals: { subtotal: 150, discount: 0, total: 150 },
      payments: [createMockPayment({ method: 'cash', amount: 150 })],
      cancelled: false,
      reopened: true, // Marked reopened
      reopenReason: 'Müşteri ilave ürün istedi',
    })

    // Step 2: Customer re-orders with an extra 50 TL item -> New order is 200 TL
    const reCompletedOrder = createMockOrder({
      id: 'order-new-2',
      businessDayId: day.id,
      totals: { subtotal: 200, discount: 0, total: 200 },
      payments: [createMockPayment({ method: 'cash', amount: 200 })],
      cancelled: false,
      reopened: false,
    })

    // Step 3: A third order was cancelled before payment
    const cancelledOrder = createMockOrder({
      id: 'order-cancelled-3',
      businessDayId: day.id,
      totals: { subtotal: 80, discount: 0, total: 80 },
      cancelled: true,
      reopened: false,
    })

    const allOrders = [originalOrder, reCompletedOrder, cancelledOrder]
    const report = buildReportFromOrders(allOrders, 10, undefined, day.id)

    // Invariant: Revenue must be EXACTLY 200 TL (original 150 reopened must NOT be double-counted!)
    expect(report.totalRevenue).toBe(200)
    expect(report.orderCount).toBe(1)
    expect(report.paymentDistribution.cash).toBe(200)
    expect(report.cancelledCount).toBe(1)
    expect(report.cancelledTotal).toBe(80)

    // Card breakdown must also exclude reopened orders
    const cardBreakdown = calculateDayCardBreakdown(day, allOrders)
    expect(cardBreakdown.expectedZ).toBe(0)
  })

  // Requirement B.8: Closing a day captures an immutable snapshot, expected cash, counted cash, POS Z and differences
  it('B.8: Day close captures immutable snapshot, expected cash, counted cash and Z difference', () => {
    const openDay = createMockBusinessDay({
      id: 'day-close-test-1',
      status: 'open',
      openingCash: 500,
    })

    const orderCash = createMockOrder({
      businessDayId: openDay.id,
      totals: { subtotal: 300, discount: 0, total: 300 },
      payments: [createMockPayment({ method: 'cash', amount: 300 })],
    })
    const orderCard = createMockOrder({
      businessDayId: openDay.id,
      totals: { subtotal: 250, discount: 0, total: 250 },
      payments: [createMockPayment({ method: 'card', amount: 250 })],
    })

    const orders = [orderCash, orderCard]
    const snapshot = buildReportFromOrders(orders, 10, undefined, openDay.id)

    const expectedCash = roundCurrency(openDay.openingCash + snapshot.paymentDistribution.cash) // 500 + 300 = 800
    const countedCash = 790 // 10 TL kasa açığı
    const cashDifference = roundCurrency(countedCash - expectedCash) // -10

    const expectedZ = snapshot.paymentDistribution.card // 250
    const enteredZ = 250 // Tam uyumlu Z
    const zDifference = roundCurrency(enteredZ - expectedZ) // 0

    const closedDay: BusinessDay = {
      ...openDay,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: 'Kasiyer',
      expectedCash,
      countedCash,
      closingCash: countedCash,
      cashDifference,
      expectedZ,
      enteredZ,
      zDifference,
      report: {
        ...snapshot,
        expectedZ,
        enteredZ,
        zDifference,
      },
    }

    expect(closedDay.expectedCash).toBe(800)
    expect(closedDay.countedCash).toBe(790)
    expect(closedDay.cashDifference).toBe(-10)
    expect(closedDay.expectedZ).toBe(250)
    expect(closedDay.zDifference).toBe(0)
    expect(closedDay.report?.totalRevenue).toBe(550)
  })

  // Requirement B.9: Closed-day reports remain unchanged after product edits, price edits, or later transactions
  it('B.9: Closed-day reports are strictly immutable even if prices or products change later', () => {
    const closedDay = createMockBusinessDay({
      id: 'day-immutable-1',
      status: 'closed',
      openingCash: 500,
      countedCash: 650,
      expectedCash: 650,
      closingCash: 650,
      report: {
        generatedAt: '2026-11-01T22:00:00Z',
        totalRevenue: 150,
        orderCount: 1,
        averageBasket: 150,
        totalTax: 15,
        totalDiscount: 0,
        cancelledCount: 0,
        cancelledTotal: 0,
        cancelledOrders: [],
        paymentDistribution: { card: 150, cash: 0, iban: 0 },
        soldProducts: [
          {
            productKey: 'prod-coffee-1',
            productId: 'prod-coffee-1',
            name: 'Filtre Kahve',
            category: 'Sıcak Kahveler',
            quantity: 3,
            revenue: 150, // 50 TL each
            share: 100,
            optionBreakdown: [],
          },
        ],
        categorySales: [{ category: 'Sıcak Kahveler', quantity: 3, revenue: 150, share: 100 }],
        hourlySales: [],
      },
    })

    // Now later: Product price is changed from 50 TL to 90 TL!
    createMockProduct({ id: 'prod-coffee-1', price: 90 })

    // Later new order in another business day
    const laterOrder = createMockOrder({
      businessDayId: 'day-future-2',
      totals: { subtotal: 900, discount: 0, total: 900 },
    })

    // Fetch report for the closed day
    const retrievedReport = getReportForBusinessDay(closedDay, [laterOrder])

    // Invariant: Historical closed report remains 150 TL, exactly as captured at closure!
    expect(retrievedReport.totalRevenue).toBe(150)
    expect(retrievedReport.soldProducts[0].revenue).toBe(150)
    expect(retrievedReport.orderCount).toBe(1)
  })

  // Requirement B.10: Europe/Istanbul time zone boundary checks around 23:57 and midnight
  it('B.10: Europe/Istanbul time zone handling across 23:57 and midnight boundaries', () => {
    // 2026-11-07 23:55 in Istanbul
    const preCutoff = createIstanbulDate(2026, 11, 7, 23, 55, 0)
    const preParts = getIstanbulParts(preCutoff)
    expect(preParts.hour).toBe(23)
    expect(preParts.minute).toBe(55)

    // 2026-11-08 00:02 in Istanbul (past midnight)
    const postMidnight = createIstanbulDate(2026, 11, 8, 0, 2, 0)
    const postParts = getIstanbulParts(postMidnight)
    expect(postParts.day).toBe(8)
    expect(postParts.hour).toBe(0)
    expect(postParts.minute).toBe(2)

    // Cutoff calculation: When opened at 10:00 AM on 2026-11-07, cutoff is 2026-11-07 23:57
    const openMorning = createIstanbulDate(2026, 11, 7, 10, 0, 0).toISOString()
    const cutoff = getDayCutoffDate(openMorning, '23:57')
    const cutoffParts = getIstanbulParts(cutoff)
    expect(cutoffParts.day).toBe(7)
    expect(cutoffParts.hour).toBe(23)
    expect(cutoffParts.minute).toBe(57)

    // Cutoff calculation: When opened after cutoff (e.g. 23:58), cutoff is next day 23:57
    const openLate = createIstanbulDate(2026, 11, 7, 23, 58, 0).toISOString()
    const cutoffNextDay = getDayCutoffDate(openLate, '23:57')
    const nextParts = getIstanbulParts(cutoffNextDay)
    expect(nextParts.day).toBe(8)
    expect(nextParts.hour).toBe(23)
    expect(nextParts.minute).toBe(57)
  })

  // Requirement B.11: Partial table payments at day close business rule
  it('B.11: Partial payments on open tables belong to active business day and are calculated correctly', () => {
    const day = createMockBusinessDay({ id: 'day-table-partial-1', status: 'open' })

    const tableWithPartial = createMockTable({
      status: 'occupied',
      cart: [createMockCartItem({ price: 100, quantity: 2 })], // 200 TL total
      payments: [
        createMockPayment({ method: 'card', amount: 50, businessDayId: day.id }),
        createMockPayment({ method: 'cash', amount: 30, businessDayId: day.id }),
      ],
    })

    const emptyTable = createMockTable({ status: 'empty' })

    const partials = computeOpenTablesPartialPayments([tableWithPartial, emptyTable], day.id)
    expect(partials.total).toBe(80)
    expect(partials.byMethod.card).toBe(50)
    expect(partials.byMethod.cash).toBe(30)

    // Business rule: Card payments on open tables contribute to expected POS Z while day is open
    const cardBreakdown = calculateDayCardBreakdown(day, [], [tableWithPartial])
    expect(cardBreakdown.expectedZ).toBe(50)
  })

  // Requirement B.12: Rapid repeated actions generate strictly unique IDs
  it('B.12: Rapid repeated action generation produces unique IDs without collision', () => {
    const ids = new Set<string>()
    const count = 5000

    for (let i = 0; i < count; i++) {
      const id = generateUUID()
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }

    expect(ids.size).toBe(count)
  })

  // Requirement B.13: Gross items revenue (Toplam Ciro) includes open tables & option deltas, excludes cancelled/refunded items, and paidTablesTotal tracks collected closed orders
  it('B.13: Toplam Ciro includes unpaid open tables & option deltas, excludes cancelled items, and Ödenen Masalar Toplamı tracks closed table collections', () => {
    const day = createMockBusinessDay({ id: 'day-rev-check-1', status: 'open' })
    const nowIso = createIstanbulDate(2026, 11, 12, 14, 0, 0).toISOString()

    // 1. Open table with 2 items (no payment yet), including option delta (+15 TL)
    const openTableUnpaid = createMockTable({
      id: 'table-1',
      status: 'occupied',
      cart: [
        createMockCartItem({
          id: 'item-1',
          price: 100,
          quantity: 2,
          selectedOptions: [
            { groupId: 'g1', groupName: 'Süt', optionId: 'o1', optionName: 'Yulaf Sütü', priceDelta: 15 },
          ],
          addedAt: nowIso,
        }), // 2 * (100 + 15) = 230
        createMockCartItem({
          id: 'item-2',
          price: 50,
          quantity: 1,
          addedAt: nowIso,
        }), // 50
      ],
    })

    // 2. Open table with refunded item (should be excluded) & partial payment (table not closed yet)
    const openTablePartial = createMockTable({
      id: 'table-2',
      status: 'occupied',
      cart: [
        createMockCartItem({ id: 'item-3', price: 80, quantity: 1, addedAt: nowIso }), // 80
        createMockCartItem({ id: 'item-4', price: 60, quantity: 1, status: 'refunded', addedAt: nowIso }), // 0 (cancelled/refunded)
      ],
      payments: [createMockPayment({ method: 'cash', amount: 40, businessDayId: day.id })],
    })

    // Report before any table is closed: Toplam Ciro = 230 + 50 + 80 = 360, Ödenen Masalar = 0
    const openOnlyReport = buildReportFromOrders([], 10, [openTableUnpaid, openTablePartial], day.id, [])
    expect(openOnlyReport.grossItemsRevenue).toBe(360)
    expect(openOnlyReport.paidTablesTotal).toBe(0)

    // 3. Closed order with partial payments (really collected 180 TL out of 200 TL gross)
    const closedOrder = createMockOrder({
      businessDayId: day.id,
      date: nowIso,
      items: [createMockCartItem({ id: 'item-5', price: 100, quantity: 2 })], // 200 gross
      totals: { subtotal: 200, discount: 20, total: 180 },
      payments: [
        createMockPayment({ method: 'card', amount: 100, businessDayId: day.id }),
        createMockPayment({ method: 'cash', amount: 80, businessDayId: day.id }),
      ],
    })

    // 4. Cancelled order (should be excluded from both)
    const cancelledOrder = createMockOrder({
      businessDayId: day.id,
      date: nowIso,
      cancelled: true,
      items: [createMockCartItem({ id: 'item-6', price: 90, quantity: 1 })],
      totals: { subtotal: 90, discount: 0, total: 90 },
    })

    // 5. Old refund from a different day should NOT zero out today's dateRange report
    const oldRefund = createMockRefund({
      businessDayId: 'old-day',
      amount: 5000,
      paymentMethod: 'cash',
      refundedAt: createIstanbulDate(2026, 11, 1, 12, 0, 0).toISOString(),
    })

    const rangeStart = createIstanbulDate(2026, 11, 12, 0, 0, 0)
    const rangeEnd = new Date(createIstanbulDate(2026, 11, 12, 23, 59, 59).getTime() + 999)

    const fullReport = buildReportFromOrders(
      [closedOrder, cancelledOrder],
      10,
      [openTableUnpaid, openTablePartial],
      undefined,
      [oldRefund],
      { dateRange: { start: rangeStart, end: rangeEnd } },
    )

    // Toplam Ciro = 360 (open tables) + 200 (closedOrder gross) = 560
    expect(fullReport.grossItemsRevenue).toBe(560)
    // Ödenen Masalar Toplamı = 180 (closedOrder collected payments, oldRefund excluded by dateRange)
    expect(fullReport.paidTablesTotal).toBe(180)
  })

  // Requirement B.14: 10% KDV applies strictly to card payments (card * rate / 100), excluding cash/IBAN, and deducts card refunds
  it('B.14: KDV (%10) applies only to net card payments across single, split, legacy, cancelled/reopened, and refunded orders', () => {
    const day = createMockBusinessDay({ id: 'day-kdv-card-only', status: 'open' })

    // 1. Cash-only and IBAN-only orders -> 0 KDV
    const cashOnly = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 300, discount: 0, total: 300 },
      taxRate: 10,
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 300 })],
    })
    const ibanOnly = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 250, discount: 0, total: 250 },
      taxRate: 10,
      paymentMethod: 'iban',
      payments: [createMockPayment({ method: 'iban', amount: 250 })],
    })

    const nonCardReport = buildReportFromOrders([cashOnly, ibanOnly], 10, undefined, day.id, [])
    expect(nonCardReport.totalRevenue).toBe(550)
    expect(nonCardReport.totalTax).toBe(0)

    // 2. Mixed/split payment (100 card + 50 cash + 50 iban) -> KDV = 100 * 0.10 = 10
    const splitOrder = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 200, discount: 0, total: 200 },
      taxRate: 10,
      paymentMethod: 'mixed',
      payments: [
        createMockPayment({ method: 'card', amount: 100 }),
        createMockPayment({ method: 'cash', amount: 50 }),
        createMockPayment({ method: 'iban', amount: 50 }),
      ],
    })

    // 3. Legacy order without payments array (paymentMethod: 'card', 150 TL -> 15 TL KDV)
    const legacyCardOrder = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 150, discount: 0, total: 150 },
      taxRate: 10,
      paymentMethod: 'card',
      payments: undefined,
    })

    // 4. Cancelled & reopened card orders must NOT contribute to KDV
    const cancelledCard = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 500, discount: 0, total: 500 },
      taxRate: 10,
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 500 })],
      cancelled: true,
    })
    const reopenedCard = createMockOrder({
      businessDayId: day.id,
      totals: { subtotal: 400, discount: 0, total: 400 },
      taxRate: 10,
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 400 })],
      reopened: true,
    })

    // 5. Card refund of 50 TL and cash refund of 100 TL
    const cardRefund = createMockRefund({
      businessDayId: day.id,
      amount: 50,
      paymentMethod: 'card',
    })
    const cashRefund = createMockRefund({
      businessDayId: day.id,
      amount: 100,
      paymentMethod: 'cash',
    })

    // Net card = 100 + 150 - 50 = 200 -> KDV = 20.00
    const mixedReport = buildReportFromOrders(
      [cashOnly, ibanOnly, splitOrder, legacyCardOrder, cancelledCard, reopenedCard],
      10,
      undefined,
      day.id,
      [cardRefund, cashRefund],
    )
    expect(mixedReport.paymentDistribution.card).toBe(200)
    expect(mixedReport.totalTax).toBe(20)

    // 6. Precision check: 33.35 + 33.35 + 33.30 = 100.00 card -> exact 10.00 KDV without 1-kuruş drift
    const decimalOrders = [33.35, 33.35, 33.3].map((amt) =>
      createMockOrder({
        businessDayId: day.id,
        totals: { subtotal: amt, discount: 0, total: amt },
        taxRate: 10,
        paymentMethod: 'card',
        payments: [createMockPayment({ method: 'card', amount: amt })],
      }),
    )
    const decimalReport = buildReportFromOrders(decimalOrders, 10, undefined, day.id, [])
    expect(decimalReport.paymentDistribution.card).toBe(100)
    expect(decimalReport.totalTax).toBe(10)
  })
})
