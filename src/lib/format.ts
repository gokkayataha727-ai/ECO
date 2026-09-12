import type { CartItem, OrderTotals, PaymentMethod } from '../types'

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value)

export const getEffectivePrice = (item: CartItem): number => {
  const optionsDelta = item.selectedOptions
    ? item.selectedOptions.reduce((sum, opt) => sum + opt.priceDelta, 0)
    : 0
  return item.price + optionsDelta
}

export const calculateTotals = (cart: CartItem[], discountRate: number): OrderTotals => {
  const subtotal = cart.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0)
  
  const itemDiscounts = cart.reduce((sum, item) => {
    if (!item.itemDiscount) return sum
    const lineTotal = getEffectivePrice(item) * item.quantity
    if (item.itemDiscount.type === 'amount') {
      return sum + Math.min(item.itemDiscount.value, lineTotal)
    } else {
      return sum + (lineTotal * (item.itemDiscount.value / 100))
    }
  }, 0)

  const discountedSubtotal = subtotal - itemDiscounts
  const globalDiscount = discountedSubtotal * discountRate
  
  const totalDiscount = itemDiscounts + globalDiscount

  return { subtotal, discount: totalDiscount, total: subtotal - totalDiscount }
}

export const paymentMethodLabel = (method: PaymentMethod) => {
  const labels: Record<PaymentMethod, string> = { card: 'Kart', cash: 'Nakit', qr: 'QR ile Öde' }
  return labels[method]
}

