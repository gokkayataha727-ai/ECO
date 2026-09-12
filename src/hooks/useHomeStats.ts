import { useMemo } from 'react'
import type { CompletedOrder, Table } from '../types'
import { formatCurrency } from '../lib/format'

export interface HomeStats {
  todayRevenue: number
  todayRevenueFormatted: string
  todayOrderCount: number
  averageBasket: number
  averageBasketFormatted: string
  occupiedTableCount: number
  totalTableCount: number
}

function isSameDay(dateStr: string, today: Date): boolean {
  const d = new Date(dateStr)
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

export function useHomeStats(
  completedOrders: CompletedOrder[],
  tables: Table[]
): HomeStats {
  return useMemo(() => {
    const today = new Date()

    const todayOrders = completedOrders.filter((o) => isSameDay(o.date, today))
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.totals.total, 0)
    const todayOrderCount = todayOrders.length
    const averageBasket = todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0
    const occupiedTableCount = tables.filter(
      (t) => t.cart.length > 0 || t.status === 'occupied'
    ).length

    return {
      todayRevenue,
      todayRevenueFormatted: formatCurrency(todayRevenue),
      todayOrderCount,
      averageBasket,
      averageBasketFormatted: formatCurrency(averageBasket),
      occupiedTableCount,
      totalTableCount: tables.length,
    }
  }, [completedOrders, tables])
}
