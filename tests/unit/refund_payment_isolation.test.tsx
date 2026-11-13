import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PaymentModal } from '../../src/components/PaymentModal'
import { ReceiptPreview } from '../../src/components/ReceiptPreview'
import { DEFAULT_SETTINGS } from '../../src/types/settings'
import {
  calculateTotals,
  deriveLinePaymentStates,
  mergeTablesOrder,
  splitTableOrder,
} from '../../src/lib/format'
import {
  buildReportFromOrders,
  getOrderItemNetRevenues,
} from '../../src/lib/businessDay'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockTable,
} from '../fixtures/factories'
import type { Session } from '../../src/types'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockAdminSession: Session = {
  userId: 'admin-1',
  username: 'admin',
  fullName: 'Admin',
  role: 'admin',
  loginAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
}

describe('Refunded items do not create phantom discounts or corrupt payments', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null

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
      rootContainer = null
    }
  })

  it('deriveLinePaymentStates excludes refunded items and preserves exact unit/line prices without phantom discount', () => {
    const activeItem = createMockCartItem({
      cartItemId: 'active-fw',
      name: 'Flat White',
      price: 140,
      quantity: 2,
      status: 'active',
    })
    const refundedItem = createMockCartItem({
      cartItemId: 'refunded-fw',
      name: 'Flat White',
      price: 140,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
      refundReason: 'Müşteri Vazgeçti',
    })

    const lineStates = deriveLinePaymentStates([activeItem, refundedItem], 0, [], 0)
    expect(lineStates).toHaveLength(1)
    expect(lineStates[0].cartItemId).toBe('active-fw')
    expect(lineStates[0].unitGrossPrice).toBe(140)
    expect(lineStates[0].unitNetPrice).toBe(140)
    expect(lineStates[0].lineGrossTotal).toBe(280)
    expect(lineStates[0].lineNetTotal).toBe(280)
    expect(lineStates[0].unpaidLineAmount).toBe(280)
    expect(lineStates[0].unpaidQty).toBe(2)

    // With a genuine 10% discount, the 10% applies strictly to active items (280 -> 252)
    const discountedStates = deriveLinePaymentStates([activeItem, refundedItem], 0.1, [], 0)
    expect(discountedStates).toHaveLength(1)
    expect(discountedStates[0].lineGrossTotal).toBe(280)
    expect(discountedStates[0].lineNetTotal).toBe(252)
    expect(discountedStates[0].unitNetPrice).toBe(126)
  })

  it('PaymentModal hides refunded items, does not show İndirimli badge, and pays full remaining price per item', () => {
    vi.useFakeTimers()
    try {
      const activeItem = createMockCartItem({
        cartItemId: 'active-fw',
        name: 'Flat White',
        price: 140,
        quantity: 2,
        status: 'active',
      })
      const refundedItem = createMockCartItem({
        cartItemId: 'refunded-fw',
        name: 'Flat White',
        price: 140,
        quantity: 1,
        status: 'refunded',
        refundedQty: 1,
        refundReason: 'Müşteri Vazgeçti',
      })
      const cart = [activeItem, refundedItem]
      const totals = calculateTotals(cart, 0, 0)
      const onAddPayment = vi.fn()

      act(() => {
        root!.render(
          <PaymentModal
            cart={cart}
            discountRate={0}
            discountAmount={0}
            isOpen={true}
            note=""
            onClose={vi.fn()}
            onNewOrder={vi.fn()}
            onPaid={vi.fn()}
            onAddPayment={onAddPayment}
            orderNumber="Masa 2"
            paidMethod={null}
            payments={[]}
            settings={DEFAULT_SETTINGS}
            totals={totals}
            currentSession={mockAdminSession}
          />,
        )
      })

      expect(rootContainer!.querySelector('.payment-items-count')?.textContent?.trim()).toBe('2 adet')
      const itemRows = rootContainer!.querySelectorAll('.payment-item-row')
      expect(itemRows).toHaveLength(1)
      expect(rootContainer!.querySelector('.payment-item-discount-pill')).toBeNull()
      expect(rootContainer!.querySelector('.payment-item-gross-strike')).toBeNull()
      expect(rootContainer!.querySelector('.payment-item-total')?.textContent?.trim()).toBe('₺280,00')

      // Select 1 active item -> should charge ₺140,00 (not ₺93,34)
      act(() => {
        ;(itemRows[0] as HTMLElement).click()
      })
      const confirmBtn = rootContainer!.querySelector('button.confirm-pay') as HTMLButtonElement
      expect(confirmBtn.textContent?.trim()).toBe('Seçili Ürünleri Öde (₺140,00)')

      // Select all unpaid -> should charge ₺280,00 for the 2 active units only
      const selectAllBtn = Array.from(rootContainer!.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Tümünü Seç',
      )!
      act(() => {
        selectAllBtn.click()
      })
      expect(confirmBtn.textContent?.trim()).toBe('Seçili Ürünleri Öde (₺280,00)')

      act(() => {
        confirmBtn.click()
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(onAddPayment).toHaveBeenCalledTimes(1)
      expect(onAddPayment.mock.calls[0][0].amount).toBe(280)
      expect(onAddPayment.mock.calls[0][0].items).toEqual([
        { lineId: 'active-fw', quantity: 2, amount: 280 },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ReceiptPreview omits refunded items and only lists active items matching totals', () => {
    const activeItem = createMockCartItem({
      cartItemId: 'active-fw',
      name: 'Flat White',
      price: 140,
      quantity: 2,
      status: 'active',
    })
    const refundedItem = createMockCartItem({
      cartItemId: 'refunded-fw',
      name: 'Cortado',
      price: 130,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
    })
    const cart = [activeItem, refundedItem]
    const totals = calculateTotals(cart, 0, 0)

    act(() => {
      root!.render(
        <ReceiptPreview
          cart={cart}
          discountRate={0}
          note=""
          orderNumber="Masa 2"
          paymentMethod="cash"
          totals={totals}
        />,
      )
    })

    const text = rootContainer!.textContent || ''
    expect(text).toContain('2 × Flat White')
    expect(text).not.toContain('Cortado')
  })

  it('splitTableOrder blocks splitting refunded items, clears source table when all active items move, and mergeTablesOrder does not merge active items into refunded rows', () => {
    const active = createMockCartItem({
      cartItemId: 'act-1',
      id: 'prod-fw',
      name: 'Flat White',
      price: 140,
      quantity: 2,
      status: 'active',
    })
    const refunded = createMockCartItem({
      cartItemId: 'ref-1',
      id: 'prod-fw',
      name: 'Flat White',
      price: 140,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
    })
    const table1 = createMockTable({ id: 't1', name: 'Masa 1', status: 'occupied', cart: [active, refunded] })
    const table2 = createMockTable({ id: 't2', name: 'Masa 2', status: 'empty', cart: [] })

    // Attempting to split refunded item is rejected (state unchanged)
    const blocked = splitTableOrder([table1, table2], 't1', 't2', [{ cartItemId: 'ref-1', quantity: 1 }])
    expect(blocked[0].cart).toHaveLength(2)
    expect(blocked[1].cart).toHaveLength(0)

    // Splitting all active items empties source table cleanly
    const split = splitTableOrder([table1, table2], 't1', 't2', [{ cartItemId: 'act-1', quantity: 2 }])
    expect(split[0].status).toBe('empty')
    expect(split[0].cart).toHaveLength(0)
    expect(split[1].status).toBe('occupied')
    expect(split[1].cart).toHaveLength(1)
    expect(split[1].cart[0].quantity).toBe(2)

    // Merging active table into a table that has a refunded line of the same product keeps them separate
    const tableMainWithRefund = createMockTable({
      id: 'm1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [
        createMockCartItem({ id: 'prod-fw', name: 'Flat White', price: 140, quantity: 1, status: 'active' }),
        refunded,
      ],
    })
    const tableSourceActive = createMockTable({
      id: 'm2',
      name: 'Masa 2',
      status: 'occupied',
      cart: [
        createMockCartItem({ id: 'prod-fw', name: 'Flat White', price: 140, quantity: 1, status: 'active' }),
      ],
    })
    const merged = mergeTablesOrder([tableMainWithRefund, tableSourceActive], 'm1', 'm2')
    const mainCart = merged.find((t) => t.id === 'm1')!.cart
    const activeLines = mainCart.filter((i) => i.status !== 'refunded')
    const refundedLines = mainCart.filter((i) => i.status === 'refunded')
    expect(activeLines).toHaveLength(1)
    expect(activeLines[0].quantity).toBe(2)
    expect(refundedLines).toHaveLength(1)
    expect(refundedLines[0].quantity).toBe(1)
  })

  it('getOrderItemNetRevenues and buildReportFromOrders attribute 100% of collected revenue to active items when refunded items exist in order.items', () => {
    const day = createMockBusinessDay({ id: 'day-1' })
    const active = createMockCartItem({
      id: 'fw',
      name: 'Flat White',
      category: 'Sıcak Kahveler',
      price: 140,
      quantity: 2,
      status: 'active',
    })
    const refunded = createMockCartItem({
      id: 'fw',
      name: 'Flat White',
      category: 'Sıcak Kahveler',
      price: 140,
      quantity: 1,
      status: 'refunded',
      refundedQty: 1,
    })

    const lineNets = getOrderItemNetRevenues([active, refunded], 280)
    expect(lineNets).toEqual([280, 0])

    const order = createMockOrder({
      businessDayId: day.id,
      items: [active, refunded],
      totals: { subtotal: 280, discount: 0, total: 280 },
      payments: [createMockPayment({ method: 'cash', amount: 280, businessDayId: day.id })],
    })

    const report = buildReportFromOrders([order], 10, undefined, day.id)
    expect(report.totalRevenue).toBe(280)
    expect(report.soldProducts).toHaveLength(1)
    expect(report.soldProducts[0].quantity).toBe(2)
    expect(report.soldProducts[0].revenue).toBe(280)
    expect(report.categorySales).toHaveLength(1)
    expect(report.categorySales[0].revenue).toBe(280)
  })
})
