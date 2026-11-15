import type {
  ActivityLog,
  AppSettings,
  BusinessDay,
  CartItem,
  CompletedOrder,
  ConcretePaymentMethod,
  PartialPayment,
  Session,
  Table,
  User,
} from '../types'
import {
  deriveTableStatus,
  formatCurrency,
  fromKurus,
  isTableOccupied,
  isValidPaymentMovement,
  normalizePaymentMethod,
  toKurus,
} from './format'
import { can } from './permissions'
import { generateUUID } from './uuid'

export interface PaymentMethodBreakdownEntry {
  method: ConcretePaymentMethod
  label: 'Nakit' | 'Kart' | 'IBAN'
  amount: number
}

export interface OrderPaymentBreakdownSummary {
  entries: PaymentMethodBreakdownEntry[]
  total: number
  /** Tek yöntemde "₺520,00 · Nakit", parçalı ödemede "₺200,00 Nakit + ₺320,00 Kart" */
  summaryText: string
}

const METHOD_LABELS: Record<ConcretePaymentMethod, 'Nakit' | 'Kart' | 'IBAN'> = {
  cash: 'Nakit',
  card: 'Kart',
  iban: 'IBAN',
}

/**
 * Bir adisyonun (açık veya geri açılmak üzere olan kapalı adisyonun) ödeme kırılımını
 * yöntem bazında kuruş hassasiyetiyle hesaplar.
 */
export const getOrderPaymentBreakdownSummary = (
  order: CompletedOrder,
): OrderPaymentBreakdownSummary => {
  const methodOrder: ConcretePaymentMethod[] = []
  const kurusByMethod: Record<ConcretePaymentMethod, number> = {
    cash: 0,
    card: 0,
    iban: 0,
  }

  const rawPayments = Array.isArray(order.payments) ? order.payments : []
  // Geri açılmamış siparişte geçerli ödemeleri al; eğer tümü iptal edilmişse (zaten geri açılmışsa) tüm ödemeleri göster
  const sourcePayments = rawPayments.some((p) => isValidPaymentMovement(p) && p.type !== 'IADE')
    ? rawPayments.filter((p) => isValidPaymentMovement(p) && p.type !== 'IADE')
    : rawPayments.filter((p) => p && p.type !== 'IADE' && toKurus(p.amount) > 0)

  if (sourcePayments.length > 0) {
    for (const p of sourcePayments) {
      const amtKurus = Math.max(0, toKurus(p.amount))
      if (amtKurus <= 0) continue
      const method = normalizePaymentMethod(p.method, 'cash')
      if (!methodOrder.includes(method)) {
        methodOrder.push(method)
      }
      kurusByMethod[method] += amtKurus
    }
  } else {
    const fallbackKurus = Math.max(0, toKurus(order.totals?.total ?? 0))
    const fallbackMethod = normalizePaymentMethod(order.paymentMethod, 'cash')
    if (fallbackKurus > 0) {
      methodOrder.push(fallbackMethod)
      kurusByMethod[fallbackMethod] = fallbackKurus
    }
  }

  const entries: PaymentMethodBreakdownEntry[] = methodOrder
    .filter((m) => kurusByMethod[m] > 0)
    .map((m) => ({
      method: m,
      label: METHOD_LABELS[m],
      amount: fromKurus(kurusByMethod[m]),
    }))

  const totalKurus = entries.reduce((sum, e) => sum + toKurus(e.amount), 0)
  const total = fromKurus(totalKurus)

  let summaryText: string
  if (entries.length === 0) {
    const fallbackMethod = normalizePaymentMethod(order.paymentMethod, 'cash')
    summaryText = `${formatCurrency(0)} · ${METHOD_LABELS[fallbackMethod]}`
  } else if (entries.length === 1) {
    const single = entries[0]
    summaryText = `${formatCurrency(single.amount)} · ${single.label}`
  } else {
    summaryText = entries.map((e) => `${formatCurrency(e.amount)} ${e.label}`).join(' + ')
  }

  return {
    entries,
    total,
    summaryText,
  }
}

/**
 * Geri açma onay penceresinde gösterilecek sabit bilgilendirme metnini üretir.
 * Tek yöntem: "Alınan ödeme (₺520,00 · Nakit) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak."
 * Parçalı:    "Alınan ödeme (₺200,00 Nakit + ₺320,00 Kart) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak."
 */
export const formatReopenCancellationNotice = (order: CompletedOrder): string => {
  const { summaryText } = getOrderPaymentBreakdownSummary(order)
  return `Alınan ödeme (${summaryText}) iptal edilecek ve raporlardan düşülecek. Masa, ürünleriyle birlikte ödenmemiş olarak açılacak.`
}

const cloneCartItemsForReopen = (items: CartItem[]): CartItem[] => {
  return (items || []).map((item) => ({
    ...item,
    selectedOptions: item.selectedOptions
      ? item.selectedOptions.map((opt) => ({ ...opt }))
      : undefined,
    optionGroups: item.optionGroups
      ? item.optionGroups.map((grp) => ({
          ...grp,
          options: grp.options ? grp.options.map((o) => ({ ...o })) : [],
        }))
      : undefined,
    itemDiscount: item.itemDiscount ? { ...item.itemDiscount } : undefined,
  }))
}

export interface ExecuteOrderReopenInput {
  orderId: string
  targetTableId: string
  reason: string
  completedOrders: CompletedOrder[]
  tables: Table[]
  openBusinessDay: BusinessDay | null | undefined
  actor?: User | Session | null
  settings?: AppSettings
  userName?: string
  nowIso?: string
}

export interface ExecuteOrderReopenSuccess {
  ok: true
  reopenedOrder: CompletedOrder
  reopenedTable: Table
  updatedOrders: CompletedOrder[]
  updatedTables: Table[]
  cancelledPayments: PartialPayment[]
  breakdown: OrderPaymentBreakdownSummary
  tableMoved: boolean
  sourceTableLabel: string
  targetTableLabel: string
  activityLogPayload: Omit<ActivityLog, 'id' | 'createdAt' | 'userName' | 'businessDayId'> & {
    createdAt: string
    userName: string
    businessDayId?: string
  }
}

export interface ExecuteOrderReopenFailure {
  ok: false
  code:
    | 'UNAUTHORIZED'
    | 'ORDER_NOT_FOUND'
    | 'ALREADY_REOPENED'
    | 'ORDER_CANCELLED'
    | 'CLOSED_BUSINESS_DAY'
    | 'INVALID_REASON'
    | 'TABLE_NOT_FOUND'
    | 'TABLE_OCCUPIED'
  error: string
}

export type ExecuteOrderReopenResult = ExecuteOrderReopenSuccess | ExecuteOrderReopenFailure

/**
 * Kapalı bir adisyonu geri açma işlemini tüm iş kuralları ve değişmezlerle (invariants)
 * tek ve atomik bir adım olarak doğrular ve yeni durumları üretir.
 * Herhangi bir kural ihlalinde hiçbir veriyi değiştirmeden hata döner.
 */
export const executeOrderReopen = (
  input: ExecuteOrderReopenInput,
): ExecuteOrderReopenResult => {
  const {
    orderId,
    targetTableId,
    reason,
    completedOrders,
    tables,
    openBusinessDay,
    actor,
    settings,
    userName,
    nowIso = new Date().toISOString(),
  } = input

  // 1. Yetki kontrolü
  if (actor !== undefined && !can(actor, 'reopen_order', settings)) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Kapalı adisyonu geri açma yetkiniz bulunmuyor.',
    }
  }

  // 2. Adisyon varlık ve durum kontrolü
  const targetOrder = completedOrders.find((o) => o.id === orderId)
  if (!targetOrder) {
    return {
      ok: false,
      code: 'ORDER_NOT_FOUND',
      error: 'Geri açılacak adisyon bulunamadı.',
    }
  }

  if (targetOrder.reopened) {
    return {
      ok: false,
      code: 'ALREADY_REOPENED',
      error: 'Bu adisyon zaten geri açılmış.',
    }
  }

  if (targetOrder.cancelled) {
    return {
      ok: false,
      code: 'ORDER_CANCELLED',
      error: 'İptal edilmiş bir adisyon geri açılamaz.',
    }
  }

  // 3. Aktif iş günü kontrolü (Değişmez 8 & Bölüm 4.2)
  if (
    !openBusinessDay ||
    openBusinessDay.status !== 'open' ||
    !targetOrder.businessDayId ||
    targetOrder.businessDayId !== openBusinessDay.id
  ) {
    return {
      ok: false,
      code: 'CLOSED_BUSINESS_DAY',
      error: 'Bu adisyon kapanmış bir güne ait, geri açılamaz.',
    }
  }

  // 4. Geri açma sebebi kontrolü (en az 3 karakter)
  const trimmedReason = (reason || '').trim()
  if (trimmedReason.length < 3) {
    return {
      ok: false,
      code: 'INVALID_REASON',
      error: 'Geri açma sebebi en az 3 karakter olmalıdır.',
    }
  }

  // 5. Açılacak masa kontrolü (Bölüm 4.1: Dolu masaya geri açma engellenir)
  const targetTable = tables.find((t) => t.id === targetTableId)
  if (!targetTable) {
    return {
      ok: false,
      code: 'TABLE_NOT_FOUND',
      error: 'Açılacak masa bulunamadı.',
    }
  }

  if (isTableOccupied(targetTable)) {
    return {
      ok: false,
      code: 'TABLE_OCCUPIED',
      error: 'Bu masada aktif bir adisyon var, önce onu kapatın ya da başka masa seçin',
    }
  }

  const resolvedUserName =
    userName ||
    (actor && 'fullName' in actor ? actor.fullName : undefined) ||
    'Yönetici'

  const breakdown = getOrderPaymentBreakdownSummary(targetOrder)

  // 6. Ödeme hareketlerini silmeden IPTAL durumuna çek (Değişmez 4 & Bölüm 1.1)
  const existingPayments =
    Array.isArray(targetOrder.payments) && targetOrder.payments.length > 0
      ? targetOrder.payments
      : [
          {
            id: `pay_${targetOrder.id}_0`,
            orderId: targetOrder.id,
            tableId: targetOrder.tableId || targetTable.id,
            businessDayId: targetOrder.businessDayId,
            type: 'ODEME' as const,
            status: 'GECERLI' as const,
            method: normalizePaymentMethod(targetOrder.paymentMethod, 'cash'),
            amount: fromKurus(Math.max(0, toKurus(targetOrder.totals?.total ?? 0))),
            createdAt: targetOrder.date || nowIso,
            cashier: targetOrder.cashier || resolvedUserName,
          },
        ]

  const cancelledPayments: PartialPayment[] = existingPayments.map((p) => ({
    ...p,
    orderId: p.orderId || targetOrder.id,
    tableId: p.tableId || targetOrder.tableId || targetTable.id,
    businessDayId: p.businessDayId || targetOrder.businessDayId,
    type: p.type || 'ODEME',
    method: normalizePaymentMethod(p.method, 'cash'),
    amount: fromKurus(Math.max(0, toKurus(p.amount))),
    status: 'IPTAL',
    cancelledAt: nowIso,
    cancelledBy: resolvedUserName,
    cancelledReason: trimmedReason,
  }))

  const reopenedOrder: CompletedOrder = {
    ...targetOrder,
    reopened: true,
    reopenedAt: nowIso,
    reopenedBy: resolvedUserName,
    reopenReason: trimmedReason,
    reopenedToTableId: targetTable.id,
    reopenedToTableName: targetTable.name,
    cancelledPaymentsTotal: breakdown.total,
    cancelledPaymentsSummary: breakdown.summaryText,
    payments: cancelledPayments,
  }

  // 7. Masayı ürünleriyle birlikte ödenmemiş (Ödenen = 0, Kalan = Tam Tutar) olarak aç
  const restoredCart = cloneCartItemsForReopen(targetOrder.items)
  const reopenedTable: Table = {
    ...targetTable,
    status: 'occupied',
    cart: restoredCart,
    payments: [],
    discountRate: targetOrder.discountRate || 0,
    discountAmount: targetOrder.discountAmount || 0,
    note: targetOrder.note || '',
    customerName: targetOrder.customerName || '',
  }

  const updatedOrders = completedOrders.map((o) =>
    o.id === targetOrder.id ? reopenedOrder : o,
  )
  const updatedTables = tables.map((t) =>
    t.id === targetTable.id ? reopenedTable : t,
  )

  const sourceTableLabel = targetOrder.tableName || targetOrder.tableId || targetTable.name
  const targetTableLabel = targetTable.name
  const tableMoved = Boolean(
    (targetOrder.tableId && targetOrder.tableId !== targetTable.id) ||
      (targetOrder.tableName && targetOrder.tableName !== targetTable.name),
  )
  const tableTransitionText = tableMoved
    ? `${sourceTableLabel} → ${targetTableLabel}`
    : targetTableLabel

  const activityDetails = `Sipariş #${targetOrder.orderNumber} geri açıldı (${tableTransitionText}). İptal edilen ödeme: ${breakdown.summaryText}. Sebep: ${trimmedReason}`

  return {
    ok: true,
    reopenedOrder,
    reopenedTable,
    updatedOrders,
    updatedTables,
    cancelledPayments,
    breakdown,
    tableMoved,
    sourceTableLabel,
    targetTableLabel,
    activityLogPayload: {
      type: 'order_reopen',
      orderId: targetOrder.id,
      tableId: targetTable.id,
      tableName: tableTransitionText,
      oldValue: targetOrder.tableName || targetOrder.tableId,
      newValue: targetTable.name,
      amount: breakdown.total,
      reason: trimmedReason,
      details: activityDetails,
      userName: resolvedUserName,
      createdAt: nowIso,
      businessDayId: openBusinessDay.id,
    },
  }
}

export interface HealReopenedDataResult {
  healed: boolean
  healedTablesCount: number
  healedOrdersCount: number
  tables: Table[]
  completedOrders: CompletedOrder[]
}

/**
 * Mevcut veritabanında / localStorage'da eski "Ödemeyi Koru" seçeneğinden kaynaklanan
 * veya eksik durum/tip alanlarına sahip geri açılmış adisyonları ve açık masaları
 * veri kaybı olmadan onarır (healing).
 */
export const healCorruptedReopenedData = (
  tables: Table[],
  completedOrders: CompletedOrder[],
): HealReopenedDataResult => {
  let healed = false
  let healedTablesCount = 0
  let healedOrdersCount = 0

  const reopenedPaymentIds = new Set<string>()
  for (const order of completedOrders) {
    if (!order.reopened) continue
    for (const p of order.payments || []) {
      if (p && p.id) {
        reopenedPaymentIds.add(p.id)
      }
    }
  }

  const nextOrders = completedOrders.map((order) => {
    if (order.reopened) {
      const existingPayments = Array.isArray(order.payments) ? order.payments : []
      if (existingPayments.length === 0 && toKurus(order.totals?.total ?? 0) > 0) {
        healed = true
        healedOrdersCount += 1
        const synthesizedId = `pay_${order.id}_healed_${generateUUID().slice(0, 8)}`
        reopenedPaymentIds.add(synthesizedId)
        return {
          ...order,
          payments: [
            {
              id: synthesizedId,
              orderId: order.id,
              tableId: order.tableId,
              businessDayId: order.businessDayId,
              type: 'ODEME' as const,
              status: 'IPTAL' as const,
              method: normalizePaymentMethod(order.paymentMethod, 'cash'),
              amount: fromKurus(Math.max(0, toKurus(order.totals?.total ?? 0))),
              createdAt: order.date,
              cashier: order.cashier,
              cancelledAt: order.reopenedAt || order.date,
              cancelledBy: order.reopenedBy || order.cashier || 'Sistem Onarımı',
              cancelledReason: order.reopenReason || 'Geri açılan adisyon ödeme iptali',
            },
          ],
        }
      }

      const needsPaymentStatusFix = existingPayments.some(
        (p) =>
          p.status !== 'IPTAL' ||
          !p.type ||
          !p.cancelledAt ||
          !p.cancelledReason ||
          toKurus(p.amount) < 0,
      )
      if (!needsPaymentStatusFix) return order

      healed = true
      healedOrdersCount += 1
      return {
        ...order,
        payments: existingPayments.map((p) => ({
          ...p,
          orderId: p.orderId || order.id,
          tableId: p.tableId || order.tableId,
          businessDayId: p.businessDayId || order.businessDayId,
          type: p.type || 'ODEME',
          status: 'IPTAL' as const,
          method: normalizePaymentMethod(p.method, 'cash'),
          amount: fromKurus(Math.abs(toKurus(p.amount))),
          cancelledAt: p.cancelledAt || order.reopenedAt || order.date,
          cancelledBy: p.cancelledBy || order.reopenedBy || order.cashier || 'Sistem Onarımı',
          cancelledReason: p.cancelledReason || order.reopenReason || 'Geri açılan adisyon ödeme iptali',
        })),
      }
    }

    // Normal (geri açılmamış) siparişlerde eksik tip/durum varsayılanlarını tamamla
    if (Array.isArray(order.payments) && order.payments.length > 0) {
      const needsDefaultNormalization = order.payments.some(
        (p) => !p.type || !p.status || toKurus(p.amount) < 0,
      )
      if (needsDefaultNormalization) {
        return {
          ...order,
          payments: order.payments.map((p) => ({
            ...p,
            type: p.type || 'ODEME',
            status: p.status || 'GECERLI',
            method: normalizePaymentMethod(p.method, 'cash'),
            amount: fromKurus(Math.abs(toKurus(p.amount))),
          })),
        }
      }
    }
    return order
  })

  const nextTables = tables.map((table) => {
    const rawPayments = Array.isArray(table.payments) ? table.payments : []
    if (rawPayments.length === 0) return table

    const filteredPayments = rawPayments
      .filter((p) => {
        if (!p) return false
        // Geri açılmış bir adisyondan "Ödemeyi Koru" ile masaya taşınmış eski ödemeleri temizle
        if (p.id && reopenedPaymentIds.has(p.id)) return false
        if (!Number.isFinite(p.amount) || toKurus(p.amount) <= 0) return false
        return true
      })
      .map((p) => ({
        ...p,
        type: p.type || ('ODEME' as const),
        status: p.status || ('GECERLI' as const),
        method: normalizePaymentMethod(p.method, 'cash'),
        amount: fromKurus(Math.max(0, toKurus(p.amount))),
      }))

    if (filteredPayments.length !== rawPayments.length) {
      healed = true
      healedTablesCount += 1
      const updatedTable = {
        ...table,
        payments: filteredPayments,
      }
      return {
        ...updatedTable,
        status: deriveTableStatus(updatedTable),
      }
    }

    return table
  })

  return {
    healed,
    healedTablesCount,
    healedOrdersCount,
    tables: nextTables,
    completedOrders: nextOrders,
  }
}

export interface GhostTableRepairResult {
  healed: boolean
  repairedTables: Array<{ id: string; name: string }>
  tables: Table[]
}

/**
 * Uygulama açılışında status: 'occupied' göründüğü halde sepeti, geçerli ödemesi
 * ve müşteri adı tamamen boş olan hayalet masaları tespit eder, 'empty' durumuna çeker.
 */
export const repairGhostOccupiedTables = (tables: Table[]): GhostTableRepairResult => {
  const repairedTables: Array<{ id: string; name: string }> = []
  const nextTables = tables.map((table) => {
    if (table.status === 'occupied' && !isTableOccupied(table)) {
      repairedTables.push({ id: table.id, name: table.name })
      return {
        ...table,
        status: 'empty' as const,
      }
    }
    return table
  })

  return {
    healed: repairedTables.length > 0,
    repairedTables,
    tables: nextTables,
  }
}
