import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CASH_DIFFERENCE_NOTE_THRESHOLD,
  CloseDayModal,
} from '../../src/components/CloseDayModal'
import { ReportsModal } from '../../src/components/ReportsModal'
import { ZReportPrintView } from '../../src/components/ZReportPrintView'
import {
  buildReportFromOrders,
  exportReportToCsv,
  getReportForBusinessDay,
} from '../../src/lib/businessDay'
import { formatCurrency } from '../../src/lib/format'
import {
  clearInMemoryCache,
  executeCloseBusinessDaySqliteTx,
  executeOpenBusinessDaySqliteTx,
  getBusinessDaysSafe,
  saveBusinessDaysSafe,
} from '../../src/lib/storage'
import {
  createMockBusinessDay,
  createMockCartItem,
  createMockOrder,
  createMockPayment,
  createMockSettings,
} from '../fixtures/factories'
import type { BusinessDay, CompletedOrder, Session, Table } from '../../src/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const adminSession: Session = {
  id: 'sess-admin-p4',
  userId: 'user-admin-p4',
  username: 'admin',
  fullName: 'Yönetici',
  role: 'admin',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  lastActivityAt: new Date().toISOString(),
}

const mountedRoots: Array<{ root: Root; container: HTMLElement }> = []

function mount(element: React.ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  const entry = { root, container }
  mountedRoots.push(entry)
  return entry
}

function setInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function findButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  )
  if (!btn) {
    throw new Error(`"${label}" butonu bulunamadı`)
  }
  return btn
}

function buildScenarioWithExpected320() {
  const settings = createMockSettings({ taxRate: 10, cashierName: 'Ahmet' })
  const day = createMockBusinessDay({
    id: 'day-p4-320',
    status: 'open',
    openingCash: 100,
    openedBy: 'Ahmet',
  })
  const orders: CompletedOrder[] = [
    createMockOrder({
      id: 'ord-p4-cash',
      businessDayId: day.id,
      items: [createMockCartItem({ name: 'Filtre Kahve', price: 220, quantity: 1 })],
      totals: { subtotal: 220, discount: 0, total: 220 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'pay-p4-cash',
          method: 'cash',
          amount: 220,
          businessDayId: day.id,
        }),
      ],
    }),
    createMockOrder({
      id: 'ord-p4-card',
      businessDayId: day.id,
      items: [createMockCartItem({ name: 'Latte', price: 150, quantity: 1 })],
      totals: { subtotal: 150, discount: 0, total: 150 },
      paymentMethod: 'card',
      payments: [
        createMockPayment({
          id: 'pay-p4-card',
          method: 'card',
          amount: 150,
          businessDayId: day.id,
        }),
      ],
    }),
  ]
  const tables: Table[] = []
  return { settings, day, orders, tables }
}

describe('Gün Sonu Sayılan Nakit Kontrolü ve Kasa Farkı (Prompt 4)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearInMemoryCache()
  })

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const entry = mountedRoots.pop()!
      act(() => {
        entry.root.unmount()
      })
      entry.container.remove()
    }
  })

  it('Adım 1 & 6: Pencere açıldığında Sayılan nakit ve POS Z kutuları boş başlar, gün kapatma butonu pasif olur; 0 beklenen nakitte bile boşken kapanamaz', () => {
    const { settings, day, orders, tables } = buildScenarioWithExpected320()
    const onCloseDay = vi.fn()

    const { root, container } = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={onCloseDay}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    // Beklenen nakit ayrı gösteriliyor (₺320,00), ancak kutuya yazılmıyor
    expect(
      container.querySelector('[data-testid="close-day-expected-cash"]')?.textContent,
    ).toBe(formatCurrency(320))

    const countedInput = container.querySelector('#counted-cash-input') as HTMLInputElement
    const enteredZInput = container.querySelector('#entered-z-input') as HTMLInputElement
    expect(countedInput).toBeTruthy()
    expect(countedInput.value).toBe('')
    expect(enteredZInput.value).toBe('')

    const submitBtn = findButtonByText(container, 'Günü Kapat')
    expect(submitBtn.disabled).toBe(true)

    // Kasa farkı kutusu henüz gösterilmemeli
    expect(container.querySelector('[data-testid="close-day-cash-difference"]')).toBeNull()

    // Önceki modalı DOM'dan kaldır ki aynı id çakışması yaşanmasın
    act(() => {
      root.unmount()
    })
    container.remove()
    mountedRoots.pop()

    // 0 TL beklenen nakitte de boşken buton pasif, "0" yazılınca aktif olur
    const zeroDay = createMockBusinessDay({
      id: 'day-zero-expected',
      status: 'open',
      openingCash: 0,
    })
    const { container: zeroContainer } = mount(
      <CloseDayModal
        isOpen
        openDay={zeroDay}
        orders={[]}
        tables={[]}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    const zeroInput = zeroContainer.querySelector('#counted-cash-input') as HTMLInputElement
    expect(zeroInput).toBeTruthy()
    expect(zeroInput.value).toBe('')
    expect(findButtonByText(zeroContainer, 'Günü Kapat').disabled).toBe(true)

    setInputValue(zeroInput, '0')
    expect(findButtonByText(zeroContainer, 'Günü Kapat').disabled).toBe(false)
    expect(
      zeroContainer.querySelector('[data-testid="close-day-cash-difference"]')?.textContent,
    ).toContain('Kasa Tam')
  })

  it('Adım 1b: Modal kapatılıp yeniden açıldığında Sayılan nakit kutusu tekrar boş başlar', () => {
    const { settings, day, orders, tables } = buildScenarioWithExpected320()
    const onClose = vi.fn()
    const { root, container } = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={onClose}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    const input = container.querySelector('#counted-cash-input') as HTMLInputElement
    setInputValue(input, '300')
    expect(input.value).toBe('300')

    act(() => {
      root.render(
        <CloseDayModal
          isOpen={false}
          openDay={day}
          orders={orders}
          tables={tables}
          settings={settings}
          onClose={onClose}
          onCloseDay={vi.fn()}
          onGoToTables={vi.fn()}
          onViewReport={vi.fn()}
        />,
      )
    })
    act(() => {
      root.render(
        <CloseDayModal
          isOpen
          openDay={day}
          orders={orders}
          tables={tables}
          settings={settings}
          onClose={onClose}
          onCloseDay={vi.fn()}
          onGoToTables={vi.fn()}
          onViewReport={vi.fn()}
        />,
      )
    })

    const reopenedInput = container.querySelector('#counted-cash-input') as HTMLInputElement
    expect(reopenedInput.value).toBe('')
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(true)
  })

  it('Adım 2: Beklenenden farklı tutarda (₺320 vs ₺240 / ₺440) Eksik/Fazla uyarısı çıkar; ₺50 eşiği üzerinde açıklama zorunlu olur', () => {
    expect(CASH_DIFFERENCE_NOTE_THRESHOLD).toBe(50)
    const { settings, day, orders, tables } = buildScenarioWithExpected320()

    const { container } = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    const countedInput = container.querySelector('#counted-cash-input') as HTMLInputElement

    // 1. Beklenen ₺320 iken ₺240 gir -> "₺80,00 Eksik", eşik üstü açıklama zorunlu
    setInputValue(countedInput, '240')
    const diffBanner = container.querySelector('[data-testid="close-day-cash-difference"]')!
    expect(diffBanner.textContent).toContain('₺80,00 Eksik')
    expect(container.querySelector('[data-testid="cash-difference-note-input"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="cash-difference-note-error"]')).toBeTruthy()
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(true)

    // 2. Açıklama girilince buton aktifleşir
    const diffNoteInput = container.querySelector(
      '[data-testid="cash-difference-note-input"]',
    ) as HTMLTextAreaElement
    setInputValue(diffNoteInput, 'Bozuk para eksiği')
    expect(container.querySelector('[data-testid="cash-difference-note-error"]')).toBeNull()
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(false)

    // 3. Beklenen ₺320 iken ₺440 gir -> "₺120,00 Fazla", açıklama silinmişse tekrar pasifleşir
    setInputValue(diffNoteInput, '')
    setInputValue(countedInput, '440')
    expect(
      container.querySelector('[data-testid="close-day-cash-difference"]')?.textContent,
    ).toContain('₺120,00 Fazla')
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(true)

    // 4. Eşik içi küçük fark (₺300 -> ₺20,00 Eksik <= ₺50): uyarı çıkar ama açıklama zorunlu değildir
    setInputValue(countedInput, '300')
    expect(
      container.querySelector('[data-testid="close-day-cash-difference"]')?.textContent,
    ).toContain('₺20,00 Eksik')
    expect(container.querySelector('[data-testid="cash-difference-note-error"]')).toBeNull()
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(false)

    // 5. Tam eşik sınırları: ₺50,00 farkta opsiyonel, ₺50,01 farkta zorunlu
    setInputValue(countedInput, '270') // 320 - 270 = 50
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(false)
    setInputValue(countedInput, '269,99') // 50,01 eksik
    expect(findButtonByText(container, 'Günü Kapat').disabled).toBe(true)
  })

  it('Adım 3 & 4: Fark açıklaması closeNote yerine cashDifferenceNote alanında saklanır, SQLite ve Raporlar/Z Raporu/CSV ekranlarında ayrı görünür', async () => {
    const { settings, day, orders, tables } = buildScenarioWithExpected320()
    executeOpenBusinessDaySqliteTx({ businessDay: day })

    const onCloseDay = vi.fn((closedDay: BusinessDay) => {
      executeCloseBusinessDaySqliteTx({ closedDay })
    })

    const { container } = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={onCloseDay}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    setInputValue(container.querySelector('#counted-cash-input') as HTMLInputElement, '240')
    setInputValue(
      container.querySelector('[data-testid="cash-difference-note-input"]') as HTMLTextAreaElement,
      'Gün içi bozuk para açığı',
    )
    setInputValue(container.querySelector('#close-day-note') as HTMLTextAreaElement, 'Akşam kapanış')

    act(() => {
      findButtonByText(container, 'Günü Kapat').click()
    })
    act(() => {
      findButtonByText(container, 'Onayla ve Günü Kapat').click()
    })

    expect(onCloseDay).toHaveBeenCalledTimes(1)
    const closedDay: BusinessDay = onCloseDay.mock.calls[0][0]
    expect(closedDay.status).toBe('closed')
    expect(closedDay.countedCash).toBe(240)
    expect(closedDay.closingCash).toBe(240)
    expect(closedDay.expectedCash).toBe(320)
    expect(closedDay.cashDifference).toBe(-80)
    expect(closedDay.cashDifferenceNote).toBe('Gün içi bozuk para açığı')
    expect(closedDay.closeNote).toBe('Akşam kapanış')
    expect(closedDay.usedExpectedCash).toBeUndefined()
    expect(closedDay.enteredZ).toBeUndefined()

    // SQLite kalıcılık kontrolü
    clearInMemoryCache()
    const reloaded = getBusinessDaysSafe()
    expect(reloaded).toHaveLength(1)
    const persistedDay = reloaded[0]
    expect(persistedDay.countedCash).toBe(240)
    expect(persistedDay.cashDifference).toBe(-80)
    expect(persistedDay.cashDifferenceNote).toBe('Gün içi bozuk para açığı')
    expect(persistedDay.closeNote).toBe('Akşam kapanış')

    // Raporlar ekranı kontrolü
    const { container: reportsContainer } = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={orders}
        businessDays={[persistedDay]}
        openBusinessDay={null}
        initialSelectedDayId={persistedDay.id}
        tables={tables}
        settings={settings}
        currentSession={adminSession}
      />,
    )

    expect(reportsContainer.textContent).toContain(formatCurrency(240))
    expect(reportsContainer.textContent).toContain(`${formatCurrency(-80)} Eksik`)
    expect(reportsContainer.textContent).toContain('Akşam kapanış')
    expect(
      reportsContainer.querySelector('[data-testid="reports-cash-difference-note"]')?.textContent,
    ).toContain('Gün içi bozuk para açığı')

    // Z Raporu A4 & 80mm Fiş kontrolü
    const report = getReportForBusinessDay(persistedDay, orders, settings.taxRate, tables)
    const { container: a4Container } = mount(
      <ZReportPrintView report={report} day={persistedDay} settings={settings} mode="a4" />,
    )
    expect(a4Container.textContent).toContain(formatCurrency(240))
    expect(a4Container.textContent).toContain(`${formatCurrency(-80)} (Eksik)`)
    expect(
      a4Container.querySelector('[data-testid="zreport-a4-cash-difference-note"]')?.textContent,
    ).toContain('Gün içi bozuk para açığı')

    const { container: receiptContainer } = mount(
      <ZReportPrintView report={report} day={persistedDay} settings={settings} mode="receipt" />,
    )
    expect(receiptContainer.textContent).toContain(formatCurrency(240))
    expect(
      receiptContainer.querySelector('[data-testid="zreport-receipt-cash-difference-note"]')
        ?.textContent,
    ).toContain('Gün içi bozuk para açığı')

    // CSV kontrolü
    let capturedBlob: Blob | null = null
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b
      return 'blob:mock-p4-csv'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    try {
      exportReportToCsv(report, 'Prompt 4 Test', persistedDay)
    } finally {
      URL.createObjectURL = origCreateObjectURL
      URL.revokeObjectURL = origRevokeObjectURL
      clickSpy.mockRestore()
    }
    const csv = await capturedBlob!.text()
    expect(csv).toContain('"Kapanış Notu";"Akşam kapanış"')
    expect(csv).toContain('"Sayılan Nakit";"240,00"')
    expect(csv).toContain('"Kasa Farkı";"-80,00"')
    expect(csv).toContain('"Kasa Farkı Açıklaması";"Gün içi bozuk para açığı"')
  })

  it('Adım 5: Beklenenle aynı tutar girilince Kasa Tam (₺0,00) görünür; "Beklenen tutarı kullan" bilinçli tıklama ile not düşer', () => {
    const { settings, day, orders, tables } = buildScenarioWithExpected320()
    const onCloseDayManual = vi.fn()

    const { container: manualContainer } = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={onCloseDayManual}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    setInputValue(manualContainer.querySelector('#counted-cash-input') as HTMLInputElement, '320')
    expect(
      manualContainer.querySelector('[data-testid="close-day-cash-difference"]')?.textContent,
    ).toContain('Kasa Tam')
    expect(manualContainer.querySelector('[data-testid="cash-difference-note-input"]')).toBeNull()

    act(() => {
      findButtonByText(manualContainer, 'Günü Kapat').click()
    })
    act(() => {
      findButtonByText(manualContainer, 'Onayla ve Günü Kapat').click()
    })

    const manualClosed: BusinessDay = onCloseDayManual.mock.calls[0][0]
    expect(manualClosed.countedCash).toBe(320)
    expect(manualClosed.cashDifference).toBe(0)
    expect(manualClosed.cashDifferenceNote).toBeUndefined()
    expect(manualClosed.usedExpectedCash).toBeUndefined()
    expect(manualClosed.closeNote).toBeUndefined()

    // Kısayol butonu: "Beklenen tutarı kullan"
    const onCloseDayShortcut = vi.fn()
    const { container: shortcutContainer } = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={tables}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={onCloseDayShortcut}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    const shortcutBtn = shortcutContainer.querySelector(
      '[data-testid="use-expected-cash-btn"]',
    ) as HTMLButtonElement
    act(() => {
      shortcutBtn.click()
    })

    const shortcutInput = shortcutContainer.querySelector('#counted-cash-input') as HTMLInputElement
    expect(shortcutInput.value).toBe('320')
    expect(
      shortcutContainer.querySelector('[data-testid="used-expected-cash-notice"]'),
    ).toBeTruthy()
    expect(findButtonByText(shortcutContainer, 'Günü Kapat').disabled).toBe(false)

    // Kısayoldan sonra elle düzenlenirse kısayol bayrağı temizlenir
    setInputValue(shortcutInput, '315')
    expect(
      shortcutContainer.querySelector('[data-testid="used-expected-cash-notice"]'),
    ).toBeNull()

    // Tekrar kısayola tıklayıp günü kapat
    act(() => {
      shortcutBtn.click()
    })
    act(() => {
      findButtonByText(shortcutContainer, 'Günü Kapat').click()
    })
    act(() => {
      findButtonByText(shortcutContainer, 'Onayla ve Günü Kapat').click()
    })

    const shortcutClosed: BusinessDay = onCloseDayShortcut.mock.calls[0][0]
    expect(shortcutClosed.countedCash).toBe(320)
    expect(shortcutClosed.cashDifference).toBe(0)
    expect(shortcutClosed.usedExpectedCash).toBe(true)
    expect(shortcutClosed.closeNote).toContain('Beklenen tutar kullanıldı')
  })

  it('Adım 6: Geçmişte kapanmış günlerin kayıtları yeni alanlar olmadan da bozulmadan yüklenir ve görüntülenir', () => {
    const settings = createMockSettings({ taxRate: 10 })
    const legacySnapshot = buildReportFromOrders([], 10)
    const legacyClosedDay: BusinessDay = createMockBusinessDay({
      id: 'day-legacy-p4',
      status: 'closed',
      openingCash: 500,
      closedAt: '2026-10-01T21:00:00.000Z',
      closedBy: 'Eski Kasiyer',
      countedCash: 650,
      closingCash: 650,
      expectedCash: 650,
      cashDifference: 0,
      closeNote: 'Eski dönem kapanış notu',
      report: legacySnapshot,
    })

    saveBusinessDaysSafe([legacyClosedDay])
    clearInMemoryCache()
    const loaded = getBusinessDaysSafe()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].countedCash).toBe(650)
    expect(loaded[0].cashDifference).toBe(0)
    expect(loaded[0].closeNote).toBe('Eski dönem kapanış notu')
    expect(loaded[0].cashDifferenceNote).toBeUndefined()
    expect(loaded[0].usedExpectedCash).toBeUndefined()

    const { container: reportsContainer } = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={[]}
        businessDays={loaded}
        openBusinessDay={null}
        initialSelectedDayId={loaded[0].id}
        tables={[]}
        settings={settings}
        currentSession={adminSession}
      />,
    )
    expect(reportsContainer.textContent).toContain('Kasa Tam (₺0,00)')
    expect(reportsContainer.textContent).toContain('Eski dönem kapanış notu')
    expect(
      reportsContainer.querySelector('[data-testid="reports-cash-difference-note"]'),
    ).toBeNull()

    const { container: printContainer } = mount(
      <ZReportPrintView
        report={legacySnapshot}
        day={loaded[0]}
        settings={settings}
        mode="a4"
      />,
    )
    expect(printContainer.textContent).toContain(formatCurrency(650))
    expect(
      printContainer.querySelector('[data-testid="zreport-a4-cash-difference-note"]'),
    ).toBeNull()
  })
})
