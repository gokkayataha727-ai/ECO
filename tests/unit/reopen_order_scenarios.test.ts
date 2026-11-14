import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildReportFromOrders,
  calculateDayCardBreakdown,
  executeOrderReopen,
  formatReopenCancellationNotice,
  getOrderPaymentBreakdownSummary,
  getReportForBusinessDay,
  healCorruptedReopenedData,
  hesaplaGunToplamlari,
} from '../../src/lib/businessDay'
import {
  calculateTotals,
  deriveLinePaymentStates,
  derivePaymentState,
  formatCurrency,
  hesaplaAdisyonBakiye,
  isTableOccupied,
  roundCurrency,
} from '../../src/lib/format'
import {
  clearInMemoryCache,
  getCompletedOrdersSafe,
  getTablesSafe,
  saveBusinessDaysSafe,
  saveCompletedOrdersSafe,
  saveTablesSafe,
} from '../../src/lib/storage'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockSettings,
  createMockTable,
  createMockUser,
} from '../fixtures/factories'
import type { CompletedOrder, Table, User } from '../../src/types'

describe('Kapalı Adisyonu Geri Aç — Tek ve Doğru Davranış (15 Zorunlu Senaryo)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearInMemoryCache()
  })

  // Senaryo 1 — Basit geri açma (kullanıcının yaşadığı hata)
  it('Senaryo 1: 360 TL Nakit kapanan Masa 1 geri açıldığında Nakit=0, Ödenen=0, Kalan=360 TL olur ve asla -₺360,00 görünmez', () => {
    const day = createMockBusinessDay({ id: 'day-1', status: 'open', openingCash: 500 })
    const item1 = createMockCartItem({
      cartItemId: 'line-tk',
      name: 'Türk Kahvesi',
      category: 'Sıcak Kahveler',
      price: 80,
      quantity: 1,
    })
    const item2 = createMockCartItem({
      cartItemId: 'line-fw',
      name: 'Flat White',
      category: 'Sıcak Kahveler',
      price: 140,
      quantity: 2,
    })
    const totals = calculateTotals([item1, item2], 0)
    expect(totals.total).toBe(360)

    const masa1 = createMockTable({
      id: 'table-1',
      name: 'Masa 1',
      status: 'empty',
      cart: [],
      payments: [],
    })

    const closedOrder = createMockOrder({
      id: 'order-360',
      orderNumber: 'MASA-1-001',
      tableId: masa1.id,
      tableName: masa1.name,
      businessDayId: day.id,
      items: [item1, item2],
      totals,
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'pay-360-cash',
          method: 'cash',
          amount: 360,
          businessDayId: day.id,
        }),
      ],
    })

    // 1. Geri açmadan önce rapor kontrolü: Nakit 360 TL, Ödenen Masalar 360 TL, Sipariş 1
    const reportBefore = hesaplaGunToplamlari([closedOrder], 10, [masa1], day.id, [])
    expect(reportBefore.paymentDistribution.cash).toBe(360)
    expect(reportBefore.paidTablesTotal).toBe(360)
    expect(reportBefore.orderCount).toBe(1)

    // Sabit bilgi kutusu metni kontrolü (Tek yöntem)
    expect(formatReopenCancellationNotice(closedOrder)).toBe(
      'Alınan ödeme (₺360,00 · Nakit) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak.',
    )

    // 2. Adisyonu Masa 1'e geri aç (sebep: "Müşteri ek sipariş istedi")
    const reopenRes = executeOrderReopen({
      orderId: closedOrder.id,
      targetTableId: masa1.id,
      reason: 'Müşteri ek sipariş istedi',
      completedOrders: [closedOrder],
      tables: [masa1],
      openBusinessDay: day,
      userName: 'Yönetici',
    })

    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    // Rapor kontrolü: Nakit 0 TL, Ödenen Masalar 0 TL, Sipariş 0
    const reportAfter = hesaplaGunToplamlari(
      reopenRes.updatedOrders,
      10,
      reopenRes.updatedTables,
      day.id,
      [],
    )
    expect(reportAfter.paymentDistribution.cash).toBe(0)
    expect(reportAfter.paidTablesTotal).toBe(0)
    expect(reportAfter.orderCount).toBe(0)
    expect(reportAfter.openTablePaymentsTotal).toBe(0)
    expect(reportAfter.openTablesUnpaidBalance).toBe(360)

    // Masa 1 dolu görünür ve bakiye: Ödenen = 0,00 TL, Kalan Tutar = 360,00 TL
    const reopenedTable = reopenRes.reopenedTable
    expect(isTableOccupied(reopenedTable)).toBe(true)
    expect(reopenedTable.cart).toHaveLength(2)

    const bakiye = hesaplaAdisyonBakiye(reopenedTable)
    expect(bakiye.odenen).toBe(0)
    expect(bakiye.kalan).toBe(360)
    expect(bakiye.fazlaOdeme).toBe(0)
    expect(bakiye.durum).toBe('ACIK')
    expect(formatCurrency(bakiye.odenen)).toBe('₺0,00')
    expect(formatCurrency(bakiye.kalan)).toBe('₺360,00')

    // Satır bazlı ödeme durumları da tamamen 'unpaid' olmalı (yeniden tahsil edilebilir)
    const lineStates = deriveLinePaymentStates(
      reopenedTable.cart,
      reopenedTable.discountRate || 0,
      reopenedTable.payments,
      reopenedTable.discountAmount || 0,
    )
    expect(lineStates.every((l) => l.status === 'unpaid' && l.unpaidQty === l.item.quantity)).toBe(
      true,
    )

    // Ödeme kaydı silinmez, IPTAL olarak işaretlenir
    expect(reopenRes.reopenedOrder.payments).toHaveLength(1)
    expect(reopenRes.reopenedOrder.payments?.[0].status).toBe('IPTAL')
    expect(reopenRes.reopenedOrder.payments?.[0].cancelledReason).toBe('Müşteri ek sipariş istedi')
    expect(reopenRes.reopenedOrder.payments?.[0].cancelledBy).toBe('Yönetici')
  })

  // Senaryo 2 — Geri aç, ürün ekle, yeniden öde
  it('Senaryo 2: Geri açılan 360 TL masaya 200 TL Cheesecake eklenip 560 TL Kart ile ödendiğinde Nakit=0, Kart=560, Sipariş=1 olur', () => {
    const day = createMockBusinessDay({ id: 'day-2', status: 'open', openingCash: 500 })
    const item1 = createMockCartItem({ name: 'Türk Kahvesi', price: 80, quantity: 1 })
    const item2 = createMockCartItem({ name: 'Flat White', price: 140, quantity: 2 })
    const masa1 = createMockTable({ id: 'table-1', name: 'Masa 1', status: 'empty', cart: [] })

    const closedOrder = createMockOrder({
      id: 'order-s2-1',
      tableId: masa1.id,
      tableName: masa1.name,
      businessDayId: day.id,
      items: [item1, item2],
      totals: calculateTotals([item1, item2], 0),
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 360, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: closedOrder.id,
      targetTableId: masa1.id,
      reason: 'Müşteri ek sipariş istedi',
      completedOrders: [closedOrder],
      tables: [masa1],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    // 1x Cheesecake (200 TL) ekle -> Toplam 560 TL, Ödenen 0 TL, Kalan 560 TL
    const cheesecake = createMockCartItem({ name: 'Cheesecake', price: 200, quantity: 1 })
    const updatedCart = [...reopenRes.reopenedTable.cart, cheesecake]
    const updatedTable: Table = { ...reopenRes.reopenedTable, cart: updatedCart }

    const bakiye = hesaplaAdisyonBakiye(updatedTable)
    expect(bakiye.genelToplam).toBe(560)
    expect(bakiye.odenen).toBe(0)
    expect(bakiye.kalan).toBe(560)

    // 560 TL Kredi Kartı ile öde ve kapat
    const recompletedOrder = createMockOrder({
      id: 'order-s2-2',
      tableId: masa1.id,
      tableName: masa1.name,
      businessDayId: day.id,
      items: updatedCart,
      totals: calculateTotals(updatedCart, 0),
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 560, businessDayId: day.id })],
    })

    const allOrders = [recompletedOrder, ...reopenRes.updatedOrders]
    const report = hesaplaGunToplamlari(allOrders, 10, [masa1], day.id, [])

    expect(report.paymentDistribution.cash).toBe(0)
    expect(report.paymentDistribution.card).toBe(560)
    expect(report.paidTablesTotal).toBe(560)
    expect(report.totalRevenue).toBe(560)
    expect(report.orderCount).toBe(1) // 2 değil!
  })

  // Senaryo 3 — Ödeme yöntemini değiştirme (Nakit -> Kart)
  it('Senaryo 3: 500 TL Nakit kapanan adisyon geri açılıp Kart ile ödendiğinde Beklenen Kasa Nakit düşer, POS Z artar', () => {
    const day = createMockBusinessDay({ id: 'day-3', status: 'open', openingCash: 1000 })
    const item = createMockCartItem({ name: 'Filtre Kahve', price: 250, quantity: 2 }) // 500 TL
    const masa = createMockTable({ id: 'table-3', name: 'Masa 3', status: 'empty', cart: [] })

    const cashOrder = createMockOrder({
      id: 'order-s3-cash',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 500, businessDayId: day.id })],
    })

    // Geri açmadan önce Beklenen Kasa Nakit = 1000 + 500 = 1500, POS Z = 0
    const reportBefore = getReportForBusinessDay(day, [cashOrder], 10, [masa], [])
    expect(roundCurrency(day.openingCash + reportBefore.paymentDistribution.cash)).toBe(1500)
    expect(reportBefore.expectedZ).toBe(0)

    // Geri aç
    const reopenRes = executeOrderReopen({
      orderId: cashOrder.id,
      targetTableId: masa.id,
      reason: 'Ödeme yöntemi kart olarak değiştirilecek',
      completedOrders: [cashOrder],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    // Kart ile 500 TL öde ve kapat
    const cardOrder = createMockOrder({
      id: 'order-s3-card',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: reopenRes.reopenedTable.cart,
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 500, businessDayId: day.id })],
    })

    const finalOrders = [cardOrder, ...reopenRes.updatedOrders]
    const reportAfter = getReportForBusinessDay(day, finalOrders, 10, [masa], [])

    expect(reportAfter.paymentDistribution.cash).toBe(0)
    expect(reportAfter.paymentDistribution.card).toBe(500)
    expect(roundCurrency(day.openingCash + reportAfter.paymentDistribution.cash)).toBe(1000)
    expect(reportAfter.expectedZ).toBe(500)
    expect(reportAfter.totalRevenue).toBe(500)
    expect(reportAfter.orderCount).toBe(1)
  })

  // Senaryo 4 — Parçalı (karma) ödemeli adisyonu geri açma
  it('Senaryo 4: 200 TL Nakit + 320 TL Kart parçalı ödemeli adisyon geri açıldığında her yöntem kendi kaleminden düşer, IBAN ile ödenince sadece IBAN 520 TL olur', () => {
    const day = createMockBusinessDay({ id: 'day-4', status: 'open', openingCash: 500 })
    const item = createMockCartItem({ name: 'Serpme Kahvaltı', price: 520, quantity: 1 })
    const masa = createMockTable({ id: 'table-4', name: 'Masa 4', status: 'empty', cart: [] })

    const mixedOrder = createMockOrder({
      id: 'order-s4-mixed',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 520, discount: 0, total: 520 },
      paymentMethod: 'mixed',
      payments: [
        createMockPayment({ id: 'p-cash-200', method: 'cash', amount: 200, businessDayId: day.id }),
        createMockPayment({ id: 'p-card-320', method: 'card', amount: 320, businessDayId: day.id }),
      ],
    })

    // Parçalı ödeme sabit bilgi kutusu metni kontrolü
    expect(formatReopenCancellationNotice(mixedOrder)).toBe(
      'Alınan ödeme (₺200,00 Nakit + ₺320,00 Kart) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak.',
    )

    const reportBefore = hesaplaGunToplamlari([mixedOrder], 10, [masa], day.id, [])
    expect(reportBefore.paymentDistribution).toEqual({ cash: 200, card: 320, iban: 0 })
    expect(reportBefore.paidTablesTotal).toBe(520)

    // Geri aç
    const reopenRes = executeOrderReopen({
      orderId: mixedOrder.id,
      targetTableId: masa.id,
      reason: 'Parçalı ödeme iptal edilip IBAN yapılacak',
      completedOrders: [mixedOrder],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    // Her iki ödeme parçası da IPTAL durumuna geçti
    expect(reopenRes.reopenedOrder.payments?.every((p) => p.status === 'IPTAL')).toBe(true)

    const reportDuringOpen = hesaplaGunToplamlari(
      reopenRes.updatedOrders,
      10,
      reopenRes.updatedTables,
      day.id,
      [],
    )
    expect(reportDuringOpen.paymentDistribution).toEqual({ cash: 0, card: 0, iban: 0 })
    expect(reportDuringOpen.paidTablesTotal).toBe(0)

    const bakiye = hesaplaAdisyonBakiye(reopenRes.reopenedTable)
    expect(bakiye.odenen).toBe(0)
    expect(bakiye.kalan).toBe(520)

    // Tamamını IBAN ile 520 TL öde
    const ibanOrder = createMockOrder({
      id: 'order-s4-iban',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: reopenRes.reopenedTable.cart,
      totals: { subtotal: 520, discount: 0, total: 520 },
      paymentMethod: 'iban',
      payments: [createMockPayment({ method: 'iban', amount: 520, businessDayId: day.id })],
    })

    const reportAfter = hesaplaGunToplamlari(
      [ibanOrder, ...reopenRes.updatedOrders],
      10,
      [masa],
      day.id,
      [],
    )
    expect(reportAfter.paymentDistribution).toEqual({ cash: 0, card: 0, iban: 520 })
    expect(reportAfter.paidTablesTotal).toBe(520)
    expect(reportAfter.orderCount).toBe(1)
  })

  // Senaryo 5 — Geri aç, ürün çıkar/azalt, yeniden öde
  it('Senaryo 5: 360 TL kapanan adisyon geri açılıp 80 TL ürün çıkarılıp 280 TL Nakit ödendiğinde Ciro=280 TL ve kategori satışları güncellenir', () => {
    const day = createMockBusinessDay({ id: 'day-5', status: 'open' })
    const item1 = createMockCartItem({
      id: 'prod-tk',
      name: 'Türk Kahvesi',
      category: 'Türk Kahveleri',
      price: 80,
      quantity: 1,
    })
    const item2 = createMockCartItem({
      id: 'prod-fw',
      name: 'Flat White',
      category: 'Espressolar',
      price: 140,
      quantity: 2,
    })
    const masa = createMockTable({ id: 'table-5', name: 'Masa 5', status: 'empty', cart: [] })

    const initialOrder = createMockOrder({
      id: 'order-s5-1',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [item1, item2],
      totals: calculateTotals([item1, item2], 0),
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 360, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: initialOrder.id,
      targetTableId: masa.id,
      reason: 'Yanlış ürün düşülecek',
      completedOrders: [initialOrder],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    // 80 TL'lik Türk Kahvesi çıkarıldı -> Kalan 280 TL
    const reducedCart = reopenRes.reopenedTable.cart.filter((i) => i.id !== 'prod-tk')
    const reducedTotals = calculateTotals(reducedCart, 0)
    expect(reducedTotals.total).toBe(280)

    const finalOrder = createMockOrder({
      id: 'order-s5-2',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: reducedCart,
      totals: reducedTotals,
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 280, businessDayId: day.id })],
    })

    const report = hesaplaGunToplamlari(
      [finalOrder, ...reopenRes.updatedOrders],
      10,
      [masa],
      day.id,
      [],
    )
    expect(report.paymentDistribution.cash).toBe(280)
    expect(report.totalRevenue).toBe(280)
    expect(report.categorySales).toEqual([
      { category: 'Espressolar', quantity: 2, revenue: 280, share: 100 },
    ])
  })

  // Senaryo 6 — Geri aç, indirim uygula, yeniden öde
  it('Senaryo 6: 500 TL kapanan adisyon geri açılıp 50 TL indirim uygulanıp 450 TL Kart ödendiğinde Brüt=500, İndirim=50, Kart=450 olur', () => {
    const day = createMockBusinessDay({ id: 'day-6', status: 'open' })
    const item = createMockCartItem({ name: 'V60', price: 250, quantity: 2 }) // 500 TL
    const masa = createMockTable({ id: 'table-6', name: 'Masa 6', status: 'empty', cart: [] })

    const initialOrder = createMockOrder({
      id: 'order-s6-1',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 500, discount: 0, total: 500 },
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 500, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: initialOrder.id,
      targetTableId: masa.id,
      reason: 'İndirim uygulanacak',
      completedOrders: [initialOrder],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    const discountedTotals = calculateTotals(reopenRes.reopenedTable.cart, 0, 50)
    expect(discountedTotals).toEqual({ subtotal: 500, discount: 50, total: 450 })

    const finalOrder = createMockOrder({
      id: 'order-s6-2',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: reopenRes.reopenedTable.cart,
      totals: discountedTotals,
      discountRate: 0,
      discountAmount: 50,
      paymentMethod: 'card',
      payments: [createMockPayment({ method: 'card', amount: 450, businessDayId: day.id })],
    })

    const report = hesaplaGunToplamlari(
      [finalOrder, ...reopenRes.updatedOrders],
      10,
      [masa],
      day.id,
      [],
    )
    expect(report.closedTablesGrossRevenue).toBe(500)
    expect(report.totalDiscount).toBe(50)
    expect(report.paymentDistribution.card).toBe(450)
    expect(report.paymentDistribution.cash).toBe(0)
    expect(report.paidTablesTotal).toBe(450)
  })

  // Senaryo 7 — Geri açıp başka boş masaya aktarma
  it('Senaryo 7: Masa 3 kapalı adisyonu Masa 7 (Boş) seçilerek geri açıldığında Masa 3 boş kalır, Masa 7 dolu açılır ve logda "Masa 3 → Masa 7" yazar', () => {
    const day = createMockBusinessDay({ id: 'day-7', status: 'open' })
    const masa3 = createMockTable({ id: 'table-3', name: 'Masa 3', status: 'empty', cart: [] })
    const masa7 = createMockTable({ id: 'table-7', name: 'Masa 7', status: 'empty', cart: [] })
    const item = createMockCartItem({ name: 'Latte', price: 180, quantity: 2 }) // 360 TL

    const orderMasa3 = createMockOrder({
      id: 'order-s7',
      orderNumber: 'MASA-3-001',
      tableId: masa3.id,
      tableName: masa3.name,
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 360, discount: 0, total: 360 },
      paymentMethod: 'cash',
      payments: [createMockPayment({ method: 'cash', amount: 360, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: orderMasa3.id,
      targetTableId: masa7.id,
      reason: 'Müşteri Masa 7ye geçti',
      completedOrders: [orderMasa3],
      tables: [masa3, masa7],
      openBusinessDay: day,
    })

    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    const updatedMasa3 = reopenRes.updatedTables.find((t) => t.id === masa3.id)!
    const updatedMasa7 = reopenRes.updatedTables.find((t) => t.id === masa7.id)!

    expect(isTableOccupied(updatedMasa3)).toBe(false)
    expect(isTableOccupied(updatedMasa7)).toBe(true)
    expect(hesaplaAdisyonBakiye(updatedMasa7).kalan).toBe(360)
    expect(reopenRes.tableMoved).toBe(true)
    expect(reopenRes.activityLogPayload.tableName).toBe('Masa 3 → Masa 7')
    expect(reopenRes.activityLogPayload.details).toContain('Masa 3 → Masa 7')
  })

  // Senaryo 8 — Dolu masaya geri açma engeli
  it('Senaryo 8: Dolu olan Masa 2 seçilerek geri açma denendiğinde işlem engellenir ve doğru uyarı mesajı döner', () => {
    const day = createMockBusinessDay({ id: 'day-8', status: 'open' })
    const masa1 = createMockTable({ id: 'table-1', name: 'Masa 1', status: 'empty', cart: [] })
    const masa2Dolu = createMockTable({
      id: 'table-2',
      name: 'Masa 2',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Çay', price: 40, quantity: 2 })],
    })

    const closedOrder = createMockOrder({
      id: 'order-s8',
      tableId: masa1.id,
      tableName: masa1.name,
      businessDayId: day.id,
      items: [createMockCartItem({ name: 'Kahve', price: 100, quantity: 1 })],
      totals: { subtotal: 100, discount: 0, total: 100 },
      payments: [createMockPayment({ method: 'cash', amount: 100, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: closedOrder.id,
      targetTableId: masa2Dolu.id,
      reason: 'Masa 2ye açmayı dene',
      completedOrders: [closedOrder],
      tables: [masa1, masa2Dolu],
      openBusinessDay: day,
    })

    expect(reopenRes.ok).toBe(false)
    if (reopenRes.ok) return
    expect(reopenRes.code).toBe('TABLE_OCCUPIED')
    expect(reopenRes.error).toBe(
      'Bu masada aktif bir adisyon var, önce onu kapatın ya da başka masa seçin',
    )
  })

  // Senaryo 9 — Aynı adisyonu art arda 2 kez geri açıp kapatma
  it('Senaryo 9: Öde -> Geri aç -> Öde -> Geri aç -> Öde döngüsünde ciro ve sipariş sayısı şişmez, tüm iptal edilen ödemeler koruma altında kalır', () => {
    const day = createMockBusinessDay({ id: 'day-9', status: 'open' })
    const masa = createMockTable({ id: 'table-9', name: 'Masa 9', status: 'empty', cart: [] })
    const item = createMockCartItem({ name: 'Americano', price: 150, quantity: 2 }) // 300 TL

    // 1. İlk ödeme (Nakit 300 TL)
    const order1 = createMockOrder({
      id: 'order-s9-1',
      orderNumber: 'MASA-9-001',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 300, discount: 0, total: 300 },
      paymentMethod: 'cash',
      payments: [createMockPayment({ id: 'pay-1', method: 'cash', amount: 300, businessDayId: day.id })],
    })

    // 1. Geri açma
    const reopen1 = executeOrderReopen({
      orderId: order1.id,
      targetTableId: masa.id,
      reason: 'Kart ile ödenecekti',
      completedOrders: [order1],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopen1.ok).toBe(true)
    if (!reopen1.ok) return

    // 2. İkinci ödeme (Kart 300 TL)
    const order2 = createMockOrder({
      id: 'order-s9-2',
      orderNumber: 'MASA-9-002',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: reopen1.reopenedTable.cart,
      totals: { subtotal: 300, discount: 0, total: 300 },
      paymentMethod: 'card',
      payments: [createMockPayment({ id: 'pay-2', method: 'card', amount: 300, businessDayId: day.id })],
    })

    // 2. Geri açma
    const reopen2 = executeOrderReopen({
      orderId: order2.id,
      targetTableId: masa.id,
      reason: 'IBAN ile ödenecek',
      completedOrders: [order2, ...reopen1.updatedOrders],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopen2.ok).toBe(true)
    if (!reopen2.ok) return

    // 3. Üçüncü ödeme (IBAN 300 TL)
    const order3 = createMockOrder({
      id: 'order-s9-3',
      orderNumber: 'MASA-9-003',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: reopen2.reopenedTable.cart,
      totals: { subtotal: 300, discount: 0, total: 300 },
      paymentMethod: 'iban',
      payments: [createMockPayment({ id: 'pay-3', method: 'iban', amount: 300, businessDayId: day.id })],
    })

    const allOrders = [order3, ...reopen2.updatedOrders]
    const report = hesaplaGunToplamlari(allOrders, 10, [masa], day.id, [])

    // Sadece son geçerli ödeme (300 TL IBAN) rapora yansır
    expect(report.totalRevenue).toBe(300)
    expect(report.paidTablesTotal).toBe(300)
    expect(report.orderCount).toBe(1)
    expect(report.paymentDistribution).toEqual({ cash: 0, card: 0, iban: 300 })

    // İlk 2 sipariş ve ödeme kayıtları silinmemiştir, IPTAL olarak durmaktadır
    expect(allOrders).toHaveLength(3)
    expect(allOrders.filter((o) => o.reopened)).toHaveLength(2)
    expect(allOrders.find((o) => o.id === 'order-s9-1')?.payments?.[0].status).toBe('IPTAL')
    expect(allOrders.find((o) => o.id === 'order-s9-2')?.payments?.[0].status).toBe('IPTAL')
    expect(allOrders.find((o) => o.id === 'order-s9-3')?.payments?.[0].status).toBe('GECERLI')
  })

  // Senaryo 10 — Geri açılmış (henüz ödenmemiş) masa varken Gün Kapatma
  it('Senaryo 10: Geri açılmış ve henüz ödenmemiş masa varken açık masa kontrolü gün kapatmayı engeller', () => {
    const day = createMockBusinessDay({ id: 'day-10', status: 'open' })
    const masa = createMockTable({ id: 'table-10', name: 'Bahçe 2', status: 'empty', cart: [] })
    const order = createMockOrder({
      id: 'order-s10',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [createMockCartItem({ name: 'Mocha', price: 190, quantity: 1 })],
      totals: { subtotal: 190, discount: 0, total: 190 },
      payments: [createMockPayment({ method: 'cash', amount: 190, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: order.id,
      targetTableId: masa.id,
      reason: 'Hesap kontrol edilecek',
      completedOrders: [order],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    const openTables = reopenRes.updatedTables.filter((t) => isTableOccupied(t))
    expect(openTables).toHaveLength(1)
    expect(openTables[0].name).toBe('Bahçe 2')
  })

  // Senaryo 11 — Kapanmış iş gününün adisyonunu geri açma engeli
  it('Senaryo 11: Kapanmış iş gününe ait adisyon geri açılamaz ve kapanmış günün Z raporu değişmez', () => {
    const closedDay = createMockBusinessDay({
      id: 'day-closed-11',
      status: 'closed',
      closedAt: new Date().toISOString(),
    })
    const newOpenDay = createMockBusinessDay({ id: 'day-open-11', status: 'open' })
    const masa = createMockTable({ id: 'table-11', name: 'Masa 11', status: 'empty', cart: [] })

    const oldOrder = createMockOrder({
      id: 'order-old-day',
      tableId: masa.id,
      businessDayId: closedDay.id,
      items: [createMockCartItem({ name: 'Espresso', price: 100, quantity: 1 })],
      totals: { subtotal: 100, discount: 0, total: 100 },
      payments: [createMockPayment({ method: 'card', amount: 100, businessDayId: closedDay.id })],
    })

    // 1. Yeni bir gün açıkken eski günün adisyonunu geri açmayı dene
    const res1 = executeOrderReopen({
      orderId: oldOrder.id,
      targetTableId: masa.id,
      reason: 'Geçmiş günü açma denemesi',
      completedOrders: [oldOrder],
      tables: [masa],
      openBusinessDay: newOpenDay,
    })
    expect(res1.ok).toBe(false)
    if (!res1.ok) {
      expect(res1.code).toBe('CLOSED_BUSINESS_DAY')
      expect(res1.error).toContain('kapanmış bir güne ait')
    }

    // 2. Hiç açık gün yokken geri açmayı dene
    const res2 = executeOrderReopen({
      orderId: oldOrder.id,
      targetTableId: masa.id,
      reason: 'Kapalı günde deneme',
      completedOrders: [oldOrder],
      tables: [masa],
      openBusinessDay: null,
    })
    expect(res2.ok).toBe(false)
    if (!res2.ok) {
      expect(res2.code).toBe('CLOSED_BUSINESS_DAY')
    }
  })

  // Senaryo 12 — Sebep alanı boşken (veya 3 karakterden kısayken) geri açma engeli
  it('Senaryo 12: Sebep alanı boş veya 3 karakterden kısa olduğunda geri açma engellenir', () => {
    const day = createMockBusinessDay({ id: 'day-12', status: 'open' })
    const masa = createMockTable({ id: 'table-12', name: 'Masa 12', status: 'empty', cart: [] })
    const order = createMockOrder({
      id: 'order-s12',
      tableId: masa.id,
      businessDayId: day.id,
      items: [createMockCartItem({ price: 100, quantity: 1 })],
      totals: { subtotal: 100, discount: 0, total: 100 },
    })

    for (const badReason of ['', '   ', 'ab', ' a ']) {
      const res = executeOrderReopen({
        orderId: order.id,
        targetTableId: masa.id,
        reason: badReason,
        completedOrders: [order],
        tables: [masa],
        openBusinessDay: day,
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.code).toBe('INVALID_REASON')
      }
    }
  })

  // Senaryo 13 — Yetkisiz kullanıcı engeli
  it('Senaryo 13: Yetkisi olmayan garson rolüyle geri açma denendiğinde işlem engellenir', () => {
    const day = createMockBusinessDay({ id: 'day-13', status: 'open' })
    const masa = createMockTable({ id: 'table-13', name: 'Masa 13', status: 'empty', cart: [] })
    const order = createMockOrder({
      id: 'order-s13',
      tableId: masa.id,
      businessDayId: day.id,
      items: [createMockCartItem({ price: 100, quantity: 1 })],
      totals: { subtotal: 100, discount: 0, total: 100 },
    })

    const waiter: User = createMockUser({
      id: 'waiter-s13',
      role: 'waiter',
      username: 'garson1',
      fullName: 'Garson Ali',
    })
    const settings = createMockSettings({ allowCashierReopen: false })

    const res = executeOrderReopen({
      orderId: order.id,
      targetTableId: masa.id,
      reason: 'Yetkisiz deneme',
      completedOrders: [order],
      tables: [masa],
      openBusinessDay: day,
      actor: waiter,
      settings,
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('UNAUTHORIZED')
    }
  })

  // Senaryo 14 — Uygulama yeniden başlatma (kalıcılık) ve eski bozuk veriyi otomatik onarma (healing)
  it('Senaryo 14: Geri açılan adisyon yeniden başlatma sonrasında da Ödenen=0, Kalan=Tam Tutar olarak korunur; eski bozuk veriler onarılır', () => {
    const day = createMockBusinessDay({ id: 'day-14', status: 'open' })
    saveBusinessDaysSafe([day])

    const masa = createMockTable({ id: 'table-14', name: 'Masa 14', status: 'empty', cart: [] })
    const item = createMockCartItem({ name: 'Cortado', price: 160, quantity: 2 }) // 320 TL
    const order = createMockOrder({
      id: 'order-s14',
      tableId: masa.id,
      tableName: masa.name,
      businessDayId: day.id,
      items: [item],
      totals: { subtotal: 320, discount: 0, total: 320 },
      payments: [createMockPayment({ id: 'pay-s14', method: 'cash', amount: 320, businessDayId: day.id })],
    })

    const reopenRes = executeOrderReopen({
      orderId: order.id,
      targetTableId: masa.id,
      reason: 'Kalıcılık testi',
      completedOrders: [order],
      tables: [masa],
      openBusinessDay: day,
    })
    expect(reopenRes.ok).toBe(true)
    if (!reopenRes.ok) return

    saveCompletedOrdersSafe(reopenRes.updatedOrders)
    saveTablesSafe(reopenRes.updatedTables)

    // Uygulamayı kapatıp yeniden açmayı simüle et
    clearInMemoryCache()

    const reloadedTables = getTablesSafe()
    const reloadedOrders = getCompletedOrdersSafe()
    const reloadedMasa = reloadedTables.find((t) => t.id === masa.id)!

    expect(isTableOccupied(reloadedMasa)).toBe(true)
    const bakiye = hesaplaAdisyonBakiye(reloadedMasa)
    expect(bakiye.odenen).toBe(0)
    expect(bakiye.kalan).toBe(320)
    expect(reloadedOrders[0].reopened).toBe(true)
    expect(reloadedOrders[0].payments?.[0].status).toBe('IPTAL')

    // Ayrıca: Eski "Ödemeyi Koru" hatasından kalma bozuk bir masa varsa healCorruptedReopenedData onarır
    const corruptedTable: Table = {
      ...reloadedMasa,
      payments: [
        createMockPayment({ id: 'pay-s14', method: 'cash', amount: 320, businessDayId: day.id }),
      ],
    }
    const healResult = healCorruptedReopenedData([corruptedTable], reloadedOrders)
    expect(healResult.healed).toBe(true)
    expect(healResult.tables[0].payments).toEqual([])
    expect(hesaplaAdisyonBakiye(healResult.tables[0]).odenen).toBe(0)
    expect(hesaplaAdisyonBakiye(healResult.tables[0]).kalan).toBe(320)
  })

  // Senaryo 15 — Atomiklik ve Fazla Ödeme (Overpayment) değişmezi
  it('Senaryo 15: Hata durumunda hiçbir veri yarım kalmaz; kısmi ödeme sonrası indirim/iptalde Kalan asla negatif olmaz, Fazla Ödeme ayrı gösterilir', () => {
    const day = createMockBusinessDay({ id: 'day-15', status: 'open' })
    const masaDolu = createMockTable({
      id: 'table-15',
      name: 'Masa 15',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Mevcut Ürün', price: 100, quantity: 1 })],
    })
    const originalOrder = createMockOrder({
      id: 'order-s15',
      tableId: masaDolu.id,
      businessDayId: day.id,
      reopened: false,
      items: [createMockCartItem({ name: 'Eski Ürün', price: 250, quantity: 1 })],
      totals: { subtotal: 250, discount: 0, total: 250 },
      payments: [
        createMockPayment({
          id: 'pay-s15',
          method: 'cash',
          amount: 250,
          status: 'GECERLI',
          businessDayId: day.id,
        }),
      ],
    })

    const ordersSnapshot = [originalOrder]
    const tablesSnapshot = [masaDolu]

    // Dolu masaya geri açma hatasında orijinal diziler ve nesneler hiçbir şekilde mutasyona uğramaz
    const failedRes = executeOrderReopen({
      orderId: originalOrder.id,
      targetTableId: masaDolu.id,
      reason: 'Atomiklik testi',
      completedOrders: ordersSnapshot,
      tables: tablesSnapshot,
      openBusinessDay: day,
    })
    expect(failedRes.ok).toBe(false)
    expect(originalOrder.reopened).toBe(false)
    expect(originalOrder.payments?.[0].status).toBe('GECERLI')
    expect(masaDolu.cart).toHaveLength(1)

    // Değişmez 2 kontrolü: Kısmi ödeme (300 TL) alındıktan sonra indirimle Genel Toplam 220 TL'ye düşerse
    // Kalan: -80 TL gösterilmez; Kalan: 0,00 TL ve Fazla Ödeme / İade Edilecek: 80,00 TL döner
    const state = derivePaymentState(220, [
      createMockPayment({ method: 'cash', amount: 300, status: 'GECERLI' }),
    ])
    expect(state.paidTotal).toBe(300)
    expect(state.remaining).toBe(0)
    expect(state.overpayment).toBe(80)
  })
})
