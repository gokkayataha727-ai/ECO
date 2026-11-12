import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PaymentModal } from '../../src/components/PaymentModal'
import { DEFAULT_SETTINGS } from '../../src/types/settings'
import { createMockCartItem } from '../fixtures/factories'
import type { Session } from '../../src/types'
import { calculateTotals } from '../../src/lib/format'

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockAdminSession: Session = {
  userId: 'admin-1',
  username: 'admin',
  fullName: 'Admin',
  role: 'admin',
  loginAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
}

describe('PaymentModal Confirm Button Label Suite', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    rootContainer = document.createElement('div')
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

  it('displays uppercase method name (with Turkish İ) and updates dynamically on method, split, and manual amount changes', () => {
    vi.useFakeTimers()
    try {
      const onAddPayment = vi.fn()
    const item = createMockCartItem({ price: 200, quantity: 1 })
    const totals = { subtotal: 200, discount: 0, total: 200 }

    act(() => {
      root!.render(
        <PaymentModal
          cart={[item]}
          discountRate={0}
          isOpen={true}
          note=""
          onClose={vi.fn()}
          onNewOrder={vi.fn()}
          onPaid={vi.fn()}
          onAddPayment={onAddPayment}
          orderNumber="001"
          paidMethod={null}
          payments={[]}
          settings={DEFAULT_SETTINGS}
          totals={totals}
          currentSession={mockAdminSession}
        />,
      )
    })

    const getConfirmBtn = () =>
      rootContainer!.querySelector('button.confirm-pay') as HTMLButtonElement

    // 1. Default method is Nakit (canCash comes first), amount 200 -> NAKİT (₺200,00)
    expect(getConfirmBtn().textContent?.trim()).toBe('NAKİT (₺200,00)')

    // 2. Switch to Kart -> KART (₺200,00), then IBAN -> IBAN (₺200,00)
    const methodButtons = Array.from(
      rootContainer!.querySelectorAll('button.method-card'),
    ) as HTMLButtonElement[]
    const cashBtn = methodButtons.find((b) => b.textContent?.includes('Nakit'))!
    const ibanBtn = methodButtons.find((b) => b.textContent?.includes('IBAN'))!
    const cardBtn = methodButtons.find((b) => b.textContent?.includes('Kart'))!

    act(() => {
      cardBtn.click()
    })
    expect(getConfirmBtn().textContent?.trim()).toBe('KART (₺200,00)')

    // Switch to IBAN -> IBAN (₺200,00)
    act(() => {
      ibanBtn.click()
    })
    expect(getConfirmBtn().textContent?.trim()).toBe('IBAN (₺200,00)')

    // Switch to Nakit -> NAKİT (₺200,00) and back to Kart
    act(() => {
      cashBtn.click()
    })
    expect(getConfirmBtn().textContent?.trim()).toBe('NAKİT (₺200,00)')

    act(() => {
      cardBtn.click()
    })
    expect(getConfirmBtn().textContent?.trim()).toBe('KART (₺200,00)')

    // 3. Split "Yarısı" -> KART (₺100,00)
    const splitButtons = Array.from(
      rootContainer!.querySelectorAll('button'),
    ) as HTMLButtonElement[]
    const halfBtn = splitButtons.find((b) => b.textContent?.includes('Yarısı'))!
    act(() => {
      halfBtn.click()
    })
    expect(getConfirmBtn().textContent?.trim()).toBe('KART (₺100,00)')

    // 4. Manual amount input -> updates button text
    const amountInput = rootContainer!.querySelector(
      '#amount-to-pay',
    ) as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      nativeSetter.call(amountInput, '75')
      amountInput.dispatchEvent(new Event('input', { bubbles: true }))
      amountInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(getConfirmBtn().textContent?.trim()).toBe('KART (₺75,00)')

      // 5. Clicking confirm triggers payment callback with exact amount
      act(() => {
        getConfirmBtn().click()
      })
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(onAddPayment).toHaveBeenCalledTimes(1)
      expect(onAddPayment.mock.calls[0][0].amount).toBe(75)
      expect(onAddPayment.mock.calls[0][0].method).toBe('card')
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies fixed amount and net target discounts cleanly without DOM errors and updates remaining total', () => {
    vi.useFakeTimers()
    try {
      const item = createMockCartItem({ price: 410, quantity: 1 })
      let currentDiscountAmount = 0
      const onAddPayment = vi.fn()

      const renderModal = () => {
        const totals = calculateTotals([item], 0, currentDiscountAmount)
        root!.render(
          <PaymentModal
            cart={[item]}
            discountRate={0}
            discountAmount={currentDiscountAmount}
            onApplyDiscountAmount={(amt) => {
              currentDiscountAmount = amt
              renderModal()
            }}
            isOpen={true}
            note=""
            onClose={vi.fn()}
            onNewOrder={vi.fn()}
            onPaid={vi.fn()}
            onAddPayment={onAddPayment}
            orderNumber="001"
            paidMethod={null}
            payments={[]}
            settings={DEFAULT_SETTINGS}
            totals={totals}
            currentSession={mockAdminSession}
          />,
        )
      }

      act(() => {
        renderModal()
      })

      expect(rootContainer!.querySelector('button.confirm-pay')?.textContent?.trim()).toBe('NAKİT (₺410,00)')
      expect(rootContainer!.querySelector('#cash-received')).toBeNull()

      const openDiscBtn = Array.from(rootContainer!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('İndirim Uygula'),
      )!
      act(() => {
        openDiscBtn.click()
      })

      const netTabBtn = Array.from(rootContainer!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Net Tutar'),
      )!
      act(() => {
        netTabBtn.click()
      })

      const discInput = rootContainer!.querySelector('input[aria-label="İndirim değeri"]') as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      act(() => {
        nativeSetter.call(discInput, '400')
        discInput.dispatchEvent(new Event('input', { bubbles: true }))
        discInput.dispatchEvent(new Event('change', { bubbles: true }))
      })

      const applyBtn = Array.from(rootContainer!.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Uygula',
      )!
      act(() => {
        applyBtn.click()
      })

      expect(currentDiscountAmount).toBe(10)
      expect(rootContainer!.querySelector('button.confirm-pay')?.textContent?.trim()).toBe('NAKİT (₺400,00)')

      act(() => {
        (rootContainer!.querySelector('button.confirm-pay') as HTMLButtonElement).click()
      })
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(onAddPayment).toHaveBeenCalledTimes(1)
      expect(onAddPayment.mock.calls[0][0].amount).toBe(400)
      expect(onAddPayment.mock.calls[0][0].method).toBe('cash')
    } finally {
      vi.useRealTimers()
    }
  })
})
