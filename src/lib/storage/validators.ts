import type {
  BusinessDay,
  CompletedOrder,
  Product,
  Refund,
  Table,
} from '../../types'
import type { ActivityLog } from '../../types'
import type { User } from '../../types'
import type { POSBackupFile, POSBackupPayload } from './types'
import { verifyChecksum } from './checksum'

export function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

export function validateTable(item: unknown): Table | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.name !== 'string' || !item.name.trim()) return null

  return {
    id: item.id.trim(),
    name: item.name.trim(),
    status: item.status === 'occupied' ? 'occupied' : 'empty',
    cart: Array.isArray(item.cart) ? item.cart : [],
    note: typeof item.note === 'string' ? item.note : undefined,
    customerName: typeof item.customerName === 'string' ? item.customerName : undefined,
    discountRate: typeof item.discountRate === 'number' && Number.isFinite(item.discountRate) ? item.discountRate : 0,
    discountAmount: typeof item.discountAmount === 'number' && Number.isFinite(item.discountAmount) && item.discountAmount >= 0 ? item.discountAmount : 0,
    payments: Array.isArray(item.payments) ? item.payments : [],
  }
}

export function validateTables(data: unknown): Table[] | null {
  if (!Array.isArray(data)) return null
  const validated: Table[] = []
  for (const item of data) {
    const table = validateTable(item)
    if (table) validated.push(table)
  }
  return validated
}

export function validateCompletedOrder(item: unknown): CompletedOrder | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.orderNumber !== 'string') return null
  if (!Array.isArray(item.items)) return null
  if (!isObject(item.totals)) return null

  const subtotal = typeof item.totals.subtotal === 'number' ? item.totals.subtotal : 0
  const total = typeof item.totals.total === 'number' ? item.totals.total : 0
  const discount = typeof item.totals.discount === 'number' ? item.totals.discount : 0

  return {
    id: item.id.trim(),
    orderNumber: item.orderNumber,
    items: item.items,
    totals: { subtotal, total, discount },
    paymentMethod: typeof item.paymentMethod === 'string' ? (item.paymentMethod as any) : 'cash',
    payments: Array.isArray(item.payments) ? item.payments : [],
    date: typeof item.date === 'string' ? item.date : new Date().toISOString(),
    note: typeof item.note === 'string' ? item.note : undefined,
    customerName: typeof item.customerName === 'string' ? item.customerName : undefined,
    cashier: typeof item.cashier === 'string' ? item.cashier : undefined,
    businessDayId: typeof item.businessDayId === 'string' ? item.businessDayId : undefined,
    tableId: typeof item.tableId === 'string' ? item.tableId : undefined,
    tableName: typeof item.tableName === 'string' ? item.tableName : undefined,
    discountRate: typeof item.discountRate === 'number' ? item.discountRate : 0,
    discountAmount: typeof item.discountAmount === 'number' && Number.isFinite(item.discountAmount) && item.discountAmount >= 0 ? item.discountAmount : 0,
    taxRate: typeof item.taxRate === 'number' ? item.taxRate : 10,
    cancelled: Boolean(item.cancelled),
    cancelledAt: typeof item.cancelledAt === 'string' ? item.cancelledAt : undefined,
    reopened: Boolean(item.reopened),
    reopenedAt: typeof item.reopenedAt === 'string' ? item.reopenedAt : undefined,
    reopenReason: typeof item.reopenReason === 'string' ? item.reopenReason : undefined,
    reopenedBy: typeof item.reopenedBy === 'string' ? item.reopenedBy : undefined,
  }
}

export function validateCompletedOrders(data: unknown): CompletedOrder[] | null {
  if (!Array.isArray(data)) return null
  const validated: CompletedOrder[] = []
  for (const item of data) {
    const order = validateCompletedOrder(item)
    if (order) validated.push(order)
  }
  return validated
}

export function validateBusinessDay(item: unknown): BusinessDay | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (item.status !== 'open' && item.status !== 'closed') return null
  if (typeof item.openedAt !== 'string') return null

  return {
    id: item.id.trim(),
    status: item.status,
    openedAt: item.openedAt,
    openedBy: typeof item.openedBy === 'string' ? item.openedBy : 'Kasiyer',
    openingCash: typeof item.openingCash === 'number' && Number.isFinite(item.openingCash) ? item.openingCash : 0,
    closedAt: typeof item.closedAt === 'string' ? item.closedAt : undefined,
    closedBy: typeof item.closedBy === 'string' ? item.closedBy : undefined,
    countedCash: typeof item.countedCash === 'number' ? item.countedCash : undefined,
    closingCash: typeof item.closingCash === 'number' ? item.closingCash : undefined,
    expectedCash: typeof item.expectedCash === 'number' ? item.expectedCash : undefined,
    cashDifference: typeof item.cashDifference === 'number' ? item.cashDifference : undefined,
    note: typeof item.note === 'string' ? item.note : undefined,
    closeNote: typeof item.closeNote === 'string' ? item.closeNote : undefined,
    report: isObject(item.report) ? (item.report as any) : undefined,
    expectedZ: typeof item.expectedZ === 'number' ? item.expectedZ : undefined,
    enteredZ: typeof item.enteredZ === 'number' ? item.enteredZ : undefined,
    zDifference: typeof item.zDifference === 'number' ? item.zDifference : undefined,
  }
}

export function validateBusinessDays(data: unknown): BusinessDay[] | null {
  if (!Array.isArray(data)) return null
  const validated: BusinessDay[] = []
  for (const item of data) {
    const day = validateBusinessDay(item)
    if (day) validated.push(day)
  }
  return validated
}

export function validateMenuProduct(item: unknown): Product | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.name !== 'string' || !item.name.trim()) return null
  if (typeof item.price !== 'number' || !Number.isFinite(item.price)) return null

  return {
    id: item.id.trim(),
    name: item.name.trim(),
    description: typeof item.description === 'string' ? item.description : '',
    price: Math.max(0, item.price),
    category: (typeof item.category === 'string' ? item.category : 'Sıcak Kahveler') as any,
    badge: item.badge === 'Yeni' || item.badge === 'Çok Satan' ? item.badge : undefined,
    image_url: typeof item.image_url === 'string' ? item.image_url : undefined,
    optionGroups: Array.isArray(item.optionGroups) ? item.optionGroups : undefined,
  }
}

export function validateMenuProducts(data: unknown): Product[] | null {
  if (!Array.isArray(data)) return null
  const validated: Product[] = []
  for (const item of data) {
    const prod = validateMenuProduct(item)
    if (prod) validated.push(prod)
  }
  return validated
}

export function validateRefund(item: unknown): Refund | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.amount !== 'number' || !Number.isFinite(item.amount)) return null

  return {
    id: item.id.trim(),
    businessDayId: typeof item.businessDayId === 'string' ? item.businessDayId : undefined,
    orderId: typeof item.orderId === 'string' ? item.orderId : undefined,
    tableId: typeof item.tableId === 'string' ? item.tableId : undefined,
    tableName: typeof item.tableName === 'string' ? item.tableName : undefined,
    amount: Math.max(0, item.amount),
    paymentMethod: typeof item.paymentMethod === 'string' ? (item.paymentMethod as any) : undefined,
    reason: typeof item.reason === 'string' ? item.reason : 'İade',
    refundedAt: typeof item.refundedAt === 'string' ? item.refundedAt : undefined,
    refundedBy: typeof item.refundedBy === 'string' ? item.refundedBy : undefined,
    items: Array.isArray(item.items) ? item.items : undefined,
  }
}

export function validateRefunds(data: unknown): Refund[] | null {
  if (!Array.isArray(data)) return null
  const validated: Refund[] = []
  for (const item of data) {
    const ref = validateRefund(item)
    if (ref) validated.push(ref)
  }
  return validated
}

export function validateActivityLog(item: unknown): ActivityLog | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.type !== 'string') return null
  if (typeof item.userName !== 'string') return null
  if (typeof item.createdAt !== 'string') return null

  return {
    id: item.id.trim(),
    businessDayId: typeof item.businessDayId === 'string' ? item.businessDayId : undefined,
    type: item.type as any,
    tableName: typeof item.tableName === 'string' ? item.tableName : undefined,
    tableId: typeof item.tableId === 'string' ? item.tableId : undefined,
    orderId: typeof item.orderId === 'string' ? item.orderId : undefined,
    productName: typeof item.productName === 'string' ? item.productName : undefined,
    oldValue:
      typeof item.oldValue === 'string' || typeof item.oldValue === 'number'
        ? item.oldValue
        : undefined,
    newValue:
      typeof item.newValue === 'string' || typeof item.newValue === 'number'
        ? item.newValue
        : undefined,
    amount: typeof item.amount === 'number' ? item.amount : undefined,
    reason: typeof item.reason === 'string' ? item.reason : undefined,
    userName: item.userName,
    userRole: typeof item.userRole === 'string' ? item.userRole : undefined,
    userId: typeof item.userId === 'string' ? item.userId : undefined,
    createdAt: item.createdAt,
    details: typeof item.details === 'string' ? item.details : undefined,
    prevHash: typeof item.prevHash === 'string' ? item.prevHash : undefined,
    hash: typeof item.hash === 'string' ? item.hash : undefined,
  }
}

export function validateActivityLogs(data: unknown): ActivityLog[] | null {
  if (!Array.isArray(data)) return null
  const validated: ActivityLog[] = []
  for (const item of data) {
    const log = validateActivityLog(item)
    if (log) validated.push(log)
  }
  return validated
}

export function validateUser(item: unknown): User | null {
  if (!isObject(item)) return null
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.username !== 'string' || !item.username.trim()) return null
  if (typeof item.fullName !== 'string') return null
  if (typeof item.role !== 'string') return null

  return {
    id: item.id.trim(),
    username: item.username.trim(),
    fullName: item.fullName,
    role: item.role as any,
    pinHash: typeof item.pinHash === 'string' ? item.pinHash : undefined,
    passwordHash: typeof item.passwordHash === 'string' ? item.passwordHash : '',
    status: item.status === 'inactive' ? 'inactive' : 'active',
    isDeleted: Boolean(item.isDeleted),
    mustChangePassword: Boolean(item.mustChangePassword),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    lastLoginAt: typeof item.lastLoginAt === 'string' ? item.lastLoginAt : undefined,
    createdBy: typeof item.createdBy === 'string' ? item.createdBy : undefined,
  }
}

export function validateUsers(data: unknown): User[] | null {
  if (!Array.isArray(data)) return null
  const validated: User[] = []
  for (const item of data) {
    const user = validateUser(item)
    if (user) validated.push(user)
  }
  return validated
}

/**
 * Validates a complete backup payload file.
 */
export function validateBackupFileStructure(fileContent: unknown): {
  valid: boolean
  error?: string
  backup?: POSBackupFile
} {
  if (!isObject(fileContent)) {
    return { valid: false, error: 'Dosya geçerli bir JSON nesnesi değil.' }
  }

  if (typeof fileContent.formatVersion !== 'number') {
    return { valid: false, error: 'Yedek format versiyonu eksik veya geçersiz.' }
  }

  if (fileContent.formatVersion > 1) {
    return {
      valid: false,
      error: `Desteklenmeyen yedek format versiyonu: v${fileContent.formatVersion}. Uygulamanızı güncelleyin.`,
    }
  }

  if (typeof fileContent.checksum !== 'string' || !fileContent.checksum.trim()) {
    return { valid: false, error: 'Bütünlük sağlama anahtarı (checksum) eksik.' }
  }

  if (!isObject(fileContent.data)) {
    return { valid: false, error: 'Yedek veri gövdesi (data) eksik veya geçersiz.' }
  }

  // Verify Checksum
  const payloadJson = JSON.stringify(fileContent.data)
  if (!verifyChecksum(payloadJson, fileContent.checksum)) {
    return {
      valid: false,
      error: 'Bütünlük doğrulaması başarısız! Yedek dosyası bozulmuş veya üzerinde oynanmış.',
    }
  }

  const data = fileContent.data as POSBackupPayload

  // Check required arrays and objects
  if (!Array.isArray(data.tables)) {
    return { valid: false, error: 'Yedek içindeki "tables" verisi geçersiz.' }
  }
  if (!Array.isArray(data.completedOrders)) {
    return { valid: false, error: 'Yedek içindeki "completedOrders" verisi geçersiz.' }
  }
  if (!Array.isArray(data.businessDays)) {
    return { valid: false, error: 'Yedek içindeki "businessDays" verisi geçersiz.' }
  }
  if (!Array.isArray(data.menuProducts)) {
    return { valid: false, error: 'Yedek içindeki "menuProducts" verisi geçersiz.' }
  }
  if (!isObject(data.appSettings)) {
    return { valid: false, error: 'Yedek içindeki "appSettings" verisi geçersiz.' }
  }

  // Check ID uniqueness in critical collections
  const tableIds = new Set<string>()
  for (const t of data.tables) {
    if (!t.id || tableIds.has(t.id)) {
      return { valid: false, error: `Masa listesinde mükerrer veya eksik ID: ${t.id}` }
    }
    tableIds.add(t.id)
  }

  const orderIds = new Set<string>()
  for (const o of data.completedOrders) {
    if (!o.id || orderIds.has(o.id)) {
      return { valid: false, error: `Sipariş listesinde mükerrer veya eksik ID: ${o.id}` }
    }
    orderIds.add(o.id)
  }

  const dayIds = new Set<string>()
  for (const d of data.businessDays) {
    if (!d.id || dayIds.has(d.id)) {
      return { valid: false, error: `İş günü listesinde mükerrer veya eksik ID: ${d.id}` }
    }
    dayIds.add(d.id)
  }

  return {
    valid: true,
    backup: fileContent as POSBackupFile,
  }
}
