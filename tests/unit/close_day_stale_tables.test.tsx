import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import App from '../../src/App'
import {
  getBusinessDaysSafe,
  getCompletedOrdersSafe,
  getTablesSafe,
  saveBusinessDaysSafe,
  saveTablesSafe,
  saveUsersSafe,
} from '../../src/lib/storage/repository'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockPayment,
  createMockTable,
} from '../fixtures/factories'
import type { Session, User } from '../../src/types'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function seedAuthenticatedAdminSession() {
  const adminUser: User = {
    id: 'admin-1',
    fullName: 'Kafe Yöneticisi',
    username: 'admin',
    role: 'admin',
    passwordHash: 'pbkdf2$100000$00112233445566778899aabbccddeeff$deadbeef',
    status: 'active',
    isDeleted: false,
    mustChangePassword: false,
    createdAt: '2026-11-15T08:00:00.000Z',
  }
  saveUsersSafe([adminUser])

  const nowIso = new Date().toISOString()
  const session: Session = {
    id: 'sess-admin-1',
    userId: adminUser.id,
    username: adminUser.username,
    fullName: adminUser.fullName,
    role: 'admin',
    loginAt: nowIso,
    createdAt: nowIso,
    lastActivityAt: nowIso,
  }
  localStorage.setItem('appSession', JSON.stringify(session))
  localStorage.setItem('userActiveSession_' + adminUser.id, session.id)
}

function advancePastSplash() {
  act(() => {
    vi.advanceTimersByTime(4000)
  })
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.trim().includes(text),
  ) as HTMLButtonElement | undefined
}

function setCountedCashFromExpected(dialog: HTMLElement) {
  const countedInput = dialog.querySelector('#counted-cash-input') as HTMLInputElement
  expect(countedInput).toBeTruthy()
  expect(countedInput.value).toBe('')
  const expectedText =
    dialog.querySelector('[data-testid="close-day-expected-cash"]')?.textContent ?? '0'
  const numericValue = expectedText.replace(/[^\d,]/g, '') || '0'
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  act(() => {
    nativeSetter.call(countedInput, numericValue)
    countedInput.dispatchEvent(new Event('input', { bubbles: true }))
    countedInput.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Close Day Table Occupancy Check (Prompt 1)', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    rootContainer = document.createElement('div')
    document.body.appendChild(rootContainer)
    root = createRoot(rootContainer)
    seedAuthenticatedAdminSession()
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
    vi.useRealTimers()
  })

  it('Scenario 1: Reloading while Masa 1 has partial payment, then paying remaining amount and closing day succeeds without phantom alert', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const openDay = createMockBusinessDay({
      id: 'day-s1',
      status: 'open',
      openingCash: 500,
    })
    saveBusinessDaysSafe([openDay])

    // Masa 1 has a 200 TL item and a 100 TL partial payment before page reload
    const masa1 = createMockTable({
      id: 't-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [
        createMockCartItem({
          id: 'prod-latte',
          cartItemId: 'ci-1',
          name: 'Latte',
          price: 200,
          quantity: 1,
          status: 'active',
        }),
      ],
      payments: [
        createMockPayment({
          id: 'pay-partial-1',
          method: 'cash',
          amount: 100,
          businessDayId: openDay.id,
          tableId: 't-1',
          tableName: 'Masa 1',
        }),
      ],
    })
    const masa2 = createMockTable({ id: 't-2', name: 'Masa 2', status: 'empty', cart: [] })
    saveTablesSafe([masa1, masa2])

    // Simulate page reload by mounting App with Masa 1 occupied in storage
    act(() => {
      root!.render(<App />)
    })
    advancePastSplash()

    // Navigate to Masalar and open Masa 1, or pay remaining directly
    const masalarNav = findButtonByText(rootContainer!, 'Masalar')!
    act(() => {
      masalarNav.click()
    })

    // Click Masa 1 card to enter TableOrderView
    const masa1Card = Array.from(rootContainer!.querySelectorAll('.tables-grid > div')).find((el) =>
      el.textContent?.includes('Masa 1'),
    ) as HTMLElement
    expect(masa1Card).toBeTruthy()
    act(() => {
      masa1Card.click()
    })

    // Open PaymentModal ("Ödeme")
    const odemeAlBtn = rootContainer!.querySelector('button.pay-button--payment') as HTMLButtonElement
    expect(odemeAlBtn).toBeTruthy()
    act(() => {
      odemeAlBtn.click()
    })

    // Pay the remaining 100 TL to complete and close the order on Masa 1
    const kalanOdeBtn = Array.from(rootContainer!.querySelectorAll('button.confirm-pay'))[0] as HTMLButtonElement
    expect(kalanOdeBtn).toBeTruthy()
    act(() => {
      kalanOdeBtn.click()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Close the completed receipt modal if open
    const kapatBtns = Array.from(rootContainer!.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Kapat' || b.getAttribute('aria-label') === 'Kapat',
    )
    if (kapatBtns.length > 0) {
      act(() => {
        kapatBtns[0].click()
      })
    }

    // Verify all tables are now empty in storage, and 1 order is completed
    const tablesAfterPay = getTablesSafe()
    expect(tablesAfterPay.every((t) => t.cart.length === 0)).toBe(true)
    expect(getCompletedOrdersSafe()).toHaveLength(1)

    // Go back to Ana Sayfa and click "Günü Kapat"
    const anaSayfaBtn = findButtonByText(rootContainer!, 'Ana Sayfa')!
    act(() => {
      anaSayfaBtn.click()
    })

    const gunuKapatTrigger = findButtonByText(rootContainer!, 'Günü Kapat')!
    expect(gunuKapatTrigger).toBeTruthy()
    act(() => {
      gunuKapatTrigger.click()
    })

    // CloseDayModal should NOT show "Açık Masalar Var"
    const dialog = rootContainer!.querySelector('[role="dialog"][aria-label="Günü Kapat"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).not.toContain('Açık Masalar Var')

    // Sayılan nakit boşken buton pasif olmalı, sayım girilince aktifleşmeli
    const modalSubmitBtn = findButtonByText(dialog, 'Günü Kapat')!
    expect(modalSubmitBtn.disabled).toBe(true)
    setCountedCashFromExpected(dialog)
    expect(modalSubmitBtn.disabled).toBe(false)
    act(() => {
      modalSubmitBtn.click()
    })

    const confirmBtn = findButtonByText(dialog, 'Onayla ve Günü Kapat')!
    expect(confirmBtn).toBeTruthy()
    act(() => {
      confirmBtn.click()
    })

    // Alert MUST NOT be called and day MUST be closed
    expect(alertSpy).not.toHaveBeenCalled()
    const daysAfterClose = getBusinessDaysSafe()
    expect(daysAfterClose[0].status).toBe('closed')
  })

  it('Scenario 2: Truly occupied table blocks closing the day in CloseDayModal and lists open table names accurately', () => {
    const openDay = createMockBusinessDay({
      id: 'day-s2',
      status: 'open',
      openingCash: 500,
    })
    saveBusinessDaysSafe([openDay])

    const masa1 = createMockTable({
      id: 't-1',
      name: 'Masa 1',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Americano', price: 120, quantity: 1 })],
    })
    const masa3 = createMockTable({
      id: 't-3',
      name: 'Bahçe 3',
      status: 'occupied',
      cart: [createMockCartItem({ name: 'Filtre Kahve', price: 100, quantity: 2 })],
    })
    saveTablesSafe([masa1, masa3])

    act(() => {
      root!.render(<App />)
    })
    advancePastSplash()

    const gunuKapatTrigger = findButtonByText(rootContainer!, 'Günü Kapat')!
    act(() => {
      gunuKapatTrigger.click()
    })

    const dialog = rootContainer!.querySelector('[role="dialog"][aria-label="Günü Kapat"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Açık Masalar Var (2 masa)')
    expect(dialog.textContent).toContain('Masa 1')
    expect(dialog.textContent).toContain('Bahçe 3')

    const modalSubmitBtn = findButtonByText(dialog, 'Günü Kapat')!
    expect(modalSubmitBtn.disabled).toBe(true)
    expect(getBusinessDaysSafe()[0].status).toBe('open')
  })

  it('Scenario 3 & 4: Without page reload in the same session, opening -> closing -> reopening -> closing a table always reflects live state when closing day', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const openDay = createMockBusinessDay({
      id: 'day-s3',
      status: 'open',
      openingCash: 500,
    })
    saveBusinessDaysSafe([openDay])

    const masa1 = createMockTable({ id: 't-1', name: 'Masa 1', status: 'empty', cart: [] })
    saveTablesSafe([masa1])

    act(() => {
      root!.render(<App />)
    })
    advancePastSplash()

    // 1. Go to Masalar, select Masa 1, add a product (table becomes occupied)
    act(() => {
      findButtonByText(rootContainer!, 'Masalar')!.click()
    })
    const clickMasa1 = () => {
      const card = Array.from(rootContainer!.querySelectorAll('.tables-grid > div')).find((node) =>
        node.textContent?.includes('Masa 1'),
      ) as HTMLElement
      expect(card).toBeTruthy()
      act(() => {
        card.click()
      })
    }
    clickMasa1()

    // Click first product card to add to Masa 1
    const firstProductBtn = rootContainer!.querySelector('.product-card') as HTMLElement
    expect(firstProductBtn).toBeTruthy()
    act(() => {
      firstProductBtn.click()
    })

    // Check Günü Kapat while Masa 1 is open -> must warn and block
    act(() => {
      findButtonByText(rootContainer!, 'Ana Sayfa')!.click()
    })
    act(() => {
      findButtonByText(rootContainer!, 'Günü Kapat')!.click()
    })
    let dialog = rootContainer!.querySelector('[role="dialog"][aria-label="Günü Kapat"]') as HTMLElement
    expect(dialog.textContent).toContain('Açık Masalar Var (1 masa)')
    expect(dialog.textContent).toContain('Masa 1')
    expect(findButtonByText(dialog, 'Günü Kapat')!.disabled).toBe(true)

    // Close modal, clear/close Masa 1, then reopen Masa 1 and add item again
    act(() => {
      findButtonByText(dialog, 'Vazgeç')!.click()
    })
    act(() => {
      findButtonByText(rootContainer!, 'Masalar')!.click()
    })

    // Clear Masa 1 cart in TableOrderView (still active table or click Masa 1)
    if (!rootContainer!.querySelector('button.pay-button--payment')) {
      clickMasa1()
    }
    const temizleBtn = findButtonByText(rootContainer!, 'Temizle')
    expect(temizleBtn).toBeTruthy()
    act(() => {
      temizleBtn!.click()
    })
    const onaylaBtn = findButtonByText(rootContainer!, 'Evet, temizle')
    expect(onaylaBtn).toBeTruthy()
    act(() => {
      onaylaBtn!.click()
    })

    // Add item again (reopen Masa 1)
    act(() => {
      ;(rootContainer!.querySelector('.product-card') as HTMLElement).click()
    })
    expect(getTablesSafe()[0].cart.length).toBeGreaterThan(0)

    // Check Günü Kapat again -> must still block because Masa 1 was reopened
    act(() => {
      findButtonByText(rootContainer!, 'Ana Sayfa')!.click()
    })
    act(() => {
      findButtonByText(rootContainer!, 'Günü Kapat')!.click()
    })
    dialog = rootContainer!.querySelector('[role="dialog"][aria-label="Günü Kapat"]') as HTMLElement
    expect(dialog.textContent).toContain('Açık Masalar Var (1 masa)')
    expect(findButtonByText(dialog, 'Günü Kapat')!.disabled).toBe(true)
    act(() => {
      findButtonByText(dialog, 'Vazgeç')!.click()
    })

    // Now pay Masa 1 so it closes
    act(() => {
      findButtonByText(rootContainer!, 'Masalar')!.click()
    })
    if (!rootContainer!.querySelector('button.pay-button--payment')) {
      clickMasa1()
    }
    act(() => {
      ;(rootContainer!.querySelector('button.pay-button--payment') as HTMLButtonElement).click()
    })
    const confirmPayBtn = rootContainer!.querySelector('button.confirm-pay') as HTMLButtonElement
    act(() => {
      confirmPayBtn.click()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    const closePaymentModalBtns = Array.from(rootContainer!.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Kapat' || b.getAttribute('aria-label') === 'Kapat',
    )
    if (closePaymentModalBtns.length > 0) {
      act(() => {
        closePaymentModalBtns[0].click()
      })
    }

    // Finally Günü Kapat -> must succeed without alert
    act(() => {
      findButtonByText(rootContainer!, 'Ana Sayfa')!.click()
    })
    act(() => {
      findButtonByText(rootContainer!, 'Günü Kapat')!.click()
    })
    dialog = rootContainer!.querySelector('[role="dialog"][aria-label="Günü Kapat"]') as HTMLElement
    expect(dialog.textContent).not.toContain('Açık Masalar Var')
    setCountedCashFromExpected(dialog)
    act(() => {
      findButtonByText(dialog, 'Günü Kapat')!.click()
    })
    act(() => {
      findButtonByText(dialog, 'Onayla ve Günü Kapat')!.click()
    })

    expect(alertSpy).not.toHaveBeenCalled()
    expect(getBusinessDaysSafe()[0].status).toBe('closed')
  })
})
