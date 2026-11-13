import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TableLayout } from '../../src/components/TableLayout'
import { createMockCartItem, createMockOrder, createMockTable } from '../fixtures/factories'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('TableLayout Modal Portal & Overlay Layout Suite', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    rootContainer = document.createElement('div')
    rootContainer.id = 'root'
    document.body.appendChild(rootContainer)
    root = createRoot(rootContainer)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    if (rootContainer && rootContainer.parentNode) {
      rootContainer.parentNode.removeChild(rootContainer)
      rootContainer = null
    }
  })

  function renderTableLayout() {
    const occupiedTable1 = createMockTable({
      id: 'table-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Latte', price: 110, quantity: 2 })],
    })
    const occupiedTable2 = createMockTable({
      id: 'table-2',
      name: 'Masa 2',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Espresso', price: 80, quantity: 1 })],
    })
    const emptyTable3 = createMockTable({
      id: 'table-3',
      name: 'Masa 3',
      status: 'empty',
      cart: [],
    })
    const closedOrder = createMockOrder({
      id: 'order-1',
      orderNumber: 'ORD-2026',
      tableName: 'Masa 1',
      businessDayId: 'day-open-1',
      reopened: false,
    })

    act(() => {
      root!.render(
        <TableLayout
          tables={[occupiedTable1, occupiedTable2, emptyTable3]}
          onSelectTable={vi.fn()}
          onOpenTableManager={vi.fn()}
          onMoveTable={vi.fn()}
          onMergeTables={vi.fn()}
          onSplitTable={vi.fn()}
          isDayOpen={true}
          canManageTables={true}
          canTransferMerge={true}
          canReopenOrder={true}
          onRequestReopenOrder={vi.fn()}
          completedOrders={[closedOrder]}
          openBusinessDayId="day-open-1"
        />,
      )
    })
  }

  function clickMenuAction(tableName: string, actionLabel: string) {
    const menuBtn = rootContainer!.querySelector(
      `button[aria-label="${tableName} için masa menüsü"]`,
    ) as HTMLButtonElement | null
    expect(menuBtn).not.toBeNull()

    act(() => {
      menuBtn!.click()
    })

    const buttons = Array.from(rootContainer!.querySelectorAll('button'))
    const actionBtn = buttons.find((b) => b.textContent?.includes(actionLabel))
    expect(actionBtn).toBeDefined()

    act(() => {
      actionBtn!.click()
    })
  }

  it('portals "Kapatılan Adisyonu Aç" modal to document.body outside .tables-container and closes on Escape', () => {
    renderTableLayout()

    const tablesContainer = rootContainer!.querySelector('.tables-container')
    expect(tablesContainer).not.toBeNull()

    const triggerBtn = Array.from(rootContainer!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Kapatılan Adisyonu Aç'),
    )
    expect(triggerBtn).toBeDefined()

    act(() => {
      triggerBtn!.click()
    })

    const dialog = document.body.querySelector('[role="dialog"][aria-label="Kapatılan Adisyon Seçimi"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.classList.contains('overlay')).toBe(true)
    expect(dialog!.parentElement).toBe(document.body)
    expect(tablesContainer!.contains(dialog)).toBe(false)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(
      document.body.querySelector('[role="dialog"][aria-label="Kapatılan Adisyon Seçimi"]'),
    ).toBeNull()
  })

  it('portals "Masayı Taşı", "Masayı Birleştir", and "Masayı Ayır" modals to document.body outside .tables-container', () => {
    renderTableLayout()
    const tablesContainer = rootContainer!.querySelector('.tables-container')!

    const scenarios = [
      { action: 'Masayı Taşı', ariaLabel: 'Masayı Taşı' },
      { action: 'Masayı Birleştir', ariaLabel: 'Masayı Birleştir' },
      { action: 'Masayı Ayır', ariaLabel: 'Masayı Ayır' },
    ]

    for (const { action, ariaLabel } of scenarios) {
      clickMenuAction('Masa 1', action)

      const dialog = document.body.querySelector(`[role="dialog"][aria-label="${ariaLabel}"]`)
      expect(dialog).not.toBeNull()
      expect(dialog!.classList.contains('overlay')).toBe(true)
      expect(dialog!.parentElement).toBe(document.body)
      expect(tablesContainer.contains(dialog)).toBe(false)

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })
      expect(document.body.querySelector(`[role="dialog"][aria-label="${ariaLabel}"]`)).toBeNull()
    }
  })
})
