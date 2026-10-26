import type { CartItem, ItemDiscount, OrderTotals, PaidOrderItem, PartialPayment, PaymentMethod, SelectedOption, Table } from '../types'
import { generateUUID } from './uuid'

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value)

export const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

export const derivePaymentState = (grandTotal: number, payments: PartialPayment[] = []) => {
  const paidTotal = roundCurrency(payments.reduce((sum, p) => sum + p.amount, 0))
  const remaining = Math.max(0, roundCurrency(grandTotal - paidTotal))
  return { paidTotal, remaining }
}

export const formatIban = (raw: string): string => {
  const clean = raw.replace(/\s+/g, '').toUpperCase()
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

export const validateTurkishIban = (raw: string): string | null => {
  const clean = raw.replace(/\s+/g, '').toUpperCase()
  if (!clean) return 'IBAN alanı boş bırakılamaz.'
  if (!clean.startsWith('TR')) return 'Türk IBAN numarası "TR" ile başlamalıdır.'
  if (clean.length !== 26) return `IBAN 26 karakter olmalıdır (şu an ${clean.length} karakter).`
  if (!/^TR\d{24}$/.test(clean)) return 'TR sonrasında yalnızca 24 rakam bulunmalıdır.'
  return null
}

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
  const labels: Record<PaymentMethod, string> = {
    card: 'Kart',
    cash: 'Nakit',
    iban: 'IBAN',
    mixed: 'Karışık Ödeme',
  }
  return labels[method] || 'Kart'
}

export const isTableOccupied = (table: Table): boolean => {
  const hasCustomer = Boolean(table.customerName && table.customerName.trim().length > 0)
  return table.cart.length > 0 || table.status === 'occupied' || hasCustomer
}

export interface LinePaymentState {
  cartItemId: string
  item: CartItem
  unitGrossPrice: number
  lineGrossTotal: number
  lineNetTotal: number
  unitNetPrice: number
  paidQty: number
  unpaidQty: number
  paidAmount: number
  unpaidLineAmount: number
  status: 'unpaid' | 'partial' | 'paid'
  paidMethod?: 'card' | 'cash' | 'iban'
}

export const getLineAfterItemDiscount = (item: CartItem): number => {
  const lineGross = getEffectivePrice(item) * item.quantity
  if (!item.itemDiscount) return lineGross
  if (item.itemDiscount.type === 'amount') {
    return Math.max(0, lineGross - Math.min(item.itemDiscount.value, lineGross))
  }
  return Math.max(0, lineGross - lineGross * (item.itemDiscount.value / 100))
}

export const deriveLinePaymentStates = (
  cart: CartItem[],
  discountRate: number,
  payments: PartialPayment[] = [],
): LinePaymentState[] => {
  const totals = calculateTotals(cart, discountRate)
  const grandTotal = roundCurrency(totals.total)
  const discountedSubtotal = cart.reduce((sum, item) => sum + getLineAfterItemDiscount(item), 0)

  const rawLineNets = cart.map((item) => {
    const afterItemDisc = getLineAfterItemDiscount(item)
    if (discountedSubtotal <= 0) return 0
    return (afterItemDisc / discountedSubtotal) * grandTotal
  })

  return cart.map((item, idx) => {
    const unitGrossPrice = getEffectivePrice(item)
    const lineGrossTotal = roundCurrency(unitGrossPrice * item.quantity)
    const lineNetTotal = roundCurrency(rawLineNets[idx])
    const unitNetPrice = item.quantity > 0 ? roundCurrency(lineNetTotal / item.quantity) : 0

    let rawPaidQty = 0
    let rawPaidAmount = 0
    let lastMethod: 'card' | 'cash' | 'iban' | undefined

    for (const p of payments) {
      if (!p.items) continue
      for (const pi of p.items) {
        if (pi.lineId === item.cartItemId) {
          rawPaidQty += pi.quantity
          rawPaidAmount += pi.amount
          lastMethod = p.method
        }
      }
    }

    const paidQty = Math.min(item.quantity, Math.max(0, rawPaidQty))
    const unpaidQty = Math.max(0, item.quantity - paidQty)
    const paidAmount = roundCurrency(rawPaidAmount)
    const unpaidLineAmount =
      unpaidQty === 0
        ? 0
        : paidQty === 0
          ? lineNetTotal
          : Math.max(0, roundCurrency(lineNetTotal - paidAmount))

    const status: 'unpaid' | 'partial' | 'paid' =
      unpaidQty === 0 ? 'paid' : paidQty > 0 ? 'partial' : 'unpaid'

    return {
      cartItemId: item.cartItemId,
      item,
      unitGrossPrice,
      lineGrossTotal,
      lineNetTotal,
      unitNetPrice,
      paidQty,
      unpaidQty,
      paidAmount,
      unpaidLineAmount,
      status,
      paidMethod: lastMethod,
    }
  })
}

export const calculateSelectedItemsPayment = (
  lineStates: LinePaymentState[],
  selectedQuantities: Record<string, number>,
  remaining: number,
): { items: PaidOrderItem[]; totalAmount: number; totalUnits: number } => {
  const entries: PaidOrderItem[] = []
  let totalUnits = 0

  for (const line of lineStates) {
    const reqQty = selectedQuantities[line.cartItemId] || 0
    if (reqQty <= 0 || line.unpaidQty <= 0) continue
    const qty = Math.min(Math.max(1, reqQty), line.unpaidQty)
    totalUnits += qty

    const amount =
      qty === line.unpaidQty
        ? line.unpaidLineAmount
        : roundCurrency((line.unpaidLineAmount / line.unpaidQty) * qty)

    entries.push({
      lineId: line.cartItemId,
      quantity: qty,
      amount,
    })
  }

  if (entries.length === 0) {
    return { items: [], totalAmount: 0, totalUnits: 0 }
  }

  const allOrderUnpaidSelected = lineStates.every(
    (l) => l.unpaidQty === 0 || (selectedQuantities[l.cartItemId] || 0) >= l.unpaidQty,
  )

  const rawSum = roundCurrency(entries.reduce((sum, e) => sum + e.amount, 0))

  // Last unpaid item(s) absorb any rounding difference (or cap to remaining if mixed with free payments)
  if (allOrderUnpaidSelected || rawSum > remaining) {
    const targetTotal = roundCurrency(remaining)
    if (entries.length === 1) {
      entries[0].amount = targetTotal
    } else if (rawSum > 0) {
      let running = 0
      for (let i = 0; i < entries.length - 1; i++) {
        if (Math.abs(targetTotal - rawSum) <= 0.05 * entries.length) {
          running = roundCurrency(running + entries[i].amount)
        } else {
          entries[i].amount = roundCurrency((entries[i].amount / rawSum) * targetTotal)
          running = roundCurrency(running + entries[i].amount)
        }
      }
      entries[entries.length - 1].amount = Math.max(0, roundCurrency(targetTotal - running))
    }
    return { items: entries, totalAmount: targetTotal, totalUnits }
  }

  return { items: entries, totalAmount: rawSum, totalUnits }
}

const getOptionsSignature = (options?: SelectedOption[]): string => {
  if (!options || options.length === 0) return ''
  return [...options]
    .map((o) => `${o.groupId}:${o.optionId}:${o.optionName}:${o.priceDelta}`)
    .sort()
    .join('|')
}

const getDiscountSignature = (discount?: ItemDiscount): string => {
  if (!discount || !discount.value) return ''
  return `${discount.type}:${discount.value}`
}

const mergeCartItemsWithMap = (
  mainCart: CartItem[],
  sourceCart: CartItem[],
): { merged: CartItem[]; sourceLineIdMap: Map<string, string> } => {
  const sourceLineIdMap = new Map<string, string>()
  const merged: CartItem[] = mainCart.map((item) => ({
    ...item,
    selectedOptions: item.selectedOptions ? [...item.selectedOptions] : undefined,
    itemDiscount: item.itemDiscount ? { ...item.itemDiscount } : undefined,
  }))

  sourceCart.forEach((sourceItem, idx) => {
    const srcOptSig = getOptionsSignature(sourceItem.selectedOptions)
    const srcDiscSig = getDiscountSignature(sourceItem.itemDiscount)

    const matchIndex = merged.findIndex(
      (existing) =>
        existing.id === sourceItem.id &&
        getOptionsSignature(existing.selectedOptions) === srcOptSig &&
        getDiscountSignature(existing.itemDiscount) === srcDiscSig,
    )

    if (matchIndex >= 0) {
      merged[matchIndex] = {
        ...merged[matchIndex],
        quantity: merged[matchIndex].quantity + sourceItem.quantity,
      }
      sourceLineIdMap.set(sourceItem.cartItemId, merged[matchIndex].cartItemId)
    } else {
      let cartItemId = sourceItem.cartItemId
      if (merged.some((item) => item.cartItemId === cartItemId)) {
        cartItemId = `${cartItemId}-merged-${idx}`
      }
      merged.push({
        ...sourceItem,
        cartItemId,
        selectedOptions: sourceItem.selectedOptions ? [...sourceItem.selectedOptions] : undefined,
        itemDiscount: sourceItem.itemDiscount ? { ...sourceItem.itemDiscount } : undefined,
      })
      sourceLineIdMap.set(sourceItem.cartItemId, cartItemId)
    }
  })

  return { merged, sourceLineIdMap }
}

export const mergeCartItems = (mainCart: CartItem[], sourceCart: CartItem[]): CartItem[] =>
  mergeCartItemsWithMap(mainCart, sourceCart).merged

export const moveTableOrder = (
  tables: Table[],
  sourceTableId: string,
  targetTableId: string,
): Table[] => {
  if (sourceTableId === targetTableId) return tables
  const sourceTable = tables.find((t) => t.id === sourceTableId)
  const targetTable = tables.find((t) => t.id === targetTableId)
  if (!sourceTable || !targetTable) return tables
  if (!isTableOccupied(sourceTable) || isTableOccupied(targetTable)) return tables

  return tables.map((t) => {
    if (t.id === sourceTableId) {
      return {
        ...t,
        status: 'empty',
        cart: [],
        note: '',
        customerName: '',
        discountRate: 0,
        payments: [],
      }
    }
    if (t.id === targetTableId) {
      return {
        ...t,
        status: 'occupied',
        cart: sourceTable.cart.map((item) => ({ ...item })),
        note: sourceTable.note || '',
        customerName: sourceTable.customerName || '',
        discountRate: sourceTable.discountRate || 0,
        payments: sourceTable.payments
          ? sourceTable.payments.map((p) => ({
              ...p,
              items: p.items ? p.items.map((pi) => ({ ...pi })) : undefined,
            }))
          : [],
      }
    }
    return t
  })
}

export const mergeTablesOrder = (
  tables: Table[],
  mainTableId: string,
  sourceTableId: string,
): Table[] => {
  if (mainTableId === sourceTableId) return tables
  const mainTable = tables.find((t) => t.id === mainTableId)
  const sourceTable = tables.find((t) => t.id === sourceTableId)
  if (!mainTable || !sourceTable) return tables
  if (!isTableOccupied(mainTable) || !isTableOccupied(sourceTable)) return tables

  const { merged: mergedCart, sourceLineIdMap } = mergeCartItemsWithMap(
    mainTable.cart,
    sourceTable.cart,
  )
  const mergedCustomerName = mainTable.customerName?.trim()
    ? mainTable.customerName.trim()
    : sourceTable.customerName?.trim() || ''

  const mainNote = mainTable.note?.trim() || ''
  const sourceNote = sourceTable.note?.trim() || ''
  const mergedNote =
    mainNote && sourceNote
      ? mainNote === sourceNote
        ? mainNote
        : `${mainNote} | ${sourceNote}`
      : mainNote || sourceNote

  const mergedDiscountRate = mainTable.discountRate || sourceTable.discountRate || 0
  const mainPayments = (mainTable.payments || []).map((p) => ({
    ...p,
    items: p.items ? p.items.map((pi) => ({ ...pi })) : undefined,
  }))
  const remappedSourcePayments = (sourceTable.payments || []).map((p) => ({
    ...p,
    items: p.items
      ? p.items.map((pi) => ({
          ...pi,
          lineId: sourceLineIdMap.get(pi.lineId) ?? pi.lineId,
        }))
      : undefined,
  }))
  const mergedPayments = [...mainPayments, ...remappedSourcePayments]

  return tables.map((t) => {
    if (t.id === mainTableId) {
      return {
        ...t,
        status: 'occupied',
        cart: mergedCart,
        note: mergedNote,
        customerName: mergedCustomerName,
        discountRate: mergedDiscountRate,
        payments: mergedPayments,
      }
    }
    if (t.id === sourceTableId) {
      return {
        ...t,
        status: 'empty',
        cart: [],
        note: '',
        customerName: '',
        discountRate: 0,
        payments: [],
      }
    }
    return t
  })
}

export interface SplitItemSelection {
  cartItemId: string
  quantity: number
}

export const splitTableOrder = (
  tables: Table[],
  sourceTableId: string,
  targetTableId: string,
  splitItems: SplitItemSelection[],
): Table[] => {
  if (sourceTableId === targetTableId) return tables
  const sourceTable = tables.find((t) => t.id === sourceTableId)
  const targetTable = tables.find((t) => t.id === targetTableId)
  if (!sourceTable || !targetTable) return tables
  if (!isTableOccupied(sourceTable)) return tables

  // Yalnızca 0'dan büyük miktarları al
  const validSelections = splitItems.filter((s) => s.quantity > 0)
  if (validSelections.length === 0) return tables

  // Ödenmiş ürünlerin bölünmesini engellemek için mevcut ödeme durumlarını al
  const lineStates = deriveLinePaymentStates(
    sourceTable.cart,
    sourceTable.discountRate || 0,
    sourceTable.payments,
  )
  const lineStateMap = new Map(lineStates.map((ls) => [ls.cartItemId, ls]))

  // Atomik doğrulama: Tüm seçilen ürünler kaynak masada var mı ve ödenmemiş miktarı aşıyor mu?
  const itemsToTransfer: CartItem[] = []
  const splitQuantityMap = new Map<string, number>()

  for (const splitReq of validSelections) {
    const sourceItem = sourceTable.cart.find((i) => i.cartItemId === splitReq.cartItemId)
    if (!sourceItem) return tables // Ürün bulunamadı, işlemi atomik olarak iptal et

    const lineState = lineStateMap.get(sourceItem.cartItemId)
    const maxUnpaid = lineState ? lineState.unpaidQty : sourceItem.quantity
    if (splitReq.quantity > maxUnpaid || splitReq.quantity > sourceItem.quantity) {
      return tables // Ödenmiş ya da mevcut adetten fazlası ayrılamaz, iptal et
    }

    splitQuantityMap.set(sourceItem.cartItemId, splitReq.quantity)

    itemsToTransfer.push({
      ...sourceItem,
      cartItemId: `split-${generateUUID()}`,
      quantity: splitReq.quantity,
      selectedOptions: sourceItem.selectedOptions ? [...sourceItem.selectedOptions] : undefined,
      itemDiscount: sourceItem.itemDiscount ? { ...sourceItem.itemDiscount } : undefined,
    })
  }

  // 1. Kaynak masanın yeni sepetini hesapla
  const newSourceCart: CartItem[] = []
  for (const item of sourceTable.cart) {
    const splitQty = splitQuantityMap.get(item.cartItemId) || 0
    const remainingQty = item.quantity - splitQty
    if (remainingQty > 0) {
      newSourceCart.push({
        ...item,
        quantity: remainingQty,
        selectedOptions: item.selectedOptions ? [...item.selectedOptions] : undefined,
        itemDiscount: item.itemDiscount ? { ...item.itemDiscount } : undefined,
      })
    }
  }

  // 2. Hedef masanın yeni sepetini hesapla
  let newTargetCart: CartItem[] = []
  const isTargetOccupied = isTableOccupied(targetTable)

  if (!isTargetOccupied || targetTable.cart.length === 0) {
    newTargetCart = itemsToTransfer.map((item, idx) => ({
      ...item,
      cartItemId: `split-target-${generateUUID().slice(0, 8)}-${idx}`,
    }))
  } else {
    newTargetCart = mergeCartItems(targetTable.cart, itemsToTransfer)
  }

  const totalSplitUnits = itemsToTransfer.reduce((sum, item) => sum + item.quantity, 0)
  console.log(`[Masa Ayırma] ${sourceTable.name} → ${targetTable.name}: ${totalSplitUnits} ürün aktarıldı.`)

  return tables.map((t) => {
    if (t.id === sourceTableId) {
      if (newSourceCart.length === 0) {
        // Kaynak masada hiç ürün kalmadıysa tamamen boşalt
        return {
          ...t,
          status: 'empty',
          cart: [],
          note: '',
          customerName: '',
          discountRate: 0,
          payments: [],
        }
      }
      return {
        ...t,
        status: 'occupied',
        cart: newSourceCart,
      }
    }

    if (t.id === targetTableId) {
      return {
        ...t,
        status: 'occupied',
        cart: newTargetCart,
        note: targetTable.note || '',
        customerName: targetTable.customerName || '',
        discountRate: targetTable.discountRate || 0,
        payments: targetTable.payments ? [...targetTable.payments] : [],
      }
    }

    return t
  })
}

