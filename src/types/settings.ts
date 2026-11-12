import type { AppSettings } from '../types'

export type { AppSettings } from '../types'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  storeName: 'LEMOON KAFE',
  storeSub: 'Kahvenin iyi hali',
  location: 'LEMOON KAFE · SIMAV',
  cashierName: 'LEMOON',
  receiptFooter: 'Bizi tercih ettiğiniz için teşekkür ederiz! Yine bekleriz.',
  autoPrintReceipt: false,
  currencySymbol: '₺',
  taxRate: 10,
  bankName: 'Banka Adı',
  accountHolder: 'Hesap Sahibi',
  iban: 'TR00 0000 0000 0000 0000 0000 00',
  currentUserRole: 'admin',
  allowCashierRefund: true,
  allowCashierReopen: false,
}
