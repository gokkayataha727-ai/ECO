export type ProductCategory = 'Sıcak Kahveler' | 'Soğuk İçecekler' | 'Tatlılar' | 'Atıştırmalıklar' | 'Çaylar'

export interface OptionItem {
  id: string
  name: string
  priceDelta: number
  isDefault: boolean
}

export interface OptionGroup {
  id: string
  name: string
  selectionType: 'single' | 'multiple'
  required: boolean
  options: OptionItem[]
}

export interface SelectedOption {
  groupId: string
  groupName: string
  optionId: string
  optionName: string
  priceDelta: number
}

export interface Product {
  id: string
  name: string
  description: string
  price: number
  category: ProductCategory
  badge?: 'Yeni' | 'Çok Satan'
  image_url?: string
  optionGroups?: OptionGroup[]
}

export interface ItemDiscount {
  type: 'percentage' | 'amount'
  value: number
}

export interface CartItem extends Product {
  cartItemId: string
  quantity: number
  selectedOptions?: SelectedOption[]
  itemDiscount?: ItemDiscount
}

export interface OrderTotals {
  subtotal: number
  discount: number
  total: number
}

export type PaymentMethod = 'card' | 'cash' | 'iban' | 'mixed'

export interface PaidOrderItem {
  lineId: string
  quantity: number
  amount: number
}

export interface PartialPayment {
  id: string
  method: 'card' | 'cash' | 'iban'
  amount: number
  receivedAmount?: number
  change?: number
  createdAt: string
  items?: PaidOrderItem[]
  businessDayId?: string
}

export type TableStatus = 'empty' | 'occupied'

export interface Table {
  id: string
  name: string
  status: TableStatus
  cart: CartItem[]
  note?: string
  customerName?: string
  discountRate?: number
  payments?: PartialPayment[]
}

export interface CompletedOrder {
  id: string
  orderNumber: string
  items: CartItem[]
  totals: OrderTotals
  paymentMethod: PaymentMethod
  payments?: PartialPayment[]
  date: string
  note?: string
  customerName?: string
  cashier?: string
  businessDayId?: string
  tableId?: string
  tableName?: string
  discountRate?: number
  taxRate?: number
  cancelled?: boolean
  cancelledAt?: string
}

export interface SoldProductOptionBreakdown {
  optionsLabel: string
  quantity: number
  revenue: number
}

export interface SoldProductReportItem {
  productKey: string
  productId: string
  name: string
  category: string
  quantity: number
  revenue: number
  share: number
  optionBreakdown: SoldProductOptionBreakdown[]
}

export interface CategorySalesItem {
  category: string
  quantity: number
  revenue: number
  share: number
}

export interface HourlySalesItem {
  hour: number
  label: string
  revenue: number
  orders: number
}

export interface CancelledOrderSummary {
  id: string
  orderNumber: string
  total: number
  date: string
  itemCount: number
  cashier?: string
  customerName?: string
  itemsSummary: string
}

export interface BusinessDayReportSnapshot {
  generatedAt: string
  totalRevenue: number
  orderCount: number
  averageBasket: number
  totalTax: number
  totalDiscount: number
  cancelledCount: number
  cancelledTotal: number
  cancelledOrders: CancelledOrderSummary[]
  paymentDistribution: {
    card: number
    cash: number
    iban: number
  }
  soldProducts: SoldProductReportItem[]
  categorySales: CategorySalesItem[]
  hourlySales: HourlySalesItem[]
  openTablePaymentsTotal?: number
  openTablePaymentsByMethod?: {
    card: number
    cash: number
    iban: number
  }
  // POS Z Report & Card carry-over snapshot
  cardCarryIn?: number
  cardBeforeCutoff?: number
  cardAfterCutoff?: number
  cardCarryOut?: number
  expectedZ?: number
  enteredZ?: number
  zDifference?: number
  posZCutoffTime?: string
}

export interface BusinessDay {
  id: string
  status: 'open' | 'closed'
  openedAt: string
  openedBy: string
  openingCash: number
  closedAt?: string
  closedBy?: string
  countedCash?: number
  expectedCash?: number
  cashDifference?: number
  note?: string
  closeNote?: string
  report?: BusinessDayReportSnapshot
  // POS Z Report & Card carry-over tracking
  posZCutoffTime?: string
  cardCarryIn?: number
  cardCarryInAuto?: number
  cardCarryInOverridden?: boolean
  cardCarryOut?: number
  cardBeforeCutoff?: number
  cardAfterCutoff?: number
  expectedZ?: number
  enteredZ?: number
  zDifference?: number
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'warm'
  storeName: string
  storeSub: string
  location: string
  cashierName: string
  receiptFooter: string
  autoPrintReceipt: boolean
  currencySymbol: string
  taxRate: number
  bankName: string
  accountHolder: string
  iban: string
  posZCutoffTime?: string
}

