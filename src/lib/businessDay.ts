import type {
  BusinessDay,
  BusinessDayReportSnapshot,
  CancelledOrderSummary,
  CartItem,
  CategorySalesItem,
  CompletedOrder,
  HourlySalesItem,
  Refund,
  SelectedOption,
  SoldProductOptionBreakdown,
  SoldProductReportItem,
  Table,
} from '../types'
import {
  calculateTotals,
  formatCurrency,
  fromKurus,
  getEffectivePrice,
  getLineAfterItemDiscount,
  isTableOccupied,
  isValidPaymentMovement,
  normalizePaymentMethod,
  roundCurrency,
  toKurus,
} from './format'

export {
  executeOrderReopen,
  formatReopenCancellationNotice,
  getOrderPaymentBreakdownSummary,
  healCorruptedReopenedData,
} from './reopenOrder'
export type {
  ExecuteOrderReopenFailure,
  ExecuteOrderReopenInput,
  ExecuteOrderReopenResult,
  ExecuteOrderReopenSuccess,
  HealReopenedDataResult,
  OrderPaymentBreakdownSummary,
  PaymentMethodBreakdownEntry,
} from './reopenOrder'

import { getRefundsSafe, saveRefundsSafe } from './storage'

export function getStoredRefunds(): Refund[] {
  return getRefundsSafe()
}

export function saveStoredRefund(refund: Refund): void {
  try {
    const current = getRefundsSafe()
    saveRefundsSafe([refund, ...current])
  } catch (err) {
    console.error('Failed to save refund', err)
  }
}

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
 * Formats a Date as YYYY-MM-DD in Europe/Istanbul timezone.
 */
export function formatIstanbulDateString(date: Date): string {
  const p = getIstanbulParts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/**
 * Parses a YYYY-MM-DD string into start/end Date bounds in Europe/Istanbul timezone (inclusive).
 */
export function getIstanbulDayBounds(
  ymd: string,
): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!match) return null
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const day = parseInt(match[3], 10)
  const start = createIstanbulDate(year, month, day, 0, 0, 0)
  const endSec = createIstanbulDate(year, month, day, 23, 59, 59)
  return { start, end: new Date(endSec.getTime() + 999) }
}

/**
 * Girilen ürünlerin indirim öncesi brüt fiyat toplamını hesaplar:
 * aktif adet × (birim fiyat + opsiyon/varyant farkları).
 * İptal/iade edilen ürünler ve iade edilen adetler dahil edilmez.
 * Not: İndirim varsa koddaki mevcut subtotal mantığına paralel olarak brüt (indirim öncesi) ürün toplamı esas alınır.
 */
export const calculateCartItemsGrossRevenue = (items: CartItem[] = []): number => {
  let total = 0
  for (const item of items) {
    if (item.status === 'refunded' && !item.refundedQty) continue
    const effectiveQty = Math.max(0, item.quantity - (item.refundedQty || 0))
    if (effectiveQty <= 0) continue
    const unitPrice = getEffectivePrice(item)
    total = roundCurrency(total + unitPrice * effectiveQty)
  }
  return total
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
  if (order.cancelled || order.reopened) {
    return { card: 0, cash: 0, iban: 0, total: 0 }
  }

  if (order.payments && order.payments.length > 0) {
    let cardKurus = 0
    let cashKurus = 0
    let ibanKurus = 0
    for (const p of order.payments) {
      if (!isValidPaymentMovement(p)) continue
      const amtKurus = Math.max(0, toKurus(p.amount))
      const method = normalizePaymentMethod(p.method, 'cash')
      if (p.type === 'IADE') {
        if (method === 'card') cardKurus = Math.max(0, cardKurus - amtKurus)
        else if (method === 'iban') ibanKurus = Math.max(0, ibanKurus - amtKurus)
        else cashKurus = Math.max(0, cashKurus - amtKurus)
      } else {
        if (method === 'card') cardKurus += amtKurus
        else if (method === 'iban') ibanKurus += amtKurus
        else cashKurus += amtKurus
      }
    }
    const totalKurus = cardKurus + cashKurus + ibanKurus
    return {
      card: fromKurus(cardKurus),
      cash: fromKurus(cashKurus),
      iban: fromKurus(ibanKurus),
      total: fromKurus(totalKurus),
    }
  }

  const fallbackTotalKurus = Math.max(0, toKurus(order.totals?.total ?? 0))
  const fallbackTotal = fromKurus(fallbackTotalKurus)
  const method = normalizePaymentMethod(order.paymentMethod, 'cash')
  if (method === 'card') {
    return { card: fallbackTotal, cash: 0, iban: 0, total: fallbackTotal }
  }
  if (method === 'iban') {
    return { card: 0, cash: 0, iban: fallbackTotal, total: fallbackTotal }
  }
  // Default to cash for backward compatibility
  return { card: 0, cash: fallbackTotal, iban: 0, total: fallbackTotal }
}

/**
 * Determines whether a refund record represents an actual reversal of received money
 * (from cash drawer, POS terminal, or IBAN) rather than an unpaid kitchen/cart item cancellation.
 */
export const isPaidRefund = (refund: Refund): boolean => {
  if (refund.paymentReceived === false) return false
  if (refund.paymentReceived === true) return true
  // Legacy open-table refunds (created before paymentReceived flag existed) have tableId set and no orderId.
  // Their items were already marked 'refunded' in the open table's cart (or the open table was cleared)
  // before any CompletedOrder was created, so deducting them from CompletedOrder revenue would double-deduct.
  if (!refund.orderId && Boolean(refund.tableId)) {
    return false
  }
  return Boolean(refund.paymentMethod && String(refund.paymentMethod).trim().length > 0)
}

/**
 * Calculates total card payments and expected POS Z report for a business day.
 * Devir YOK: All payments taken while the business day is open belong 100% to this day,
 * regardless of calendar time or midnight/23:57 cutoff.
 */
export const calculateDayCardBreakdown = (
  day: BusinessDay,
  orders: CompletedOrder[],
  tables?: Table[],
  _fallbackCutoffTime = '23:57',
  passedRefunds?: Refund[],
): DayCardBreakdown => {
  let totalCardKurus = 0

  const dayOrders = orders.filter((o) => o.businessDayId === day.id && !o.cancelled && !o.reopened)

  for (const o of dayOrders) {
    if (o.payments && o.payments.length > 0) {
      for (const p of o.payments) {
        if (!isValidPaymentMovement(p)) continue
        if (normalizePaymentMethod(p.method, 'cash') === 'card') {
          const amtKurus = Math.max(0, toKurus(p.amount))
          if (p.type === 'IADE') {
            totalCardKurus = Math.max(0, totalCardKurus - amtKurus)
          } else {
            totalCardKurus += amtKurus
          }
        }
      }
    } else if (normalizePaymentMethod(o.paymentMethod, 'cash') === 'card') {
      totalCardKurus += Math.max(0, toKurus(o.totals?.total ?? 0))
    }
  }

  if (day.status === 'open' && tables) {
    for (const t of tables) {
      if (!isTableOccupied(t) || !t.payments || t.payments.length === 0) continue
      for (const p of t.payments) {
        if (!isValidPaymentMovement(p)) continue
        if (p.businessDayId && p.businessDayId !== day.id) continue
        if (normalizePaymentMethod(p.method, 'cash') === 'card') {
          const amtKurus = Math.max(0, toKurus(p.amount))
          if (p.type === 'IADE') {
            totalCardKurus = Math.max(0, totalCardKurus - amtKurus)
          } else {
            totalCardKurus += amtKurus
          }
        }
      }
    }
  }

  // Deduct paid card refunds for this business day
  const storedRefunds = (passedRefunds ?? getStoredRefunds()).filter((r) => r.businessDayId === day.id)
  for (const r of storedRefunds) {
    if (!isPaidRefund(r)) continue
    if (normalizePaymentMethod(r.paymentMethod, 'cash') === 'card') {
      totalCardKurus = Math.max(0, totalCardKurus - Math.max(0, toKurus(r.amount)))
    }
  }

  const totalCard = fromKurus(totalCardKurus)
  const expectedZ = totalCard
  let enteredZ: number | undefined
  let zDifference: number | undefined

  if (typeof day.enteredZ === 'number') {
    enteredZ = roundCurrency(day.enteredZ)
    zDifference = day.zDifference ?? roundCurrency(enteredZ - expectedZ)
  }

  return {
    totalCard,
    cardBeforeCutoff: totalCard,
    cardAfterCutoff: 0,
    cardCarryIn: 0,
    cardCarryOut: 0,
    expectedZ,
    enteredZ,
    zDifference,
    posZCutoffTime: 'Yok (Tüm Gün)',
    cutoffDate: new Date(day.openedAt),
  }
}

export const getOrderItemNetRevenues = (items: CartItem[], orderNetRevenue: number): number[] => {
  if (items.length === 0) return []
  const target = roundCurrency(orderNetRevenue)
  const rawAfterItemDisc = items.map((item) => {
    if (item.status === 'refunded' && !item.refundedQty) return 0
    const effectiveQty = Math.max(0, item.quantity - (item.refundedQty || 0))
    if (effectiveQty <= 0 || item.quantity <= 0) return 0
    return (getLineAfterItemDiscount(item) / item.quantity) * effectiveQty
  })
  const totalAfterItemDisc = rawAfterItemDisc.reduce((sum, v) => sum + v, 0)

  if (totalAfterItemDisc <= 0) {
    return items.map(() => 0)
  }

  let lastActiveIdx = -1
  for (let i = rawAfterItemDisc.length - 1; i >= 0; i--) {
    if (rawAfterItemDisc[i] > 0) {
      lastActiveIdx = i
      break
    }
  }

  const nets: number[] = []
  let running = 0
  for (let i = 0; i < items.length; i++) {
    if (rawAfterItemDisc[i] <= 0) {
      nets.push(0)
    } else if (i === lastActiveIdx) {
      nets.push(Math.max(0, roundCurrency(target - running)))
    } else {
      const share = roundCurrency((rawAfterItemDisc[i] / totalAfterItemDisc) * target)
      nets.push(share)
      running = roundCurrency(running + share)
    }
  }
  return nets
}

export const computeOpenTablesPartialPayments = (
  tables: Table[],
  openBusinessDayId?: string,
  dateRange?: { start: Date; end: Date },
): {
  total: number
  byMethod: { card: number; cash: number; iban: number }
} => {
  let cardKurus = 0
  let cashKurus = 0
  let ibanKurus = 0

  for (const t of tables) {
    if (!isTableOccupied(t) || !t.payments || t.payments.length === 0) continue
    for (const p of t.payments) {
      if (!isValidPaymentMovement(p)) continue
      if (openBusinessDayId && p.businessDayId && p.businessDayId !== openBusinessDayId) {
        continue
      }
      if (dateRange && p.createdAt) {
        const pd = new Date(p.createdAt)
        if (!Number.isNaN(pd.getTime()) && (pd < dateRange.start || pd > dateRange.end)) {
          continue
        }
      }
      const amtKurus = Math.max(0, toKurus(p.amount))
      const method = normalizePaymentMethod(p.method, 'cash')
      if (p.type === 'IADE') {
        if (method === 'cash') cashKurus = Math.max(0, cashKurus - amtKurus)
        else if (method === 'iban') ibanKurus = Math.max(0, ibanKurus - amtKurus)
        else cardKurus = Math.max(0, cardKurus - amtKurus)
      } else {
        if (method === 'cash') cashKurus += amtKurus
        else if (method === 'iban') ibanKurus += amtKurus
        else cardKurus += amtKurus
      }
    }
  }

  const card = fromKurus(cardKurus)
  const cash = fromKurus(cashKurus)
  const iban = fromKurus(ibanKurus)

  return {
    total: fromKurus(cardKurus + cashKurus + ibanKurus),
    byMethod: { card, cash, iban },
  }
}

export const buildReportFromOrders = (
  orders: CompletedOrder[],
  defaultTaxRate = 10,
  tables?: Table[],
  openBusinessDayId?: string,
  passedRefunds?: Refund[],
  options?: { dateRange?: { start: Date; end: Date }; legacyOnly?: boolean },
): BusinessDayReportSnapshot => {
  const validOrders = orders.filter((o) => !o.cancelled && !o.reopened)
  const cancelledOrdersRaw = orders.filter((o) => Boolean(o.cancelled))

  let totalRevenueKurus = 0
  let closedTablesGrossKurus = 0
  let openTablesGrossKurus = 0
  let openTablesNetKurus = 0
  let openTablesDiscountKurus = 0
  let openTablesCount = 0
  let totalDiscountKurus = 0
  let rawCardTax = 0
  let cardTotalKurus = 0
  let cashTotalKurus = 0
  let ibanTotalKurus = 0

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

    totalRevenueKurus += toKurus(orderRev)
    closedTablesGrossKurus += toKurus(calculateCartItemsGrossRevenue(order.items))
    cardTotalKurus += toKurus(applied.card)
    cashTotalKurus += toKurus(applied.cash)
    ibanTotalKurus += toKurus(applied.iban)

    const orderDisc = roundCurrency(order.totals?.discount || 0)
    totalDiscountKurus += toKurus(orderDisc)

    const rate = typeof order.taxRate === 'number' ? order.taxRate : defaultTaxRate
    if (rate > 0 && applied.card > 0) {
      rawCardTax += (applied.card * rate) / 100
    }

    const orderDate = new Date(order.date)
    const hour = Number.isNaN(orderDate.getTime())
      ? 0
      : getIstanbulParts(orderDate).hour
    const hourBucket = hourlyMap.get(hour) || { revenue: 0, orders: 0 }
    hourBucket.revenue = roundCurrency(hourBucket.revenue + orderRev)
    hourBucket.orders += 1
    hourlyMap.set(hour, hourBucket)

    const lineNets = getOrderItemNetRevenues(order.items, orderRev)
    order.items.forEach((item, idx) => {
      if (item.status === 'refunded' && !item.refundedQty) return
      const effectiveQty = Math.max(0, item.quantity - (item.refundedQty || 0))
      if (effectiveQty <= 0) return

      const lineRev = roundCurrency(lineNets[idx] ?? 0)
      const qty = effectiveQty
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

  // Açık masalardaki (kapanmamış / ödemesi alınmamış) ürünlerin brüt ve net toplamlarını hesapla
  if (tables && tables.length > 0) {
    for (const t of tables) {
      if (!isTableOccupied(t) && t.cart.length === 0) continue
      let itemsToCount = t.cart
      if (options?.dateRange) {
        const { start, end } = options.dateRange
        itemsToCount = t.cart.filter((item) => {
          const itemDate = item.addedAt ? new Date(item.addedAt) : new Date()
          return itemDate >= start && itemDate <= end
        })
      }
      const tableGross = calculateCartItemsGrossRevenue(itemsToCount)
      const hasValidTablePayments = Boolean(
        t.payments && t.payments.some((p) => isValidPaymentMovement(p) && p.type !== 'IADE'),
      )
      if (tableGross > 0 || hasValidTablePayments) {
        openTablesCount += 1
      }
      openTablesGrossKurus += toKurus(tableGross)
      const tableTotals = calculateTotals(itemsToCount, t.discountRate || 0, t.discountAmount || 0)
      openTablesNetKurus += toKurus(tableTotals.total)
      openTablesDiscountKurus += toKurus(tableTotals.discount)
    }
  }

  const openTablesInfo = tables
    ? computeOpenTablesPartialPayments(tables, openBusinessDayId, options?.dateRange)
    : undefined

  // Deduct paid refunds from revenue and payment method breakdown
  const allRefunds = passedRefunds ?? getStoredRefunds()
  const relevantRefunds = allRefunds.filter((r) => {
    if (openBusinessDayId) return r.businessDayId === openBusinessDayId
    if (options?.dateRange) {
      const refTime = r.refundedAt || r.createdAt
      if (!refTime) return false
      const d = new Date(refTime)
      return d >= options.dateRange.start && d <= options.dateRange.end
    }
    if (options?.legacyOnly) return !r.businessDayId
    return true
  })

  let totalRefundsKurus = 0
  let paidRefundsKurus = 0
  let unpaidRefundsKurus = 0

  for (const r of relevantRefunds) {
    const amtKurus = Math.max(0, toKurus(r.amount))
    const amtTl = fromKurus(amtKurus)
    totalRefundsKurus += amtKurus

    if (!isPaidRefund(r)) {
      unpaidRefundsKurus += amtKurus
      continue
    }

    paidRefundsKurus += amtKurus
    const refMethod = normalizePaymentMethod(r.paymentMethod, 'cash')
    if (refMethod === 'card') {
      cardTotalKurus = Math.max(0, cardTotalKurus - amtKurus)
      if (defaultTaxRate > 0) {
        rawCardTax -= (amtTl * defaultTaxRate) / 100
      }
    } else if (refMethod === 'iban') {
      ibanTotalKurus = Math.max(0, ibanTotalKurus - amtKurus)
    } else {
      cashTotalKurus = Math.max(0, cashTotalKurus - amtKurus)
    }
  }

  const cardTotal = fromKurus(cardTotalKurus)
  const cashTotal = fromKurus(cashTotalKurus)
  const ibanTotal = fromKurus(ibanTotalKurus)
  const totalRevenue = fromKurus(totalRevenueKurus)
  const totalRefunds = fromKurus(totalRefundsKurus)
  const paidRefundsTotal = fromKurus(paidRefundsKurus)
  const unpaidRefundsTotal = fromKurus(unpaidRefundsKurus)
  const totalDiscount = fromKurus(totalDiscountKurus)
  const closedTablesGrossRevenue = fromKurus(closedTablesGrossKurus)
  const openTablesGrossRevenue = fromKurus(openTablesGrossKurus)
  const grossItemsRevenue = fromKurus(closedTablesGrossKurus + openTablesGrossKurus)
  const openTablesNetTotal = fromKurus(openTablesNetKurus)
  const openTablesDiscountTotal = fromKurus(openTablesDiscountKurus)
  const openPaymentsKurus = openTablesInfo ? toKurus(openTablesInfo.total) : 0
  const openTablesUnpaidBalance = fromKurus(Math.max(0, openTablesNetKurus - openPaymentsKurus))

  const totalTax = cardTotal <= 0 ? 0 : Math.max(0, roundCurrency(rawCardTax))
  const netRevenueKurus = cardTotalKurus + cashTotalKurus + ibanTotalKurus
  const netRevenue = fromKurus(netRevenueKurus)
  const totalCollectedRevenue = fromKurus(
    Math.max(0, netRevenueKurus + openPaymentsKurus),
  )

  const orderCount = validOrders.length
  const averageBasket = orderCount > 0 ? roundCurrency(netRevenue / orderCount) : 0

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

  let cancelledTotalKurus = 0
  const cancelledOrders: CancelledOrderSummary[] = cancelledOrdersRaw
    .sort((a, b) => new Date(b.cancelledAt || b.date).getTime() - new Date(a.cancelledAt || a.date).getTime())
    .map((o) => {
      const tot = roundCurrency(o.totals?.total || 0)
      cancelledTotalKurus += toKurus(tot)
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
  const cancelledTotal = fromKurus(cancelledTotalKurus)

  return {
    generatedAt: new Date().toISOString(),
    totalRevenue: netRevenue,
    grossItemsRevenue,
    closedTablesGrossRevenue,
    openTablesGrossRevenue,
    openTablesNetTotal,
    openTablesUnpaidBalance,
    openTablesCount,
    openTablesDiscountTotal,
    paidTablesTotal: netRevenue,
    totalCollectedRevenue,
    totalRefunds,
    paidRefundsTotal,
    unpaidRefundsTotal,
    refundCount: relevantRefunds.length,
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
    closedPaymentDistribution: {
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

export const hesaplaGunToplamlari = buildReportFromOrders

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
    const dayOrders = allOrders.filter((o) => o.businessDayId === day.id)
    const dayValidOrders = dayOrders.filter((o) => !o.cancelled && !o.reopened)

    if (
      dayValidOrders.length > 0 &&
      (day.report.totalRefunds || 0) > 0 &&
      day.report.unpaidRefundsTotal === undefined
    ) {
      const healed = buildReportFromOrders(dayOrders, defaultTaxRate, undefined, day.id)
      if ((healed.unpaidRefundsTotal || 0) > 0) {
        const enteredZVal = day.report.enteredZ ?? day.enteredZ ?? cardBreakdown.enteredZ
        return {
          ...healed,
          cardCarryIn: day.report.cardCarryIn ?? day.cardCarryIn ?? cardBreakdown.cardCarryIn,
          cardBeforeCutoff:
            day.report.cardBeforeCutoff ?? day.cardBeforeCutoff ?? cardBreakdown.cardBeforeCutoff,
          cardAfterCutoff:
            day.report.cardAfterCutoff ?? day.cardAfterCutoff ?? cardBreakdown.cardAfterCutoff,
          cardCarryOut:
            day.report.cardCarryOut ?? day.cardCarryOut ?? cardBreakdown.cardCarryOut,
          expectedZ: healed.paymentDistribution.card,
          enteredZ: enteredZVal,
          zDifference:
            typeof enteredZVal === 'number'
              ? roundCurrency(enteredZVal - healed.paymentDistribution.card)
              : (day.report.zDifference ?? day.zDifference ?? cardBreakdown.zDifference),
          posZCutoffTime:
            day.report.posZCutoffTime ?? day.posZCutoffTime ?? cardBreakdown.posZCutoffTime,
        }
      }
    }

    const fallbackGrossItems =
      dayValidOrders.length > 0
        ? roundCurrency(
            dayValidOrders.reduce(
              (sum, o) => sum + calculateCartItemsGrossRevenue(o.items),
              0,
            ),
          )
        : day.report.totalRevenue

    const paidTables = day.report.paidTablesTotal ?? day.report.totalRevenue
    const grossItems = day.report.grossItemsRevenue ?? fallbackGrossItems
    const closedGross = day.report.closedTablesGrossRevenue ?? fallbackGrossItems
    const openGross =
      day.report.openTablesGrossRevenue ?? Math.max(0, roundCurrency(grossItems - closedGross))

    return {
      ...day.report,
      grossItemsRevenue: grossItems,
      closedTablesGrossRevenue: closedGross,
      openTablesGrossRevenue: openGross,
      paidTablesTotal: paidTables,
      totalCollectedRevenue:
        day.report.totalCollectedRevenue ??
        roundCurrency(paidTables + (day.report.openTablePaymentsTotal || 0)),
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
  rows.push(['Toplam Ciro (TL)', formatNum(report.grossItemsRevenue ?? report.totalRevenue)])
  rows.push(['Sipariş Sayısı', String(report.orderCount)])
  rows.push(['Ödenen Masalar Toplamı (TL)', formatNum(report.paidTablesTotal ?? report.totalRevenue)])
  rows.push(['Toplam KDV (Sadece Kart) (TL)', formatNum(report.totalTax)])
  rows.push(['Toplam İndirim (TL)', formatNum(report.totalDiscount)])
  rows.push(['Toplam İade (TL)', formatNum(report.totalRefunds || 0)])
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
    const openCash = report.openTablePaymentsByMethod?.cash || 0
    const cashSales = roundCurrency(report.paymentDistribution.cash + openCash)
    const expected =
      day.expectedCash ?? roundCurrency(day.openingCash + cashSales)
    rows.push([])
    rows.push(['KASA ÖZETİ', 'TUTAR (TL)'])
    rows.push(['Açılış Nakiti', formatNum(day.openingCash)])
    rows.push(['Nakit Satışlar', formatNum(cashSales)])
    if (openCash > 0) {
      rows.push(['  ↳ Açık Masalarda Alınan Nakit', formatNum(openCash)])
    }
    rows.push(['Beklenen Nakit', formatNum(expected)])
    if (day.status === 'closed' && typeof day.countedCash === 'number') {
      rows.push(['Sayılan Nakit', formatNum(day.countedCash)])
      rows.push(['Kasa Farkı', formatNum(day.cashDifference ?? day.countedCash - expected)])
    }

    const openCard = report.openTablePaymentsByMethod?.card || 0
    const cardSales = roundCurrency(report.paymentDistribution.card + openCard)
    const expectedZ = report.expectedZ ?? day.expectedZ ?? cardSales

    rows.push([])
    rows.push(['POS Z RAPORU ÖZETİ', 'TUTAR (TL)'])
    rows.push(['Kart Satışları (Toplam)', formatNum(cardSales)])
    rows.push(['Beklenen POS Z Raporu', formatNum(expectedZ)])
    const enteredZVal = report.enteredZ ?? day.enteredZ
    if (typeof enteredZVal === 'number') {
      const zDiffVal =
        (report.zDifference ?? day.zDifference) ?? roundCurrency(enteredZVal - expectedZ)
      rows.push(['Fişteki POS Z Raporu', formatNum(enteredZVal)])
      rows.push(['POS Z Raporu Farkı', formatNum(zDiffVal)])
    }
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

