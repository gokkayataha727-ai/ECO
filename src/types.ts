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

export type PaymentMethod = 'card' | 'cash' | 'qr'

export type TableStatus = 'empty' | 'occupied'

export interface Table {
  id: string
  name: string
  status: TableStatus
  cart: CartItem[]
  note?: string
  customerName?: string
  discountRate?: number
}

export interface CompletedOrder {
  id: string
  orderNumber: string
  items: CartItem[]
  totals: OrderTotals
  paymentMethod: PaymentMethod
  date: string
  note?: string
  customerName?: string
  cashier?: string
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
}

