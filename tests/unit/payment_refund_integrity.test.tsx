import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PaymentModal } from '../../src/components/PaymentModal'
import { CartPanel } from '../../src/components/CartPanel'
import { DEFAULT_SETTINGS } from '../../src/types/settings'
import {
  calculateTotals,
  derivePaymentState,
  hesaplaAdisyonBakiye,
  isValidPaymentMovement,
} from '../../src/lib/format'
import {
  buildReportFromOrders,
  calculateDayCardBreakdown,
  detectPaymentAndRefundInconsistencies,
  healCorruptedReopenedData,
  isPaidRefund,
} from '../../src/lib/businessDay'
import { getActivityLogs, logActivity } from '../../src/lib/activityLog'
import { validateCompletedOrder, validateRefund, validateTable } from '../../src/lib/storage/validators'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockRefund,
  createMockTable,
} from '../fixtures/factories'
import type { PartialPayment, Refund, Session } from '../../src/types'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockAdminSession: Session = {
  userId: 'admin-1',
  username: 'admin',
  fullName: 'Sistem Yöneticisi',
  role: 'admin',
  loginAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
}

describe('PROMPT 2 — Ödeme ve İade Kayıtlarının Bütünlüğü (9 Zorunlu Senaryo ve 5 Değişmez)', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    localStorage.clear()
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
      rootContainer = null
    }
  })

  // Senaryo 1 — Kırpma testi
  it('Senaryo 1 (Kırpma testi): Masa ₺240 ürün + ₺200 nakit kısmi ödeme → ₺120 nakit iade → ödeme kaydı ₺200 kalır, ₺120 IADE hareketi eklenir, Ödenen=₺80, Kalan=₺40', () => {
    const day = createMockBusinessDay({ id: 'day-s1', status: 'open' })
    const itemActive = createMockCartItem({
      cartItemId: 'item-1',
      name: 'Latte',
      price: 120,
      quantity: 1,
      status: 'active',
    })
    const itemRefunded = createMockCartItem({
      cartItemId: 'item-2',
      name: 'Latte',
      price: 120,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
      refundReason: 'Müşteri Vazgeçti',
    })

    const originalPayment: PartialPayment = createMockPayment({
      id: 'pay-200',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'cash',
      amount: 200,
      businessDayId: day.id,
      tableId: 'table-1',
    })

    const iadeMovement: PartialPayment = createMockPayment({
      id: 'pay-iade-120',
      type: 'IADE',
      status: 'GECERLI',
      method: 'cash',
      amount: 120,
      reversalOfId: originalPayment.id,
      reason: 'Müşteri Vazgeçti',
      cancelledReason: 'Müşteri Vazgeçti',
      businessDayId: day.id,
      tableId: 'table-1',
    })

    const table = createMockTable({
      id: 'table-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [itemActive, itemRefunded],
      payments: [originalPayment, iadeMovement],
    })

    // 1. Orijinal ödeme kaydı kırpılmamış, hâlâ ₺200
    expect(table.payments).toHaveLength(2)
    expect(table.payments![0].amount).toBe(200)
    expect(table.payments![0].type).toBe('ODEME')
    expect(table.payments![0].status).toBe('GECERLI')

    // 2. Karşı hareket (IADE) pozitif tutarla (₺120) ve reversalOfId ile kayıtlı
    expect(table.payments![1].amount).toBe(120)
    expect(table.payments![1].type).toBe('IADE')
    expect(table.payments![1].status).toBe('GECERLI')
    expect(table.payments![1].reversalOfId).toBe('pay-200')

    // 3. Yeni toplam ₺120, Ödenen = 200 - 120 = ₺80, Kalan = 120 - 80 = ₺40
    const totals = calculateTotals(table.cart, 0, 0)
    expect(totals.total).toBe(120)

    const paymentState = derivePaymentState(totals.total, table.payments)
    expect(paymentState.paidTotal).toBe(80)
    expect(paymentState.remaining).toBe(40)
    expect(paymentState.overpayment).toBe(0)

    const bakiye = hesaplaAdisyonBakiye(table)
    expect(bakiye.genelToplam).toBe(120)
    expect(bakiye.odenen).toBe(80)
    expect(bakiye.kalan).toBe(40)
    expect(bakiye.fazlaOdeme).toBe(0)
  })

  // Senaryo 2 — Kasa testi
  it('Senaryo 2 (Kasa testi): Yukarıdaki senaryoda gerçek kasa ₺80, raporun nakit toplamı da ₺80 olmalı', () => {
    const day = createMockBusinessDay({ id: 'day-s2', status: 'open', openingCash: 0 })
    const itemActive = createMockCartItem({ name: 'Latte', price: 120, quantity: 1, status: 'active' })
    const itemRefunded = createMockCartItem({
      name: 'Latte',
      price: 120,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
    })

    const odeme200 = createMockPayment({
      id: 'pay-200',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'cash',
      amount: 200,
      businessDayId: day.id,
      tableId: 'table-1',
    })
    const iade120 = createMockPayment({
      id: 'pay-iade-120',
      type: 'IADE',
      status: 'GECERLI',
      method: 'cash',
      amount: 120,
      reversalOfId: odeme200.id,
      businessDayId: day.id,
      tableId: 'table-1',
    })

    const openTable = createMockTable({
      id: 'table-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [itemActive, itemRefunded],
      payments: [odeme200, iade120],
    })

    const refundRecord = createMockRefund({
      id: 'ref-120',
      businessDayId: day.id,
      tableId: 'table-1',
      amount: 120,
      paymentMethod: 'cash',
      paymentReceived: true,
      paymentMovementId: iade120.id,
    })

    // A) Masa açıkken rapor kontrolü
    const reportWhileOpen = buildReportFromOrders([], 10, [openTable], day.id, [refundRecord])
    expect(reportWhileOpen.openTablePaymentsByMethod?.cash).toBe(80)
    expect(reportWhileOpen.openTablePaymentsTotal).toBe(80)
    expect(reportWhileOpen.totalCollectedRevenue).toBe(80)

    // B) Masa ₺80 tahsilatla kapatıldığında raporun nakit toplamı da tam ₺80
    const closedAt80Order = createMockOrder({
      id: 'order-s2',
      businessDayId: day.id,
      tableId: 'table-1',
      items: [itemActive, itemRefunded],
      totals: { subtotal: 120, discount: 40, total: 80 },
      paymentMethod: 'cash',
      payments: [odeme200, iade120],
    })
    const reportWhenClosed = buildReportFromOrders([closedAt80Order], 10, [], day.id, [refundRecord])
    expect(reportWhenClosed.paymentDistribution.cash).toBe(80)
    expect(reportWhenClosed.totalRevenue).toBe(80)
  })

  // Senaryo 3 — İade bayrağı testi
  it('Senaryo 3 (İade bayrağı testi): ₺600 nakit tahsilat + ₺120 nakit iade → rapor nakit ₺480', () => {
    const day = createMockBusinessDay({ id: 'day-s3', status: 'open' })
    const order = createMockOrder({
      id: 'order-600',
      businessDayId: day.id,
      totals: { subtotal: 600, discount: 0, total: 600 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'pay-600',
          type: 'ODEME',
          status: 'GECERLI',
          method: 'cash',
          amount: 600,
          businessDayId: day.id,
        }),
      ],
    })

    const paidRefund: Refund = createMockRefund({
      id: 'ref-s3',
      businessDayId: day.id,
      orderId: order.id,
      amount: 120,
      paymentMethod: 'cash',
      paymentReceived: true,
      reason: 'Nakit iade',
    })

    expect(isPaidRefund(paidRefund)).toBe(true)

    const report = buildReportFromOrders([order], 10, [], day.id, [paidRefund])
    expect(report.paymentDistribution.cash).toBe(480)
    expect(report.paidTablesTotal).toBe(480)
    expect(report.paidRefundsTotal).toBe(120)
  })

  // Senaryo 4 — Mutfak iadesi testi
  it('Senaryo 4 (Mutfak iadesi testi): Ödeme alınmamış masada ₺100 ürün iptali → paymentReceived: false, nakit/kart toplamına etkisi ₺0', () => {
    const day = createMockBusinessDay({ id: 'day-s4', status: 'open' })
    const otherClosedOrder = createMockOrder({
      id: 'order-other',
      businessDayId: day.id,
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'pay-500',
          type: 'ODEME',
          status: 'GECERLI',
          method: 'cash',
          amount: 500,
          businessDayId: day.id,
        }),
      ],
    })

    const unpaidKitchenRefund: Refund = createMockRefund({
      id: 'ref-kitchen-100',
      businessDayId: day.id,
      tableId: 'table-unpaid',
      tableName: 'Masa 5',
      amount: 100,
      paymentMethod: undefined,
      paymentReceived: false,
      reason: 'Yanlış Sipariş',
    })

    expect(isPaidRefund(unpaidKitchenRefund)).toBe(false)

    const report = buildReportFromOrders([otherClosedOrder], 10, [], day.id, [unpaidKitchenRefund])
    // Nakit toplamı etkilenmez (₺500 kalır)
    expect(report.paymentDistribution.cash).toBe(500)
    expect(report.paymentDistribution.card).toBe(0)
    expect(report.unpaidRefundsTotal).toBe(100)
    expect(report.paidRefundsTotal).toBe(0)
  })

  // Senaryo 5 — Geri alma testi
  it('Senaryo 5 (Geri alma testi): Parçalı ₺100 nakit + ₺100 kart → "Son Ödemeyi Geri Al" → ikinci kayıt status: IPTAL, listede 2 kayıt duruyor, paidTotal = ₺100, logda iptal kaydı var', () => {
    const day = createMockBusinessDay({ id: 'day-s5', status: 'open' })
    const item = createMockCartItem({ name: 'Filtre Kahve', price: 300, quantity: 1 })
    const p1 = createMockPayment({
      id: 'p1-cash',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'cash',
      amount: 100,
      businessDayId: day.id,
    })
    const p2 = createMockPayment({
      id: 'p2-card',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'card',
      amount: 100,
      businessDayId: day.id,
    })

    let currentPayments: PartialPayment[] = [p1, p2]

    const handleUndo = () => {
      const nowIso = new Date().toISOString()
      let lastIdx = -1
      for (let i = currentPayments.length - 1; i >= 0; i--) {
        const p = currentPayments[i]
        if ((p.status || 'GECERLI') === 'GECERLI' && (p.type || 'ODEME') === 'ODEME') {
          lastIdx = i
          break
        }
      }
      if (lastIdx >= 0) {
        const target = currentPayments[lastIdx]
        currentPayments = currentPayments.map((p, idx) =>
          idx === lastIdx
            ? {
                ...p,
                status: 'IPTAL' as const,
                cancelledAt: nowIso,
                cancelledBy: 'Sistem Yöneticisi',
                cancelledReason: 'Son ödeme geri alındı',
              }
            : p,
        )
        logActivity({
          businessDayId: day.id,
          type: 'payment_cancel',
          tableName: 'Masa 1',
          tableId: 'table-1',
          amount: target.amount,
          reason: 'Son ödeme geri alındı',
          userName: 'Sistem Yöneticisi',
          details: `Son ödeme geri alındı (IPTAL): KART ile ₺100,00`,
        })
      }
    }

    act(() => {
      root!.render(
        <PaymentModal
          cart={[item]}
          discountRate={0}
          discountAmount={0}
          isOpen={true}
          note=""
          onClose={vi.fn()}
          onNewOrder={vi.fn()}
          onPaid={vi.fn()}
          onAddPayment={vi.fn()}
          onUndoLastPayment={handleUndo}
          orderNumber="Masa 1"
          paidMethod={null}
          payments={currentPayments}
          settings={DEFAULT_SETTINGS}
          totals={{ subtotal: 300, discount: 0, total: 300 }}
          currentSession={mockAdminSession}
        />,
      )
    })

    const undoBtn = rootContainer!.querySelector('button.undo-payment-btn') as HTMLButtonElement
    expect(undoBtn).not.toBeNull()
    act(() => {
      undoBtn.click()
    })

    const confirmYesBtn = rootContainer!.querySelector('button.confirm-yes') as HTMLButtonElement
    expect(confirmYesBtn).not.toBeNull()
    act(() => {
      confirmYesBtn.click()
    })

    // 1. Diziden hiçbir kayıt silinmedi: 2 kayıt duruyor
    expect(currentPayments).toHaveLength(2)
    expect(currentPayments[0].id).toBe('p1-cash')
    expect(currentPayments[0].status).toBe('GECERLI')
    expect(currentPayments[0].amount).toBe(100)

    // 2. İkinci kayıt IPTAL olarak işaretlendi ve meta alanları dolu
    expect(currentPayments[1].id).toBe('p2-card')
    expect(currentPayments[1].status).toBe('IPTAL')
    expect(currentPayments[1].amount).toBe(100)
    expect(currentPayments[1].cancelledBy).toBe('Sistem Yöneticisi')
    expect(currentPayments[1].cancelledReason).toBe('Son ödeme geri alındı')
    expect(currentPayments[1].cancelledAt).toBeDefined()

    // 3. paidTotal = ₺100, remaining = ₺200
    const state = derivePaymentState(300, currentPayments)
    expect(state.paidTotal).toBe(100)
    expect(state.remaining).toBe(200)

    // 4. İşlem günlüğünde iptal kaydı var
    const logs = getActivityLogs()
    const cancelLog = logs.find((l) => l.type === 'payment_cancel')
    expect(cancelLog).toBeDefined()
    expect(cancelLog?.amount).toBe(100)
    expect(cancelLog?.details).toContain('KART')

    // 5. healCorruptedReopenedData açık masadaki IPTAL kaydını silmez
    const healed = healCorruptedReopenedData(
      [createMockTable({ id: 'table-1', status: 'occupied', cart: [item], payments: currentPayments })],
      [],
    )
    expect(healed.tables[0].payments).toHaveLength(2)
    expect(healed.tables[0].payments![1].status).toBe('IPTAL')
  })

  // Senaryo 6 — Fazla ödeme testi
  it('Senaryo 6 (Fazla ödeme testi): ₺200 ürün + ₺200 nakit ödeme alındı, sonra ₺80 ürün iade edilip fazla ödeme oluştuğunda "Fazla Ödeme / İade Edilecek: ₺80,00" gösterilir, Kalan negatif olmaz, onaylandığında IADE hareketi oluşur', () => {
    const activeItem = createMockCartItem({
      cartItemId: 'item-120',
      name: 'Cheesecake',
      price: 120,
      quantity: 1,
      status: 'active',
    })
    const refundedItem = createMockCartItem({
      cartItemId: 'item-80',
      name: 'Americano',
      price: 80,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
    })

    let payments: PartialPayment[] = [
      createMockPayment({
        id: 'pay-200',
        type: 'ODEME',
        status: 'GECERLI',
        method: 'cash',
        amount: 200,
      }),
    ]

    const totals = calculateTotals([activeItem, refundedItem], 0, 0)
    expect(totals.total).toBe(120)

    const initialPaymentState = derivePaymentState(totals.total, payments)
    expect(initialPaymentState.paidTotal).toBe(200)
    expect(initialPaymentState.remaining).toBe(0) // Kalan asla negatif olmaz
    expect(initialPaymentState.overpayment).toBe(80)

    // CartPanel kontrolü
    act(() => {
      root!.render(
        <CartPanel
          tableName="Masa 3"
          cart={[activeItem, refundedItem]}
          confirmClear={false}
          note=""
          customerName=""
          totals={totals}
          payments={payments}
          onUpdateQuantity={vi.fn()}
          onRemoveItem={vi.fn()}
          onApplyItemDiscount={vi.fn()}
          onClear={vi.fn()}
          onConfirmClearChange={vi.fn()}
          onNoteChange={vi.fn()}
          onCustomerNameChange={vi.fn()}
          onCompleteOrder={vi.fn()}
          onOpenPayment={vi.fn()}
          onOpenAdisyon={vi.fn()}
        />,
      )
    })

    const cartText = rootContainer!.textContent || ''
    expect(cartText).toContain('Fazla Ödeme / İade Edilecek: ₺80,00')
    expect(cartText).not.toContain('-₺80,00')

    // PaymentModal kontrolü: Fazla ödemeyi onaylayarak IADE hareketine dönüştürme
    const onRefundOverpayment = vi.fn((method: 'card' | 'cash' | 'iban', amount: number) => {
      payments = [
        ...payments,
        createMockPayment({
          id: 'pay-iade-80',
          type: 'IADE',
          status: 'GECERLI',
          method,
          amount,
          reversalOfId: 'pay-200',
          reason: 'Fazla ödeme iadesi',
        }),
      ]
    })

    act(() => {
      root!.render(
        <PaymentModal
          cart={[activeItem, refundedItem]}
          discountRate={0}
          discountAmount={0}
          isOpen={true}
          note=""
          onClose={vi.fn()}
          onNewOrder={vi.fn()}
          onPaid={vi.fn()}
          onAddPayment={vi.fn()}
          onRefundOverpayment={onRefundOverpayment}
          orderNumber="Masa 3"
          paidMethod={null}
          payments={payments}
          settings={DEFAULT_SETTINGS}
          totals={totals}
          currentSession={mockAdminSession}
        />,
      )
    })

    const banner = rootContainer!.querySelector('[data-testid="overpayment-banner"]')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('Fazla Ödeme / İade Edilecek: ₺80,00')

    const confirmOverpaymentBtn = rootContainer!.querySelector(
      '[data-testid="confirm-overpayment-refund-btn"]',
    ) as HTMLButtonElement
    expect(confirmOverpaymentBtn).not.toBeNull()

    act(() => {
      confirmOverpaymentBtn.click()
    })

    expect(onRefundOverpayment).toHaveBeenCalledWith('cash', 80)
    expect(payments).toHaveLength(2)
    expect(payments[1].type).toBe('IADE')
    expect(payments[1].amount).toBe(80)

    const afterRefundState = derivePaymentState(totals.total, payments)
    expect(afterRefundState.paidTotal).toBe(120)
    expect(afterRefundState.remaining).toBe(0)
    expect(afterRefundState.overpayment).toBe(0)
  })

  // Senaryo 7 — Çift düşüm testi
  it('Senaryo 7 (Çift düşüm testi): Açık masada kısmi ödeme sonrası kalem iadesi yapıp masayı kapatınca iade tutarı raporda yalnızca bir kez düşülür', () => {
    const day = createMockBusinessDay({ id: 'day-s7', status: 'open' })
    const odeme200 = createMockPayment({
      id: 'pay-s7-1',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'cash',
      amount: 200,
      businessDayId: day.id,
      tableId: 'table-s7',
    })
    const iade120 = createMockPayment({
      id: 'pay-s7-iade',
      type: 'IADE',
      status: 'GECERLI',
      method: 'cash',
      amount: 120,
      reversalOfId: odeme200.id,
      businessDayId: day.id,
      tableId: 'table-s7',
    })
    const odeme40 = createMockPayment({
      id: 'pay-s7-2',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'cash',
      amount: 40,
      businessDayId: day.id,
      tableId: 'table-s7',
    })

    // Masa kapandığında: 200 - 120 + 40 = ₺120 net tahsilat
    const closedOrder = createMockOrder({
      id: 'order-s7',
      businessDayId: day.id,
      tableId: 'table-s7',
      tableName: 'Masa 7',
      totals: { subtotal: 120, discount: 0, total: 120 },
      paymentMethod: 'cash',
      payments: [odeme200, iade120, odeme40],
    })

    // Aynı iade için oluşturulmuş Refund kaydı (paymentReceived: true)
    const refundRecord: Refund = createMockRefund({
      id: 'ref-s7',
      businessDayId: day.id,
      tableId: 'table-s7',
      tableName: 'Masa 7',
      amount: 120,
      paymentMethod: 'cash',
      paymentReceived: true,
      paymentMovementId: iade120.id,
    })

    const report = buildReportFromOrders([closedOrder], 10, [], day.id, [refundRecord])
    // Eğer çift düşüm olsaydı 120 - 120 = 0 çıkardı. Tek düşümle tam ₺120 olmalı!
    expect(report.paymentDistribution.cash).toBe(120)
    expect(report.paidTablesTotal).toBe(120)
    expect(report.totalRevenue).toBe(120)
    expect(report.paidRefundsTotal).toBe(120)
  })

  // Senaryo 8 — Kart iadesi testi
  it('Senaryo 8 (Kart iadesi testi): ₺300 kart tahsilat + ₺100 kart iade → Beklenen Z = ₺200, Kart toplamı = ₺200', () => {
    const day = createMockBusinessDay({ id: 'day-s8', status: 'open' })
    const odeme300Card = createMockPayment({
      id: 'pay-card-300',
      type: 'ODEME',
      status: 'GECERLI',
      method: 'card',
      amount: 300,
      businessDayId: day.id,
      tableId: 'table-s8',
    })
    const iade100Card = createMockPayment({
      id: 'pay-card-iade-100',
      type: 'IADE',
      status: 'GECERLI',
      method: 'card',
      amount: 100,
      reversalOfId: odeme300Card.id,
      businessDayId: day.id,
      tableId: 'table-s8',
    })

    const order = createMockOrder({
      id: 'order-s8',
      businessDayId: day.id,
      tableId: 'table-s8',
      totals: { subtotal: 200, discount: 0, total: 200 },
      paymentMethod: 'card',
      payments: [odeme300Card, iade100Card],
    })

    const cardRefund: Refund = createMockRefund({
      id: 'ref-card-100',
      businessDayId: day.id,
      tableId: 'table-s8',
      amount: 100,
      paymentMethod: 'card',
      paymentReceived: true,
      paymentMovementId: iade100Card.id,
    })

    const zBreakdown = calculateDayCardBreakdown(day, [order], [], '23:57', [cardRefund])
    expect(zBreakdown.totalCard).toBe(200)
    expect(zBreakdown.expectedZ).toBe(200)

    const report = buildReportFromOrders([order], 10, [], day.id, [cardRefund])
    expect(report.paymentDistribution.card).toBe(200)
  })

  // Senaryo 9 — Eski veri testi
  it('Senaryo 9 (Eski veri testi): type ve status alanı olmayan eski ödeme kayıtları ODEME + GECERLI olarak okunmaya devam eder', () => {
    const legacyPayment: PartialPayment = {
      id: 'legacy-pay-1',
      method: 'cash',
      amount: 175,
      createdAt: new Date().toISOString(),
      // type ve status tanımsız
    }

    expect(isValidPaymentMovement(legacyPayment)).toBe(true)

    const state = derivePaymentState(200, [legacyPayment])
    expect(state.paidTotal).toBe(175)
    expect(state.remaining).toBe(25)
    expect(state.overpayment).toBe(0)

    const validatedTable = validateTable({
      id: 't-legacy',
      name: 'Masa Eski',
      status: 'occupied',
      cart: [],
      payments: [legacyPayment],
    })
    expect(validatedTable?.payments?.[0].type).toBe('ODEME')
    expect(validatedTable?.payments?.[0].status).toBe('GECERLI')

    const validatedOrder = validateCompletedOrder({
      id: 'ord-legacy',
      orderNumber: '101',
      items: [],
      totals: { subtotal: 175, discount: 0, total: 175 },
      paymentMethod: 'cash',
      payments: [legacyPayment],
    })
    expect(validatedOrder?.payments?.[0].type).toBe('ODEME')
    expect(validatedOrder?.payments?.[0].status).toBe('GECERLI')

    const validatedRef = validateRefund({
      id: 'ref-legacy',
      amount: 50,
      paymentMethod: 'cash',
      paymentReceived: true,
      paymentMovementId: 'iade-mov-1',
      reason: 'İade',
    })
    expect(validatedRef?.paymentMovementId).toBe('iade-mov-1')
  })

  // Adım E — Mevcut verideki olası tutarsızlıkları tespit testi (veriyi otomatik değiştirmeden)
  it('Adım E: detectPaymentAndRefundInconsistencies eski HATA 2.1/2.2/2.3 kaynaklı tutarsızlıkları veriyi bozmadan raporlar', () => {
    const legacyTable = createMockTable({
      id: 't-inc-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [createMockCartItem({ price: 120, quantity: 1 })],
      payments: [
        // Eski kırpılmış ödeme: logda 200 TL iken masada 120 TL'ye kırpılmış
        {
          id: 'p-trimmed',
          method: 'cash',
          amount: 120,
          createdAt: new Date().toISOString(),
        },
      ],
    })

    const buggyRefund: Refund = {
      id: 'ref-bug-22',
      tableId: 't-inc-1',
      tableName: 'Masa 1',
      amount: 120,
      paymentMethod: 'cash',
      paymentReceived: false, // HATA 2.2: ödeme alındığı halde false yazılmış
      reason: 'Müşteri Vazgeçti',
    }

    const report = detectPaymentAndRefundInconsistencies({
      tables: [legacyTable],
      completedOrders: [],
      refunds: [buggyRefund],
      activityLogs: [
        {
          id: 'log-1',
          type: 'payment',
          tableId: 't-inc-1',
          tableName: 'Masa 1',
          amount: 200,
          userName: 'Kasiyer',
          createdAt: new Date().toISOString(),
          details: 'CASH ile ₺200,00 ara ödeme alındı',
        },
      ],
    })

    expect(report.totalIssues).toBeGreaterThanOrEqual(3)
    expect(report.issues.map((i) => i.code)).toContain('legacy_payment_missing_type_or_status')
    expect(report.issues.map((i) => i.code)).toContain('paid_refund_marked_unreceived')
    expect(report.issues.map((i) => i.code)).toContain('payment_trimmed_or_deleted_vs_logs')

    // Orijinal girdi verisi hiçbir şekilde değiştirilmemiştir
    expect(legacyTable.payments![0].amount).toBe(120)
    expect(legacyTable.payments![0].type).toBeUndefined()
    expect(buggyRefund.paymentReceived).toBe(false)
  })
})
