import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildReportFromOrders,
  calculateDayCardBreakdown,
  createIstanbulDate,
  detectPaymentAndRefundInconsistencies,
  getOpenBusinessDayDurationAlert,
  getOrderAppliedPayments,
  getReportForBusinessDay,
  hesaplaBeklenenNakit,
  selectOrdersForBusinessDay,
} from '../../src/lib/businessDay'
import { roundCurrency } from '../../src/lib/format'
import {
  clearInMemoryCache,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveRefundsSafe,
} from '../../src/lib/storage'
import { CloseDayModal } from '../../src/components/CloseDayModal'
import { HomePage } from '../../src/components/HomePage'
import { ReportsModal } from '../../src/components/ReportsModal'
import { ZReportPrintView } from '../../src/components/ZReportPrintView'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockRefund,
  createMockSettings,
  createMockTable,
} from '../fixtures/factories'

function renderComponent(ui: React.ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root | null = null
  act(() => {
    root = createRoot(container)
    root.render(ui)
  })
  return {
    container,
    unmount: () => {
      act(() => {
        root?.unmount()
      })
      container.remove()
    },
  }
}

describe('PROMPT 6 — Günler arası nakit kayması ve tahsilat/ciro ayrımı', () => {
  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    clearInMemoryCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    clearInMemoryCache()
    document.body.innerHTML = ''
  })

  // Doğrulama 1
  it('1. A gününde masaya ₺300 nakit ara ödeme → A gününün raporunda nakit ₺300 görünmeli', () => {
    const dayA = createMockBusinessDay({
      id: 'day-a',
      status: 'open',
      openingCash: 500,
      openedAt: createIstanbulDate(2026, 11, 13, 21, 53, 0).toISOString(),
    })
    const openTable = createMockTable({
      id: 'masa-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Latte', category: 'Kahveler', price: 200, quantity: 4 })],
      payments: [
        createMockPayment({
          id: 'pay-a-300',
          method: 'cash',
          amount: 300,
          businessDayId: dayA.id,
          createdAt: createIstanbulDate(2026, 11, 13, 22, 15, 0).toISOString(),
        }),
      ],
    })

    const reportA = getReportForBusinessDay(dayA, [], 10, [openTable], [], [dayA])
    const cashA = hesaplaBeklenenNakit(dayA, reportA)

    expect(reportA.openTablePaymentsTotal).toBe(300)
    expect(reportA.openTablePaymentsByMethod?.cash).toBe(300)
    expect(reportA.cashDrawerBreakdown?.openTableCashGross).toBe(300)
    expect(reportA.totalCollectedRevenue).toBe(300)
    expect(cashA.kirilim.acikMasaNakit).toBe(300)
    expect(cashA.kirilim.netNakitSatis).toBe(300)
    expect(cashA.beklenen).toBe(800) // 500 açılış + 300 nakit ara ödeme
  })

  // Doğrulama 2
  it('2. A gününde ara ödeme (₺300) → aynı gün masayı kapat (₺500) → A gününde nakit ₺800', () => {
    const dayA = createMockBusinessDay({
      id: 'day-a',
      status: 'open',
      openingCash: 500,
      openedAt: createIstanbulDate(2026, 11, 13, 10, 0, 0).toISOString(),
    })
    const order = createMockOrder({
      id: 'ord-same-day',
      businessDayId: dayA.id,
      date: createIstanbulDate(2026, 11, 13, 14, 0, 0).toISOString(),
      items: [createMockCartItem({ name: 'Filtre', category: 'Kahveler', price: 200, quantity: 4 })],
      totals: { subtotal: 800, discount: 0, total: 800 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'p-1',
          method: 'cash',
          amount: 300,
          businessDayId: dayA.id,
          createdAt: createIstanbulDate(2026, 11, 13, 12, 0, 0).toISOString(),
        }),
        createMockPayment({
          id: 'p-2',
          method: 'cash',
          amount: 500,
          businessDayId: dayA.id,
          createdAt: createIstanbulDate(2026, 11, 13, 14, 0, 0).toISOString(),
        }),
      ],
    })

    const reportA = getReportForBusinessDay(dayA, [order], 10, [], [], [dayA])
    const cashA = hesaplaBeklenenNakit(dayA, reportA)

    expect(reportA.paymentDistribution.cash).toBe(800)
    expect(reportA.totalRevenue).toBe(800)
    expect(reportA.grossItemsRevenue).toBe(800)
    expect(reportA.orderCount).toBe(1)
    expect(cashA.kirilim.kapananNakit).toBe(800)
    expect(cashA.kirilim.netNakitSatis).toBe(800)
    expect(cashA.beklenen).toBe(1300) // 500 + 800
  })

  // Doğrulama 3 + B ayrımı (ciro vs tahsilat)
  it('3. Hareketleri farklı günlere ait siparişte tahsilatlar kendi gününe bölünür, ürün/kategori/ciro sipariş gününde kalır', () => {
    const dayA = createMockBusinessDay({
      id: 'day-a',
      status: 'closed',
      openingCash: 0,
      openedAt: createIstanbulDate(2026, 11, 13, 21, 53, 0).toISOString(),
      closedAt: createIstanbulDate(2026, 11, 14, 1, 0, 0).toISOString(),
      expectedCash: 300,
      countedCash: 300,
    })
    const dayB = createMockBusinessDay({
      id: 'day-b',
      status: 'open',
      openingCash: 100,
      openedAt: createIstanbulDate(2026, 11, 14, 9, 0, 0).toISOString(),
    })

    const orderSplit = createMockOrder({
      id: 'ord-split-ab',
      orderNumber: '9001',
      businessDayId: dayA.id,
      date: createIstanbulDate(2026, 11, 13, 22, 30, 0).toISOString(),
      items: [
        createMockCartItem({
          id: 'item-cheesecake',
          name: 'Cheesecake',
          category: 'Tatlılar',
          price: 200,
          quantity: 4,
        }),
      ],
      totals: { subtotal: 800, discount: 0, total: 800 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'mov-a-300',
          method: 'cash',
          amount: 300,
          businessDayId: dayA.id,
          createdAt: createIstanbulDate(2026, 11, 13, 22, 35, 0).toISOString(),
        }),
        createMockPayment({
          id: 'mov-b-500',
          method: 'cash',
          amount: 500,
          businessDayId: dayB.id,
          createdAt: createIstanbulDate(2026, 11, 14, 10, 15, 0).toISOString(),
        }),
      ],
    })

    expect(getOrderAppliedPayments(orderSplit, dayA.id)).toEqual({
      cash: 300,
      card: 0,
      iban: 0,
      total: 300,
    })
    expect(getOrderAppliedPayments(orderSplit, dayB.id)).toEqual({
      cash: 500,
      card: 0,
      iban: 0,
      total: 500,
    })

    expect(selectOrdersForBusinessDay([orderSplit], dayA.id).map((o) => o.id)).toEqual([
      orderSplit.id,
    ])
    expect(selectOrdersForBusinessDay([orderSplit], dayB.id).map((o) => o.id)).toEqual([
      orderSplit.id,
    ])

    // A günü raporu: ürün/kategori/sipariş cirosu ₺800 olarak kalır, ancak A günü tahsilatı ₺300'dür
    const reportA = getReportForBusinessDay(dayA, [orderSplit], 10, [], [], [dayA, dayB])
    expect(reportA.orderCount).toBe(1)
    expect(reportA.closedTablesGrossRevenue).toBe(800)
    expect(reportA.soldProducts).toHaveLength(1)
    expect(reportA.soldProducts[0].revenue).toBe(800)
    expect(reportA.categorySales).toHaveLength(1)
    expect(reportA.categorySales[0].revenue).toBe(800)
    expect(reportA.paymentDistribution).toEqual({ cash: 300, card: 0, iban: 0 })
    expect(reportA.paidTablesTotal).toBe(300)

    // B günü raporu: ürün/kategori/ciro B gününe yazılmaz, yalnızca ₺500 nakit tahsilat B gününe yazılır
    const reportB = getReportForBusinessDay(dayB, [orderSplit], 10, [], [], [dayA, dayB])
    const cashB = hesaplaBeklenenNakit(dayB, reportB)
    expect(reportB.orderCount).toBe(0)
    expect(reportB.closedTablesGrossRevenue).toBe(0)
    expect(reportB.soldProducts).toHaveLength(0)
    expect(reportB.categorySales).toHaveLength(0)
    expect(reportB.paymentDistribution).toEqual({ cash: 500, card: 0, iban: 0 })
    expect(reportB.paidTablesTotal).toBe(500)
    expect(cashB.kirilim.kapananNakit).toBe(500)
    expect(cashB.beklenen).toBe(600) // 100 açılış + 500 tahsilat
  })

  // Doğrulama 4
  it("4. Eski kayıtlarda ödeme hareketinin businessDayId'si yoksa siparişin gününe düşer (geriye dönük uyumluluk)", () => {
    const dayA = createMockBusinessDay({ id: 'day-legacy-a', status: 'open', openingCash: 0 })
    const dayB = createMockBusinessDay({ id: 'day-legacy-b', status: 'open', openingCash: 0 })

    // Payments array'de businessDayId olmayan eski hareketler
    const legacyWithPayments = createMockOrder({
      id: 'ord-leg-payments',
      businessDayId: dayA.id,
      totals: { subtotal: 450, discount: 0, total: 450 },
      payments: [
        {
          id: 'p-leg-1',
          method: 'cash',
          amount: 200,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'p-leg-2',
          method: 'card',
          amount: 250,
          createdAt: new Date().toISOString(),
        },
      ],
    })

    // Payments array hiç olmayan daha da eski kayıt
    const legacyNoPayments = createMockOrder({
      id: 'ord-leg-empty',
      businessDayId: dayA.id,
      paymentMethod: 'iban',
      totals: { subtotal: 150, discount: 0, total: 150 },
      payments: [],
    })

    expect(getOrderAppliedPayments(legacyWithPayments, dayA.id)).toEqual({
      cash: 200,
      card: 250,
      iban: 0,
      total: 450,
    })
    expect(getOrderAppliedPayments(legacyWithPayments, dayB.id)).toEqual({
      cash: 0,
      card: 0,
      iban: 0,
      total: 0,
    })
    expect(getOrderAppliedPayments(legacyNoPayments, dayA.id)).toEqual({
      cash: 0,
      card: 0,
      iban: 150,
      total: 150,
    })
    expect(getOrderAppliedPayments(legacyNoPayments, dayB.id)).toEqual({
      cash: 0,
      card: 0,
      iban: 0,
      total: 0,
    })

    const allLegacy = [legacyWithPayments, legacyNoPayments]
    const reportA = getReportForBusinessDay(dayA, allLegacy, 10, [], [], [dayA, dayB])
    const reportB = getReportForBusinessDay(dayB, allLegacy, 10, [], [], [dayA, dayB])

    expect(reportA.paymentDistribution).toEqual({ cash: 200, card: 250, iban: 150 })
    expect(reportA.totalRevenue).toBe(600)
    expect(reportB.paymentDistribution).toEqual({ cash: 0, card: 0, iban: 0 })
    expect(reportB.totalRevenue).toBe(0)
  })

  // Doğrulama 5
  it('5. POS Z kart toplamı (calculateDayCardBreakdown) da hareketlerin kendi businessDayId gününe düşer', () => {
    const dayA = createMockBusinessDay({ id: 'day-z-a', status: 'open', openingCash: 0 })
    const dayB = createMockBusinessDay({ id: 'day-z-b', status: 'open', openingCash: 0 })

    // Sipariş A gününde açılmış, ₺150 kart A gününde, ₺350 kart B gününde alınmış
    const crossDayCardOrder = createMockOrder({
      id: 'ord-card-ab',
      businessDayId: dayA.id,
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({ id: 'cp-1', method: 'card', amount: 150, businessDayId: dayA.id }),
        createMockPayment({ id: 'cp-2', method: 'card', amount: 350, businessDayId: dayB.id }),
      ],
    })

    // Eski kayıt (movement businessDayId yok) A gününde ₺100 kart
    const legacyCardOrder = createMockOrder({
      id: 'ord-card-legacy',
      businessDayId: dayA.id,
      totals: { subtotal: 100, discount: 0, total: 100 },
      paymentMethod: 'card',
      payments: [{ id: 'cp-leg', method: 'card', amount: 100, createdAt: new Date().toISOString() }],
    })

    // B gününde açık masada alınmış ₺120 kart ara ödeme (ve A günü devri ₺40 dahil olsa bile B Z'sine girmemeli)
    const openTable = createMockTable({
      id: 'table-z',
      status: 'occupied',
      cart: [createMockCartItem({ price: 200, quantity: 1 })],
      payments: [
        createMockPayment({ id: 'cp-open-a', method: 'card', amount: 40, businessDayId: dayA.id }),
        createMockPayment({ id: 'cp-open-b', method: 'card', amount: 120, businessDayId: dayB.id }),
      ],
    })

    // B gününde ₺50 kart iadesi (Refund kaydı, IADE movement yok)
    const cardRefundB = createMockRefund({
      id: 'ref-card-b',
      businessDayId: dayB.id,
      amount: 50,
      paymentMethod: 'card',
      paymentReceived: true,
    })

    const orders = [crossDayCardOrder, legacyCardOrder]
    const zA = calculateDayCardBreakdown(dayA, orders, [openTable], '23:57', [cardRefundB])
    const zB = calculateDayCardBreakdown(dayB, orders, [openTable], '23:57', [cardRefundB])

    // A günü Z: 150 (crossDayCardOrder A hareketi) + 100 (legacy A) + 40 (open table A hareketi) = 290
    expect(zA.totalCard).toBe(290)
    expect(zA.expectedZ).toBe(290)

    // B günü Z: 350 (crossDayCardOrder B hareketi) + 120 (open table B hareketi) - 50 (B iadesi) = 420
    expect(zB.totalCard).toBe(420)
    expect(zB.expectedZ).toBe(420)
  })

  // Doğrulama 6 + Kural C + UI Devir Satırı
  it('6. Kapanmış günün arşiv raporu değiştirilmez; kapalı günden devreden tahsilat bugünün raporunda ayrı satırda gösterilir', () => {
    const archivedReportA = buildReportFromOrders(
      [
        createMockOrder({
          id: 'ord-a-regular',
          businessDayId: 'day-closed-a',
          totals: { subtotal: 400, discount: 0, total: 400 },
          payments: [
            createMockPayment({
              id: 'p-a-reg',
              method: 'cash',
              amount: 400,
              businessDayId: 'day-closed-a',
            }),
          ],
        }),
      ],
      10,
      [],
      'day-closed-a',
      [],
    )

    const closedDayA = createMockBusinessDay({
      id: 'day-closed-a',
      status: 'closed',
      openingCash: 100,
      openedAt: createIstanbulDate(2026, 11, 13, 10, 0, 0).toISOString(),
      closedAt: createIstanbulDate(2026, 11, 14, 0, 15, 0).toISOString(),
      expectedCash: 500,
      countedCash: 500,
      expectedZ: 0,
      enteredZ: 0,
      zDifference: 0,
      report: archivedReportA,
    })

    const openDayB = createMockBusinessDay({
      id: 'day-open-b',
      status: 'open',
      openingCash: 200,
      openedAt: createIstanbulDate(2026, 11, 14, 9, 0, 0).toISOString(),
    })

    // Senaryo C: Günü kapanmış A gününden Masa 3 üzerinde ₺300 ara ödeme devretmiş ve B gününde kalan ₺500 tahsil edilip sipariş kapatılmış
    const carriedOverOrderClosedOnB = createMockOrder({
      id: 'ord-carry-b',
      orderNumber: '9055',
      businessDayId: openDayB.id,
      date: createIstanbulDate(2026, 11, 14, 11, 30, 0).toISOString(),
      items: [createMockCartItem({ name: 'Özel Kahve', category: 'Kahveler', price: 800, quantity: 1 })],
      totals: { subtotal: 800, discount: 0, total: 800 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'carry-from-a',
          method: 'cash',
          amount: 300,
          businessDayId: closedDayA.id, // Kapalı günden devir!
          createdAt: createIstanbulDate(2026, 11, 13, 23, 30, 0).toISOString(),
        }),
        createMockPayment({
          id: 'paid-today-b',
          method: 'cash',
          amount: 500,
          businessDayId: openDayB.id,
          createdAt: createIstanbulDate(2026, 11, 14, 11, 30, 0).toISOString(),
        }),
      ],
    })

    // Ayrıca A gününde açık başka bir masa da hala açıkta ₺150 kart devri taşıyor olsun
    const carriedOpenTable = createMockTable({
      id: 'masa-carry-open',
      name: 'Masa Carry',
      status: 'occupied',
      cart: [createMockCartItem({ price: 400, quantity: 1 })],
      payments: [
        createMockPayment({
          id: 'carry-open-a',
          method: 'card',
          amount: 150,
          businessDayId: closedDayA.id,
          createdAt: createIstanbulDate(2026, 11, 13, 23, 50, 0).toISOString(),
        }),
        createMockPayment({
          id: 'today-open-b',
          method: 'iban',
          amount: 100,
          businessDayId: openDayB.id,
          createdAt: createIstanbulDate(2026, 11, 14, 12, 0, 0).toISOString(),
        }),
      ],
    })

    const businessDays = [openDayB, closedDayA]
    const allOrders = [
      createMockOrder({
        id: 'ord-a-regular',
        businessDayId: closedDayA.id,
        totals: { subtotal: 400, discount: 0, total: 400 },
        payments: [
          createMockPayment({
            id: 'p-a-reg',
            method: 'cash',
            amount: 400,
            businessDayId: closedDayA.id,
          }),
        ],
      }),
      carriedOverOrderClosedOnB,
    ]

    // 1. Kapanmış dayA arşivi ve Z kaydı değişmemeli
    const snapshotClosedA = JSON.stringify(closedDayA.report)
    const reportClosedA = getReportForBusinessDay(
      closedDayA,
      allOrders,
      10,
      [carriedOpenTable],
      [],
      businessDays,
    )
    expect(reportClosedA.paymentDistribution).toEqual({ cash: 400, card: 0, iban: 0 })
    expect(reportClosedA.expectedZ).toBe(0)
    expect(JSON.stringify(closedDayA.report)).toBe(snapshotClosedA)

    // 2. B gününün raporunda kapalı günden devredenler normal nakit/POS'a KARIŞTIRILMAZ, ayrı satır alanında yer alır
    const reportOpenB = getReportForBusinessDay(
      openDayB,
      allOrders,
      10,
      [carriedOpenTable],
      [],
      businessDays,
    )
    const cashOpenB = hesaplaBeklenenNakit(openDayB, reportOpenB)

    // B gününde fiilen kasaya giren nakit yalnızca 500 TL (kapalı A gününden devreden 300 karışmamalı!)
    expect(reportOpenB.paymentDistribution).toEqual({ cash: 500, card: 0, iban: 0 })
    expect(reportOpenB.openTablePaymentsByMethod).toEqual({ cash: 0, card: 0, iban: 100 })
    expect(cashOpenB.kirilim.netNakitSatis).toBe(500)
    expect(cashOpenB.beklenen).toBe(700) // 200 açılış + 500 nakit
    expect(reportOpenB.expectedZ).toBe(0) // A'dan devreden 150 kart B'nin POS Z'sine girmez!

    // Devreden toplam ayrı alanda raporlanır: 300 (nakit) + 150 (kart) = 450
    expect(reportOpenB.previousDayCarryoverCollection).toBe(450)
    expect(reportOpenB.previousDayCarryoverByMethod).toEqual({ cash: 300, card: 150, iban: 0 })

    // 3. UI bileşenleri ayrı "Önceki günden devreden tahsilat:" satırını render eder
    const settings = createMockSettings()
    const closeModal = renderComponent(
      <CloseDayModal
        isOpen
        openDay={openDayB}
        orders={allOrders}
        tables={[carriedOpenTable]}
        cashMovements={[]}
        businessDays={businessDays}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )
    expect(closeModal.container.querySelector('[data-testid="close-day-carryover-collection"]')?.textContent).toContain(
      'Önceki günden devreden tahsilat:',
    )
    expect(closeModal.container.querySelector('[data-testid="close-day-carryover-collection"]')?.textContent).toContain(
      '450,00',
    )
    closeModal.unmount()

    const zPrint = renderComponent(
      <ZReportPrintView
        report={reportOpenB}
        day={openDayB}
        titleLabel="Test Günü"
        settings={settings}
        mode="a4"
      />,
    )
    expect(zPrint.container.querySelector('[data-testid="zreport-a4-carryover-collection"]')?.textContent).toContain(
      'Önceki günden devreden tahsilat',
    )
    expect(zPrint.container.querySelector('[data-testid="zreport-a4-carryover-collection"]')?.textContent).toContain(
      '450,00',
    )
    zPrint.unmount()

    const reportsModal = renderComponent(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={allOrders}
        businessDays={businessDays}
        openBusinessDay={openDayB}
        tables={[carriedOpenTable]}
        cashMovements={[]}
        settings={settings}
        onClearReports={vi.fn()}
      />,
    )
    expect(reportsModal.container.querySelector('[data-testid="reports-carryover-collection"]')?.textContent).toContain(
      'Önceki günden devreden tahsilat:',
    )
    expect(reportsModal.container.querySelector('[data-testid="reports-carryover-collection"]')?.textContent).toContain(
      '450,00',
    )
    reportsModal.unmount()
  })

  // Doğrulama 7
  it('7. Her günün Nakit + Kart + IBAN toplamı o gün fiilen kasaya/POS/bankaya giren parayla birebir eşleşir', () => {
    const day1 = createMockBusinessDay({ id: 'd1', status: 'open', openingCash: 0 })
    const day2 = createMockBusinessDay({ id: 'd2', status: 'open', openingCash: 0 })
    const day3 = createMockBusinessDay({ id: 'd3', status: 'open', openingCash: 0 })

    // Çeşitli siparişler ve günler arası ödemeler + iade
    const ord1 = createMockOrder({
      id: 'm1',
      businessDayId: day1.id,
      totals: { subtotal: 900, discount: 0, total: 900 },
      payments: [
        createMockPayment({ id: 'm1-a', method: 'cash', amount: 300, businessDayId: day1.id }),
        createMockPayment({ id: 'm1-b', method: 'card', amount: 400, businessDayId: day2.id }),
        createMockPayment({ id: 'm1-c', method: 'iban', amount: 200, businessDayId: day3.id }),
      ],
    })
    const ord2 = createMockOrder({
      id: 'm2',
      businessDayId: day2.id,
      totals: { subtotal: 350, discount: 0, total: 350 },
      payments: [
        createMockPayment({ id: 'm2-b', method: 'cash', amount: 250, businessDayId: day2.id }),
        createMockPayment({ id: 'm2-c', method: 'card', amount: 100, businessDayId: day3.id }),
      ],
    })
    const openTable = createMockTable({
      id: 'mt-open',
      status: 'occupied',
      cart: [createMockCartItem({ price: 500, quantity: 1 })],
      payments: [
        createMockPayment({ id: 'ot-1', method: 'iban', amount: 120, businessDayId: day1.id }),
        createMockPayment({ id: 'ot-3', method: 'cash', amount: 180, businessDayId: day3.id }),
      ],
    })

    const allOrders = [ord1, ord2]
    const days = [day1, day2, day3]

    const rep1 = getReportForBusinessDay(day1, allOrders, 10, [openTable], [], days)
    const rep2 = getReportForBusinessDay(day2, allOrders, 10, [openTable], [], days)
    const rep3 = getReportForBusinessDay(day3, allOrders, 10, [openTable], [], days)

    const sumDayMethods = (r: ReturnType<typeof getReportForBusinessDay>) =>
      roundCurrency(
        r.paymentDistribution.cash +
          r.paymentDistribution.card +
          r.paymentDistribution.iban +
          (r.openTablePaymentsByMethod?.cash || 0) +
          (r.openTablePaymentsByMethod?.card || 0) +
          (r.openTablePaymentsByMethod?.iban || 0),
      )

    // Fiili girişler:
    // Gün 1: 300 (nakit ord1) + 120 (iban açık masa) = 420
    expect(sumDayMethods(rep1)).toBe(420)
    expect(rep1.totalCollectedRevenue).toBe(420)

    // Gün 2: 400 (kart ord1) + 250 (nakit ord2) = 650
    expect(sumDayMethods(rep2)).toBe(650)
    expect(rep2.totalCollectedRevenue).toBe(650)

    // Gün 3: 200 (iban ord1) + 100 (kart ord2) + 180 (nakit açık masa) = 480
    expect(sumDayMethods(rep3)).toBe(480)
    expect(rep3.totalCollectedRevenue).toBe(480)

    // Üç gün toplamı = tüm gerçek tahsilat toplamına eşit (900 + 350 + 120 + 180 = 1550)
    expect(roundCurrency(sumDayMethods(rep1) + sumDayMethods(rep2) + sumDayMethods(rep3))).toBe(1550)
  })

  // Kural D — Çok günlü açık iş günü uyarısı
  it("D. İş günü takvim gününü aşınca bilgilendirici uyarı üretir: 'İş günü 2 gündür açık (13 Kas 21:53'ten beri).'", () => {
    const opened13Kas = createIstanbulDate(2026, 11, 13, 21, 53, 0)
    const dayOpen = createMockBusinessDay({
      id: 'day-long-open',
      status: 'open',
      openedAt: opened13Kas.toISOString(),
    })

    // Aynı takvim günü (13 Kas 23:40): uyarı YOK
    const sameDayNow = createIstanbulDate(2026, 11, 13, 23, 40, 0)
    expect(getOpenBusinessDayDurationAlert(dayOpen, sameDayNow)).toBeNull()

    // 15 Kas 00:56 (2 takvim günü sonra): birebir beklenen mesaj
    const twoDaysLaterNow = createIstanbulDate(2026, 11, 15, 0, 56, 0)
    const alert = getOpenBusinessDayDurationAlert(dayOpen, twoDaysLaterNow)
    expect(alert).not.toBeNull()
    expect(alert?.calendarDaysOpen).toBe(2)
    expect(alert?.message).toBe("İş günü 2 gündür açık (13 Kas 21:53'ten beri).")

    // Kapalı günde uyarı gösterilmez
    const closedDay = createMockBusinessDay({ ...dayOpen, status: 'closed' })
    expect(getOpenBusinessDayDurationAlert(closedDay, twoDaysLaterNow)).toBeNull()

    // HomePage'de bilgilendirici ve engelleyici olmadan render edildiğini doğrula
    vi.useFakeTimers()
    vi.setSystemTime(twoDaysLaterNow)
    const settings = createMockSettings()
    const home = renderComponent(
      <HomePage
        completedOrders={[]}
        tables={[]}
        openBusinessDay={dayOpen}
        onViewChange={vi.fn()}
        onOpenSummary={vi.fn()}
        onOpenProducts={vi.fn()}
        settings={settings}
      />,
    )
    const homeAlert = home.container.querySelector('[data-testid="home-multiday-open-alert"]')
    expect(homeAlert?.textContent).toContain("İş günü 2 gündür açık (13 Kas 21:53'ten beri).")
    home.unmount()
  })

  // Mevcut veri tutarsızlık tespiti (otomatik değiştirmeden)
  it('detectPaymentAndRefundInconsistencies günler arası kayma ve kapalı gün devrini veriyi değiştirmeden tespit eder', () => {
    const closedDayA = createMockBusinessDay({
      id: 'day-det-a',
      status: 'closed',
      openingCash: 0,
      expectedCash: 0, // Buggy dönemde 300 A'ya hiç yazılmayıp B'ye kaymış olsun
      countedCash: 300,
    })
    const openDayB = createMockBusinessDay({
      id: 'day-det-b',
      status: 'open',
      openingCash: 0,
    })

    const shiftedOrder = createMockOrder({
      id: 'ord-shifted',
      orderNumber: '777',
      businessDayId: openDayB.id,
      totals: { subtotal: 800, discount: 0, total: 800 },
      payments: [
        createMockPayment({ id: 'p1', method: 'cash', amount: 300, businessDayId: closedDayA.id }),
        createMockPayment({ id: 'p2', method: 'cash', amount: 500, businessDayId: openDayB.id }),
      ],
    })

    const carriedTable = createMockTable({
      id: 't-carried',
      name: 'Bahçe 4',
      status: 'occupied',
      cart: [createMockCartItem({ price: 250, quantity: 1 })],
      payments: [
        createMockPayment({ id: 'tp-a', method: 'cash', amount: 100, businessDayId: closedDayA.id }),
      ],
    })

    saveBusinessDaysSafe([openDayB, closedDayA])
    saveCompletedOrdersSafe([shiftedOrder])
    saveRefundsSafe([])

    const check = detectPaymentAndRefundInconsistencies({
      tables: [carriedTable],
      completedOrders: [shiftedOrder],
      refunds: [],
      activityLogs: [],
      businessDays: [openDayB, closedDayA],
    })

    const crossDayIssues = check.issues.filter((i) => i.code === 'cross_day_payment_shift')
    const cashMismatchIssues = check.issues.filter(
      (i) => i.code === 'closed_day_expected_cash_mismatch',
    )

    expect(crossDayIssues.length).toBe(2) // shiftedOrder + carriedTable
    expect(cashMismatchIssues.length).toBe(1) // closedDayA (arşiv 0 vs merkezi 300)
    // Veriler otomatik değiştirilmemiş olmalı
    expect(closedDayA.expectedCash).toBe(0)
    expect(shiftedOrder.businessDayId).toBe(openDayB.id)
  })
})
