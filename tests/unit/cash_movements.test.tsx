import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildReportFromOrders,
  exportReportToCsv,
  getReportForBusinessDay,
  hesaplaBeklenenNakit,
} from '../../src/lib/businessDay'
import { formatCurrency } from '../../src/lib/format'
import {
  can,
  getPermissionTemplate,
  logUnauthorizedAttempt,
  savePermissionTemplate,
} from '../../src/lib/permissions'
import {
  clearInMemoryCache,
  createFullBackupFile,
  getActivityLogsSafe,
  getCashMovementsSafe,
  getSettingsSafe,
  migrateLocalStorageToSqliteIfNeeded,
  restoreFromBackup,
  saveBusinessDaysSafe,
  saveCashMovementsSafe,
  saveCompletedOrdersSafe,
  saveSettingsSafe,
  setCustomSqliteDispatcher,
  validateBackupFileStructure,
} from '../../src/lib/storage'
import { setResetSqliteOnStorageClear } from '../setup'
import { computeChecksum } from '../../src/lib/storage/checksum'
import { logActivity } from '../../src/lib/activityLog'
import { CashMovementModal } from '../../src/components/CashMovementModal'
import { CloseDayModal } from '../../src/components/CloseDayModal'
import { HomePage } from '../../src/components/HomePage'
import { ReportsModal } from '../../src/components/ReportsModal'
import { SettingsModal } from '../../src/components/SettingsModal'
import { TableLayout } from '../../src/components/TableLayout'
import { ZReportPrintView } from '../../src/components/ZReportPrintView'
import {
  createMockBusinessDay,
  createMockOrder,
  createMockPayment,
  createMockProduct,
  createMockSettings,
  createMockTable,
  createMockUser,
} from '../fixtures/factories'
import type {
  BusinessDay,
  CashMovement,
  CompletedOrder,
  Session,
} from '../../src/types'

const require = createRequire(import.meta.url)
const {
  openDatabase,
  closeDatabase,
  executeDbAction,
  setCustomMigrationPayload,
} = require('../../electron/db/index.cjs')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const adminSession: Session = {
  id: 'sess-admin',
  userId: 'user-admin',
  username: 'admin',
  fullName: 'Yönetici',
  role: 'admin',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  lastActivityAt: new Date().toISOString(),
}

const waiterSession: Session = {
  id: 'sess-waiter',
  userId: 'user-waiter',
  username: 'garson1',
  fullName: 'Ahmet Garson',
  role: 'waiter',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  lastActivityAt: new Date().toISOString(),
}

const mountedRoots: Array<{ root: Root; container: HTMLElement }> = []

function mount(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  mountedRoots.push({ root, container })
  return container
}

function getByTestId(container: HTMLElement, testId: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${testId}"]`) ?? document.body.querySelector(`[data-testid="${testId}"]`)
  if (!el) {
    throw new Error(`data-testid="${testId}" bulunamadı`)
  }
  return el as HTMLElement
}

function setInputValue(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto =
    input instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Prompt 5: Kasa Giriş/Çıkış (Gider) Kaydı Özellik Testleri', () => {
  beforeEach(() => {
    setResetSqliteOnStorageClear(true)
    setCustomSqliteDispatcher(null)
    localStorage.clear()
    clearInMemoryCache()
  })

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const item = mountedRoots.pop()
      if (item) {
        act(() => {
          item.root.unmount()
        })
        item.container.remove()
      }
    }
    setCustomSqliteDispatcher(null)
    vi.restoreAllMocks()
  })

  function buildDayWith240CashSales(openingCash = 500) {
    const day = createMockBusinessDay({
      id: 'day-cash-test',
      status: 'open',
      openingCash,
    })
    const order = createMockOrder({
      id: 'ord-cash-240',
      orderNumber: 'ORD-240',
      businessDayId: day.id,
      totals: { subtotal: 240, discount: 0, total: 240 },
      paymentMethod: 'cash',
      payments: [
        createMockPayment({
          id: 'pay-cash-240',
          method: 'cash',
          amount: 240,
          businessDayId: day.id,
        }),
      ],
    })
    return { day, orders: [order] as CompletedOrder[], settings: createMockSettings({ taxRate: 10 }) }
  }

  it('Doğrulama 1 & 2 & 3: Açılış ₺500 + nakit satış ₺240 − çıkış ₺150 = ₺590, + giriş ₺100 = ₺690, çıkış iptali = ₺740 ve iptal kaydı korunur', () => {
    const { day, orders, settings } = buildDayWith240CashSales(500)
    const out150: CashMovement = {
      id: 'cm-out-150',
      businessDayId: day.id,
      type: 'CIKIS',
      amount: 150,
      category: 'Tedarikçi',
      description: 'Süt ve kahve tedarik ödemesi',
      createdAt: new Date().toISOString(),
      createdBy: 'Yönetici',
    }
    saveCashMovementsSafe([out150])

    // Doğrulama 1: 500 + 240 - 150 = 590
    const rep1 = getReportForBusinessDay(day, orders, settings.taxRate, [])
    const sum1 = hesaplaBeklenenNakit(day, rep1)
    expect(sum1.kirilim.acilisNakiti).toBe(500)
    expect(sum1.kirilim.kapananNakit).toBe(240)
    expect(sum1.kirilim.kasaCikis).toBe(150)
    expect(sum1.kirilim.kasaGiris).toBe(0)
    expect(sum1.beklenen).toBe(590)

    // Doğrulama 2: + ₺100 kasa girişi => 690
    const in100: CashMovement = {
      id: 'cm-in-100',
      businessDayId: day.id,
      type: 'GIRIS',
      amount: 100,
      category: 'Bozuk Para',
      description: 'Bankadan bozuk para takviyesi',
      createdAt: new Date().toISOString(),
      createdBy: 'Yönetici',
    }
    saveCashMovementsSafe([in100, out150])

    const rep2 = getReportForBusinessDay(day, orders, settings.taxRate, [])
    const sum2 = hesaplaBeklenenNakit(day, rep2)
    expect(sum2.kirilim.kasaGiris).toBe(100)
    expect(sum2.kirilim.kasaCikis).toBe(150)
    expect(sum2.beklenen).toBe(690)

    // Doğrulama 3: ₺150 çıkış iptal edilir (silinmez, cancelled: true kalır) => 500 + 240 + 100 = 840
    // (100 giriş olmadan önce iptal edilirse de 500 + 240 = 740)
    const cancelledList: CashMovement[] = [
      in100,
      {
        ...out150,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'Yönetici',
        cancelledReason: 'Fatura daha sonra EFT ödendi',
      },
    ]
    saveCashMovementsSafe(cancelledList)

    const storedAfterCancel = getCashMovementsSafe()
    expect(storedAfterCancel).toHaveLength(2)
    const cancelledRecord = storedAfterCancel.find((m) => m.id === 'cm-out-150')
    expect(cancelledRecord?.cancelled).toBe(true)
    expect(cancelledRecord?.cancelledReason).toBe('Fatura daha sonra EFT ödendi')

    const rep3 = getReportForBusinessDay(day, orders, settings.taxRate, [])
    const sum3 = hesaplaBeklenenNakit(day, rep3)
    expect(sum3.kirilim.kasaGiris).toBe(100)
    expect(sum3.kirilim.kasaCikis).toBe(0)
    expect(sum3.beklenen).toBe(840)

    // Tek başına 150 çıkış iptal edildiğinde (giriş hariç) başlangıç + satış = 740'a döner
    const onlyCancelledOut = [cancelledList[1]]
    saveCashMovementsSafe(onlyCancelledOut)
    const rep4 = getReportForBusinessDay(day, orders, settings.taxRate, [])
    const sum4 = hesaplaBeklenenNakit(day, rep4)
    expect(sum4.beklenen).toBe(740)
  })

  it('Doğrulama 4: CloseDayModal, ReportsModal, ZReportPrintView (A4 + fiş) ve CSV tüm ekranlarda aynı beklenen nakit ve kırılımı gösterir', () => {
    const { day, orders, settings } = buildDayWith240CashSales(500)
    const movements: CashMovement[] = [
      {
        id: 'cm-giris-1',
        businessDayId: day.id,
        type: 'GIRIS',
        amount: 100,
        category: 'Bozuk Para',
        description: 'Bozuk para eklendi',
        createdAt: new Date().toISOString(),
        createdBy: 'Yönetici',
      },
      {
        id: 'cm-cikis-1',
        businessDayId: day.id,
        type: 'CIKIS',
        amount: 150,
        category: 'Tedarikçi',
        description: 'Süt faturası nakit',
        createdAt: new Date().toISOString(),
        createdBy: 'Yönetici',
      },
    ]
    saveCashMovementsSafe(movements)

    const report = getReportForBusinessDay(day, orders, settings.taxRate, [], movements)
    const closeContainer = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={[]}
        cashMovements={movements}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={vi.fn()}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )
    const reportsContainer = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={orders}
        businessDays={[day]}
        openBusinessDay={day}
        initialSelectedDayId={day.id}
        tables={[]}
        cashMovements={movements}
        settings={settings}
        currentSession={adminSession}
      />,
    )
    const a4Container = mount(
      <ZReportPrintView report={report} day={day} settings={settings} mode="a4" />,
    )
    const receiptContainer = mount(
      <ZReportPrintView report={report} day={day} settings={settings} mode="receipt" />,
    )

    // 500 + 240 + 100 - 150 = 690
    expect(getByTestId(closeContainer, 'close-day-expected-cash').textContent).toBe(
      formatCurrency(690),
    )
    expect(getByTestId(reportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(690),
    )
    expect(getByTestId(a4Container, 'zreport-a4-expected-cash').textContent).toBe(
      formatCurrency(690),
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-expected-cash').textContent).toBe(
      formatCurrency(690),
    )

    for (const c of [closeContainer, reportsContainer, a4Container, receiptContainer]) {
      expect(c.textContent).toContain('+ Kasa giriş')
      expect(c.textContent).toContain('− Kasa çıkış')
      expect(c.textContent).toContain(formatCurrency(100))
      expect(c.textContent).toContain(formatCurrency(150))
    }

    expect(getByTestId(reportsContainer, 'reports-cash-movements-card').textContent).toContain(
      'Süt faturası nakit',
    )
    expect(getByTestId(a4Container, 'zreport-a4-cash-movements').textContent).toContain(
      'Bozuk para eklendi',
    )
    expect(getByTestId(receiptContainer, 'zreport-receipt-cash-movements').textContent).toContain(
      'Süt faturası nakit',
    )

    // CSV çıktısını doğrula
    let capturedCsv = ''
    const OrigBlob = globalThis.Blob
    vi.stubGlobal(
      'Blob',
      class MockBlob extends OrigBlob {
        constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
          super(parts, opts)
          capturedCsv = (parts || []).map((p) => String(p)).join('')
        }
      },
    )
    if (typeof URL.createObjectURL !== 'function') {
      ;(URL as any).createObjectURL = () => 'blob:mock'
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    }
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    exportReportToCsv(report, 'Test Günü', day)
    expect(capturedCsv).toContain('+ Kasa giriş')
    expect(capturedCsv).toContain('− Kasa çıkış')
    expect(capturedCsv).toContain('KASA HAREKETLERİ')
    expect(capturedCsv).toContain('Süt faturası nakit')
  })

  it('Doğrulama 5: Günü kapatınca arşivlenen raporda kasa hareketleri korunur, kapalı güne ekleme engellenir ve eski kapalı günler etkilenmez', () => {
    const { day, orders, settings } = buildDayWith240CashSales(500)
    const movements: CashMovement[] = [
      {
        id: 'cm-close-1',
        businessDayId: day.id,
        type: 'CIKIS',
        amount: 150,
        category: 'Tedarikçi',
        description: 'Kapanış öncesi gider çıkışı',
        createdAt: new Date().toISOString(),
        createdBy: 'Yönetici',
      },
    ]
    saveCashMovementsSafe(movements)

    let closedDayResult: BusinessDay | null = null
    const closeContainer = mount(
      <CloseDayModal
        isOpen
        openDay={day}
        orders={orders}
        tables={[]}
        cashMovements={movements}
        settings={settings}
        onClose={vi.fn()}
        onCloseDay={(closed) => {
          closedDayResult = closed
        }}
        onGoToTables={vi.fn()}
        onViewReport={vi.fn()}
      />,
    )

    // Beklenen tutar butonuna tıkla (590) -> Kapatmayı Başlat -> Onayla
    act(() => {
      getByTestId(closeContainer, 'use-expected-cash-btn').click()
    })
    const submitBtn = Array.from(closeContainer.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Günü Kapat',
    ) as HTMLButtonElement
    act(() => {
      submitBtn.click()
    })
    const confirmBtn = Array.from(closeContainer.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Onayla ve Günü Kapat',
    ) as HTMLButtonElement
    act(() => {
      confirmBtn.click()
    })

    expect(closedDayResult).not.toBeNull()
    expect(closedDayResult!.status).toBe('closed')
    expect(closedDayResult!.expectedCash).toBe(590)
    expect(closedDayResult!.report?.cashOutTotal).toBe(150)
    expect(closedDayResult!.report?.cashInTotal).toBe(0)
    expect(closedDayResult!.report?.cashMovements).toHaveLength(1)

    // Kapanan günü arşivde ReportsModal üzerinden görüntüle
    const archivedReportsContainer = mount(
      <ReportsModal
        isOpen
        onClose={vi.fn()}
        completedOrders={orders}
        businessDays={[closedDayResult!]}
        initialSelectedDayId={closedDayResult!.id}
        tables={[]}
        cashMovements={movements}
        settings={settings}
        currentSession={adminSession}
      />,
    )
    expect(getByTestId(archivedReportsContainer, 'reports-expected-cash').textContent).toBe(
      formatCurrency(590),
    )
    expect(
      getByTestId(archivedReportsContainer, 'reports-cash-movements-card').textContent,
    ).toContain('Kapanış öncesi gider çıkışı')

    // Kapalı günde kasa hareketi modalı ekleme/iptali engeller
    const onAddSpy = vi.fn()
    const closedCashContainer = mount(
      <CashMovementModal
        isOpen
        onClose={vi.fn()}
        openBusinessDay={null}
        movements={movements}
        canManage
        onAddMovement={onAddSpy}
        onCancelMovement={vi.fn()}
      />,
    )
    expect(
      getByTestId(closedCashContainer, 'cash-movement-day-closed-banner').textContent,
    ).toContain('Gün kapalı')
    expect(
      (getByTestId(closedCashContainer, 'cash-movement-submit-btn') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(onAddSpy).not.toHaveBeenCalled()

    // Geçmişte kapanmış (kasa hareketi alanı olmayan) gün raporu sıfır/boş kalır ve etkilenmez
    const legacySnapshot = buildReportFromOrders([], 10, [], 'day-old-closed', [], {
      legacyOnly: true,
    })
    delete legacySnapshot.cashInTotal
    delete legacySnapshot.cashOutTotal
    delete legacySnapshot.cashMovements
    const legacyClosedDay = createMockBusinessDay({
      id: 'day-old-closed',
      status: 'closed',
      openingCash: 100,
      expectedCash: 100,
      countedCash: 100,
      cashDifference: 0,
      report: legacySnapshot,
    })
    const legacyCashSummary = hesaplaBeklenenNakit(
      legacyClosedDay,
      getReportForBusinessDay(legacyClosedDay, [], 10),
    )
    expect(legacyCashSummary.kirilim.kasaGiris).toBe(0)
    expect(legacyCashSummary.kirilim.kasaCikis).toBe(0)
    expect(legacyCashSummary.beklenen).toBe(100)
  })

  it('Doğrulama 6: Yetki kontrolü, unauthorized_attempt logu, Ayarlardan garson yetkisi açma ve aktivite logları', () => {
    const waiter = createMockUser({
      id: waiterSession.userId,
      username: 'garson1',
      fullName: 'Ahmet Garson',
      role: 'waiter',
    })
    const admin = createMockUser({
      id: adminSession.userId,
      username: 'admin',
      fullName: 'Yönetici',
      role: 'admin',
    })
    const settings = createMockSettings()

    // Varsayılan: sadece yönetici yapabilir, garson yapamaz
    expect(can(admin, 'cash_movement_manage', settings)).toBe(true)
    expect(can(waiter, 'cash_movement_manage', settings)).toBe(false)

    // Yetkisiz deneme modalı ve loglama
    const onUnauthorized = vi.fn(() => {
      logUnauthorizedAttempt(waiterSession, 'cash_movement_manage', 'day-1')
    })
    const modalUnauth = mount(
      <CashMovementModal
        isOpen
        onClose={vi.fn()}
        openBusinessDay={createMockBusinessDay({ id: 'day-1', status: 'open' })}
        movements={[]}
        canManage={false}
        onAddMovement={vi.fn()}
        onCancelMovement={vi.fn()}
        onUnauthorized={onUnauthorized}
      />,
    )
    expect(getByTestId(modalUnauth, 'cash-movement-unauthorized-banner').textContent).toContain(
      'yetkiniz bulunmuyor',
    )
    act(() => {
      getByTestId(modalUnauth, 'cash-movement-submit-btn').click()
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    const unauthLogs = getActivityLogsSafe().filter((l) => l.type === 'unauthorized_attempt')
    expect(unauthLogs.length).toBeGreaterThanOrEqual(1)

    // Ayarlar UI içinden "Garson kasaya para giriş/çıkış hareketi yapabilsin" açılınca yetki verilmiş olur
    let latestSettings = createMockSettings()
    const settingsContainer = mount(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={latestSettings}
        onUpdateSettings={(next) => {
          latestSettings = next
        }}
        onOpenProducts={vi.fn()}
        onOpenTableManager={vi.fn()}
        onOpenLogoSettings={vi.fn()}
        onResetData={vi.fn()}
        currentSession={adminSession}
      />,
    )
    // "İşletme & Kasa" sekmesine geç
    const storeTabBtn = Array.from(settingsContainer.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('İşletme'),
    ) as HTMLButtonElement
    act(() => {
      storeTabBtn.click()
    })
    const checkbox = getByTestId(
      settingsContainer,
      'settings-allow-waiter-cash-movement',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    act(() => {
      checkbox.click()
    })
    expect(latestSettings.allowWaiterCashMovement).toBe(true)
    expect(getPermissionTemplate().cash_movement_manage).toBe(true)
    expect(can(waiter, 'cash_movement_manage', latestSettings)).toBe(true)

    // Şablon kapatılınca tekrar engellenir
    savePermissionTemplate(
      { ...getPermissionTemplate(), cash_movement_manage: false },
      { id: admin.id, fullName: admin.fullName, role: admin.role },
    )
    expect(getSettingsSafe().allowWaiterCashMovement).toBe(false)
    expect(can(waiter, 'cash_movement_manage', getSettingsSafe())).toBe(false)

    // Ekleme ve iptal aktivite logu tipleri doğru kaydedilir
    logActivity({
      businessDayId: 'day-1',
      type: 'cash_movement_add',
      amount: 120,
      reason: 'Tedarikçi',
      userName: 'Yönetici',
      userRole: 'Yönetici',
      details: 'Test kasa çıkışı',
    })
    logActivity({
      businessDayId: 'day-1',
      type: 'cash_movement_cancel',
      amount: 120,
      reason: 'Yanlış kayıt',
      userName: 'Yönetici',
      userRole: 'Yönetici',
      details: 'Test iptal',
    })
    const logTypes = getActivityLogsSafe().map((l) => l.type)
    expect(logTypes).toContain('cash_movement_add')
    expect(logTypes).toContain('cash_movement_cancel')
  })

  it('Doğrulama 7: Boş veya 3 karakterden kısa açıklama ve geçersiz tutar engellenir; iptal gerekçesi zorunludur', () => {
    const openDay = createMockBusinessDay({ id: 'day-val', status: 'open', openingCash: 500 })
    const existingMov: CashMovement = {
      id: 'cm-existing-1',
      businessDayId: openDay.id,
      type: 'CIKIS',
      amount: 75,
      category: 'Tedarikçi',
      description: 'Buz alımı',
      createdAt: new Date().toISOString(),
      createdBy: 'Yönetici',
    }
    const onAdd = vi.fn()
    const onCancel = vi.fn()

    const container = mount(
      <CashMovementModal
        isOpen
        onClose={vi.fn()}
        openBusinessDay={openDay}
        movements={[existingMov]}
        canManage
        onAddMovement={onAdd}
        onCancelMovement={onCancel}
      />,
    )

    const amountInput = getByTestId(container, 'cash-movement-amount-input') as HTMLInputElement
    const descInput = getByTestId(container, 'cash-movement-description-input') as HTMLInputElement
    const submitBtn = getByTestId(container, 'cash-movement-submit-btn') as HTMLButtonElement

    // Tutar 0 veya negatif -> engellenir
    setInputValue(amountInput, '0')
    setInputValue(descInput, 'Geçerli açıklama')
    act(() => {
      submitBtn.click()
    })
    expect(onAdd).not.toHaveBeenCalled()
    expect(getByTestId(container, 'cash-movement-form-error').textContent).toContain('sıfırdan büyük')

    // Açıklama boş -> engellenir
    setInputValue(amountInput, '150')
    setInputValue(descInput, '  ')
    act(() => {
      submitBtn.click()
    })
    expect(onAdd).not.toHaveBeenCalled()
    expect(getByTestId(container, 'cash-movement-form-error').textContent).toContain('en az 3 karakter')

    // Açıklama 2 karakter ("ab") -> engellenir
    setInputValue(descInput, 'ab')
    act(() => {
      submitBtn.click()
    })
    expect(onAdd).not.toHaveBeenCalled()
    expect(getByTestId(container, 'cash-movement-form-error').textContent).toContain('en az 3 karakter')

    // Geçerli açıklama (3+ karakter) -> kaydedilir
    setInputValue(descInput, 'Süt')
    act(() => {
      submitBtn.click()
    })
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({
      type: 'CIKIS',
      amount: 150,
      category: 'Tedarikçi',
      description: 'Süt',
    })

    // İptal işleminde kısa gerekçe engellenir, geçerli gerekçe onaylanır
    act(() => {
      getByTestId(container, 'cash-movement-cancel-btn-cm-existing-1').click()
    })
    const reasonInput = getByTestId(
      container,
      'cash-movement-cancel-reason-cm-existing-1',
    ) as HTMLInputElement
    setInputValue(reasonInput, 'ab')
    act(() => {
      getByTestId(container, 'cash-movement-cancel-confirm-cm-existing-1').click()
    })
    expect(onCancel).not.toHaveBeenCalled()

    setInputValue(reasonInput, 'Yanlış tutar girildi')
    act(() => {
      getByTestId(container, 'cash-movement-cancel-confirm-cm-existing-1').click()
    })
    expect(onCancel).toHaveBeenCalledWith('cm-existing-1', 'Yanlış tutar girildi')
  })

  it('Doğrulama 8: cashMovements alanı olmayan eski yedek dosyası hatasız geri yüklenir; yeni yedek cashMovements taşır', () => {
    // Eski formatlı yedek (cashMovements alanı hiç yok)
    const legacyPayload = {
      tables: [createMockTable({ id: 't-legacy-1', name: 'Masa 1' })],
      completedOrders: [],
      businessDays: [],
      menuProducts: [createMockProduct({ id: 'p-legacy-1' })],
      appSettings: createMockSettings(),
      refunds: [],
      activityLogs: [],
      appUsers: [],
    }
    const legacyBackupFile = {
      formatVersion: 1,
      schemaVersion: 1,
      appVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      checksum: computeChecksum(JSON.stringify(legacyPayload)),
      data: legacyPayload,
    }

    // Mevcutta kasa hareketi varken eski yedeği yükleyince hatasız temiz [] olmalı
    saveCashMovementsSafe([
      {
        id: 'cm-old-1',
        businessDayId: 'day-x',
        type: 'CIKIS',
        amount: 50,
        category: 'Diğer',
        description: 'Eski kayıt',
        createdAt: new Date().toISOString(),
        createdBy: 'Yönetici',
      },
    ])

    const validatedLegacy = validateBackupFileStructure(legacyBackupFile)
    expect(validatedLegacy.valid).toBe(true)

    const restoreRes = restoreFromBackup(legacyBackupFile as any, { skipPreRestoreBackup: true })
    expect(restoreRes.success).toBe(true)
    expect(getCashMovementsSafe()).toEqual([])

    // Yeni yedek alma & geri yükleme cashMovements'ı eksiksiz korur
    const mov: CashMovement = {
      id: 'cm-backup-1',
      businessDayId: 'day-b',
      type: 'GIRIS',
      amount: 125.5,
      category: 'Bozuk Para',
      description: 'Yedek testi girişi',
      createdAt: new Date().toISOString(),
      createdBy: 'Yönetici',
    }
    saveCashMovementsSafe([mov])
    const fullBackup = createFullBackupFile('Kasa hareketli tam yedek')
    expect(fullBackup.data.cashMovements).toHaveLength(1)

    saveCashMovementsSafe([])
    expect(getCashMovementsSafe()).toEqual([])

    const restoreNewRes = restoreFromBackup(fullBackup, { skipPreRestoreBackup: true })
    expect(restoreNewRes.success).toBe(true)
    expect(getCashMovementsSafe()).toHaveLength(1)
    expect(getCashMovementsSafe()[0].amount).toBe(125.5)
  })

  it('Doğrulama 9: localStorage yenileme + gerçek SQLite diske yazma/açma/migrasyon sonrası kayıtlar kalıcıdır', async () => {
    const mov1: CashMovement = {
      id: 'cm-persist-1',
      businessDayId: 'day-p1',
      type: 'CIKIS',
      amount: 149.95,
      category: 'Fatura / Gider',
      description: 'Elektrik fatura ödemesi',
      createdAt: '2026-11-15T09:30:00.000Z',
      createdBy: 'Yönetici',
      userId: 'user-admin',
    }
    const mov2: CashMovement = {
      id: 'cm-persist-2',
      businessDayId: 'day-p1',
      type: 'GIRIS',
      amount: 200.5,
      category: 'Kasa Takviyesi',
      description: 'Sabah bozuk para takviyesi',
      createdAt: '2026-11-15T10:00:00.000Z',
      createdBy: 'Yönetici',
      cancelled: true,
      cancelledAt: '2026-11-15T10:15:00.000Z',
      cancelledBy: 'Yönetici',
      cancelledReason: 'Yanlış giriş',
    }

    // 1) localStorage persistence (cache clear simülasyonu)
    saveCashMovementsSafe([mov1, mov2])
    clearInMemoryCache()
    const reloadedFromLs = getCashMovementsSafe()
    expect(reloadedFromLs).toHaveLength(2)
    expect(reloadedFromLs.find((m) => m.id === 'cm-persist-1')?.amount).toBe(149.95)
    expect(reloadedFromLs.find((m) => m.id === 'cm-persist-2')?.cancelledReason).toBe(
      'Yanlış giriş',
    )

    // 2) Gerçek SQLite disk DB üzerinde migration + restart roundtrip
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemoon-cm-sqlite-'))
    const dbPath = path.join(tmpDir, 'cash-movements.sqlite')
    let ctx = openDatabase({ dbPath, primaryBackupDir: tmpDir })
    try {
      saveSettingsSafe(createMockSettings())
      saveBusinessDaysSafe([createMockBusinessDay({ id: 'day-p1', status: 'open' })])
      saveCompletedOrdersSafe([])

      setCustomSqliteDispatcher((action, payload) => {
        if (action === 'migrateLocalStorageToSqlite' && typeof setCustomMigrationPayload === 'function') {
          setCustomMigrationPayload(payload)
        }
        return executeDbAction(ctx, action, payload)
      })

      const migRes = await migrateLocalStorageToSqliteIfNeeded()
      expect(migRes.success).toBe(true)

      const viaSqlite = getCashMovementsSafe()
      expect(viaSqlite).toHaveLength(2)

      // Veritabanını kapat ve sıfırdan yeniden aç
      closeDatabase(ctx)
      clearInMemoryCache()
      ctx = openDatabase({ dbPath, primaryBackupDir: tmpDir })
      setCustomSqliteDispatcher((action, payload) => executeDbAction(ctx, action, payload))

      const afterRestart = getCashMovementsSafe()
      expect(afterRestart).toHaveLength(2)
      const p1 = afterRestart.find((m) => m.id === 'cm-persist-1')
      const p2 = afterRestart.find((m) => m.id === 'cm-persist-2')
      expect(p1?.amount).toBe(149.95)
      expect(p1?.description).toBe('Elektrik fatura ödemesi')
      expect(p2?.cancelled).toBe(true)
      expect(p2?.cancelledReason).toBe('Yanlış giriş')
    } finally {
      setCustomSqliteDispatcher(null)
      closeDatabase(ctx)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('UI giriş noktaları (Ana Sayfa & Masalar) ve modal içi ekleme/listeleme/iptal akışı uçtan uca çalışır', () => {
    const openDay = createMockBusinessDay({ id: 'day-ui', status: 'open', openingCash: 500 })
    const onOpenCashMock = vi.fn()

    const homeContainer = mount(
      <HomePage
        completedOrders={[]}
        tables={[]}
        openBusinessDay={openDay}
        onViewChange={vi.fn()}
        onOpenSummary={vi.fn()}
        onOpenProducts={vi.fn()}
        onOpenCashMovements={onOpenCashMock}
        settings={createMockSettings()}
        currentSession={adminSession}
      />,
    )
    const homeQuickBtn = Array.from(homeContainer.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Kasa Hareketleri'),
    ) as HTMLButtonElement
    expect(homeQuickBtn).toBeTruthy()
    act(() => {
      homeQuickBtn.click()
    })
    expect(onOpenCashMock).toHaveBeenCalledTimes(1)

    const tablesContainer = mount(
      <TableLayout
        tables={[]}
        onSelectTable={vi.fn()}
        onOpenTableManager={vi.fn()}
        onOpenCashMovements={onOpenCashMock}
        canManageCashMovements
      />,
    )
    act(() => {
      getByTestId(tablesContainer, 'tables-cash-movement-btn').click()
    })
    expect(onOpenCashMock).toHaveBeenCalledTimes(2)

    // Stateful modal harness: ekle -> listede gör -> iptal et -> iptal rozeti & net güncelleme gör
    function StatefulHarness() {
      const [list, setList] = React.useState<CashMovement[]>([])
      return (
        <CashMovementModal
          isOpen
          onClose={vi.fn()}
          openBusinessDay={openDay}
          movements={list}
          canManage
          onAddMovement={(vals) => {
            setList((prev) => [
              {
                id: `cm-ui-${prev.length + 1}`,
                businessDayId: openDay.id,
                type: vals.type,
                amount: vals.amount,
                category: vals.category,
                description: vals.description,
                createdAt: new Date().toISOString(),
                createdBy: 'Yönetici',
              },
              ...prev,
            ])
            return { ok: true }
          }}
          onCancelMovement={(id, reason) => {
            setList((prev) =>
              prev.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      cancelled: true,
                      cancelledReason: reason,
                      cancelledBy: 'Yönetici',
                      cancelledAt: new Date().toISOString(),
                    }
                  : m,
              ),
            )
            return { ok: true }
          }}
        />
      )
    }

    const modalRoot = mount(<StatefulHarness />)
    setInputValue(getByTestId(modalRoot, 'cash-movement-amount-input') as HTMLInputElement, '150')
    setInputValue(
      getByTestId(modalRoot, 'cash-movement-description-input') as HTMLInputElement,
      'Kahve çekirdeği ödemesi',
    )
    act(() => {
      getByTestId(modalRoot, 'cash-movement-submit-btn').click()
    })

    expect(getByTestId(modalRoot, 'cash-movement-total-out').textContent).toBe(formatCurrency(150))
    expect(getByTestId(modalRoot, 'cash-movement-list').textContent).toContain(
      'Kahve çekirdeği ödemesi',
    )

    // İptal et -> kayıt listede kalır, toplam sıfırlanır
    act(() => {
      getByTestId(modalRoot, 'cash-movement-cancel-btn-cm-ui-1').click()
    })
    setInputValue(
      getByTestId(modalRoot, 'cash-movement-cancel-reason-cm-ui-1') as HTMLInputElement,
      'Çift kayıt düzeltmesi',
    )
    act(() => {
      getByTestId(modalRoot, 'cash-movement-cancel-confirm-cm-ui-1').click()
    })

    expect(getByTestId(modalRoot, 'cash-movement-total-out').textContent).toBe(formatCurrency(0))
    const listText = getByTestId(modalRoot, 'cash-movement-list').textContent || ''
    expect(listText).toContain('İptal Edildi')
    expect(listText).toContain('Çift kayıt düzeltmesi')
  })
})
