import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ReopenOrderModal } from '../../src/components/ReopenOrderModal'
import { CartPanel } from '../../src/components/CartPanel'
import {
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockTable,
} from '../fixtures/factories'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ReopenOrderModal & CartPanel UI Invariants (Bölüm 0, 2, 4)', () => {
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

  it('Bölüm 0: ReopenOrderModal eski (a)/(b) ödeme seçeneklerini göstermez, tek yöntemli sabit bilgi kutusunu gösterir', () => {
    const masa1 = createMockTable({ id: 't-1', name: 'Masa 1', status: 'empty', cart: [] })
    const order = createMockOrder({
      id: 'ord-520',
      orderNumber: '101',
      tableId: 't-1',
      tableName: 'Masa 1',
      businessDayId: 'day-open-1',
      totals: { subtotal: 520, discount: 0, total: 520 },
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 520, businessDayId: 'day-open-1' })],
    })

    act(() => {
      root!.render(
        <ReopenOrderModal
          isOpen={true}
          onClose={vi.fn()}
          order={order}
          openBusinessDayId="day-open-1"
          tables={[masa1]}
          onConfirmReopen={vi.fn()}
        />,
      )
    })

    const text = rootContainer!.textContent || ''
    // Eski seçenekler kesinlikle ekranda olmamalı
    expect(text).not.toContain('Önceki Ödeme Kayıtları Nasıl İşlensin')
    expect(text).not.toContain('Ödemeyi Koru ve Üzerine Ekle')
    expect(text).not.toContain('Ödemeyi İptal Et / İade Olarak İşle')
    expect(text).not.toContain('silinir')

    // Sabit bilgi kutusu tek yöntemli ödeme metniyle görünmeli
    expect(text).toContain(
      'Alınan ödeme (₺520,00 · Nakit) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak.',
    )
  })

  it('Bölüm 0: ReopenOrderModal parçalı (karma) ödemede sabit bilgi kutusunu her yöntemin tutarıyla doldurur', () => {
    const masa1 = createMockTable({ id: 't-1', name: 'Masa 1', status: 'empty', cart: [] })
    const mixedOrder = createMockOrder({
      id: 'ord-mixed-520',
      orderNumber: '102',
      tableId: 't-1',
      tableName: 'Masa 1',
      businessDayId: 'day-open-1',
      totals: { subtotal: 520, discount: 0, total: 520 },
      paymentMethod: 'mixed',
      payments: [
        createMockPayment({ method: 'cash', amount: 200, businessDayId: 'day-open-1' }),
        createMockPayment({ method: 'card', amount: 320, businessDayId: 'day-open-1' }),
      ],
    })

    act(() => {
      root!.render(
        <ReopenOrderModal
          isOpen={true}
          onClose={vi.fn()}
          order={mixedOrder}
          openBusinessDayId="day-open-1"
          tables={[masa1]}
          onConfirmReopen={vi.fn()}
        />,
      )
    })

    const text = rootContainer!.textContent || ''
    expect(text).toContain(
      'Alınan ödeme (₺200,00 Nakit + ₺320,00 Kart) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak.',
    )
  })

  it('Bölüm 4.1: Dolu masa seçildiğinde uyarı mesajı gösterilir ve "Adisyonu Geri Aç" butonu engellenir', () => {
    const masa1Bos = createMockTable({ id: 't-1', name: 'Masa 1', status: 'empty', cart: [] })
    const masa2Dolu = createMockTable({
      id: 't-2',
      name: 'Masa 2',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Latte', price: 150, quantity: 1 })],
    })
    const order = createMockOrder({
      id: 'ord-3',
      orderNumber: '103',
      tableId: 't-2', // Orijinal masası şu an dolu
      tableName: 'Masa 2',
      businessDayId: 'day-open-1',
      totals: { subtotal: 300, discount: 0, total: 300 },
    })

    act(() => {
      root!.render(
        <ReopenOrderModal
          isOpen={true}
          onClose={vi.fn()}
          order={order}
          openBusinessDayId="day-open-1"
          tables={[masa1Bos, masa2Dolu]}
          onConfirmReopen={vi.fn()}
        />,
      )
    })

    // Dolu masa uyarısı görünür
    expect(rootContainer!.textContent).toContain(
      'Bu masada aktif bir adisyon var, önce onu kapatın ya da başka masa seçin',
    )

    const buttons = Array.from(rootContainer!.querySelectorAll('button'))
    const submitBtn = buttons.find((b) => b.textContent?.includes('Adisyonu Geri Aç'))!
    expect(submitBtn.disabled).toBe(true)
  })

  it('Bölüm 2: CartPanel "Ödenen" satırında asla negatif sayı (-₺...) göstermez; geri açılan masada Ödenen: ₺0,00 ve Kalan Tutar: ₺360,00 gösterir', () => {
    const items = [
      createMockCartItem({ name: 'Türk Kahvesi', price: 80, quantity: 1 }),
      createMockCartItem({ name: 'Flat White', price: 140, quantity: 2 }),
    ]

    act(() => {
      root!.render(
        <CartPanel
          cart={items}
          confirmClear={false}
          note=""
          customerName=""
          onClear={vi.fn()}
          onConfirmClearChange={vi.fn()}
          onNoteChange={vi.fn()}
          onCustomerNameChange={vi.fn()}
          onCompleteOrder={vi.fn()}
          onOpenPayment={vi.fn()}
          onOpenAdisyon={vi.fn()}
          orderNumber="MASA-1"
          totals={{ subtotal: 360, discount: 0, total: 360 }}
          payments={[]}
        />,
      )
    })

    const text = rootContainer!.textContent || ''
    expect(text).not.toContain('-₺360,00')
    expect(text).toContain('Ödenen')
    expect(text).toContain('₺0,00')
    expect(text).toContain('Kalan Tutar')
    expect(text).toContain('₺360,00')
  })
})
