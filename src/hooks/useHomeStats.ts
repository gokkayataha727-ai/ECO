import { useMemo } from 'react'
import type { CompletedOrder, Table } from '../types'
import { formatCurrency, isTableOccupied, roundCurrency } from '../lib/format'
import { getIstanbulParts, getOrderAppliedPayments } from '../lib/businessDay'

export interface HomeStats {
  todayRevenue: number
  todayRevenueFormatted: string
  todayOrderCount: number
  averageBasket: number
  averageBasketFormatted: string
  occupiedTableCount: number
  totalTableCount: number
}

function isSameIstanbulDay(dateStr: string, today: Date): boolean {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const dParts = getIstanbulParts(d)
  const tParts = getIstanbulParts(today)
  return (
    dParts.year === tParts.year &&
    dParts.month === tParts.month &&
    dParts.day === tParts.day
  )
}

export function useHomeStats(
  completedOrders: CompletedOrder[],
  tables: Table[],
  openBusinessDayId?: string | null,
): HomeStats {
  return useMemo(() => {
    const today = new Date()

    const validOrders = completedOrders.filter((o) => !o.cancelled && !o.reopened)
    const todayOrders = openBusinessDayId
      ? validOrders.filter((o) => o.businessDayId === openBusinessDayId)
      : validOrders.filter((o) => isSameIstanbulDay(o.date, today))
    const todayRevenue = roundCurrency(
      todayOrders.reduce((sum, o) => sum + getOrderAppliedPayments(o).total, 0),
    )
    const todayOrderCount = todayOrders.length
    const averageBasket = todayOrderCount > 0 ? roundCurrency(todayRevenue / todayOrderCount) : 0
    const occupiedTableCount = tables.filter((t) => isTableOccupied(t)).length

    return {
      todayRevenue,
      todayRevenueFormatted: formatCurrency(todayRevenue),
      todayOrderCount,
      averageBasket,
      averageBasketFormatted: formatCurrency(averageBasket),
      occupiedTableCount,
      totalTableCount: tables.length,
    }
  }, [completedOrders, tables, openBusinessDayId])
}
