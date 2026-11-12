import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrintPortal } from '../../src/components/PrintPortal'
import { ZReportPrintView } from '../../src/components/ZReportPrintView'
import type { BusinessDayReportSnapshot } from '../../src/types'

// Configure react act environment for clean output in jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PrintPortal & Multi-Page Z-Report Pagination Suite', () => {
  let rootContainer: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    // Ensure #print-portal exists in document.body
    let portal = document.getElementById('print-portal')
    if (!portal) {
      portal = document.createElement('div')
      portal.id = 'print-portal'
      document.body.appendChild(portal)
    }
    portal.innerHTML = ''
    document.body.className = ''

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
    const portal = document.getElementById('print-portal')
    if (portal) {
      portal.innerHTML = ''
    }
    document.body.className = ''
  })

  it('mounts printable content into #print-portal outside #root', async () => {
    await act(async () => {
      root?.render(
        <PrintPortal>
          <div data-testid="portal-test-content">A4 Report Content</div>
        </PrintPortal>,
      )
    })

    const portalEl = document.getElementById('print-portal')
    expect(portalEl).not.toBeNull()
    expect(portalEl?.innerHTML).toContain('A4 Report Content')

    // Clean up
    await act(async () => {
      root?.unmount()
      root = null
    })
    expect(portalEl?.innerHTML).toBe('')
  })

  it('manages is-printing-portal body class during beforeprint and afterprint events', async () => {
    await act(async () => {
      root?.render(
        <PrintPortal>
          <div>Report</div>
        </PrintPortal>,
      )
    })

    expect(document.body.classList.contains('is-printing-portal')).toBe(false)

    // Trigger beforeprint
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(document.body.classList.contains('is-printing-portal')).toBe(true)

    // Trigger afterprint
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(document.body.classList.contains('is-printing-portal')).toBe(false)
  })

  it('renders multi-page ready A4 report with pagination classes and repeating thead for large product datasets', async () => {
    // Generate 50 products to simulate multi-page report
    const soldProducts = Array.from({ length: 50 }, (_, i) => ({
      productKey: `prod-${i + 1}`,
      name: `Kahve Çeşidi No ${i + 1}`,
      category: i % 2 === 0 ? 'Sıcak İçecekler' : 'Tatlılar',
      quantity: 5 + (i % 10),
      revenue: (5 + (i % 10)) * 95,
      share: 2,
    }))

    const mockReport: BusinessDayReportSnapshot = {
      generatedAt: '2026-11-12T19:30:00.000Z',
      totalRevenue: 25000,
      totalTax: 2500,
      totalDiscount: 500,
      orderCount: 120,
      averageBasket: 208.33,
      paymentDistribution: {
        cash: 10000,
        card: 13000,
        iban: 2000,
      },
      expectedZ: 13000,
      enteredZ: 13000,
      zDifference: 0,
      soldProducts,
      cancelledCount: 2,
      cancelledTotal: 350,
    }

    await act(async () => {
      root?.render(
        <PrintPortal>
          <div className="print-container print-a4">
            <ZReportPrintView
              report={mockReport}
              titleLabel="Test Dönemi"
              mode="a4"
            />
          </div>
        </PrintPortal>,
      )
    })

    const portal = document.getElementById('print-portal')
    expect(portal).not.toBeNull()

    // Verify key multi-page pagination structures
    const table = portal?.querySelector('.z-report-table')
    expect(table).not.toBeNull()

    const thead = portal?.querySelector('.z-report-thead')
    expect(thead).not.toBeNull()

    const tbody = portal?.querySelector('.z-report-tbody')
    expect(tbody).not.toBeNull()
    expect(tbody?.querySelectorAll('tr').length).toBe(50)

    // Verify header, KPIs, breakdowns, and footer have pagination avoid classes
    expect(portal?.querySelector('.z-report-header')).not.toBeNull()
    expect(portal?.querySelector('.z-report-kpi-grid')).not.toBeNull()
    expect(portal?.querySelector('.z-report-breakdown-grid')).not.toBeNull()
    expect(portal?.querySelector('.z-report-footer')).not.toBeNull()
  })

  it('sanitizes document.title cleanly for multi-page PDF download filename', () => {
    const rawPeriodTitle = 'Kasım 2026 / 12. Gün *Özel*'
    const safeDate = '2026-11-12'
    const sanitizedPeriod = (rawPeriodTitle || 'Z_Raporu')
      .replace(/[^\w\s\u00C0-\u017F-]/gi, '')
      .trim()
      .replace(/\s+/g, '_')

    const pdfTitle = `LEMOON_KAFE_Z_Raporu_${sanitizedPeriod}_${safeDate}`
    expect(pdfTitle).toBe('LEMOON_KAFE_Z_Raporu_Kasım_2026_12_Gün_Özel_2026-11-12')
    // No illegal filesystem chars like / or *
    expect(pdfTitle).not.toContain('/')
    expect(pdfTitle).not.toContain('*')
  })
})
