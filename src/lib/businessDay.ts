import type {
  ActivityLog,
  BusinessDay,
  BusinessDayReportSnapshot,
  CancelledOrderSummary,
  CartItem,
  CashMovement,
  CategorySalesItem,
  CompletedOrder,
  HourlySalesItem,
  PartialPayment,
  Refund,
  SelectedOption,
  SoldProductOptionBreakdown,
  SoldProductReportItem,
  Table,
} from '../types'
import {
  calculateTotals,
  derivePaymentState,
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
import { recordSystemLog } from './systemHealth'

export {
  executeOrderReopen,
  formatReopenCancellationNotice,
  getOrderPaymentBreakdownSummary,
  healCorruptedReopenedData,
  repairGhostOccupiedTables,
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

import {
  getBusinessDaysSafe,
  getCashMovementsSafe,
  getRefundsSafe,
  saveCashMovementsSafe,
  saveRefundsSafe,
} from './storage'

export function getStoredBusinessDays(): BusinessDay[] {
  return getBusinessDaysSafe()
}

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

export function getStoredCashMovements(): CashMovement[] {
  return getCashMovementsSafe()
}

export function saveStoredCashMovements(movements: CashMovement[]): boolean {
  return saveCashMovementsSafe(movements)
}

export function summarizeCashMovements(
  movements: CashMovement[],
  businessDayId?: string,
  dateRange?: { start: Date; end: Date },
): {
  dayMovements: CashMovement[]
  activeMovements: CashMovement[]
  cashInTotal: number
  cashOutTotal: number
  activeCount: number
} {
  const filtered = (movements || []).filter((m) => {
    if (businessDayId) return m.businessDayId === businessDayId
    if (dateRange) {
      const d = new Date(m.createdAt)
      return !Number.isNaN(d.getTime()) && d >= dateRange.start && d <= dateRange.end
    }
    return true
  })

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const activeMovements = sorted.filter((m) => !m.cancelled)
  let inKurus = 0
  let outKurus = 0
  for (const m of activeMovements) {
    const k = Math.max(0, toKurus(m.amount))
    if (m.type === 'GIRIS') inKurus += k
    else if (m.type === 'CIKIS') outKurus += k
  }
  return {
    dayMovements: sorted,
    activeMovements,
    cashInTotal: fromKurus(inKurus),
    cashOutTotal: fromKurus(outKurus),
    activeCount: activeMovements.length,
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

export const getPaymentMovementBusinessDayId = (
  movement: PartialPayment,
  order?: Pick<CompletedOrder, 'businessDayId'>,
): string | undefined => {
  return movement.businessDayId || order?.businessDayId
}

export const doesOrderHavePaymentMovementForDay = (
  order: CompletedOrder,
  businessDayId: string,
): boolean => {
  if (order.cancelled || order.reopened) return false
  if (order.payments && order.payments.length > 0) {
    return order.payments.some(
      (p) =>
        isValidPaymentMovement(p) &&
        getPaymentMovementBusinessDayId(p, order) === businessDayId,
    )
  }
  return order.businessDayId === businessDayId
}

export const selectOrdersForBusinessDay = (
  orders: CompletedOrder[],
  businessDayId: string,
): CompletedOrder[] => {
  return orders.filter(
    (o) => o.businessDayId === businessDayId || doesOrderHavePaymentMovementForDay(o, businessDayId),
  )
}

export const getOrderAppliedPayments = (
  order: CompletedOrder,
  businessDayId?: string,
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
      if (businessDayId && getPaymentMovementBusinessDayId(p, order) !== businessDayId) {
        continue
      }
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

  if (businessDayId && order.businessDayId !== businessDayId) {
    return { card: 0, cash: 0, iban: 0, total: 0 }
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

const getOrderUnabsorbedIadeByMethodKurus = (
  order: CompletedOrder,
  businessDayId?: string,
): { card: number; cash: number; iban: number } => {
  if (order.cancelled || order.reopened || !order.payments || order.payments.length === 0) {
    return { card: 0, cash: 0, iban: 0 }
  }
  let cardSigned = 0
  let cashSigned = 0
  let ibanSigned = 0
  for (const p of order.payments) {
    if (!isValidPaymentMovement(p)) continue
    if (businessDayId && getPaymentMovementBusinessDayId(p, order) !== businessDayId) continue
    const amtKurus = Math.max(0, toKurus(p.amount))
    const delta = p.type === 'IADE' ? -amtKurus : amtKurus
    const method = normalizePaymentMethod(p.method, 'cash')
    if (method === 'card') cardSigned += delta
    else if (method === 'iban') ibanSigned += delta
    else cashSigned += delta
  }
  return {
    card: cardSigned < 0 ? -cardSigned : 0,
    cash: cashSigned < 0 ? -cashSigned : 0,
    iban: ibanSigned < 0 ? -ibanSigned : 0,
  }
}

/**
 * Returns raw gross cash payments (ODEME) and cash refunds (IADE) for a closed order in integer kurus.
 * Reopened/cancelled orders contribute 0.
 */
const getOrderCashMovementsKurus = (
  order: CompletedOrder,
  businessDayId?: string,
): { cashGrossKurus: number; cashIadeKurus: number } => {
  if (order.cancelled || order.reopened) {
    return { cashGrossKurus: 0, cashIadeKurus: 0 }
  }

  if (order.payments && order.payments.length > 0) {
    let cashGrossKurus = 0
    let cashIadeKurus = 0
    for (const p of order.payments) {
      if (!isValidPaymentMovement(p)) continue
      if (businessDayId && getPaymentMovementBusinessDayId(p, order) !== businessDayId) {
        continue
      }
      const method = normalizePaymentMethod(p.method, 'cash')
      if (method !== 'cash') continue
      const amtKurus = Math.max(0, toKurus(p.amount))
      if (p.type === 'IADE') {
        cashIadeKurus += amtKurus
      } else {
        cashGrossKurus += amtKurus
      }
    }
    return { cashGrossKurus, cashIadeKurus }
  }

  if (businessDayId && order.businessDayId !== businessDayId) {
    return { cashGrossKurus: 0, cashIadeKurus: 0 }
  }

  const method = normalizePaymentMethod(order.paymentMethod, 'cash')
  if (method !== 'cash') {
    return { cashGrossKurus: 0, cashIadeKurus: 0 }
  }
  return {
    cashGrossKurus: Math.max(0, toKurus(order.totals?.total ?? 0)),
    cashIadeKurus: 0,
  }
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

interface AccountedIadeEntry {
  movement: PartialPayment
  orderId?: string
  tableId?: string
  method: 'card' | 'cash' | 'iban'
  amountKurus: number
  consumed: boolean
}

const collectAccountedIadeMovements = (
  orders: CompletedOrder[],
  tables?: Table[],
  openBusinessDayId?: string,
  dateRange?: { start: Date; end: Date },
): AccountedIadeEntry[] => {
  const entries: AccountedIadeEntry[] = []

  for (const o of orders) {
    if (o.reopened || !o.payments || o.payments.length === 0) continue
    for (const p of o.payments) {
      if (!isValidPaymentMovement(p) || p.type !== 'IADE') continue
      if (openBusinessDayId && getPaymentMovementBusinessDayId(p, o) !== openBusinessDayId) {
        continue
      }
      entries.push({
        movement: p,
        orderId: p.orderId || o.id,
        tableId: p.tableId || o.tableId,
        method: normalizePaymentMethod(p.method, 'cash'),
        amountKurus: Math.max(0, toKurus(p.amount)),
        consumed: false,
      })
    }
  }

  if (tables) {
    for (const t of tables) {
      if (!t.payments || t.payments.length === 0) continue
      for (const p of t.payments) {
        if (!isValidPaymentMovement(p) || p.type !== 'IADE') continue
        if (openBusinessDayId && p.businessDayId && p.businessDayId !== openBusinessDayId) continue
        if (dateRange && p.createdAt) {
          const pd = new Date(p.createdAt)
          if (!Number.isNaN(pd.getTime()) && (pd < dateRange.start || pd > dateRange.end)) continue
        }
        entries.push({
          movement: p,
          orderId: p.orderId,
          tableId: p.tableId || t.id,
          method: normalizePaymentMethod(p.method, 'cash'),
          amountKurus: Math.max(0, toKurus(p.amount)),
          consumed: false,
        })
      }
    }
  }

  return entries
}

/**
 * Checks whether a paid Refund record has ALREADY been deducted via an `IADE` movement
 * in `orders` or `tables` (preventing double deduction).
 */
const consumeMatchingIadeMovement = (
  refund: Refund,
  accountedEntries: AccountedIadeEntry[],
): boolean => {
  // 1. Explicit ID link match
  if (refund.paymentMovementId) {
    const byExplicitId = accountedEntries.find(
      (e) => !e.consumed && e.movement.id === refund.paymentMovementId,
    )
    if (byExplicitId) {
      byExplicitId.consumed = true
      return true
    }
  }

  const byRefundId = accountedEntries.find(
    (e) =>
      !e.consumed &&
      (e.movement.id === refund.id || e.movement.reversalOfId === refund.id),
  )
  if (byRefundId) {
    byRefundId.consumed = true
    return true
  }

  // 2. Structural match (same method + amount + matching orderId/tableId)
  const refMethod = normalizePaymentMethod(refund.paymentMethod, 'cash')
  const refAmtKurus = Math.max(0, toKurus(refund.amount))

  const byStructure = accountedEntries.find((e) => {
    if (e.consumed) return false
    if (e.method !== refMethod || e.amountKurus !== refAmtKurus) return false
    if (refund.orderId && e.orderId && refund.orderId === e.orderId) return true
    if (refund.tableId && e.tableId && refund.tableId === e.tableId) return true
    if (!refund.orderId && !refund.tableId) return true
    return false
  })

  if (byStructure) {
    byStructure.consumed = true
    return true
  }

  return false
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

  const relevantOrders = selectOrdersForBusinessDay(orders, day.id)
  const dayOrders = relevantOrders.filter((o) => !o.cancelled && !o.reopened)
  const allDayOrdersForMovements = relevantOrders.filter((o) => !o.reopened)

  for (const o of dayOrders) {
    if (o.payments && o.payments.length > 0) {
      for (const p of o.payments) {
        if (!isValidPaymentMovement(p)) continue
        if (getPaymentMovementBusinessDayId(p, o) !== day.id) continue
        if (normalizePaymentMethod(p.method, 'cash') === 'card') {
          const amtKurus = Math.max(0, toKurus(p.amount))
          if (p.type === 'IADE') {
            totalCardKurus -= amtKurus
          } else {
            totalCardKurus += amtKurus
          }
        }
      }
    } else if (
      o.businessDayId === day.id &&
      normalizePaymentMethod(o.paymentMethod, 'cash') === 'card'
    ) {
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
            totalCardKurus -= amtKurus
          } else {
            totalCardKurus += amtKurus
          }
        }
      }
    }
  }

  const accountedIadeMovements = collectAccountedIadeMovements(
    allDayOrdersForMovements,
    day.status === 'open' ? tables : undefined,
    day.id,
  )

  // Deduct paid card refunds for this business day that are not already deducted via an IADE movement
  const storedRefunds = (passedRefunds ?? getStoredRefunds()).filter((r) => r.businessDayId === day.id)
  for (const r of storedRefunds) {
    if (!isPaidRefund(r)) continue
    if (consumeMatchingIadeMovement(r, accountedIadeMovements)) continue
    if (normalizePaymentMethod(r.paymentMethod, 'cash') === 'card') {
      totalCardKurus -= Math.max(0, toKurus(r.amount))
    }
  }

  if (totalCardKurus < 0) {
    const diffTl = fromKurus(-totalCardKurus)
    const msg = `[POS Z Kırpma Uyarısı] Kart iadeleri kart tahsilatını ${formatCurrency(diffTl)} aştı (0 TL'ye çekildi). Veri tutarsızlığını kontrol edin.`
    console.warn(msg)
    recordSystemLog('warn', 'REPORT_CLAMPING', msg, {
      businessDayId: day.id,
      method: 'card',
      excessAmount: diffTl,
    })
    totalCardKurus = 0
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

const collectOpenTablesPaymentSummary = (
  tables: Table[],
  openBusinessDayId?: string,
  dateRange?: { start: Date; end: Date },
): {
  total: number
  byMethod: { card: number; cash: number; iban: number }
  cashGrossKurus: number
  cashIadeKurus: number
  clampedTotalKurus: number
  clampedDetails: string[]
} => {
  let cardKurus = 0
  let cashKurus = 0
  let ibanKurus = 0
  let cashGrossKurus = 0
  let cashIadeKurus = 0

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
        if (method === 'cash') {
          cashKurus -= amtKurus
          cashIadeKurus += amtKurus
        } else if (method === 'iban') {
          ibanKurus -= amtKurus
        } else {
          cardKurus -= amtKurus
        }
      } else {
        if (method === 'cash') {
          cashKurus += amtKurus
          cashGrossKurus += amtKurus
        } else if (method === 'iban') {
          ibanKurus += amtKurus
        } else {
          cardKurus += amtKurus
        }
      }
    }
  }

  const clampedDetails: string[] = []
  let clampedTotalKurus = 0
  if (cashKurus < 0) {
    clampedTotalKurus += -cashKurus
    clampedDetails.push(`Açık masa nakit iade aşımı: ${formatCurrency(fromKurus(-cashKurus))}`)
    cashKurus = 0
  }
  if (cardKurus < 0) {
    clampedTotalKurus += -cardKurus
    clampedDetails.push(`Açık masa kart iade aşımı: ${formatCurrency(fromKurus(-cardKurus))}`)
    cardKurus = 0
  }
  if (ibanKurus < 0) {
    clampedTotalKurus += -ibanKurus
    clampedDetails.push(`Açık masa IBAN iade aşımı: ${formatCurrency(fromKurus(-ibanKurus))}`)
    ibanKurus = 0
  }

  const card = fromKurus(cardKurus)
  const cash = fromKurus(cashKurus)
  const iban = fromKurus(ibanKurus)

  return {
    total: fromKurus(cardKurus + cashKurus + ibanKurus),
    byMethod: { card, cash, iban },
    cashGrossKurus,
    cashIadeKurus,
    clampedTotalKurus,
    clampedDetails,
  }
}

export const computeOpenTablesPartialPayments = (
  tables: Table[],
  openBusinessDayId?: string,
  dateRange?: { start: Date; end: Date },
): {
  total: number
  byMethod: { card: number; cash: number; iban: number }
} => {
  const { total, byMethod } = collectOpenTablesPaymentSummary(
    tables,
    openBusinessDayId,
    dateRange,
  )
  return { total, byMethod }
}

const collectPreviousDayCarryover = (
  orders: CompletedOrder[],
  tables: Table[] | undefined,
  openBusinessDayId: string,
  closedBusinessDayIds?: string[],
): { total: number; byMethod: { card: number; cash: number; iban: number } } => {
  const closedDaySet = new Set(
    (
      closedBusinessDayIds ??
      getBusinessDaysSafe()
        .filter((d) => d.status === 'closed')
        .map((d) => d.id)
    ).filter((id) => Boolean(id) && id !== openBusinessDayId),
  )

  if (closedDaySet.size === 0) {
    return { total: 0, byMethod: { card: 0, cash: 0, iban: 0 } }
  }

  let cardKurus = 0
  let cashKurus = 0
  let ibanKurus = 0

  const addMovement = (p: PartialPayment) => {
    if (!isValidPaymentMovement(p)) return
    if (!p.businessDayId || p.businessDayId === openBusinessDayId) return
    if (!closedDaySet.has(p.businessDayId)) return
    const amtKurus = Math.max(0, toKurus(p.amount))
    const delta = p.type === 'IADE' ? -amtKurus : amtKurus
    const method = normalizePaymentMethod(p.method, 'cash')
    if (method === 'card') cardKurus += delta
    else if (method === 'iban') ibanKurus += delta
    else cashKurus += delta
  }

  if (tables) {
    for (const t of tables) {
      if (!isTableOccupied(t) || !t.payments || t.payments.length === 0) continue
      for (const p of t.payments) {
        addMovement(p)
      }
    }
  }

  for (const order of orders) {
    if (order.cancelled || order.reopened) continue
    // Bugün kapanmış bir siparişte, günü kapanmış önceki bir güne ait ara ödeme hareketi taşınıyorsa devir olarak listelenir
    if (order.businessDayId !== openBusinessDayId) continue
    if (!order.payments || order.payments.length === 0) continue
    for (const p of order.payments) {
      addMovement(p)
    }
  }

  const card = fromKurus(Math.max(0, cardKurus))
  const cash = fromKurus(Math.max(0, cashKurus))
  const iban = fromKurus(Math.max(0, ibanKurus))
  const total = fromKurus(
    Math.max(0, cardKurus) + Math.max(0, cashKurus) + Math.max(0, ibanKurus),
  )
  return { total, byMethod: { card, cash, iban } }
}

export const buildReportFromOrders = (
  orders: CompletedOrder[],
  defaultTaxRate = 10,
  tables?: Table[],
  openBusinessDayId?: string,
  passedRefunds?: Refund[],
  options?: {
    dateRange?: { start: Date; end: Date }
    legacyOnly?: boolean
    cashMovements?: CashMovement[]
    closedBusinessDayIds?: string[]
  },
): BusinessDayReportSnapshot => {
  const isOrderOwnedByDay = (order: CompletedOrder): boolean => {
    if (!openBusinessDayId) return true
    if (order.businessDayId === openBusinessDayId) return true
    if (!order.businessDayId && Boolean(options?.legacyOnly)) return true
    return false
  }

  const validOrders = orders.filter((o) => !o.cancelled && !o.reopened)
  const cancelledOrdersRaw = orders.filter((o) => Boolean(o.cancelled) && isOrderOwnedByDay(o))

  let totalRevenueKurus = 0
  let orderOwnedRevenueKurus = 0
  let orderOwnedCount = 0
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
  let unabsorbedCardIadeKurus = 0
  let unabsorbedCashIadeKurus = 0
  let unabsorbedIbanIadeKurus = 0
  let closedCashGrossKurus = 0
  let closedOrderCashIadeKurus = 0

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
    const ownedByDay = isOrderOwnedByDay(order)
    const applied = getOrderAppliedPayments(order, openBusinessDayId)
    const cashMovements = getOrderCashMovementsKurus(order, openBusinessDayId)
    const unabsorbedIade = openBusinessDayId
      ? getOrderUnabsorbedIadeByMethodKurus(order, openBusinessDayId)
      : { card: 0, cash: 0, iban: 0 }
    const dayCollectedRev = applied.total

    totalRevenueKurus += toKurus(dayCollectedRev)
    cardTotalKurus += toKurus(applied.card)
    cashTotalKurus += toKurus(applied.cash)
    ibanTotalKurus += toKurus(applied.iban)
    unabsorbedCardIadeKurus += unabsorbedIade.card
    unabsorbedCashIadeKurus += unabsorbedIade.cash
    unabsorbedIbanIadeKurus += unabsorbedIade.iban
    closedCashGrossKurus += cashMovements.cashGrossKurus
    closedOrderCashIadeKurus += cashMovements.cashIadeKurus

    const rate = typeof order.taxRate === 'number' ? order.taxRate : defaultTaxRate
    if (rate > 0 && applied.card > 0) {
      rawCardTax += (applied.card * rate) / 100
    }

    const orderDate = new Date(order.date)
    const fallbackHour = Number.isNaN(orderDate.getTime())
      ? 0
      : getIstanbulParts(orderDate).hour

    if (!openBusinessDayId || ownedByDay) {
      const hourBucket = hourlyMap.get(fallbackHour) || { revenue: 0, orders: 0 }
      hourBucket.revenue = roundCurrency(hourBucket.revenue + dayCollectedRev)
      hourBucket.orders += 1
      hourlyMap.set(fallbackHour, hourBucket)
    } else if (dayCollectedRev > 0) {
      const matchingMovement = (order.payments || []).find(
        (p) =>
          isValidPaymentMovement(p) &&
          p.type !== 'IADE' &&
          getPaymentMovementBusinessDayId(p, order) === openBusinessDayId,
      )
      const movDate = matchingMovement?.createdAt
        ? new Date(matchingMovement.createdAt)
        : orderDate
      const movHour = Number.isNaN(movDate.getTime())
        ? fallbackHour
        : getIstanbulParts(movDate).hour
      const hourBucket = hourlyMap.get(movHour) || { revenue: 0, orders: 0 }
      hourBucket.revenue = roundCurrency(hourBucket.revenue + dayCollectedRev)
      hourlyMap.set(movHour, hourBucket)
    }

    if (!ownedByDay) {
      continue
    }

    orderOwnedCount += 1
    closedTablesGrossKurus += toKurus(calculateCartItemsGrossRevenue(order.items))

    const orderDisc = roundCurrency(order.totals?.discount || 0)
    totalDiscountKurus += toKurus(orderDisc)

    const fullOrderProductRev = getOrderAppliedPayments(order).total
    orderOwnedRevenueKurus += toKurus(fullOrderProductRev)
    const lineNets = getOrderItemNetRevenues(order.items, fullOrderProductRev)
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
    ? collectOpenTablesPaymentSummary(tables, openBusinessDayId, options?.dateRange)
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
  let unlinkedCashRefundsKurus = 0

  const accountedIadeMovements = collectAccountedIadeMovements(
    orders.filter((o) => !o.reopened),
    tables,
    openBusinessDayId,
    options?.dateRange,
  )

  for (const r of relevantRefunds) {
    const amtKurus = Math.max(0, toKurus(r.amount))
    const amtTl = fromKurus(amtKurus)
    totalRefundsKurus += amtKurus

    if (!isPaidRefund(r)) {
      unpaidRefundsKurus += amtKurus
      continue
    }

    paidRefundsKurus += amtKurus

    // If this refund is already deducted via an IADE movement in table.payments or order.payments,
    // do not deduct it a second time from closed orders' payment totals.
    if (consumeMatchingIadeMovement(r, accountedIadeMovements)) {
      continue
    }

    const refMethod = normalizePaymentMethod(r.paymentMethod, 'cash')
    if (refMethod === 'card') {
      cardTotalKurus -= amtKurus
      if (defaultTaxRate > 0) {
        rawCardTax -= (amtTl * defaultTaxRate) / 100
      }
    } else if (refMethod === 'iban') {
      ibanTotalKurus -= amtKurus
    } else {
      cashTotalKurus -= amtKurus
      unlinkedCashRefundsKurus += amtKurus
    }
  }

  if (unabsorbedCardIadeKurus > 0) {
    cardTotalKurus -= unabsorbedCardIadeKurus
    if (defaultTaxRate > 0) {
      rawCardTax -= (fromKurus(unabsorbedCardIadeKurus) * defaultTaxRate) / 100
    }
  }
  if (unabsorbedCashIadeKurus > 0) {
    cashTotalKurus -= unabsorbedCashIadeKurus
  }
  if (unabsorbedIbanIadeKurus > 0) {
    ibanTotalKurus -= unabsorbedIbanIadeKurus
  }

  const unexplainedDetails: string[] = [...(openTablesInfo?.clampedDetails ?? [])]
  let unexplainedKurus = openTablesInfo?.clampedTotalKurus ?? 0
  if (cardTotalKurus < 0) {
    const excess = -cardTotalKurus
    unexplainedKurus += excess
    unexplainedDetails.push(`Kart iadeleri tahsilatı aştı: ${formatCurrency(fromKurus(excess))}`)
    cardTotalKurus = 0
  }
  if (cashTotalKurus < 0) {
    const excess = -cashTotalKurus
    unexplainedKurus += excess
    unexplainedDetails.push(`Nakit iadeleri tahsilatı aştı: ${formatCurrency(fromKurus(excess))}`)
    cashTotalKurus = 0
  }
  if (ibanTotalKurus < 0) {
    const excess = -ibanTotalKurus
    unexplainedKurus += excess
    unexplainedDetails.push(`IBAN iadeleri tahsilatı aştı: ${formatCurrency(fromKurus(excess))}`)
    ibanTotalKurus = 0
  }

  const unexplainedDifference = fromKurus(unexplainedKurus)
  if (unexplainedDifference > 0) {
    const warnMsg = `[Rapor Kırpma Uyarısı] Negatif bakiye 0'a çekildi — açıklanamayan fark: ${formatCurrency(unexplainedDifference)} (${unexplainedDetails.join('; ')})`
    console.warn(warnMsg)
    recordSystemLog('warn', 'REPORT_CLAMPING', warnMsg, {
      businessDayId: openBusinessDayId,
      unexplainedDifference,
      details: unexplainedDetails,
    })
  }

  const cardTotal = fromKurus(cardTotalKurus)
  const cashTotal = fromKurus(cashTotalKurus)
  const ibanTotal = fromKurus(ibanTotalKurus)
  const totalRevenue = fromKurus(totalRevenueKurus)
  const orderOwnedProductRevenue = fromKurus(orderOwnedRevenueKurus)
  const shareDenominator =
    orderOwnedProductRevenue > 0 ? orderOwnedProductRevenue : totalRevenue
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

  const orderCount = orderOwnedCount
  const averageBasket = orderCount > 0 ? roundCurrency(netRevenue / orderCount) : 0

  const soldProducts: SoldProductReportItem[] = Array.from(productMap.values())
    .map((p) => ({
      productKey: p.productKey,
      productId: p.productId,
      name: p.name,
      category: p.category,
      quantity: p.quantity,
      revenue: p.revenue,
      share: shareDenominator > 0 ? roundCurrency((p.revenue / shareDenominator) * 100) : 0,
      optionBreakdown: Array.from(p.optionsMap.values()).sort((a, b) => b.quantity - a.quantity),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)

  const categorySales: CategorySalesItem[] = Array.from(categoryMap.values())
    .map((c) => ({
      category: c.category,
      quantity: c.quantity,
      revenue: c.revenue,
      share: shareDenominator > 0 ? roundCurrency((c.revenue / shareDenominator) * 100) : 0,
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

  const cashMovementsSource = options?.cashMovements ?? getStoredCashMovements()
  const cashMovementSummary = summarizeCashMovements(
    cashMovementsSource,
    openBusinessDayId,
    options?.dateRange,
  )

  const carryoverInfo = openBusinessDayId
    ? collectPreviousDayCarryover(
        validOrders,
        tables,
        openBusinessDayId,
        options?.closedBusinessDayIds,
      )
    : { total: 0, byMethod: { card: 0, cash: 0, iban: 0 } }

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
    cashDrawerBreakdown: {
      closedCashGross: fromKurus(closedCashGrossKurus),
      openTableCashGross: fromKurus(openTablesInfo?.cashGrossKurus ?? 0),
      closedCashRefunds: fromKurus(closedOrderCashIadeKurus + unlinkedCashRefundsKurus),
      openTableCashRefunds: fromKurus(openTablesInfo?.cashIadeKurus ?? 0),
      totalCashRefunds: fromKurus(
        closedOrderCashIadeKurus +
          unlinkedCashRefundsKurus +
          (openTablesInfo?.cashIadeKurus ?? 0),
      ),
      ...(cashMovementSummary.cashInTotal > 0 || cashMovementSummary.cashOutTotal > 0
        ? {
            cashInTotal: cashMovementSummary.cashInTotal,
            cashOutTotal: cashMovementSummary.cashOutTotal,
          }
        : {}),
    },
    cashInTotal: cashMovementSummary.cashInTotal,
    cashOutTotal: cashMovementSummary.cashOutTotal,
    cashMovementsCount: cashMovementSummary.activeCount,
    ...(cashMovementSummary.dayMovements.length > 0
      ? { cashMovements: cashMovementSummary.dayMovements }
      : {}),
    ...(openTablesInfo
      ? {
          openTablePaymentsTotal: openTablesInfo.total,
          openTablePaymentsByMethod: openTablesInfo.byMethod,
        }
      : {}),
    ...(carryoverInfo.total > 0
      ? {
          previousDayCarryoverCollection: carryoverInfo.total,
          previousDayCarryoverByMethod: carryoverInfo.byMethod,
        }
      : {}),
    ...(unexplainedDifference > 0
      ? {
          unexplainedDifference,
          unexplainedDetails,
        }
      : {}),
  }
}

export const hesaplaGunToplamlari = buildReportFromOrders

export interface KasaHareketiOzet {
  type: 'GIRIS' | 'CIKIS'
  amount: number
  method?: string
  cancelled?: boolean
}

export interface BeklenenNakitOptions {
  /** Açık masalardaki nakit ara ödemeleri hesaba katsın mı? Varsayılan: day?.status === 'open' */
  includeOpenTables?: boolean
  /** Prompt 5 hazırlığı: kasaya doğrudan nakit giriş/çıkış hareketleri */
  kasaHareketleri?: KasaHareketiOzet[]
}

export interface BeklenenNakitKirilim {
  acilisNakiti: number
  kapananNakit: number
  acikMasaNakit: number
  nakitIadeler: number
  kasaGiris: number
  kasaCikis: number
  netNakitSatis: number
}

export interface BeklenenNakitSonuc {
  beklenen: number
  /** Kapanmış günlerde arşivde saklanan expectedCash değeri */
  arsivExpectedCash?: number
  /** Arşiv expectedCash ile güncel merkezi hesap arasındaki fark (arşiv - merkezi) */
  arsivFarki?: number
  /** Kasa hesabı 0'ın altına düşüp kırpıldığında oluşan açıklanamayan fark */
  aciklanamayanFark?: number
  kirilim: BeklenenNakitKirilim
}

/**
 * Tüm UI ekranları, Z raporu çıktıları, CSV ve gün sonu kaydı için
 * beklenen kasa nakdini kuruş tam sayısı bazında hesaplayan tek merkezi fonksiyon.
 *
 * Beklenen Nakit =
 *   Açılış Nakiti
 * + Kapanan Adisyonlar (Nakit)
 * + Açık Masa Ara Ödemeleri (gün açıkken)
 * − Nakit İadeler
 * + Kasa Giriş (Prompt 5 hazırlığı)
 * − Kasa Çıkış (Prompt 5 hazırlığı)
 */
export const hesaplaBeklenenNakit = (
  day: BusinessDay | null | undefined,
  report: BusinessDayReportSnapshot,
  options?: BeklenenNakitOptions,
): BeklenenNakitSonuc => {
  const includeOpenTables = options?.includeOpenTables ?? day?.status === 'open'
  const acilisKurus = Math.max(0, toKurus(day?.openingCash ?? 0))

  const breakdown = report.cashDrawerBreakdown
  let kapananKurus = 0
  let acikMasaKurus = 0
  let nakitIadeKurus = 0

  if (breakdown) {
    kapananKurus = Math.max(0, toKurus(breakdown.closedCashGross))
    acikMasaKurus = includeOpenTables
      ? Math.max(0, toKurus(breakdown.openTableCashGross))
      : 0
    const closedRefundsKurus = Math.max(0, toKurus(breakdown.closedCashRefunds))
    const openRefundsKurus = includeOpenTables
      ? Math.max(0, toKurus(breakdown.openTableCashRefunds))
      : 0
    nakitIadeKurus = closedRefundsKurus + openRefundsKurus
  } else {
    // Eski arşiv snapshot'ları için güvenli geri dönüş (paymentDistribution.cash zaten net nakittir)
    kapananKurus = Math.max(0, toKurus(report.paymentDistribution?.cash ?? 0))
    acikMasaKurus = includeOpenTables
      ? Math.max(0, toKurus(report.openTablePaymentsByMethod?.cash ?? 0))
      : 0
    nakitIadeKurus = 0
  }

  let kasaGirisKurus = 0
  let kasaCikisKurus = 0
  if (options?.kasaHareketleri !== undefined) {
    for (const h of options.kasaHareketleri) {
      if (h.cancelled) continue
      if (h.method && normalizePaymentMethod(h.method, 'cash') !== 'cash') {
        continue
      }
      const amtKurus = Math.max(0, toKurus(h.amount))
      if (h.type === 'GIRIS') {
        kasaGirisKurus += amtKurus
      } else if (h.type === 'CIKIS') {
        kasaCikisKurus += amtKurus
      }
    }
  } else {
    const snapIn = breakdown?.cashInTotal ?? report.cashInTotal ?? 0
    const snapOut = breakdown?.cashOutTotal ?? report.cashOutTotal ?? 0
    kasaGirisKurus = Math.max(0, toKurus(snapIn))
    kasaCikisKurus = Math.max(0, toKurus(snapOut))
  }

  const rawBeklenenKurus =
    acilisKurus +
    kapananKurus +
    acikMasaKurus -
    nakitIadeKurus +
    kasaGirisKurus -
    kasaCikisKurus

  const beklenenClampedKurus = rawBeklenenKurus < 0 ? -rawBeklenenKurus : 0
  const rawNetNakitSatisKurus = kapananKurus + acikMasaKurus - nakitIadeKurus
  const netNakitClampedKurus = rawNetNakitSatisKurus < 0 ? -rawNetNakitSatisKurus : 0
  const maxCashClampKurus = Math.max(beklenenClampedKurus, netNakitClampedKurus)
  const aciklanamayanFark = maxCashClampKurus > 0 ? fromKurus(maxCashClampKurus) : undefined

  if (aciklanamayanFark && aciklanamayanFark > 0) {
    const warnMsg = `[Kasa Kırpma Uyarısı] Beklenen nakit hesabı negatife düştü ve 0'a çekildi — açıklanamayan fark: ${formatCurrency(aciklanamayanFark)}`
    console.warn(warnMsg)
    recordSystemLog('warn', 'CASH_CLAMPING', warnMsg, {
      businessDayId: day?.id,
      rawBeklenen: fromKurus(rawBeklenenKurus),
      rawNetNakitSatis: fromKurus(rawNetNakitSatisKurus),
      aciklanamayanFark,
    })
  }

  const beklenen = fromKurus(Math.max(0, rawBeklenenKurus))
  const netNakitSatis = fromKurus(Math.max(0, rawNetNakitSatisKurus))

  let arsivExpectedCash: number | undefined
  let arsivFarki: number | undefined
  if (day?.status === 'closed' && typeof day.expectedCash === 'number') {
    const roundedArchive = roundCurrency(day.expectedCash)
    arsivExpectedCash = roundedArchive
    const diffKurus = toKurus(roundedArchive) - toKurus(beklenen)
    if (diffKurus !== 0) {
      arsivFarki = fromKurus(diffKurus)
    }
  }

  return {
    beklenen,
    ...(arsivExpectedCash !== undefined ? { arsivExpectedCash } : {}),
    ...(arsivFarki !== undefined ? { arsivFarki } : {}),
    ...(aciklanamayanFark !== undefined ? { aciklanamayanFark } : {}),
    kirilim: {
      acilisNakiti: fromKurus(acilisKurus),
      kapananNakit: fromKurus(kapananKurus),
      acikMasaNakit: fromKurus(acikMasaKurus),
      nakitIadeler: fromKurus(nakitIadeKurus),
      kasaGiris: fromKurus(kasaGirisKurus),
      kasaCikis: fromKurus(kasaCikisKurus),
      netNakitSatis,
    },
  }
}

export const getReportForBusinessDay = (
  day: BusinessDay,
  allOrders: CompletedOrder[],
  defaultTaxRate = 10,
  tables?: Table[],
  cashMovements?: CashMovement[],
  businessDays?: BusinessDay[],
): BusinessDayReportSnapshot => {
  const closedBusinessDayIds = (businessDays ?? getBusinessDaysSafe())
    .filter((d) => d.status === 'closed' && d.id !== day.id)
    .map((d) => d.id)

  const cardBreakdown = calculateDayCardBreakdown(
    day,
    allOrders,
    day.status === 'open' ? tables : undefined,
  )

  if (day.status === 'closed' && day.report) {
    const dayOrders = selectOrdersForBusinessDay(allOrders, day.id)
    const dayValidOrders = dayOrders.filter(
      (o) => !o.cancelled && !o.reopened && o.businessDayId === day.id,
    )

    if (
      dayValidOrders.length > 0 &&
      (day.report.totalRefunds || 0) > 0 &&
      day.report.unpaidRefundsTotal === undefined
    ) {
      const healed = buildReportFromOrders(dayOrders, defaultTaxRate, undefined, day.id, undefined, {
        closedBusinessDayIds,
      })
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
  const dayOrders = selectOrdersForBusinessDay(allOrders, day.id)
  const baseReport = buildReportFromOrders(
    dayOrders,
    defaultTaxRate,
    day.status === 'open' ? tables : undefined,
    day.id,
    undefined,
    {
      ...(cashMovements !== undefined ? { cashMovements } : {}),
      closedBusinessDayIds,
    },
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

  const grossCiroVal = report.grossItemsRevenue ?? report.totalRevenue
  const allDiscountsVal = roundCurrency((report.totalDiscount || 0) + (report.openTablesDiscountTotal || 0))
  const netCiroVal = Math.max(0, roundCurrency(grossCiroVal - allDiscountsVal))
  const paidNetVal = report.paidTablesTotal ?? report.totalRevenue

  rows.push([])
  rows.push(['GENEL ÖZET', 'DEĞER'])
  rows.push(['Girilen Ürünler (Brüt - İndirim Öncesi, Açık Masalar Dahil) (TL)', formatNum(grossCiroVal)])
  rows.push(['Net Ciro (İndirim Sonrası) (TL)', formatNum(netCiroVal)])
  rows.push(['Sipariş Sayısı', String(report.orderCount)])
  rows.push(['Tahsil Edilen (Net - Kapanan Masalar) (TL)', formatNum(paidNetVal)])
  rows.push(['Toplam KDV (Sadece Kart) (TL)', formatNum(report.totalTax)])
  rows.push(['Toplam İndirim (TL)', formatNum(allDiscountsVal)])
  rows.push(['Toplam İade (TL)', formatNum(report.totalRefunds || 0)])
  rows.push(['İptal Edilen Sipariş Sayısı', String(report.cancelledCount)])
  rows.push(['İptal Edilen Tutar (TL)', formatNum(report.cancelledTotal)])
  if ((report.unexplainedDifference || 0) > 0) {
    rows.push(['Açıklanamayan Fark (Kırpılan Tutar) (TL)', formatNum(report.unexplainedDifference || 0)])
  }

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
  if ((report.previousDayCarryoverCollection || 0) > 0) {
    rows.push([
      'Önceki günden devreden tahsilat',
      formatNum(report.previousDayCarryoverCollection || 0),
      '',
    ])
  }

  if (day) {
    const cashSummary = hesaplaBeklenenNakit(day, report)
    const { kirilim } = cashSummary
    const displayedExpected =
      day.status === 'closed' && typeof cashSummary.arsivExpectedCash === 'number'
        ? cashSummary.arsivExpectedCash
        : cashSummary.beklenen
    rows.push([])
    rows.push(['KASA ÖZETİ', 'TUTAR (TL)'])
    rows.push(['Açılış Nakiti', formatNum(kirilim.acilisNakiti)])
    rows.push(['+ Kapanan adisyonlar (nakit)', formatNum(kirilim.kapananNakit)])
    rows.push(['+ Açık masa ara ödemeleri', formatNum(kirilim.acikMasaNakit)])
    rows.push(['− Nakit iadeler', formatNum(kirilim.nakitIadeler)])
    if (kirilim.kasaGiris > 0) {
      rows.push(['+ Kasa giriş', formatNum(kirilim.kasaGiris)])
    }
    if (kirilim.kasaCikis > 0) {
      rows.push(['− Kasa çıkış', formatNum(kirilim.kasaCikis)])
    }
    rows.push(['= Beklenen Nakit', formatNum(displayedExpected)])
    if (typeof cashSummary.arsivFarki === 'number') {
      rows.push(['Merkezi Hesaplama (Güncel)', formatNum(cashSummary.beklenen)])
      rows.push(['Arşiv Beklenen Nakit Farkı', formatNum(cashSummary.arsivFarki)])
    }
    if (typeof cashSummary.aciklanamayanFark === 'number' && cashSummary.aciklanamayanFark > 0) {
      rows.push(['Açıklanamayan Kasa Farkı (Kırpılan)', formatNum(cashSummary.aciklanamayanFark)])
    }
    if (day.status === 'closed' && typeof day.countedCash === 'number') {
      rows.push(['Sayılan Nakit', formatNum(day.countedCash)])
      rows.push([
        'Kasa Farkı',
        formatNum(
          day.cashDifference ?? roundCurrency(day.countedCash - displayedExpected),
        ),
      ])
      if (day.cashDifferenceNote) {
        rows.push(['Kasa Farkı Açıklaması', day.cashDifferenceNote])
      }
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

  if (report.cashMovements && report.cashMovements.length > 0) {
    rows.push([])
    rows.push([
      'KASA HAREKETLERİ',
      'TÜR',
      'KATEGORİ',
      'AÇIKLAMA',
      'TUTAR (TL)',
      'İŞLEM YAPAN',
      'DURUM',
    ])
    for (const mov of report.cashMovements) {
      rows.push([
        new Date(mov.createdAt).toLocaleString('tr-TR'),
        mov.type === 'GIRIS' ? 'Kasaya Giriş' : 'Kasadan Çıkış',
        mov.category,
        mov.description,
        formatNum(mov.amount),
        mov.createdBy,
        mov.cancelled
          ? `İptal${mov.cancelledReason ? `: ${mov.cancelledReason}` : ''}`
          : 'Aktif',
      ])
    }
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

const TR_SHORT_MONTHS = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
]

function getTurkishTimeSinceSuffix(hour: number, minute: number): string {
  const val = minute !== 0 ? minute : hour
  if (val === 0) return "'dan beri"
  const lastDigit = val % 10
  if (lastDigit === 1 || lastDigit === 2 || lastDigit === 7 || lastDigit === 8) {
    return "'den beri"
  }
  if (lastDigit === 3 || lastDigit === 4 || lastDigit === 5) {
    return "'ten beri"
  }
  if (lastDigit === 6 || lastDigit === 9) {
    return "'dan beri"
  }
  if (val === 10 || val === 30) return "'dan beri"
  if (val === 40) return "'tan beri"
  return "'den beri"
}

export interface OpenBusinessDayDurationAlert {
  calendarDaysOpen: number
  openedAtLabel: string
  message: string
}

export function getOpenBusinessDayDurationAlert(
  day: BusinessDay | null | undefined,
  now: Date = new Date(),
): OpenBusinessDayDurationAlert | null {
  if (!day || day.status !== 'open' || !day.openedAt) return null
  const openedDate = new Date(day.openedAt)
  if (Number.isNaN(openedDate.getTime()) || Number.isNaN(now.getTime())) return null

  const openedParts = getIstanbulParts(openedDate)
  const nowParts = getIstanbulParts(now)
  const openedDayMs = Date.UTC(openedParts.year, openedParts.month - 1, openedParts.day)
  const nowDayMs = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)
  const calendarDaysOpen = Math.floor((nowDayMs - openedDayMs) / (24 * 60 * 60 * 1000))

  if (calendarDaysOpen < 1) return null

  const monthLabel = TR_SHORT_MONTHS[openedParts.month - 1] || ''
  const timeStr = `${String(openedParts.hour).padStart(2, '0')}:${String(openedParts.minute).padStart(2, '0')}`
  const openedAtLabel = `${openedParts.day} ${monthLabel} ${timeStr}`
  const suffix = getTurkishTimeSinceSuffix(openedParts.hour, openedParts.minute)

  return {
    calendarDaysOpen,
    openedAtLabel,
    message: `İş günü ${calendarDaysOpen} gündür açık (${openedAtLabel}${suffix}).`,
  }
}

export interface DataInconsistencyItem {
  code:
    | 'paid_refund_marked_unreceived'
    | 'paid_refund_missing_iade_movement'
    | 'payment_trimmed_or_deleted_vs_logs'
    | 'legacy_payment_missing_type_or_status'
    | 'active_overpayment_pending_refund'
    | 'closed_day_expected_cash_mismatch'
    | 'cross_day_payment_shift'
  entityType: 'refund' | 'table' | 'order' | 'payment' | 'businessDay'
  entityId: string
  businessDayId?: string
  tableId?: string
  tableName?: string
  orderId?: string
  amount?: number
  message: string
}

export interface DataInconsistencyReport {
  checkedAt: string
  totalIssues: number
  issues: DataInconsistencyItem[]
}

/**
 * Adım E: Mevcut verideki olası ödeme/iade tutarsızlıklarını (HATA 2.1, 2.2, 2.3 kaynaklı)
 * ve kapanmış eski günlerdeki beklenen nakit uyuşmazlıklarını
 * hiçbir veriyi otomatik değiştirmeden tespit eder ve listeler.
 */
export function detectPaymentAndRefundInconsistencies(input: {
  tables?: Table[]
  completedOrders?: CompletedOrder[]
  refunds?: Refund[]
  activityLogs?: ActivityLog[]
  businessDays?: BusinessDay[]
}): DataInconsistencyReport {
  const tables = input.tables ?? []
  const orders = input.completedOrders ?? []
  const refunds = input.refunds ?? []
  const logs = input.activityLogs ?? []
  const businessDays = input.businessDays ?? []
  const issues: DataInconsistencyItem[] = []

  // Collect all IADE movements across tables and orders
  const allIadeMovements: Array<{
    movement: PartialPayment
    tableId?: string
    orderId?: string
  }> = []

  for (const t of tables) {
    const payments = t.payments || []
    for (const p of payments) {
      if (!p.type || !p.status) {
        issues.push({
          code: 'legacy_payment_missing_type_or_status',
          entityType: 'payment',
          entityId: p.id,
          businessDayId: p.businessDayId,
          tableId: t.id,
          tableName: t.name,
          amount: p.amount,
          message: `${t.name} üzerindeki ödeme kaydında (${p.id}) type/status alanı eksik (ODEME + GECERLI olarak varsayılıyor).`,
        })
      }
      if (isValidPaymentMovement(p) && p.type === 'IADE') {
        allIadeMovements.push({ movement: p, tableId: p.tableId || t.id, orderId: p.orderId })
      }
    }

    const totals = calculateTotals(t.cart || [], t.discountRate || 0, t.discountAmount || 0)
    const { overpayment } = derivePaymentState(totals.total, payments)
    if (overpayment > 0) {
      issues.push({
        code: 'active_overpayment_pending_refund',
        entityType: 'table',
        entityId: t.id,
        tableId: t.id,
        tableName: t.name,
        amount: overpayment,
        message: `${t.name} masasında ${formatCurrency(overpayment)} tutarında iade edilmemiş fazla ödeme (overpayment) bulunuyor.`,
      })
    }
  }

  for (const o of orders) {
    const payments = o.payments || []
    for (const p of payments) {
      if (!p.type || !p.status) {
        issues.push({
          code: 'legacy_payment_missing_type_or_status',
          entityType: 'payment',
          entityId: p.id,
          businessDayId: p.businessDayId || o.businessDayId,
          tableId: o.tableId,
          tableName: o.tableName,
          orderId: o.id,
          amount: p.amount,
          message: `Sipariş #${o.orderNumber} (${o.id}) ödeme kaydında (${p.id}) type/status alanı eksik (ODEME + GECERLI olarak varsayılıyor).`,
        })
      }
      if (isValidPaymentMovement(p) && p.type === 'IADE') {
        allIadeMovements.push({
          movement: p,
          tableId: p.tableId || o.tableId,
          orderId: p.orderId || o.id,
        })
      }
    }
  }

  // Check Refund records for HATA 2.2 (paymentReceived hardcoded false despite paymentMethod & payments)
  // and HATA 2.1 (paid refund missing corresponding IADE movement on table/order)
  for (const r of refunds) {
    const hasPaymentMethod = Boolean(r.paymentMethod && String(r.paymentMethod).trim().length > 0)
    const relatedTable = r.tableId ? tables.find((t) => t.id === r.tableId) : undefined
    const relatedOrder = r.orderId
      ? orders.find((o) => o.id === r.orderId)
      : r.tableId
        ? orders.find(
            (o) =>
              o.tableId === r.tableId &&
              (!r.businessDayId || o.businessDayId === r.businessDayId),
          )
        : undefined

    const tableHadPayments = Boolean(
      (relatedTable?.payments && relatedTable.payments.length > 0) ||
        (relatedOrder?.payments && relatedOrder.payments.length > 0) ||
        logs.some(
          (l) =>
            l.type === 'payment' &&
            ((r.tableId && l.tableId === r.tableId) || (r.orderId && l.orderId === r.orderId)),
        ),
    )

    if (r.paymentReceived === false && hasPaymentMethod && tableHadPayments) {
      issues.push({
        code: 'paid_refund_marked_unreceived',
        entityType: 'refund',
        entityId: r.id,
        businessDayId: r.businessDayId,
        tableId: r.tableId,
        tableName: r.tableName,
        orderId: r.orderId,
        amount: r.amount,
        message: `İade kaydı (${r.id}, ${formatCurrency(r.amount)}) için ödeme yöntemi (${r.paymentMethod}) seçilmiş ve masada ödeme kaydı var, ancak eski HATA 2.2 nedeniyle paymentReceived: false yazılmış.`,
      })
    }

    if (r.paymentReceived === true && (r.tableId || r.orderId)) {
      const hasMatchingIade = allIadeMovements.some(
        (entry) =>
          entry.movement.id === r.paymentMovementId ||
          entry.movement.id === r.id ||
          (toKurus(entry.movement.amount) === toKurus(r.amount) &&
            ((r.orderId && entry.orderId === r.orderId) ||
              (r.tableId && entry.tableId === r.tableId))),
      )
      if (!hasMatchingIade && (relatedTable || relatedOrder)) {
        issues.push({
          code: 'paid_refund_missing_iade_movement',
          entityType: 'refund',
          entityId: r.id,
          businessDayId: r.businessDayId,
          tableId: r.tableId,
          tableName: r.tableName,
          orderId: r.orderId,
          amount: r.amount,
          message: `Tahsil edilmiş iade kaydının (${r.id}, ${formatCurrency(r.amount)}) ilişkili masa/sipariş ödeme hareketlerinde karşılık gelen IADE hareketi bulunmuyor.`,
        })
      }
    }
  }

  // Check for payments trimmed by trimPaymentsToCap (HATA 2.1) or removed by slice(0, -1) (HATA 2.3)
  for (const t of tables) {
    if (!isTableOccupied(t)) continue
    const partialLogs = logs.filter(
      (l) =>
        l.type === 'payment' &&
        l.tableId === t.id &&
        typeof l.details === 'string' &&
        l.details.includes('ara ödeme alındı'),
    )
    if (partialLogs.length > 0) {
      const loggedKurus = partialLogs.reduce((sum, l) => sum + Math.max(0, toKurus(l.amount || 0)), 0)
      const allOdemeMovements = (t.payments || []).filter((p) => (p.type || 'ODEME') === 'ODEME')
      const movementKurus = allOdemeMovements.reduce(
        (sum, p) => sum + Math.max(0, toKurus(p.amount)),
        0,
      )
      if (loggedKurus > movementKurus || partialLogs.length > allOdemeMovements.length) {
        issues.push({
          code: 'payment_trimmed_or_deleted_vs_logs',
          entityType: 'table',
          entityId: t.id,
          tableId: t.id,
          tableName: t.name,
          amount: fromKurus(Math.max(0, loggedKurus - movementKurus)),
          message: `${t.name} masasında işlem loglarında ${partialLogs.length} ara ödeme (${formatCurrency(fromKurus(loggedKurus))}) görünürken masadaki ODEME hareketleri toplamı ${formatCurrency(fromKurus(movementKurus))} (${allOdemeMovements.length} kayıt). Eski trimPaymentsToCap veya slice(0, -1) nedeniyle kayıt kırpılmış/silinmiş olabilir.`,
        })
      }
    }
  }

  // Check closed historical BusinessDay records for expectedCash mismatch vs central calculation
  // and detect cross-day payment shifts without mutating archived Z reports
  const closedDayIdsSet = new Set(
    businessDays.filter((d) => d.status === 'closed').map((d) => d.id),
  )

  for (const t of tables) {
    if (!isTableOccupied(t) || !t.payments || t.payments.length === 0) continue
    let closedCarryKurus = 0
    const affectedDays = new Set<string>()
    for (const p of t.payments) {
      if (!isValidPaymentMovement(p)) continue
      if (p.businessDayId && closedDayIdsSet.has(p.businessDayId)) {
        const k = Math.max(0, toKurus(p.amount))
        closedCarryKurus += p.type === 'IADE' ? -k : k
        affectedDays.add(p.businessDayId)
      }
    }
    if (closedCarryKurus > 0) {
      issues.push({
        code: 'cross_day_payment_shift',
        entityType: 'table',
        entityId: t.id,
        tableId: t.id,
        tableName: t.name,
        businessDayId: Array.from(affectedDays)[0],
        amount: fromKurus(closedCarryKurus),
        message: `${t.name} masasında günü kapanmış önceki iş gününe ait (${Array.from(affectedDays).join(', ')}) toplam ${formatCurrency(fromKurus(closedCarryKurus))} ara ödeme devri bulunuyor. Kapanmış gün raporu değiştirilmeden bugünkü raporda ayrı devir satırında gösterilir.`,
      })
    }
  }

  for (const o of orders) {
    if (o.cancelled || o.reopened || !o.payments || o.payments.length === 0) continue
    let shiftedKurus = 0
    const shiftedDayIds = new Set<string>()
    for (const p of o.payments) {
      if (!isValidPaymentMovement(p)) continue
      if (p.businessDayId && o.businessDayId && p.businessDayId !== o.businessDayId) {
        shiftedKurus += Math.max(0, toKurus(p.amount))
        shiftedDayIds.add(p.businessDayId)
      }
    }
    if (shiftedKurus > 0) {
      issues.push({
        code: 'cross_day_payment_shift',
        entityType: 'order',
        entityId: o.id,
        businessDayId: o.businessDayId,
        orderId: o.id,
        tableId: o.tableId,
        tableName: o.tableName,
        amount: fromKurus(shiftedKurus),
        message: `Sipariş #${o.orderNumber} (${o.businessDayId}) içerisinde farklı iş gününe (${Array.from(shiftedDayIds).join(', ')}) ait toplam ${formatCurrency(fromKurus(shiftedKurus))} ödeme hareketi tespit edildi. Her tahsilat hareketi kendi iş gününe ayrıştırılır.`,
      })
    }
  }

  for (const d of businessDays) {
    if (d.status !== 'closed' || typeof d.expectedCash !== 'number') continue
    const dayOrders = selectOrdersForBusinessDay(orders, d.id)
    const reportForCheck =
      dayOrders.length > 0
        ? buildReportFromOrders(dayOrders, 10, undefined, d.id, refunds, {
            closedBusinessDayIds: businessDays
              .filter((b) => b.status === 'closed' && b.id !== d.id)
              .map((b) => b.id),
          })
        : (d.report ?? buildReportFromOrders([], 10, undefined, d.id, refunds))
    const cashSummary = hesaplaBeklenenNakit(d, reportForCheck)
    if (typeof cashSummary.arsivFarki === 'number') {
      issues.push({
        code: 'closed_day_expected_cash_mismatch',
        entityType: 'businessDay',
        entityId: d.id,
        businessDayId: d.id,
        amount: Math.abs(cashSummary.arsivFarki),
        message: `Kapanmış iş günü (${formatDayShortLabel(d)}) için arşivde kayıtlı beklenen nakit (${formatCurrency(cashSummary.arsivExpectedCash ?? d.expectedCash)}), merkezi hesaplamadan (${formatCurrency(cashSummary.beklenen)}) ${formatCurrency(Math.abs(cashSummary.arsivFarki))} farklı. Geçmiş Z raporu korunmuştur.`,
      })
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    totalIssues: issues.length,
    issues,
  }
}

export { formatCurrency }

