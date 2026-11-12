import type {
  AppSettings,
  BusinessDay,
  CartItem,
  CompletedOrder,
  PartialPayment,
  Product,
  Refund,
  Table,
  User,
} from '../../src/types'
import { generateUUID } from '../../src/lib/uuid'
import { roundCurrency } from '../../src/lib/format'
import { DEFAULT_SETTINGS } from '../../src/types/settings'

export function createMockProduct(overrides?: Partial<Product>): Product {
  return {
    id: generateUUID(),
    name: 'Espresso',
    category: 'Sıcak Kahveler',
    price: 65,
    description: 'Taze çekilmiş tek shot espresso',
    ...overrides,
  }
}

export function createMockCartItem(overrides?: Partial<CartItem>): CartItem {
  const base = createMockProduct(overrides)
  return {
    ...base,
    cartItemId: generateUUID(),
    quantity: 1,
    ...overrides,
  }
}

export function createMockPayment(overrides?: Partial<PartialPayment>): PartialPayment {
  return {
    id: generateUUID(),
    method: 'cash',
    amount: 100,
    createdAt: new Date().toISOString(),
    cashier: 'Kasiyer',
    ...overrides,
  }
}

export function createMockTable(overrides?: Partial<Table>): Table {
  return {
    id: generateUUID(),
    name: 'Masa 1',
    status: 'empty',
    cart: [],
    discountRate: 0,
    payments: [],
    ...overrides,
  }
}

export function createMockOrder(overrides?: Partial<CompletedOrder>): CompletedOrder {
  const item = createMockCartItem({ price: 100, quantity: 2 })
  const subtotal = 200
  const discount = 0
  const total = 200

  return {
    id: generateUUID(),
    orderNumber: 'ORD-1001',
    items: [item],
    totals: { subtotal, discount, total },
    paymentMethod: 'cash',
    payments: [
      createMockPayment({ method: 'cash', amount: total }),
    ],
    date: new Date().toISOString(),
    cashier: 'Kasiyer',
    cancelled: false,
    reopened: false,
    ...overrides,
  }
}

export function createMockBusinessDay(overrides?: Partial<BusinessDay>): BusinessDay {
  return {
    id: generateUUID(),
    status: 'open',
    openedAt: new Date().toISOString(),
    openedBy: 'Kasiyer',
    openingCash: 500,
    ...overrides,
  }
}

export function createMockRefund(overrides?: Partial<Refund>): Refund {
  return {
    id: generateUUID(),
    amount: 50,
    paymentMethod: 'cash',
    reason: 'Müşteri talebi / Yanlış sipariş',
    refundedAt: new Date().toISOString(),
    refundedBy: 'Kasiyer',
    ...overrides,
  }
}

export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: generateUUID(),
    username: 'admin',
    fullName: 'Yönetici Kullanıcı',
    role: 'admin',
    passwordHash: 'mock-hash-12345',
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  }
}

