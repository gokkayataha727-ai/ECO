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
  batchId?: string
  batchNumber?: number
  addedAt?: string
  addedBy?: string
  updatedAt?: string
  status?: 'active' | 'refunded'
  refundedQty?: number
  refundReason?: string
  refundedAt?: string
  refundedBy?: string
}

export interface Refund {
  id: string
  businessDayId?: string
  orderId?: string
  tableId?: string
  tableName?: string
  orderItemId?: string
  productName?: string
  quantity?: number
  unitPrice?: number
  amount: number
  paymentMethod?: PaymentMethod
  reason: string
  createdAt?: string
  createdBy?: string
  refundedAt?: string
  refundedBy?: string
  items?: Array<{
    productId?: string
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
}

export type ActivityLogType =
  | 'item_add'
  | 'item_increase'
  | 'item_decrease'
  | 'item_remove'
  | 'item_refund'
  | 'table_refund'
  | 'order_reopen'
  | 'payment'
  | 'discount'
  | 'item_discount'
  | 'order_discount'
  | 'table_move'
  | 'table_merge'
  | 'table_split'
  | 'note_change'
  | 'day_open'
  | 'day_close'
  | 'login'
  | 'logout'
  | 'session_timeout'
  | 'login_failed'
  | 'account_lockout'
  | 'user_create'
  | 'user_update'
  | 'password_reset'
  | 'user_status_change'
  | 'user_delete'
  | 'permission_override_set'
  | 'permission_reset'
  | 'permission_copy'
  | 'permission_template_update'
  | 'unauthorized_attempt'
  | 'product_delete'
  | 'backup_restore'
  | 'log_chain_broken'
  | 'log_archive'
  | 'crash_recovery'

export interface ActivityLog {
  id: string
  businessDayId?: string
  type: ActivityLogType
  tableName?: string
  tableId?: string
  orderId?: string
  productName?: string
  oldValue?: string | number
  newValue?: string | number
  amount?: number
  reason?: string
  userName: string
  userRole?: string
  userId?: string
  createdAt: string
  details?: string
  prevHash?: string
  hash?: string
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
  cashier?: string
  userId?: string
  isManualAmount?: boolean
  selectedItemsTotal?: number
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
  discountAmount?: number
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
  discountAmount?: number
  taxRate?: number
  cancelled?: boolean
  cancelledAt?: string
  reopened?: boolean
  reopenedAt?: string
  reopenReason?: string
  reopenedBy?: string
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
  /** Girilen ürünlerin (açık + kapalı masalar, iptaller hariç) brüt fiyat toplamı */
  grossItemsRevenue?: number
  /** Ödemesi tamamlanmış (kapanmış) masaların / adisyonların net tahsil edilen toplam tutarı */
  paidTablesTotal?: number
  orderCount: number
  /** @deprecated Rapor ekranından kaldırıldı; eski arşiv kayıtlarıyla uyumluluk için opsiyonel tutulur */
  averageBasket?: number
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
  // POS Z Report & Refunds
  expectedZ?: number
  enteredZ?: number
  zDifference?: number
  totalRefunds?: number
  refundCount?: number
  // Legacy fields kept optional for backward compatibility
  posZCutoffTime?: string
  cardCarryIn?: number
  cardBeforeCutoff?: number
  cardAfterCutoff?: number
  cardCarryOut?: number
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
  closingCash?: number
  expectedCash?: number
  cashDifference?: number
  note?: string
  closeNote?: string
  report?: BusinessDayReportSnapshot
  expectedZ?: number
  enteredZ?: number
  zDifference?: number
  // Legacy fields kept optional for backward compatibility
  posZCutoffTime?: string
  cardCarryIn?: number
  cardCarryInAuto?: number
  cardCarryInOverridden?: boolean
  cardCarryOut?: number
  cardBeforeCutoff?: number
  cardAfterCutoff?: number
}

export type UserRole = 'admin' | 'waiter' | 'cashier'

export interface User {
  id: string
  fullName: string
  username: string
  role: 'admin' | 'waiter'
  passwordHash: string
  pinHash?: string
  status: 'active' | 'inactive'
  isDeleted?: boolean
  deletedAt?: string
  mustChangePassword?: boolean
  lastLoginAt?: string
  createdAt: string
  createdBy?: string
}

export interface Session {
  id: string
  userId: string
  username: string
  fullName: string
  role: 'admin' | 'waiter'
  createdAt: string
  expiresAt: string
  lastActivityAt: string
}

export type PermissionKey =
  // Sipariş & Masa
  | 'order_create_add'
  | 'order_new_batch'
  | 'order_edit_note_customer'
  | 'order_view_adisyon'
  | 'order_clear_cart'
  | 'table_transfer_merge'
  // İade
  | 'refund_item'
  | 'refund_table'
  // Ödeme
  | 'payment_take'
  | 'payment_cash'
  | 'payment_card'
  | 'payment_iban'
  | 'payment_partial'
  | 'payment_custom_amount'
  // Gün & Kasa
  | 'day_open'
  | 'day_close'
  // Ürün & Menü
  | 'product_manage'
  | 'product_price_edit'
  | 'product_delete'
  // Masa Yönetimi
  | 'table_manage'
  // Raporlar
  | 'reports_view_own'
  | 'reports_view_general'
  // Yalnızca Yönetici (kilitli)
  | 'manage_users'
  | 'view_logs'
  | 'manage_settings'
  | 'reopen_order'

export interface UserPermissionOverride {
  userId: string
  permissionKey: PermissionKey
  allowed: boolean
  updatedBy?: string
  updatedAt: string
}

export interface RolePermissions {
  allowWaiterRefund?: boolean
  allowWaiterReopen?: boolean
  allowWaiterDayManagement?: boolean
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
  currentUserRole?: UserRole
  allowCashierRefund?: boolean
  allowCashierReopen?: boolean
  allowWaiterRefund?: boolean
  allowWaiterReopen?: boolean
  allowWaiterDayManagement?: boolean
  sessionTimeoutMinutes?: number
  waiterSessionTimeoutMinutes?: number
  adminSessionTimeoutMinutes?: number
  posZCutoffTime?: string
  secondaryBackupDir?: string
}

