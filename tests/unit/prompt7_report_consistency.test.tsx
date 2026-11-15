import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import App from '../../src/App'
import { CloseDayModal } from '../../src/components/CloseDayModal'
import { PaymentModal } from '../../src/components/PaymentModal'
import { RefundModal } from '../../src/components/RefundModal'
import { ReportsModal } from '../../src/components/ReportsModal'
import { ZReportPrintView } from '../../src/components/ZReportPrintView'
import { DEFAULT_SETTINGS } from '../../src/types/settings'
import {
  calculateDayCardBreakdown,
  executeOrderReopen,
  exportReportToCsv,
  getReportForBusinessDay,
  hesaplaBeklenenNakit,
  hesaplaGunToplamlari,
  isPaidRefund,
  repairGhostOccupiedTables,
  saveStoredRefund,
} from '../../src/lib/businessDay'
import {
  calculateRefundAmounts,
  calculateTotals,
  derivePaymentState,
  deriveTableStatus,
  formatCurrency,
  hesaplaAdisyonBakiye,
  isTableOccupied,
  roundCurrency,
} from '../../src/lib/format'
import { getRendererLogBuffer } from '../../src/lib/systemHealth'
import {
  getTablesSafe,
  saveBusinessDaysSafe,
  saveTablesSafe,
  saveUsersSafe,
} from '../../src/lib/storage/repository'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockRefund,
  createMockTable,
} from '../fixtures/factories'
import type {
  BusinessDay,
  CashMovement,
  PartialPayment,
  Refund,
  Session,
  User,
} from '../../src/types'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const nowIso = '2026-11-15T10:00:00.000Z'

const adminSession: Session = {
  id: 'sess-p7-admin',
  userId: 'user-p7-admin',
  username: 'admin',
  fullName: 'Sistem Yöneticisi',
  role: 'admin',
  createdAt: nowIso,
  expiresAt: '2026-11-16T10:00:00.000Z',
  lastActivityAt: nowIso,
}

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

function mount(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  mountedRoots.push({ root, container })
  return container
}

function getByTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
  if (!el) {
    throw new Error(`data-testid="${id}" bulunamadı`)
  }
  return el
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

function seedAppAdminSession() {
  const adminUser: User = {
    id: 'admin-p7',
    fullName: 'Kafe Yöneticisi',
    username: 'admin',
    role: 'admin',
    passwordHash: 'pbkdf2$100000$00112233445566778899aabbccddeeff$deadbeef',
    status: 'active',
    isDeleted: false,
    mustChangePassword: false,
    createdAt: '2026-11-15T08:00:00.000Z',
  }
  saveUsersSafe([adminUser])
  const session: Session = {
    id: 'sess-app-p7',
    userId: adminUser.id,
    username: adminUser.username,
    fullName: adminUser.fullName,
    role: 'admin',
    createdAt: nowIso,
    expiresAt: '2026-11-16T10:00:00.000Z',
    lastActivityAt: nowIso,
  }
  localStorage.setItem('appSession', JSON.stringify(session))
  localStorage.setItem('userActiveSession_' + adminUser.id, session.id)
}

describe('PROMPT 7 — Rapor Tutarlılığı, İade Netleştirme, Kırpma Uyarıları ve Hayalet Masa Onarımı', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    while (mountedRoots.length > 0) {
      const entry = mountedRoots.pop()!
      act(() => {
        entry.root.unmount()
      })
      entry.container.remove()
    }
  })

  it('7.1: Etiketler netleştirildi ("Girilen Ürünler (Brüt)", "Net Ciro (İndirim Sonrası)", "Tahsil Edilen (Net)") ve Brüt − İndirim − Açık Masa − İade = Tahsilat eşitliği kapanır', () => {
    const day = createMockBusinessDay({
      id: 'day-p7-1',
      status: 'open',
      openedAt: '2026-11-15T08:00:00.000Z',
      openingCash: 500,
    })

    // Kapalı sipariş: Brüt 1.080 TL, indirim 100 TL -> Tahsilat 980 TL (Nakit)
    const closedOrder = createMockOrder({
      id: 'ord-p7-1',
      businessDayId: day.id,
      date: '2026-11-15T09:00:00.000Z',
      items: [createMockCartItem({ id: 'latte', name: 'Latte', price: 108, quantity: 10 })],
      totals: { subtotal: 1080, discount: 100, total: 980 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'pay-p7-1',
          type: 'ODEME',
          status: 'GECERLI',
          method: 'cash',
          amount: 980,
          businessDayId: day.id,
          createdAt: '2026-11-15T09:00:00.000Z',
        }),
      ],
    })

    // Açık masa: Brüt 180 TL, henüz ödeme yok -> Brüt 1.260 TL, İndirim 100 TL, Açık Masa 180 TL, Tahsilat 980 TL
    const openTable = createMockTable({
      id: 'tbl-p7-1',
      name: 'Masa 4',
      status: 'occupied',
      cart: [createMockCartItem({ id: 'tea', name: 'Çay', price: 90, quantity: 2 })],
      payments: [],
    })

    const report = getReportForBusinessDay(day, [closedOrder], 10, [openTable])
    expect(report.grossItemsRevenue).toBe(1260)
    expect(report.paidTablesTotal).toBe(980)

    const reportsContainer = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={[closedOrder]}
        businessDays={[day]}
        openBusinessDay={day}
        initialSelectedDayId={day.id}
        tables={[openTable]}
        settings={{ ...DEFAULT_SETTINGS, taxRate: 10 }}
        currentSession={adminSession}
      />,
    )

    expect(reportsContainer.textContent).toContain('Girilen Ürünler (Brüt)')
    expect(reportsContainer.textContent).toContain('indirim öncesi, açık masalar dahil')
    expect(reportsContainer.textContent).toContain('Net Ciro (İndirim Sonrası)')
    expect(reportsContainer.textContent).toContain('Tahsil Edilen (Net)')

    expect(getByTestId(reportsContainer, 'reports-gross-revenue-card').textContent).toBe(
      formatCurrency(1260),
    )
    expect(getByTestId(reportsContainer, 'reports-net-ciro-card').textContent).toBe(
      formatCurrency(1160),
    )
    expect(getByTestId(reportsContainer, 'reports-collected-net-card').textContent).toBe(
      formatCurrency(980),
    )

    const equationText = getByTestId(reportsContainer, 'reconciliation-equation').textContent || ''
    expect(equationText).toContain(formatCurrency(1260))
    expect(equationText).toContain(formatCurrency(100))
    expect(equationText).toContain(formatCurrency(180))
    expect(equationText).toContain(formatCurrency(0))
    expect(equationText).toContain(formatCurrency(980))

    // Kapanış sonrası iade senaryosu da eşitlikte kapanmalı
    const postRefundOrder = createMockOrder({
      id: 'ord-p7-post-ref',
      businessDayId: day.id,
      date: '2026-11-15T10:00:00.000Z',
      items: [createMockCartItem({ id: 'esp', name: 'Espresso', price: 100, quantity: 6 })],
      totals: { subtotal: 600, discount: 0, total: 600 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({
          type: 'ODEME',
          status: 'GECERLI',
          method: 'card',
          amount: 600,
          businessDayId: day.id,
        }),
      ],
    })
    const postRefund: Refund = createMockRefund({
      id: 'ref-p7-post',
      businessDayId: day.id,
      orderId: postRefundOrder.id,
      amount: 120,
      paymentMethod: 'card',
      paymentReceived: true,
    })
    saveStoredRefund(postRefund)

    const reportsWithRefund = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={[postRefundOrder]}
        businessDays={[day]}
        openBusinessDay={day}
        initialSelectedDayId={day.id}
        tables={[]}
        settings={{ ...DEFAULT_SETTINGS, taxRate: 10 }}
        currentSession={adminSession}
      />,
    )
    const eqRefund = getByTestId(reportsWithRefund, 'reconciliation-equation').textContent || ''
    // 600 (Brüt) - 0 (İndirim) - 0 (Açık Masa) - 120 (İade) = 480 (Tahsilat)
    expect(eqRefund).toContain(formatCurrency(600))
    expect(eqRefund).toContain(formatCurrency(120))
    expect(eqRefund).toContain(formatCurrency(480))
  })

  it('7.2: İade tutarı brütten değil fiilen ödenen net paydan hesaplanır (kalem indirimi + adisyon indirimi), RefundModal hem brüt hem net gösterir', () => {
    const latte = createMockCartItem({
      cartItemId: 'ci-latte',
      id: 'latte',
      name: 'Latte',
      price: 100,
      quantity: 2,
      itemDiscount: { type: 'percentage', value: 25 }, // 200 -> 150
    })
    const cheesecake = createMockCartItem({
      cartItemId: 'ci-cake',
      id: 'cake',
      name: 'Cheesecake',
      price: 100,
      quantity: 1,
    })

    // Sepet kalem indirimi sonrası: 150 + 100 = 250 TL; üzerine %20 adisyon indirimi => 200 TL
    // Latte net payı: (150 / 250) * 200 = 120 TL (1 adeti net 60 TL, brüt 100 TL!)
    const itemBreakdown = calculateRefundAmounts({
      cart: [latte, cheesecake],
      discountRate: 0.2,
      discountAmount: 0,
      item: latte,
      qty: 1,
      isTableRefund: false,
    })
    expect(itemBreakdown.grossAmount).toBe(100)
    expect(itemBreakdown.netAmount).toBe(60)
    expect(itemBreakdown.discountShare).toBe(40)
    expect(itemBreakdown.unitNetPrice).toBe(60)

    // Sabit TL adisyon indirimi + tüm masa iadesi de net payı korumalı
    const tableBreakdown = calculateRefundAmounts({
      cart: [latte, cheesecake],
      discountRate: 0.2,
      discountAmount: 20, // 200 - 20 = 180 TL net (300 TL brüt)
      isTableRefund: true,
    })
    expect(tableBreakdown.grossAmount).toBe(300)
    expect(tableBreakdown.netAmount).toBe(180)
    expect(tableBreakdown.discountShare).toBe(120)
    expect(
      roundCurrency(tableBreakdown.itemDetails.reduce((s, d) => s + d.totalPrice, 0)),
    ).toBe(180)

    // RefundModal UI testi: Brüt 100 TL, İndirim Payı -40 TL, Net İade 60 TL görünür
    const onConfirmRefund = vi.fn()
    const modalContainer = mount(
      <RefundModal
        isOpen
        onClose={vi.fn()}
        item={latte}
        cart={[latte, cheesecake]}
        discountRate={0.2}
        discountAmount={0}
        hasPaymentReceived
        onConfirmRefund={onConfirmRefund}
      />,
    )

    expect(getByTestId(modalContainer, 'refund-gross-amount').textContent).toBe(
      formatCurrency(100),
    )
    expect(getByTestId(modalContainer, 'refund-discount-share').textContent).toBe(
      `-${formatCurrency(40)}`,
    )
    expect(getByTestId(modalContainer, 'refund-net-amount').textContent).toBe(
      formatCurrency(60),
    )
  })

  it('7.3: calculateDayCardBreakdown ölü kod değil ve kırpma devreye girdiğinde console.warn, sistem logu ve raporda "Açıklanamayan fark" görünür', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const day = createMockBusinessDay({
      id: 'day-p7-3',
      status: 'open',
      openingCash: 50,
    })

    // 1. Ölü kod kontrolü: IADE hareketi olmayan paymentReceived: true kart iadesi düşülür
    const cardOrder = createMockOrder({
      id: 'ord-p7-card',
      businessDayId: day.id,
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({
          type: 'ODEME',
          status: 'GECERLI',
          method: 'card',
          amount: 500,
          businessDayId: day.id,
        }),
      ],
    })
    const cardRefund = createMockRefund({
      id: 'ref-p7-card',
      businessDayId: day.id,
      orderId: cardOrder.id,
      amount: 150,
      paymentMethod: 'card',
      paymentReceived: true,
    })
    expect(isPaidRefund(cardRefund)).toBe(true)
    const cardBreakdown = calculateDayCardBreakdown(day, [cardOrder], [], '23:57', [cardRefund])
    expect(cardBreakdown.totalCard).toBe(350)
    expect(cardBreakdown.expectedZ).toBe(350)

    // 2. Kırpma görünürlüğü: 100 TL nakit tahsilata 250 TL nakit iade -> toplam 0'da kırpılır, 150 TL açıklanamayan fark bildirilir
    const cashOrder = createMockOrder({
      id: 'ord-p7-cash',
      businessDayId: day.id,
      totals: { subtotal: 100, discount: 0, total: 100 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          type: 'ODEME',
          status: 'GECERLI',
          method: 'cash',
          amount: 100,
          businessDayId: day.id,
        }),
      ],
    })
    const excessCashRefund = createMockRefund({
      id: 'ref-p7-excess',
      businessDayId: day.id,
      orderId: cashOrder.id,
      amount: 250,
      paymentMethod: 'cash',
      paymentReceived: true,
    })
    saveStoredRefund(excessCashRefund)

    const report = hesaplaGunToplamlari([cashOrder], 10, [], day.id, [excessCashRefund])
    expect(report.paymentDistribution.cash).toBe(0)
    expect(report.totalRevenue).toBe(0)
    expect(report.unexplainedDifference).toBe(150)
    expect(warnSpy).toHaveBeenCalled()
    expect(
      getRendererLogBuffer().some(
        (l) => l.category === 'REPORT_CLAMPING' && l.message.includes('150'),
      ),
    ).toBe(true)

    const cashSummary = hesaplaBeklenenNakit(day, report)
    // Açılış 50 + Kapanan Nakit 100 - Nakit İade 250 = -100 -> 0'a çekilir, 150 TL net satış kırpması
    expect(cashSummary.beklenen).toBe(0)
    expect(cashSummary.aciklanamayanFark).toBe(150)
    expect(
      getRendererLogBuffer().some((l) => l.category === 'CASH_CLAMPING'),
    ).toBe(true)

    // UI ve dışa aktarım yüzeylerinde "Açıklanamayan fark: ₺150,00" görünmeli
    const reportsEl = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={[cashOrder]}
        businessDays={[day]}
        openBusinessDay={day}
        initialSelectedDayId={day.id}
        tables={[]}
        settings={DEFAULT_SETTINGS}
        currentSession={adminSession}
      />,
    )
    expect(getByTestId(reportsEl, 'reports-unexplained-diff-banner').textContent).toContain(
      formatCurrency(150),
    )

    const a4El = mount(
      <ZReportPrintView report={report} day={day} settings={DEFAULT_SETTINGS} mode="a4" />,
    )
    expect(getByTestId(a4El, 'zreport-a4-unexplained-diff').textContent).toContain(
      formatCurrency(150),
    )

    const receiptEl = mount(
      <ZReportPrintView report={report} day={day} settings={DEFAULT_SETTINGS} mode="receipt" />,
    )
    expect(getByTestId(receiptEl, 'zreport-receipt-unexplained-diff').textContent).toContain(
      formatCurrency(150),
    )

    const closeDayEl = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={[cashOrder]}
        tables={[]}
        refunds={[excessCashRefund]}
        settings={DEFAULT_SETTINGS}
        onClose={vi.fn()}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )
    expect(getByTestId(closeDayEl, 'close-day-unexplained-diff').textContent).toContain(
      formatCurrency(150),
    )
  })

  it('7.4: PaymentModal oluşturulan paymentEntry nesnesinde type: "ODEME" ve status: "GECERLI" alanlarını açıkça yazar', async () => {
    const onAddPayment = vi.fn()
    const item = createMockCartItem({ price: 120, quantity: 1 })
    const totals = calculateTotals([item], 0, 0)

    const container = mount(
      <PaymentModal
        isOpen
        cart={[item]}
        discountRate={0}
        note=""
        orderNumber="ORD-P7-4"
        paidMethod={null}
        payments={[]}
        settings={DEFAULT_SETTINGS}
        totals={totals}
        currentSession={adminSession}
        onClose={vi.fn()}
        onNewOrder={vi.fn()}
        onPaid={vi.fn()}
        onAddPayment={onAddPayment}
      />,
    )

    const cashBtn = findButton(container, 'Nakit')
    expect(cashBtn).toBeTruthy()
    act(() => {
      cashBtn!.click()
    })

    const confirmBtn = container.querySelector('button.confirm-pay') as HTMLButtonElement | null
    expect(confirmBtn).toBeTruthy()
    act(() => {
      confirmBtn!.click()
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650))
    })

    expect(onAddPayment).toHaveBeenCalledTimes(1)
    const [entry] = onAddPayment.mock.calls[0] as [PartialPayment, boolean, string]
    expect(Object.prototype.hasOwnProperty.call(entry, 'type')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(entry, 'status')).toBe(true)
    expect(entry.type).toBe('ODEME')
    expect(entry.status).toBe('GECERLI')
  })

  it('7.5: Hayalet masa riski giderildi — status koşullu değil türetilmiş değerdir ve başlangıç onarımı boş "occupied" masayı düzeltip loglar', () => {
    // 1. status: 'occupied' ama sepet, ödeme ve müşteri adı boş => Dolu SAYILMAMALI
    const ghostTable = createMockTable({
      id: 'tbl-ghost-1',
      name: 'Masa 9',
      status: 'occupied',
      cart: [],
      payments: [],
      customerName: '',
    })
    expect(isTableOccupied(ghostTable)).toBe(false)
    expect(deriveTableStatus(ghostTable)).toBe('empty')

    // Tüm kalemler iade ve tüm ödemeler IADE ile kapanmış masa da boş sayılır
    const balancedRefundedTable = createMockTable({
      id: 'tbl-ghost-2',
      name: 'Masa 10',
      status: 'occupied',
      cart: [createMockCartItem({ status: 'refunded', refundedQty: 1, quantity: 1 })],
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', amount: 100 }),
        createMockPayment({ type: 'IADE', status: 'GECERLI', amount: 100 }),
      ],
    })
    expect(isTableOccupied(balancedRefundedTable)).toBe(false)

    // Aktif kalem, net pozitif ödeme veya müşteri adı varsa status: 'empty' olsa bile dolu sayılır
    expect(
      isTableOccupied(
        createMockTable({
          status: 'empty',
          cart: [createMockCartItem({ price: 50, quantity: 1 })],
        }),
      ),
    ).toBe(true)
    expect(
      isTableOccupied(
        createMockTable({
          status: 'empty',
          cart: [],
          payments: [createMockPayment({ type: 'ODEME', status: 'GECERLI', amount: 50 })],
        }),
      ),
    ).toBe(true)
    expect(
      isTableOccupied(
        createMockTable({
          status: 'empty',
          cart: [],
          payments: [],
          customerName: 'Ayşe Yılmaz',
        }),
      ),
    ).toBe(true)

    // Saf onarım fonksiyonu testi
    const repairResult = repairGhostOccupiedTables([ghostTable])
    expect(repairResult.healed).toBe(true)
    expect(repairResult.repairedTables).toEqual([{ id: 'tbl-ghost-1', name: 'Masa 9' }])
    expect(repairResult.tables[0].status).toBe('empty')

    // Açılış akışı entegrasyonu: Depoda hayalet masa ile App açılırsa onarılır, kaydedilir ve loglanır
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    seedAppAdminSession()
    saveBusinessDaysSafe([
      createMockBusinessDay({ id: 'day-ghost-app', status: 'open', openingCash: 100 }),
    ])
    saveTablesSafe([ghostTable])

    mount(<App />)

    const healedTables = getTablesSafe()
    expect(healedTables.find((t) => t.id === 'tbl-ghost-1')?.status).toBe('empty')
    expect(
      warnSpy.mock.calls.some((args) => String(args[0]).includes('Hayalet dolu masa onarıldı')),
    ).toBe(true)
    expect(
      getRendererLogBuffer().some(
        (l) => l.category === 'GHOST_TABLE_REPAIRED' && l.message.includes('Masa 9'),
      ),
    ).toBe(true)
  })
})

describe('Prompt 7.6 — 8 Kalıcı Finansal Değişmez', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    while (mountedRoots.length > 0) {
      const entry = mountedRoots.pop()!
      act(() => {
        entry.root.unmount()
      })
      entry.container.remove()
    }
  })

  it('Değişmez 1: Ödenen = Σ GECERLI ODEME − Σ GECERLI IADE ve asla eksi değil', () => {
    const payments: PartialPayment[] = [
      createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 250 }),
      createMockPayment({ type: 'ODEME', status: 'IPTAL', method: 'cash', amount: 500 }), // Yok sayılır
      createMockPayment({ type: 'IADE', status: 'GECERLI', method: 'cash', amount: 80 }),
      createMockPayment({ type: 'IADE', status: 'IPTAL', method: 'card', amount: 100 }), // Yok sayılır
    ]
    const state = derivePaymentState(300, payments)
    expect(state.paidTotal).toBe(170)

    const bakiye = hesaplaAdisyonBakiye(
      { items: [createMockCartItem({ price: 150, quantity: 2 })] },
      payments,
    )
    expect(bakiye.odenen).toBe(170)
    expect(bakiye.kalan).toBe(130)

    // İade toplamı ödemeden büyük olsa bile Ödenen asla eksiye düşmez (0 olur)
    const excessIade = [
      createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'card', amount: 100 }),
      createMockPayment({ type: 'IADE', status: 'GECERLI', method: 'card', amount: 260 }),
    ]
    expect(derivePaymentState(100, excessIade).paidTotal).toBe(0)
  })

  it('Değişmez 2: Kalan = Genel Toplam − Ödenen, eksiyse Fazla Ödeme olarak ayrı hesaplanır', () => {
    const items = [createMockCartItem({ price: 200, quantity: 1 })]
    const overpaid = [
      createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 250 }),
    ]
    const state = derivePaymentState(200, overpaid)
    expect(state.paidTotal).toBe(250)
    expect(state.remaining).toBe(0)
    expect(state.overpayment).toBe(50)

    // İndirim sonrası genel toplam düşerse aradaki fark kalanı eksi yapmaz, Fazla Ödeme'ye geçer
    const bakiye = hesaplaAdisyonBakiye({ items, discountRate: 0.25, discountAmount: 0 }, overpaid) // Genel toplam 150, ödenen 250
    expect(bakiye.genelToplam).toBe(150)
    expect(bakiye.kalan).toBe(0)
    expect(bakiye.fazlaOdeme).toBe(100)
  })

  it('Değişmez 3: Nakit + Kart + IBAN = Tahsil Edilen (Net)', () => {
    const day = createMockBusinessDay({ id: 'day-inv-3', status: 'open' })
    const o1 = createMockOrder({
      id: 'inv3-o1',
      businessDayId: day.id,
      totals: { subtotal: 500, discount: 50, total: 450 },
      paymentMethod: 'mixed',
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 150, businessDayId: day.id }),
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'card', amount: 200.45, businessDayId: day.id }),
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'iban', amount: 99.55, businessDayId: day.id }),
      ],
    })
    const o2 = createMockOrder({
      id: 'inv3-o2',
      businessDayId: day.id,
      totals: { subtotal: 300, discount: 0, total: 300 },
      paymentMethod: 'Nakit' as any,
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'Kredi Kartı' as any, amount: 300, businessDayId: day.id }),
        createMockPayment({ type: 'IADE', status: 'GECERLI', method: 'card', amount: 45.2, businessDayId: day.id }),
      ],
    })
    const r = hesaplaGunToplamlari([o1, o2], 10, [], day.id, [])
    const sum = roundCurrency(
      r.paymentDistribution.cash + r.paymentDistribution.card + r.paymentDistribution.iban,
    )
    expect(sum).toBe(r.paidTablesTotal)
    expect(sum).toBe(r.totalRevenue)
    expect(sum).toBe(704.8)
  })

  it('Değişmez 4: Beklenen Nakit = Açılış + Nakit Tahsilat + Açık Masa Nakdi − Nakit İade + Kasa Girişi − Kasa Çıkışı', () => {
    const day = createMockBusinessDay({ id: 'day-inv-4', status: 'open', openingCash: 350 })
    const closedCashOrder = createMockOrder({
      id: 'inv4-o1',
      businessDayId: day.id,
      totals: { subtotal: 420, discount: 0, total: 420 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 420, businessDayId: day.id }),
        createMockPayment({ type: 'IADE', status: 'GECERLI', method: 'cash', amount: 60, businessDayId: day.id }),
      ],
    })
    const openTable = createMockTable({
      id: 'inv4-t1',
      status: 'occupied',
      cart: [createMockCartItem({ price: 200, quantity: 1 })],
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 90, businessDayId: day.id }),
      ],
    })
    const movements: CashMovement[] = [
      {
        id: 'cm-inv4-in',
        businessDayId: day.id,
        type: 'GIRIS',
        amount: 110,
        category: 'Bozuk Para',
        description: 'Bozuk',
        createdAt: nowIso,
        createdBy: 'Admin',
      },
      {
        id: 'cm-inv4-out',
        businessDayId: day.id,
        type: 'CIKIS',
        amount: 75,
        category: 'Gider',
        description: 'Süt',
        createdAt: nowIso,
        createdBy: 'Admin',
      },
    ]

    const report = getReportForBusinessDay(day, [closedCashOrder], 10, [openTable], movements)
    const cashSummary = hesaplaBeklenenNakit(day, report)
    const { kirilim } = cashSummary
    const manualFormula = roundCurrency(
      kirilim.acilisNakiti +
        kirilim.kapananNakit +
        kirilim.acikMasaNakit -
        kirilim.nakitIadeler +
        kirilim.kasaGiris -
        kirilim.kasaCikis,
    )
    expect(cashSummary.beklenen).toBe(manualFormula)
    expect(cashSummary.beklenen).toBe(350 + 420 + 90 - 60 + 110 - 75) // 835 TL
  })

  it('Değişmez 5: Bir adisyon ciroya ve sipariş sayısına yalnızca bir kez girer (parçalı ödeme / geri açma dahil)', () => {
    const day = createMockBusinessDay({ id: 'day-inv-5', status: 'open' })
    const item = createMockCartItem({ price: 150, quantity: 2 })
    const originalOrder = createMockOrder({
      id: 'inv5-orig',
      orderNumber: 'ORD-500',
      tableId: 'tbl-5',
      tableName: 'Masa 5',
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 300, discount: 0, total: 300 },
      paymentMethod: 'mixed',
      payments: [
        createMockPayment({ id: 'p5-1', type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 120, businessDayId: day.id }),
        createMockPayment({ id: 'p5-2', type: 'ODEME', status: 'GECERLI', method: 'card', amount: 180, businessDayId: day.id }),
      ],
    })
    const tbl5 = createMockTable({ id: 'tbl-5', name: 'Masa 5', status: 'empty', cart: [], payments: [] })

    // Adisyon henüz geri açılmadan önce: 1 sipariş, 300 TL
    const rBefore = hesaplaGunToplamlari([originalOrder], 10, [tbl5], day.id, [])
    expect(rBefore.orderCount).toBe(1)
    expect(rBefore.paidTablesTotal).toBe(300)

    // Geri açıldığında orijinal iptal/reopened olur, yeni masa kapanınca yeniden 1 sipariş / 300 TL olur — ASLA 2 sipariş veya 600 TL olmaz!
    const reopened = executeOrderReopen({
      completedOrders: [originalOrder],
      tables: [tbl5],
      orderId: originalOrder.id,
      targetTableId: tbl5.id,
      openBusinessDay: day,
      reason: 'Yanlış ödeme yöntemi',
      userName: 'Yönetici',
    })
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) throw new Error(reopened.error)
    const reclosedOrder = createMockOrder({
      id: 'inv5-reclosed',
      orderNumber: 'Masa 5',
      tableId: tbl5.id,
      tableName: 'Masa 5',
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 300, discount: 0, total: 300 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({ id: 'p5-3', type: 'ODEME', status: 'GECERLI', method: 'card', amount: 300, businessDayId: day.id }),
      ],
    })
    const rFinal = hesaplaGunToplamlari(
      [...reopened.updatedOrders, reclosedOrder],
      10,
      [],
      day.id,
      [],
    )
    expect(rFinal.orderCount).toBe(1)
    expect(rFinal.paidTablesTotal).toBe(300)
    expect(rFinal.paymentDistribution.card).toBe(300)
    expect(rFinal.paymentDistribution.cash).toBe(0)
  })

  it('Değişmez 6: Hiçbir ödeme kaydı silinmez ve hiçbir amount sonradan değiştirilmez', () => {
    const p1 = createMockPayment({ id: 'orig-pay-1', type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 175 })
    const p2 = createMockPayment({ id: 'orig-pay-2', type: 'ODEME', status: 'GECERLI', method: 'card', amount: 225 })
    const order = createMockOrder({
      id: 'ord-inv-6',
      businessDayId: 'day-inv-6',
      tableId: 'tbl-6',
      tableName: 'Masa 6',
      totals: { subtotal: 400, discount: 0, total: 400 },
      payments: [p1, p2],
    })
    const emptyTable = createMockTable({ id: 'tbl-6', name: 'Masa 6', status: 'empty', cart: [], payments: [] })

    const day = createMockBusinessDay({ id: 'day-inv-6', status: 'open' })
    const reopenRes = executeOrderReopen({
      completedOrders: [order],
      tables: [emptyTable],
      orderId: order.id,
      targetTableId: emptyTable.id,
      openBusinessDay: day,
      reason: 'Ürün eklenecek',
      userName: 'Kasiyer',
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) throw new Error(reopenRes.error)

    const archivedOrder = reopenRes.updatedOrders.find((o) => o.id === order.id)!
    // Kayıt sayısı hiç azalmaz ve orijinal amount değerleri korunur
    expect(archivedOrder.payments).toHaveLength(2)
    expect(archivedOrder.payments!.map((p) => p.id)).toEqual(['orig-pay-1', 'orig-pay-2'])
    expect(archivedOrder.payments![0].amount).toBe(175)
    expect(archivedOrder.payments![0].status).toBe('IPTAL')
    expect(archivedOrder.payments![1].amount).toBe(225)
    expect(archivedOrder.payments![1].status).toBe('IPTAL')
  })

  it('Değişmez 7: Gün sonu ekranı, Raporlar ekranı, Z raporu (A4 + Fiş) ve CSV/PDF export aynı rakamları üretir', () => {
    const day = createMockBusinessDay({
      id: 'day-inv-7',
      status: 'open',
      openingCash: 400,
    })
    const cashOrder = createMockOrder({
      id: 'inv7-o1',
      businessDayId: day.id,
      items: [createMockCartItem({ name: 'Latte', price: 100, quantity: 3 })],
      totals: { subtotal: 300, discount: 30, total: 270 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'cash', amount: 270, businessDayId: day.id }),
      ],
    })
    const cardOrder = createMockOrder({
      id: 'inv7-o2',
      businessDayId: day.id,
      items: [createMockCartItem({ name: 'Espresso', price: 80, quantity: 5 })],
      totals: { subtotal: 400, discount: 0, total: 400 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({ type: 'ODEME', status: 'GECERLI', method: 'card', amount: 400, businessDayId: day.id }),
      ],
    })

    const settings = { ...DEFAULT_SETTINGS, taxRate: 10 }
    const report = getReportForBusinessDay(day, [cashOrder, cardOrder], 10, [])

    const closeContainer = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={[cashOrder, cardOrder]}
        tables={[]}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )
    const reportsContainer = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={[cashOrder, cardOrder]}
        businessDays={[day]}
        openBusinessDay={day}
        initialSelectedDayId={day.id}
        tables={[]}
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

    let capturedCsv = ''
    const OrigBlob = globalThis.Blob
    vi.stubGlobal(
      'Blob',
      class MockBlob extends OrigBlob {
        constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
          super(parts, opts)
          capturedCsv = (parts || []).map((p) => String(p)).join('')
        }
      },
    )
    if (typeof URL.createObjectURL !== 'function') {
      ;(URL as any).createObjectURL = () => 'blob:mock'
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    }
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    exportReportToCsv(report, 'Aynı Gün', day)

    // Tahsil Edilen (Net) = 670 TL, Beklenen Nakit = 400 + 270 = 670 TL, Kart = 400 TL
    expect(getByTestId(closeContainer, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(670),
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(670),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(670),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(670),
    )

    for (const el of [closeContainer, reportsContainer, a4Container, receiptContainer]) {
      expect(el.textContent).toContain(formatCurrency(670))
      expect(el.textContent).toContain(formatCurrency(400))
      expect(el.textContent).toContain(formatCurrency(270))
    }
    expect(capturedCsv).toContain('700,00') // Girilen Ürünler Brüt
    expect(capturedCsv).toContain('670,00') // Tahsil Edilen (Net) & Beklenen Nakit
    expect(capturedCsv).toContain('400,00') // Kart
  })

  it('Değişmez 8: Kapanmış günlerin arşiv raporları sonraki hiçbir işlemle değişmez', () => {
    const yesterdayOrder = createMockOrder({
      id: 'inv8-yest-ord',
      businessDayId: 'day-yest-closed',
      date: '2026-11-14T15:00:00.000Z',
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'inv8-yest-pay',
          type: 'ODEME',
          status: 'GECERLI',
          method: 'cash',
          amount: 500,
          businessDayId: 'day-yest-closed',
          createdAt: '2026-11-14T15:00:00.000Z',
        }),
      ],
    })
    const archivedSnapshot = buildSnapshotForClosedDay([yesterdayOrder], 'day-yest-closed')
    const closedDay: BusinessDay = {
      id: 'day-yest-closed',
      status: 'closed',
      openedAt: '2026-11-14T08:00:00.000Z',
      openedBy: 'Admin',
      closedAt: '2026-11-14T23:00:00.000Z',
      closedBy: 'Admin',
      openingCash: 200,
      expectedCash: 700,
      countedCash: 700,
      cashDifference: 0,
      report: archivedSnapshot,
    }
    const frozenBefore = JSON.stringify(getReportForBusinessDay(closedDay, [yesterdayOrder], 10))

    // Sonraki gün yapılan yeni işlemler: yeni siparişler, kasa hareketleri, dünkü siparişe carryover ödemesi, KDV oranı değişikliği
    const todayOrder = createMockOrder({
      id: 'inv8-today-ord',
      businessDayId: 'day-today-open',
      totals: { subtotal: 999, discount: 0, total: 999 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({
          type: 'ODEME',
          status: 'GECERLI',
          method: 'card',
          amount: 999,
          businessDayId: 'day-today-open',
        }),
      ],
    })
    const mutatedYesterdayOrder = {
      ...yesterdayOrder,
      payments: [
        ...yesterdayOrder.payments!,
        createMockPayment({
          type: 'ODEME',
          status: 'GECERLI',
          method: 'cash',
          amount: 300,
          businessDayId: 'day-today-open',
        }),
      ],
    }
    const todayCashMov: CashMovement = {
      id: 'cm-inv8-today',
      businessDayId: 'day-yest-closed', // Hatalı eşleşse bile kapalı arşiv raporu dondurulmuş kalmalı
      type: 'CIKIS',
      amount: 250,
      category: 'Gider',
      description: 'Arşiv dışı hareket',
      createdAt: nowIso,
      createdBy: 'Admin',
    }

    const reportAfterLaterActions = getReportForBusinessDay(
      closedDay,
      [mutatedYesterdayOrder, todayOrder],
      20, // KDV oranı %10 -> %20 değiştirilse bile
      [createMockTable({ status: 'occupied', cart: [createMockCartItem({ price: 400 })] })],
      [todayCashMov],
    )

    expect(JSON.stringify(reportAfterLaterActions)).toBe(frozenBefore)
    expect(reportAfterLaterActions.totalRevenue).toBe(500)
    expect(reportAfterLaterActions.paidTablesTotal).toBe(500)
    expect(reportAfterLaterActions.orderCount).toBe(1)
    expect(reportAfterLaterActions.paymentDistribution.cash).toBe(500)
  })
})

function buildSnapshotForClosedDay(orders: ReturnType<typeof createMockOrder>[], dayId: string) {
  return hesaplaGunToplamlari(orders, 10, [], dayId, [])
}
