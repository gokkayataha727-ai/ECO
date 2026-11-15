import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildReportFromOrders,
  detectPaymentAndRefundInconsistencies,
  exportReportToCsv,
  getReportForBusinessDay,
  hesaplaBeklenenNakit,
  saveStoredRefund,
} from '../../src/lib/businessDay'
import { formatCurrency } from '../../src/lib/format'
import { CloseDayModal } from '../../src/components/CloseDayModal'
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
import type {
  BusinessDay,
  CompletedOrder,
  Refund,
  Session,
  Table,
} from '../../src/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const adminSession: Session = {
  id: 'sess-admin',
  userId: 'user-admin',
  username: 'admin',
  fullName: 'Yönetici',
  role: 'admin',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  lastActivityAt: new Date().toISOString(),
}

const mountedRoots: Array<{ root: Root; container: HTMLElement }> = []

function mount(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  mountedRoots.push({ root, container })
  return container
}

function getByTestId(container: HTMLElement, testId: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${testId}"]`)
  if (!el) {
    throw new Error(`data-testid="${testId}" bulunamadı`)
  }
  return el as HTMLElement
}

function findButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'))
  const btn = buttons.find((b) => b.textContent?.trim() === label)
  if (!btn) {
    throw new Error(`"${label}" butonu bulunamadı`)
  }
  return btn
}

interface ScenarioOptions {
  openingCash?: number
  closeMasa2WithCard?: boolean
}

/**
 * Canlı senaryo kurucusu:
 * Masa 1: ₺240 sipariş, tamamı nakit ödendi ve kapandı.
 * Masa 2: ₺240 sipariş, ₺200 nakit kısmi ödeme alındı, ₺120 nakit kalem iadesi yapıldı.
 *         closeMasa2WithCard=true ise kalan ₺40 kartla tahsil edilip Masa 2 kapatılır.
 */
function buildLiveScenario(opts: ScenarioOptions = {}) {
  const { openingCash = 0, closeMasa2WithCard = false } = opts
  const settings = createMockSettings({ taxRate: 10 })
  const day = createMockBusinessDay({
    id: `day-${openingCash}-${closeMasa2WithCard ? 'closed2' : 'open2'}`,
    status: 'open',
    openingCash,
  })

  // Masa 1: ₺240 nakit kapalı adisyon
  const masa1Item = createMockCartItem({
    id: 'prod-1',
    name: 'Filtre Kahve',
    price: 240,
    quantity: 1,
  })
  const order1 = createMockOrder({
    id: 'ord-masa1',
    orderNumber: 'ORD-M1',
    tableId: 't-1',
    tableName: 'Masa 1',
    businessDayId: day.id,
    items: [masa1Item],
    totals: { subtotal: 240, discount: 0, total: 240 },
    paymentMethod: 'cash',
    payments: [
      createMockPayment({
        id: 'pay-m1-cash',
        type: 'ODEME',
        status: 'GECERLI',
        method: 'cash',
        amount: 240,
        businessDayId: day.id,
        tableId: 't-1',
        orderId: 'ord-masa1',
      }),
    ],
  })

  // Masa 2 hareketleri: ₺200 nakit ara ödeme + ₺120 nakit iade
  const m2CashPartial = createMockPayment({
    id: 'pay-m2-cash-200',
    type: 'ODEME',
    status: 'GECERLI',
    method: 'cash',
    amount: 200,
    businessDayId: day.id,
    tableId: 't-2',
  })
  const m2CashRefundMovement = createMockPayment({
    id: 'pay-m2-iade-120',
    type: 'IADE',
    status: 'GECERLI',
    method: 'cash',
    amount: 120,
    businessDayId: day.id,
    tableId: 't-2',
  })
  const m2RefundRecord: Refund = createMockRefund({
    id: 'ref-m2-120',
    amount: 120,
    paymentMethod: 'cash',
    paymentReceived: true,
    paymentMovementId: m2CashRefundMovement.id,
    businessDayId: day.id,
    tableId: 't-2',
    tableName: 'Masa 2',
    ...(closeMasa2WithCard ? { orderId: 'ord-masa2' } : {}),
  })
  saveStoredRefund(m2RefundRecord)

  const m2ActiveItem = createMockCartItem({
    id: 'prod-2',
    name: 'Cheesecake',
    price: 120,
    quantity: 1,
  })
  const m2RefundedItem = createMockCartItem({
    id: 'prod-3',
    name: 'Tost',
    price: 120,
    quantity: 1,
    status: 'refunded',
    refundedQty: 1,
  })

  const orders: CompletedOrder[] = [order1]
  const tables: Table[] = [
    createMockTable({ id: 't-1', name: 'Masa 1', status: 'empty', cart: [], payments: [] }),
  ]

  if (closeMasa2WithCard) {
    const m2CardClosingPayment = createMockPayment({
      id: 'pay-m2-card-40',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'card',
      amount: 40,
      businessDayId: day.id,
      tableId: 't-2',
      orderId: 'ord-masa2',
    })
    const order2 = createMockOrder({
      id: 'ord-masa2',
      orderNumber: 'ORD-M2',
      tableId: 't-2',
      tableName: 'Masa 2',
      businessDayId: day.id,
      items: [m2ActiveItem, m2RefundedItem],
      totals: { subtotal: 120, discount: 0, total: 120 },
      paymentMethod: 'mixed',
      payments: [
        { ...m2CashPartial, orderId: 'ord-masa2' },
        { ...m2CashRefundMovement, orderId: 'ord-masa2' },
        m2CardClosingPayment,
      ],
    })
    orders.push(order2)
    tables.push(
      createMockTable({
        id: 't-2',
        name: 'Masa 2',
        status: 'empty',
        cart: [],
        payments: [],
      }),
    )
  } else {
    tables.push(
      createMockTable({
        id: 't-2',
        name: 'Masa 2',
        status: 'occupied',
        cart: [m2ActiveItem, m2RefundedItem],
        payments: [m2CashPartial, m2CashRefundMovement],
      }),
    )
  }

  const report = getReportForBusinessDay(day, orders, settings.taxRate, tables)
  return { day, orders, tables, refunds: [m2RefundRecord], report, settings }
}

function mountAllScreens(params: {
  day: BusinessDay
  orders: CompletedOrder[]
  tables: Table[]
  settings: ReturnType<typeof createMockSettings>
  report: ReturnType<typeof getReportForBusinessDay>
}) {
  const { day, orders, tables, settings, report } = params

  const closeContainer =
    day.status === 'open'
      ? mount(
          <CloseDayModal
            isOpen
            openDay={day}
            orders={orders}
            tables={tables}
            settings={settings}
            onClose={vi.fn()}
            onCloseDay={vi.fn()}
            onGoToTables={vi.fn()}
            onViewReport={vi.fn()}
          />,
        )
      : null

  const reportsContainer = mount(
    <ReportsModal
      isOpen
      onClose={vi.fn()}
      completedOrders={orders}
      businessDays={[day]}
      openBusinessDay={day.status === 'open' ? day : null}
      initialSelectedDayId={day.id}
      tables={tables}
      settings={settings}
      currentSession={adminSession}
    />,
  )

  const a4Container = mount(
    <ZReportPrintView report={report} day={day} settings={settings} mode="a4" />,
  )

  const receiptContainer = mount(
    <ZReportPrintView report={report} day={day} settings={settings} mode="receipt" />,
  )

  return { closeContainer, reportsContainer, a4Container, receiptContainer }
}

describe('Beklenen Nakit Merkezi Hesaplama ve Ekran Tutarlılığı (Prompt 3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const entry = mountedRoots.pop()!
      act(() => {
        entry.root.unmount()
      })
      entry.container.remove()
    }
  })

  it('Adım 1–4: Canlı senaryoda (₺0 açılış, ₺240 kapalı nakit, ₺200 açık masa nakit, ₺120 nakit iade) tüm ekranlarda ₺320 ve tam kırılım görünür', async () => {
    const { day, orders, tables, settings, report } = buildLiveScenario({
      openingCash: 0,
      closeMasa2WithCard: false,
    })

    const central = hesaplaBeklenenNakit(day, report)
    expect(central.beklenen).toBe(320)
    expect(central.kirilim).toEqual({
      acilisNakiti: 0,
      kapananNakit: 240,
      acikMasaNakit: 200,
      nakitIadeler: 120,
      kasaGiris: 0,
      kasaCikis: 0,
      netNakitSatis: 320,
    })

    const { closeContainer, reportsContainer, a4Container, receiptContainer } = mountAllScreens({
      day,
      orders,
      tables,
      settings,
      report,
    })

    // Adım 2: Gün sonu ekranı Beklenen Nakit = ₺320 + kırılım + açık masa nakit uyarısı
    expect(getByTestId(closeContainer!, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(closeContainer!.textContent).toContain('Açık masalardaki nakit ara ödeme toplamı')
    expect(closeContainer!.textContent).toContain('+ Kapanan adisyonlar (nakit)')
    expect(closeContainer!.textContent).toContain('+ Açık masa ara ödemeleri')
    expect(closeContainer!.textContent).toContain('− Nakit iadeler')

    // Adım 3: Raporlar ekranı Beklenen Nakit = ₺320
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(reportsContainer.textContent).toContain('+ Kapanan adisyonlar (nakit)')
    expect(reportsContainer.textContent).toContain('+ Açık masa ara ödemeleri')
    expect(reportsContainer.textContent).toContain('− Nakit iadeler')

    // Adım 4: Z raporu A4 ve 80mm fiş çıktısı = ₺320
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(a4Container.textContent).toContain('+ Kapanan adisyonlar (nakit)')
    expect(a4Container.textContent).toContain('+ Açık masa ara ödemeleri')
    expect(a4Container.textContent).toContain('− Nakit iadeler')

    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(receiptContainer.textContent).toContain('+ Kapanan adisyonlar')
    expect(receiptContainer.textContent).toContain('+ Açık masa ara ödemeleri')
    expect(receiptContainer.textContent).toContain('− Nakit iadeler')

    // CSV çıktısı da merkezi kırılımı içerir
    let capturedBlob: Blob | null = null
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b
      return 'blob:mock-csv'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    try {
      exportReportToCsv(report, 'Canlı Test', day)
    } finally {
      URL.createObjectURL = origCreateObjectURL
      URL.revokeObjectURL = origRevokeObjectURL
      clickSpy.mockRestore()
    }
    expect(capturedBlob).not.toBeNull()
    const csv = await capturedBlob!.text()
    expect(csv).toContain('"Açılış Nakiti";"0,00"')
    expect(csv).toContain('"+ Kapanan adisyonlar (nakit)";"240,00"')
    expect(csv).toContain('"+ Açık masa ara ödemeleri";"200,00"')
    expect(csv).toContain('"− Nakit iadeler";"120,00"')
    expect(csv).toContain('"= Beklenen Nakit";"320,00"')
  })

  it('Adım 5: Günü kapatınca expectedCash=₺320 ve anlık görüntü eksiksiz kaydedilir; kapanmış gün tekrar açılınca ₺320 kalır', () => {
    // Kalan ₺40 kartla tahsil edilip Masa 2 kapatılır (kasada nakit hâlâ ₺240 + ₺200 - ₺120 = ₺320)
    const { day, orders, tables, settings } = buildLiveScenario({
      openingCash: 0,
      closeMasa2WithCard: true,
    })

    const onCloseDay = vi.fn()
    const closeContainer = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={onCloseDay}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    expect(getByTestId(closeContainer, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(320),
    )

    const countedInput = closeContainer.querySelector('#counted-cash-input') as HTMLInputElement
    expect(countedInput).toBeTruthy()
    expect(countedInput.value).toBe('')
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      nativeSetter.call(countedInput, '320')
      countedInput.dispatchEvent(new Event('input', { bubbles: true }))
      countedInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    act(() => {
      findButtonByText(closeContainer, 'Günü Kapat').click()
    })
    act(() => {
      findButtonByText(closeContainer, 'Onayla ve Günü Kapat').click()
    })

    expect(onCloseDay).toHaveBeenCalledTimes(1)
    const closedDay: BusinessDay = onCloseDay.mock.calls[0][0]
    expect(closedDay.status).toBe('closed')
    expect(closedDay.expectedCash).toBe(320)
    expect(closedDay.cashDifference).toBe(0)
    // Snapshot C: tables geçildiği için openTablePayments* alanları tanımlı
    expect(closedDay.report?.openTablePaymentsTotal).toBe(0)
    expect(closedDay.report?.openTablePaymentsByMethod).toEqual({
      card: 0,
      cash: 0,
      iban: 0,
    })
    expect(closedDay.report?.cashDrawerBreakdown).toEqual({
      closedCashGross: 440,
      openTableCashGross: 0,
      closedCashRefunds: 120,
      openTableCashRefunds: 0,
      totalCashRefunds: 120,
    })

    // Kapanmış günü Raporlar ve Z Raporu Print View'dan tekrar aç
    const closedReport = getReportForBusinessDay(closedDay, orders, settings.taxRate, tables)
    const { reportsContainer, a4Container, receiptContainer } = mountAllScreens({
      day: closedDay,
      orders,
      tables,
      settings,
      report: closedReport,
    })

    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(320),
    )
    expect(reportsContainer.querySelector('[data-testid="archive-cash-mismatch-notice"]')).toBeNull()
  })

  it('C gereksinimi (açık masalar varken): buildReportFromOrders tables geçildiğinde openTablePaymentsTotal & openTablePaymentsByMethod üretir', () => {
    const { day, orders, tables } = buildLiveScenario({
      openingCash: 0,
      closeMasa2WithCard: false,
    })

    const snapshotWithTables = buildReportFromOrders(orders, 10, tables, day.id)
    expect(snapshotWithTables.openTablePaymentsTotal).toBe(80)
    expect(snapshotWithTables.openTablePaymentsByMethod).toEqual({
      card: 0,
      cash: 80,
      iban: 0,
    })
    expect(snapshotWithTables.cashDrawerBreakdown).toEqual({
      closedCashGross: 240,
      openTableCashGross: 200,
      closedCashRefunds: 0,
      openTableCashRefunds: 120,
      totalCashRefunds: 120,
    })
  })

  it('Adım 6a: Sadece kart ödemeleri varken beklenen nakit = açılış nakdi', () => {
    const settings = createMockSettings()
    const day = createMockBusinessDay({
      id: 'day-card-only',
      status: 'open',
      openingCash: 350,
    })
    const cardRefundMovement = createMockPayment({
      id: 'pay-card-ref',
      type: 'IADE',
      status: 'GECERLI',
      method: 'card',
      amount: 80,
      businessDayId: day.id,
      tableId: 't-2',
    })
    saveStoredRefund(
      createMockRefund({
        id: 'ref-card-80',
        amount: 80,
        paymentMethod: 'card',
        paymentReceived: true,
        paymentMovementId: cardRefundMovement.id,
        businessDayId: day.id,
        tableId: 't-2',
      }),
    )

    const orders: CompletedOrder[] = [
      createMockOrder({
        id: 'ord-card-1',
        businessDayId: day.id,
        items: [createMockCartItem({ price: 600, quantity: 1 })],
        totals: { subtotal: 600, discount: 0, total: 600 },
        paymentMethod: 'card',
        payments: [
          createMockPayment({
            id: 'pay-c1',
            method: 'card',
            amount: 600,
            businessDayId: day.id,
          }),
        ],
      }),
    ]
    const tables: Table[] = [
      createMockTable({
        id: 't-2',
        name: 'Masa 2',
        status: 'occupied',
        cart: [createMockCartItem({ price: 200, quantity: 1 })],
        payments: [
          createMockPayment({
            id: 'pay-t2-card',
            method: 'card',
            amount: 150,
            businessDayId: day.id,
          }),
          cardRefundMovement,
        ],
      }),
    ]

    const report = getReportForBusinessDay(day, orders, settings.taxRate, tables)
    const central = hesaplaBeklenenNakit(day, report)
    expect(central.beklenen).toBe(350)
    expect(central.kirilim.netNakitSatis).toBe(0)

    const { closeContainer, reportsContainer, a4Container, receiptContainer } = mountAllScreens({
      day,
      orders,
      tables,
      settings,
      report,
    })
    expect(getByTestId(closeContainer!, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(350),
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(350),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(350),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(350),
    )
  })

  it('Adım 6b: Açılış nakdi ₺500 ile canlı senaryo -> tüm ekranlarda ₺820', () => {
    const { day, orders, tables, settings, report } = buildLiveScenario({
      openingCash: 500,
      closeMasa2WithCard: false,
    })

    const central = hesaplaBeklenenNakit(day, report)
    expect(central.beklenen).toBe(820)
    expect(central.kirilim.acilisNakiti).toBe(500)
    expect(central.kirilim.netNakitSatis).toBe(320)

    const { closeContainer, reportsContainer, a4Container, receiptContainer } = mountAllScreens({
      day,
      orders,
      tables,
      settings,
      report,
    })
    expect(getByTestId(closeContainer!, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(820),
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(820),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(820),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(820),
    )
  })

  it('Adım 6c: Hiç işlem yapılmamış gün -> beklenen = açılış nakdi (₺275)', () => {
    const settings = createMockSettings()
    const day = createMockBusinessDay({
      id: 'day-empty',
      status: 'open',
      openingCash: 275,
    })
    const orders: CompletedOrder[] = []
    const tables: Table[] = []
    const report = getReportForBusinessDay(day, orders, settings.taxRate, tables)

    const central = hesaplaBeklenenNakit(day, report)
    expect(central.beklenen).toBe(275)

    const { closeContainer, reportsContainer, a4Container, receiptContainer } = mountAllScreens({
      day,
      orders,
      tables,
      settings,
      report,
    })
    expect(getByTestId(closeContainer!, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(275),
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(275),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(275),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(275),
    )
  })

  it('Adım 6d & 7: Kuruşlu tutarlar (123,45 gibi) kuruşu kuruşuna doğru hesaplanır ve net negatif 0 ile sınırlanır', () => {
    const settings = createMockSettings()
    const day = createMockBusinessDay({
      id: 'day-kurus',
      status: 'open',
      openingCash: 100.1,
    })
    const openRefundMovement = createMockPayment({
      id: 'pay-k-iade',
      type: 'IADE',
      status: 'GECERLI',
      method: 'cash',
      amount: 12.34,
      businessDayId: day.id,
      tableId: 't-k2',
    })
    saveStoredRefund(
      createMockRefund({
        id: 'ref-k-1',
        amount: 12.34,
        paymentMethod: 'cash',
        paymentReceived: true,
        paymentMovementId: openRefundMovement.id,
        businessDayId: day.id,
        tableId: 't-k2',
      }),
    )

    const orders: CompletedOrder[] = [
      createMockOrder({
        id: 'ord-k-1',
        businessDayId: day.id,
        totals: { subtotal: 123.65, discount: 0, total: 123.65 },
        payments: [
          createMockPayment({
            id: 'pay-k-1',
            method: 'cash',
            amount: 123.45,
            businessDayId: day.id,
          }),
          createMockPayment({
            id: 'pay-k-2',
            method: 'cash',
            amount: 0.2,
            businessDayId: day.id,
          }),
        ],
      }),
    ]
    const tables: Table[] = [
      createMockTable({
        id: 't-k2',
        name: 'Masa 2',
        status: 'occupied',
        cart: [createMockCartItem({ price: 90, quantity: 1 })],
        payments: [
          createMockPayment({
            id: 'pay-k-open',
            method: 'cash',
            amount: 67.89,
            businessDayId: day.id,
          }),
          openRefundMovement,
        ],
      }),
    ]

    const report = getReportForBusinessDay(day, orders, settings.taxRate, tables)
    const central = hesaplaBeklenenNakit(day, report)
    // 100.10 + (123.45 + 0.20) + 67.89 - 12.34 = 279.30
    expect(central.beklenen).toBe(279.3)

    const { closeContainer, reportsContainer, a4Container, receiptContainer } = mountAllScreens({
      day,
      orders,
      tables,
      settings,
      report,
    })
    expect(getByTestId(closeContainer!, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(279.3),
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(279.3),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(279.3),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(279.3),
    )

    // Klasik 0.1 + 0.2 float hassasiyet testi
    const tinyDay = createMockBusinessDay({ status: 'open', openingCash: 0.1 })
    const tinySnap = buildReportFromOrders(
      [
        createMockOrder({
          businessDayId: tinyDay.id,
          totals: { subtotal: 0.2, discount: 0, total: 0.2 },
          payments: [
            createMockPayment({
              method: 'cash',
              amount: 0.2,
              businessDayId: tinyDay.id,
            }),
          ],
        }),
      ],
      10,
      [
        createMockTable({
          id: 't-tiny',
          status: 'occupied',
          cart: [createMockCartItem({ price: 1, quantity: 1 })],
          payments: [
            createMockPayment({
              method: 'cash',
              amount: 0.3,
              businessDayId: tinyDay.id,
            }),
            createMockPayment({
              type: 'IADE',
              method: 'cash',
              amount: 0.15,
              businessDayId: tinyDay.id,
            }),
          ],
        }),
      ],
      tinyDay.id,
      [],
    )
    expect(hesaplaBeklenenNakit(tinyDay, tinySnap).beklenen).toBe(0.45)

    // İade kasadan büyükse 0'ın altına düşmez
    const negSnap = buildReportFromOrders(
      [],
      10,
      [],
      'day-neg',
      [
        createMockRefund({
          businessDayId: 'day-neg',
          paymentMethod: 'cash',
          paymentReceived: true,
          amount: 50,
        }),
      ],
    )
    expect(
      hesaplaBeklenenNakit(
        createMockBusinessDay({ id: 'day-neg', status: 'open', openingCash: 10 }),
        negSnap,
      ).beklenen,
    ).toBe(0)
  })

  it('Kapanmış eski günlerde yanlış kayıtlı expectedCash değiştirilmez; arşiv korunur ve uyuşmazlık raporlanır', () => {
    const settings = createMockSettings()
    const legacySnapshot = buildReportFromOrders(
      [
        createMockOrder({
          id: 'ord-leg-1',
          businessDayId: 'day-legacy-wrong',
          totals: { subtotal: 320, discount: 0, total: 320 },
          payments: [
            createMockPayment({
              method: 'cash',
              amount: 320,
              businessDayId: 'day-legacy-wrong',
            }),
          ],
        }),
      ],
      10,
      undefined,
      'day-legacy-wrong',
      [],
    )
    const legacyClosedDay = createMockBusinessDay({
      id: 'day-legacy-wrong',
      status: 'closed',
      openingCash: 0,
      expectedCash: 240,
      countedCash: 320,
      cashDifference: 80,
      closedAt: new Date().toISOString(),
      report: legacySnapshot,
    })

    const central = hesaplaBeklenenNakit(legacyClosedDay, legacySnapshot)
    expect(central.beklenen).toBe(320)
    expect(central.arsivExpectedCash).toBe(240)
    expect(central.arsivFarki).toBe(-80)
    expect(legacyClosedDay.expectedCash).toBe(240)

    const audit = detectPaymentAndRefundInconsistencies({
      businessDays: [legacyClosedDay],
    })
    expect(audit.totalIssues).toBe(1)
    expect(audit.issues[0].code).toBe('closed_day_expected_cash_mismatch')
    expect(audit.issues[0].amount).toBe(80)

    const reportsContainer = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={[]}
        businessDays={[legacyClosedDay]}
        initialSelectedDayId={legacyClosedDay.id}
        settings={settings}
        currentSession={adminSession}
      />,
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(240),
    )
    expect(
      getByTestId(reportsContainer, 'archive-cash-mismatch-notice').textContent,
    ).toContain(formatCurrency(320))
  })

  it('Prompt 5 hazırlığı: kasaHareketleri (GIRIS/CIKIS) kuruş hassasiyetiyle hesaba katılır, nakit dışı hareketler yok sayılır', () => {
    const day = createMockBusinessDay({ status: 'open', openingCash: 100 })
    const report = buildReportFromOrders([], 10, [], day.id, [])
    const summary = hesaplaBeklenenNakit(day, report, {
      kasaHareketleri: [
        { type: 'GIRIS', amount: 150.25, method: 'cash' },
        { type: 'CIKIS', amount: 40.1, method: 'cash' },
        { type: 'GIRIS', amount: 500, method: 'card' },
      ],
    })
    expect(summary.kirilim.kasaGiris).toBe(150.25)
    expect(summary.kirilim.kasaCikis).toBe(40.1)
    expect(summary.beklenen).toBe(210.15)
  })
})
