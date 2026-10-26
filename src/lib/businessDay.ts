import type {
  BusinessDay,
  BusinessDayReportSnapshot,
  CancelledOrderSummary,
  CartItem,
  CategorySalesItem,
  CompletedOrder,
  HourlySalesItem,
  SelectedOption,
  SoldProductOptionBreakdown,
  SoldProductReportItem,
  Table,
} from '../types'
import { formatCurrency, getLineAfterItemDiscount, isTableOccupied, roundCurrency } from './format'

export interface DayCardBreakdown {
  totalCard: number
  cardBeforeCutoff: number
  cardAfterCutoff: number
  cardCarryIn: number
  cardCarryOut: number
  expectedZ: number
  enteredZ?: number
  zDifference?: number
  posZCutoffTime: string
  cutoffDate: Date
}

/**
 * Extracts year, month, day, hour, minute, second in Europe/Istanbul timezone.
 */
export function getIstanbulParts(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = parseInt(p.value, 10)
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  }
}

/**
 * Creates a Date representing an exact date/time in Europe/Istanbul without hardcoding UTC offsets.
 */
export function createIstanbulDate(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  let guessTime = Date.UTC(year, month - 1, day, hour, minute, second)
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second)

  for (let iter = 0; iter < 2; iter++) {
    const parts = getIstanbulParts(new Date(guessTime))
    const currentMsInIstanbul = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    const diff = currentMsInIstanbul - targetUtcMs
    if (diff === 0) break
    guessTime -= diff
  }
  return new Date(guessTime)
}

/**
 * Determines the Z-report cutoff Date for a given business day openedAt timestamp.
 * If the day was opened after or at the cutoff time on that calendar day,
 * the cutoff belongs to the next calendar day.
 */
export function getDayCutoffDate(openedAtStr: string, cutoffTimeStr = '23:57'): Date {
  const [cutoffH, cutoffM] = cutoffTimeStr.split(':').map((s) => parseInt(s, 10))
  const openedDate = new Date(openedAtStr)
  const openedParts = getIstanbulParts(openedDate)

  const candidateCutoff = createIstanbulDate(
    openedParts.year,
    openedParts.month,
    openedParts.day,
    Number.isFinite(cutoffH) ? cutoffH : 23,
    Number.isFinite(cutoffM) ? cutoffM : 57,
    0,
  )

  if (openedDate.getTime() >= candidateCutoff.getTime()) {
    const tomorrowMs = openedDate.getTime() + 24 * 60 * 60 * 1000
    const tomorrowParts = getIstanbulParts(new Date(tomorrowMs))
    return createIstanbulDate(
      tomorrowParts.year,
      tomorrowParts.month,
      tomorrowParts.day,
      Number.isFinite(cutoffH) ? cutoffH : 23,
      Number.isFinite(cutoffM) ? cutoffM : 57,
      0,
    )
  }

  return candidateCutoff
}

export const formatOptionsLabel = (options?: SelectedOption[]): string => {
  if (!options || options.length === 0) return 'Standart'
  return options
    .map((o) =>
      o.priceDelta !== 0
        ? `${o.optionName} (${o.priceDelta > 0 ? '+' : ''}${o.priceDelta}₺)`
        : o.optionName,
    )
    .join(', ')
}

export const getOrderAppliedPayments = (
  order: CompletedOrder,
): { card: number; cash: number; iban: number; total: number } => {
  if (order.payments && order.payments.length > 0) {
    let card = 0
    let cash = 0
    let iban = 0
    for (const p of order.payments) {
      const amt = roundCurrency(p.amount)
      if (p.method === 'card') card = roundCurrency(card + amt)
      else if (p.method === 'iban') iban = roundCurrency(iban + amt)
      else cash = roundCurrency(cash + amt) // default to cash for unknown/missing
    }
    const total = roundCurrency(card + cash + iban)
    return { card, cash, iban, total }
  }

  const fallbackTotal = roundCurrency(order.totals?.total ?? 0)
  if (order.paymentMethod === 'card') {
    return { card: fallbackTotal, cash: 0, iban: 0, total: fallbackTotal }
  }
  if (order.paymentMethod === 'iban') {
    return { card: 0, cash: 0, iban: fallbackTotal, total: fallbackTotal }
  }
  // Default to cash for backward compatibility
  return { card: 0, cash: fallbackTotal, iban: 0, total: fallbackTotal }
}

/**
 * Calculates card payments split before and after the Z-report cutoff for a business day.
 */
export const calculateDayCardBreakdown = (
  day: BusinessDay,
  orders: CompletedOrder[],
  tables?: Table[],
  fallbackCutoffTime = '23:57',
): DayCardBreakdown => {
  const cutoffTime = day.posZCutoffTime || fallbackCutoffTime || '23:57'
  const cutoffDate = getDayCutoffDate(day.openedAt, cutoffTime)
  const cutoffMs = cutoffDate.getTime()

  // Collect card payments
  const cardItems: { amount: number; timeMs: number }[] = []

  const dayOrders = orders.filter((o) => o.businessDayId === day.id && !o.cancelled)

  for (const o of dayOrders) {
    if (o.payments && o.payments.length > 0) {
      for (const p of o.payments) {
        if (p.method === 'card') {
          const amt = roundCurrency(p.amount)
          const time = new Date(p.createdAt || o.date).getTime()
          cardItems.push({ amount: amt, timeMs: Number.isNaN(time) ? 0 : time })
        }
      }
    } else if (o.paymentMethod === 'card') {
      const amt = roundCurrency(o.totals?.total ?? 0)
      const time = new Date(o.date).getTime()
      cardItems.push({ amount: amt, timeMs: Number.isNaN(time) ? 0 : time })
    }
  }

  if (day.status === 'open' && tables) {
    for (const t of tables) {
      if (!isTableOccupied(t) || !t.payments || t.payments.length === 0) continue
      for (const p of t.payments) {
        if (p.businessDayId && p.businessDayId !== day.id) continue
        if (p.method === 'card') {
          const amt = roundCurrency(p.amount)
          const time = new Date(p.createdAt).getTime()
          cardItems.push({ amount: amt, timeMs: Number.isNaN(time) ? 0 : time })
        }
      }
    }
  }

  let cardBeforeCutoff = 0
  let cardAfterCutoff = 0

  for (const item of cardItems) {
    // timestamp < cutoff is before, >= cutoff is after
    if (item.timeMs < cutoffMs) {
      cardBeforeCutoff = roundCurrency(cardBeforeCutoff + item.amount)
    } else {
      cardAfterCutoff = roundCurrency(cardAfterCutoff + item.amount)
    }
  }

  // If the day is already closed with persisted card values, prefer those for exact historical fidelity
  if (day.status === 'closed' && typeof day.cardBeforeCutoff === 'number') {
    cardBeforeCutoff = day.cardBeforeCutoff
    cardAfterCutoff = day.cardAfterCutoff ?? cardAfterCutoff
  }

  const totalCard = roundCurrency(cardBeforeCutoff + cardAfterCutoff)
  const cardCarryOut = day.status === 'closed' && typeof day.cardCarryOut === 'number'
    ? day.cardCarryOut
    : cardAfterCutoff
  const cardCarryIn = roundCurrency(day.cardCarryIn ?? 0)
  const expectedZ = roundCurrency(cardCarryIn + cardBeforeCutoff)

  let enteredZ: number | undefined
  let zDifference: number | undefined

  if (typeof day.enteredZ === 'number') {
    enteredZ = roundCurrency(day.enteredZ)
    zDifference = day.zDifference ?? roundCurrency(enteredZ - expectedZ)
  }

  return {
    totalCard,
    cardBeforeCutoff,
    cardAfterCutoff,
    cardCarryIn,
    cardCarryOut,
    expectedZ,
    enteredZ,
    zDifference,
    posZCutoffTime: cutoffTime,
    cutoffDate,
  }
}

export const getOrderItemNetRevenues = (items: CartItem[], orderNetRevenue: number): number[] => {
  if (items.length === 0) return []
  const target = roundCurrency(orderNetRevenue)
  const rawAfterItemDisc = items.map((item) => getLineAfterItemDiscount(item))
  const totalAfterItemDisc = rawAfterItemDisc.reduce((sum, v) => sum + v, 0)

  if (totalAfterItemDisc <= 0) {
    return items.map(() => 0)
  }

  const nets: number[] = []
  let running = 0
  for (let i = 0; i < items.length - 1; i++) {
    const share = roundCurrency((rawAfterItemDisc[i] / totalAfterItemDisc) * target)
    nets.push(share)
    running = roundCurrency(running + share)
  }
  nets.push(Math.max(0, roundCurrency(target - running)))
  return nets
}

export const computeOpenTablesPartialPayments = (
  tables: Table[],
  openBusinessDayId?: string,
): {
  total: number
  byMethod: { card: number; cash: number; iban: number }
} => {
  let card = 0
  let cash = 0
  let iban = 0

  for (const t of tables) {
    if (!isTableOccupied(t) || !t.payments || t.payments.length === 0) continue
    for (const p of t.payments) {
      if (openBusinessDayId && p.businessDayId && p.businessDayId !== openBusinessDayId) {
        continue
      }
      const amt = roundCurrency(p.amount)
      if (p.method === 'cash') cash = roundCurrency(cash + amt)
      else if (p.method === 'iban') iban = roundCurrency(iban + amt)
      else card = roundCurrency(card + amt)
    }
  }

  return {
    total: roundCurrency(card + cash + iban),
    byMethod: { card, cash, iban },
  }
}

export const buildReportFromOrders = (
  orders: CompletedOrder[],
  defaultTaxRate = 10,
  tables?: Table[],
  openBusinessDayId?: string,
): BusinessDayReportSnapshot => {
  const validOrders = orders.filter((o) => !o.cancelled)
  const cancelledOrdersRaw = orders.filter((o) => Boolean(o.cancelled))

  let totalRevenue = 0
  let totalDiscount = 0
  let totalTax = 0
  let cardTotal = 0
  let cashTotal = 0
  let ibanTotal = 0

  const productMap = new Map<
    string,
    {
      productKey: string
      productId: string
      name: string
      category: string
      quantity: number
      revenue: number
      optionsMap: Map<string, SoldProductOptionBreakdown>
    }
  >()

  const categoryMap = new Map<string, { category: string; quantity: number; revenue: number }>()

  const hourlyMap = new Map<number, { revenue: number; orders: number }>()
  for (let h = 0; h < 24; h++) {
    hourlyMap.set(h, { revenue: 0, orders: 0 })
  }

  for (const order of validOrders) {
    const applied = getOrderAppliedPayments(order)
    const orderRev = applied.total

    totalRevenue = roundCurrency(totalRevenue + orderRev)
    cardTotal = roundCurrency(cardTotal + applied.card)
    cashTotal = roundCurrency(cashTotal + applied.cash)
    ibanTotal = roundCurrency(ibanTotal + applied.iban)

    const orderDisc = roundCurrency(order.totals?.discount || 0)
    totalDiscount = roundCurrency(totalDiscount + orderDisc)

    const rate = typeof order.taxRate === 'number' ? order.taxRate : defaultTaxRate
    const orderTax = rate > 0 ? roundCurrency((orderRev * rate) / (100 + rate)) : 0
    totalTax = roundCurrency(totalTax + orderTax)

    const orderDate = new Date(order.date)
    const hour = Number.isNaN(orderDate.getTime()) ? 0 : orderDate.getHours()
    const hourBucket = hourlyMap.get(hour) || { revenue: 0, orders: 0 }
    hourBucket.revenue = roundCurrency(hourBucket.revenue + orderRev)
    hourBucket.orders += 1
    hourlyMap.set(hour, hourBucket)

    const lineNets = getOrderItemNetRevenues(order.items, orderRev)
    order.items.forEach((item, idx) => {
      const lineRev = lineNets[idx] ?? 0
      const qty = item.quantity
      const productKey = item.id || item.name
      const categoryName = item.category || 'Diğer'

      const existingProd = productMap.get(productKey)
      if (existingProd) {
        existingProd.quantity += qty
        existingProd.revenue = roundCurrency(existingProd.revenue + lineRev)
      } else {
        productMap.set(productKey, {
          productKey,
          productId: item.id,
          name: item.name,
          category: categoryName,
          quantity: qty,
          revenue: lineRev,
          optionsMap: new Map(),
        })
      }

      const prodEntry = productMap.get(productKey)!
      const optLabel = formatOptionsLabel(item.selectedOptions)
      const existingOpt = prodEntry.optionsMap.get(optLabel)
      if (existingOpt) {
        existingOpt.quantity += qty
        existingOpt.revenue = roundCurrency(existingOpt.revenue + lineRev)
      } else {
        prodEntry.optionsMap.set(optLabel, {
          optionsLabel: optLabel,
          quantity: qty,
          revenue: lineRev,
        })
      }

      const existingCat = categoryMap.get(categoryName)
      if (existingCat) {
        existingCat.quantity += qty
        existingCat.revenue = roundCurrency(existingCat.revenue + lineRev)
      } else {
        categoryMap.set(categoryName, {
          category: categoryName,
          quantity: qty,
          revenue: lineRev,
        })
      }
    })
  }

  const orderCount = validOrders.length
  const averageBasket = orderCount > 0 ? roundCurrency(totalRevenue / orderCount) : 0

  const soldProducts: SoldProductReportItem[] = Array.from(productMap.values())
    .map((p) => ({
      productKey: p.productKey,
      productId: p.productId,
      name: p.name,
      category: p.category,
      quantity: p.quantity,
      revenue: p.revenue,
      share: totalRevenue > 0 ? roundCurrency((p.revenue / totalRevenue) * 100) : 0,
      optionBreakdown: Array.from(p.optionsMap.values()).sort((a, b) => b.quantity - a.quantity),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)

  const categorySales: CategorySalesItem[] = Array.from(categoryMap.values())
    .map((c) => ({
      category: c.category,
      quantity: c.quantity,
      revenue: c.revenue,
      share: totalRevenue > 0 ? roundCurrency((c.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const hourlySales: HourlySalesItem[] = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    revenue: data.revenue,
    orders: data.orders,
  }))

  let cancelledTotal = 0
  const cancelledOrders: CancelledOrderSummary[] = cancelledOrdersRaw
    .sort((a, b) => new Date(b.cancelledAt || b.date).getTime() - new Date(a.cancelledAt || a.date).getTime())
    .map((o) => {
      const tot = roundCurrency(o.totals?.total || 0)
      cancelledTotal = roundCurrency(cancelledTotal + tot)
      const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0)
      const itemsSummary = o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        total: tot,
        date: o.cancelledAt || o.date,
        itemCount,
        cashier: o.cashier,
        customerName: o.customerName,
        itemsSummary,
      }
    })

  const openTablesInfo = tables
    ? computeOpenTablesPartialPayments(tables, openBusinessDayId)
    : undefined

  return {
    generatedAt: new Date().toISOString(),
    totalRevenue,
    orderCount,
    averageBasket,
    totalTax,
    totalDiscount,
    cancelledCount: cancelledOrders.length,
    cancelledTotal,
    cancelledOrders,
    paymentDistribution: {
      card: cardTotal,
      cash: cashTotal,
      iban: ibanTotal,
    },
    soldProducts,
    categorySales,
    hourlySales,
    ...(openTablesInfo
      ? {
          openTablePaymentsTotal: openTablesInfo.total,
          openTablePaymentsByMethod: openTablesInfo.byMethod,
        }
      : {}),
  }
}

export const getReportForBusinessDay = (
  day: BusinessDay,
  allOrders: CompletedOrder[],
  defaultTaxRate = 10,
  tables?: Table[],
): BusinessDayReportSnapshot => {
  const cardBreakdown = calculateDayCardBreakdown(
    day,
    allOrders,
    day.status === 'open' ? tables : undefined,
  )

  if (day.status === 'closed' && day.report) {
    return {
      ...day.report,
      cardCarryIn: day.report.cardCarryIn ?? day.cardCarryIn ?? cardBreakdown.cardCarryIn,
      cardBeforeCutoff:
        day.report.cardBeforeCutoff ?? day.cardBeforeCutoff ?? cardBreakdown.cardBeforeCutoff,
      cardAfterCutoff:
        day.report.cardAfterCutoff ?? day.cardAfterCutoff ?? cardBreakdown.cardAfterCutoff,
      cardCarryOut:
        day.report.cardCarryOut ?? day.cardCarryOut ?? cardBreakdown.cardCarryOut,
      expectedZ: day.report.expectedZ ?? day.expectedZ ?? cardBreakdown.expectedZ,
      enteredZ: day.report.enteredZ ?? day.enteredZ ?? cardBreakdown.enteredZ,
      zDifference: day.report.zDifference ?? day.zDifference ?? cardBreakdown.zDifference,
      posZCutoffTime:
        day.report.posZCutoffTime ?? day.posZCutoffTime ?? cardBreakdown.posZCutoffTime,
    }
  }
  const dayOrders = allOrders.filter((o) => o.businessDayId === day.id)
  const baseReport = buildReportFromOrders(
    dayOrders,
    defaultTaxRate,
    day.status === 'open' ? tables : undefined,
    day.id,
  )

  return {
    ...baseReport,
    cardCarryIn: cardBreakdown.cardCarryIn,
    cardBeforeCutoff: cardBreakdown.cardBeforeCutoff,
    cardAfterCutoff: cardBreakdown.cardAfterCutoff,
    cardCarryOut: cardBreakdown.cardCarryOut,
    expectedZ: cardBreakdown.expectedZ,
    enteredZ: cardBreakdown.enteredZ,
    zDifference: cardBreakdown.zDifference,
    posZCutoffTime: cardBreakdown.posZCutoffTime,
  }
}

export const exportReportToCsv = (
  report: BusinessDayReportSnapshot,
  titleLabel: string,
  day?: BusinessDay | null,
) => {
  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '')
    return `"${str.replace(/"/g, '""')}"`
  }

  const formatNum = (n: number) => roundCurrency(n).toFixed(2).replace('.', ',')

  const rows: string[][] = [
    ['LEMOON KAFE - Z RAPORU / SATIŞ ÖZETİ'],
    ['Dönem / Gün', titleLabel],
    ['Rapor Tarihi', new Date(report.generatedAt).toLocaleString('tr-TR')],
  ]

  if (day) {
    rows.push(['Durum', day.status === 'open' ? 'Açık' : 'Kapalı (Arşivlenmiş)'])
    rows.push(['Açılış Zamanı', new Date(day.openedAt).toLocaleString('tr-TR')])
    rows.push(['Açan Kasiyer', day.openedBy])
    if (day.closedAt) {
      rows.push(['Kapanış Zamanı', new Date(day.closedAt).toLocaleString('tr-TR')])
      rows.push(['Kapatan Kasiyer', day.closedBy || '—'])
    }
    if (day.note) rows.push(['Açılış Notu', day.note])
    if (day.closeNote) rows.push(['Kapanış Notu', day.closeNote])
  }

  rows.push([])
  rows.push(['GENEL ÖZET', 'DEĞER'])
  rows.push(['Toplam Ciro (TL)', formatNum(report.totalRevenue)])
  rows.push(['Sipariş Sayısı', String(report.orderCount)])
  rows.push(['Ortalama Adisyon (TL)', formatNum(report.averageBasket)])
  rows.push(['Toplam KDV (TL)', formatNum(report.totalTax)])
  rows.push(['Toplam İndirim (TL)', formatNum(report.totalDiscount)])
  rows.push(['İptal Edilen Sipariş Sayısı', String(report.cancelledCount)])
  rows.push(['İptal Edilen Tutar (TL)', formatNum(report.cancelledTotal)])

  rows.push([])
  rows.push(['ÖDEME YÖNTEMİ DAĞILIMI', 'TUTAR (TL)', 'ORAN (%)'])
  const rev = report.totalRevenue > 0 ? report.totalRevenue : 1
  rows.push([
    'Kredi Kartı',
    formatNum(report.paymentDistribution.card),
    formatNum(report.totalRevenue > 0 ? (report.paymentDistribution.card / rev) * 100 : 0),
  ])
  rows.push([
    'Nakit',
    formatNum(report.paymentDistribution.cash),
    formatNum(report.totalRevenue > 0 ? (report.paymentDistribution.cash / rev) * 100 : 0),
  ])
  rows.push([
    'IBAN',
    formatNum(report.paymentDistribution.iban),
    formatNum(report.totalRevenue > 0 ? (report.paymentDistribution.iban / rev) * 100 : 0),
  ])

  if (day) {
    const expected =
      day.expectedCash ?? roundCurrency(day.openingCash + report.paymentDistribution.cash)
    rows.push([])
    rows.push(['KASA ÖZETİ', 'TUTAR (TL)'])
    rows.push(['Açılış Nakiti', formatNum(day.openingCash)])
    rows.push(['Nakit Satışlar', formatNum(report.paymentDistribution.cash)])
    rows.push(['Beklenen Nakit', formatNum(expected)])
    if (day.status === 'closed' && typeof day.countedCash === 'number') {
      rows.push(['Sayılan Nakit', formatNum(day.countedCash)])
      rows.push(['Kasa Farkı', formatNum(day.cashDifference ?? day.countedCash - expected)])
    }

    const cutoffTime = day.posZCutoffTime || report.posZCutoffTime || '23:57'
    const carryIn = report.cardCarryIn ?? day.cardCarryIn ?? 0
    const beforeCutoff =
      report.cardBeforeCutoff ?? day.cardBeforeCutoff ?? report.paymentDistribution.card
    const afterCutoff = report.cardAfterCutoff ?? day.cardAfterCutoff ?? 0
    const expectedZ =
      report.expectedZ ?? day.expectedZ ?? roundCurrency(carryIn + beforeCutoff)
    const carryOut = report.cardCarryOut ?? day.cardCarryOut ?? afterCutoff

    rows.push([])
    rows.push(['POS Z RAPORU & KART DEVİR ÖZETİ', 'TUTAR (TL)'])
    rows.push(['Önceki Günden Devreden Kart', formatNum(carryIn)])
    rows.push(['Kart Satışları (Toplam)', formatNum(report.paymentDistribution.card)])
    rows.push([`↳ ${cutoffTime} Öncesi (Z Raporuna Dahil)`, formatNum(beforeCutoff)])
    rows.push([`↳ ${cutoffTime} Sonrası (Yarına Devreder)`, formatNum(afterCutoff)])
    rows.push(['Beklenen POS Z Raporu', formatNum(expectedZ)])
    const enteredZVal = report.enteredZ ?? day.enteredZ
    if (typeof enteredZVal === 'number') {
      const zDiffVal =
        (report.zDifference ?? day.zDifference) ?? roundCurrency(enteredZVal - expectedZ)
      rows.push(['Fişteki POS Z Raporu', formatNum(enteredZVal)])
      rows.push(['POS Z Raporu Farkı', formatNum(zDiffVal)])
    }
    rows.push(['Yarına Devreden Kart Tutarı', formatNum(carryOut)])
  }

  rows.push([])
  rows.push(['SATILAN ÜRÜNLER', 'KATEGORİ', 'SATILAN ADET', 'TOPLAM CİRO (TL)', 'PAY (%)'])
  for (const prod of report.soldProducts) {
    rows.push([
      prod.name,
      prod.category,
      String(prod.quantity),
      formatNum(prod.revenue),
      formatNum(prod.share),
    ])
    if (
      prod.optionBreakdown.length > 1 ||
      (prod.optionBreakdown.length === 1 && prod.optionBreakdown[0].optionsLabel !== 'Standart')
    ) {
      for (const opt of prod.optionBreakdown) {
        rows.push([
          `  ↳ ${prod.name} (${opt.optionsLabel})`,
          prod.category,
          String(opt.quantity),
          formatNum(opt.revenue),
          '',
        ])
      }
    }
  }

  rows.push([])
  rows.push(['KATEGORİ BAZLI SATIŞ', 'SATILAN ADET', 'TOPLAM CİRO (TL)', 'PAY (%)'])
  for (const cat of report.categorySales) {
    rows.push([cat.category, String(cat.quantity), formatNum(cat.revenue), formatNum(cat.share)])
  }

  const csvContent = '\uFEFF' + rows.map((r) => r.map(escapeCsv).join(';')).join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeFileDate = new Date().toISOString().slice(0, 10)
  link.href = url
  link.setAttribute('download', `lemoon_kafe_rapor_${safeFileDate}.csv`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const formatDayShortLabel = (day: BusinessDay): string => {
  const opened = new Date(day.openedAt)
  const datePart = opened.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timePart = opened.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (day.status === 'open') {
    return `${datePart} · ${timePart} (Açık)`
  }
  const closedTime = day.closedAt
    ? new Date(day.closedAt).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  return `${datePart} · ${timePart}${closedTime ? ` - ${closedTime}` : ''} (Kapalı)`
}

export { formatCurrency }

