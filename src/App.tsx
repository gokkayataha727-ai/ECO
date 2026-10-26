import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { AdisyonModal } from './components/AdisyonModal'
import { ReportsModal } from './components/ReportsModal'
import { KeyboardHelpModal } from './components/KeyboardHelpModal'
import { PaymentModal } from './components/PaymentModal'
import { ProductExplorer } from './components/ProductExplorer'
import { TopBar } from './components/TopBar'
import { LogoSettingsModal } from './components/LogoSettingsModal'
import { SettingsModal } from './components/SettingsModal'
import { SplashScreen } from './components/SplashScreen'
import { products as initialProducts } from './data/products'
import {
  calculateTotals,
  isTableOccupied,
  mergeTablesOrder,
  moveTableOrder,
  splitTableOrder,
  type SplitItemSelection,
} from './lib/format'
import { getProducts, saveProduct as apiSaveProduct, deleteProductApi, updateCustomerDisplay, isElectronEnvironment } from './lib/api'
import type { CartItem, PaymentMethod, PartialPayment, Product, Table, CompletedOrder, SelectedOption, AppSettings, BusinessDay } from './types'
import { ProductManager } from './components/ProductManager'
import { ProductOptionModal } from './components/ProductOptionModal'
import { ProductDetailModal } from './components/ProductDetailModal'
import { TableManager } from './components/TableManager'
import { initialTables } from './data/tables'
import { TableLayout } from './components/TableLayout'
import { HomePage } from './components/HomePage'
import { TableOrderView } from './components/TableOrderView'
import { OpenDayModal, type OpenDayParams } from './components/OpenDayModal'
import { CloseDayModal } from './components/CloseDayModal'
import { calculateDayCardBreakdown } from './lib/businessDay'
import { generateUUID } from './lib/uuid'
import { Sun, X } from 'lucide-react'

const ORDER_NUMBER = 'EC-1042'

const defaultSettings: AppSettings = {
  theme: 'light',
  storeName: 'LEMOON KAFE',
  storeSub: 'Kahvenin iyi hali',
  location: 'LEMOON KAFE · SIMAV',
  cashierName: 'LEMOON',
  receiptFooter: 'Bizi tercih ettiğiniz için teşekkür ederiz! Yine bekleriz.',
  autoPrintReceipt: false,
  currencySymbol: '₺',
  taxRate: 10,
  bankName: 'Banka Adı',
  accountHolder: 'Hesap Sahibi',
  iban: 'TR00 0000 0000 0000 0000 0000 00',
  posZCutoffTime: '23:57',
}

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [view, setView] = useState<'home' | 'tables' | 'pos'>('home')

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings') || localStorage.getItem('demoAppSettings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.storeName === 'ECO COFFEE' || parsed.storeName === 'Eco Coffee') {
          parsed.storeName = 'LEMOON KAFE'
        }
        if (parsed.location && /Eco Coffee/i.test(parsed.location)) {
          parsed.location = parsed.location.replace(/Eco Coffee/gi, 'LEMOON KAFE')
        }
        if (parsed.location && /Nurda/i.test(parsed.location)) {
          parsed.location = parsed.location.replace(/Nurda[ğg][ıi]/gi, 'SIMAV')
        }
        if (parsed.cashierName === 'ECO' || !parsed.cashierName) {
          parsed.cashierName = 'LEMOON'
        }
        return { ...defaultSettings, ...parsed }
      } catch (e) {
        console.error("Failed to parse appSettings", e)
      }
    }
    return defaultSettings
  })

  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(settings))
    document.documentElement.classList.remove('dark', 'warm')
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (settings.theme === 'warm') {
      document.documentElement.classList.add('warm')
    }
  }, [settings])

  const [tables, setTables] = useState<Table[]>(() => {
    const saved = localStorage.getItem('tables') || localStorage.getItem('demoTables')
    return saved ? JSON.parse(saved) : initialTables
  })
  
  useEffect(() => {
    localStorage.setItem('tables', JSON.stringify(tables))
  }, [tables])
  const [activeTableId, setActiveTableId] = useState<string | null>(null)

  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>(() => {
    const saved = localStorage.getItem('completedOrders')
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    localStorage.setItem('completedOrders', JSON.stringify(completedOrders))
  }, [completedOrders])

  const [businessDays, setBusinessDays] = useState<BusinessDay[]>(() => {
    const saved = localStorage.getItem('businessDays')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      } catch (e) {
        console.error('Failed to parse businessDays', e)
      }
    }
    return []
  })

  useEffect(() => {
    localStorage.setItem('businessDays', JSON.stringify(businessDays))
  }, [businessDays])

  const openBusinessDay = useMemo(
    () => businessDays.find((d) => d.status === 'open') || null,
    [businessDays],
  )
  
  const [directCart, setDirectCart] = useState<CartItem[]>([])
  const [directDiscountRate, setDirectDiscountRate] = useState(0)
  const [directNote, setDirectNote] = useState('')
  const [directPayments, setDirectPayments] = useState<PartialPayment[]>([])

  // Kasa search state (read-only catalog)
  const [kasaSearch, setKasaSearch] = useState('')
  const [kasaCategory, setKasaCategory] = useState('Tümü')
  const kasaSearchRef = useRef<HTMLInputElement>(null)

  const MENU_CATALOG_VERSION = '2026_10_23_new_menu_v1'

  const [menuProducts, setMenuProducts] = useState<Product[]>(() => {
    const currentVersion = localStorage.getItem('menuCatalogVersion')
    if (currentVersion !== MENU_CATALOG_VERSION) {
      localStorage.removeItem('menuProducts')
      localStorage.removeItem('demoMenuProducts')
      localStorage.setItem('menuCatalogVersion', MENU_CATALOG_VERSION)
      return initialProducts
    }
    const saved = localStorage.getItem('menuProducts') || localStorage.getItem('demoMenuProducts')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      } catch (e) {
        console.error("Failed to parse menuProducts", e)
      }
    }
    return initialProducts
  })

  useEffect(() => {
    localStorage.setItem('menuProducts', JSON.stringify(menuProducts))
  }, [menuProducts])

  useEffect(() => {
    getProducts()
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMenuProducts(data)
        }
      })
      .catch(err => console.error("Error fetching products:", err))
  }, [])

  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isProductsOpen, setIsProductsOpen] = useState(false)
  const [isAdisyonOpen, setIsAdisyonOpen] = useState(false)
  const [isTableManagerOpen, setIsTableManagerOpen] = useState(false)
  const [isLogoSettingsOpen, setIsLogoSettingsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isOpenDayModalOpen, setIsOpenDayModalOpen] = useState(false)
  const [isCloseDayModalOpen, setIsCloseDayModalOpen] = useState(false)
  const [dayBlockedPromptOpen, setDayBlockedPromptOpen] = useState(false)
  const [reportSelectedDayId, setReportSelectedDayId] = useState<string | null>(null)
  const [optionModalProduct, setOptionModalProduct] = useState<Product | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [paidMethod, setPaidMethod] = useState<PaymentMethod | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { previousDayCarryOut, hasPreviousClosedDay, previousDayNeverClosed } = useMemo(() => {
    if (businessDays.length === 0) {
      return { previousDayCarryOut: 0, hasPreviousClosedDay: false, previousDayNeverClosed: false }
    }
    const sorted = [...businessDays].sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    const lastDay = sorted[0]
    if (lastDay.status === 'closed') {
      let carryOut = lastDay.cardCarryOut
      if (typeof carryOut !== 'number') {
        const breakdown = calculateDayCardBreakdown(
          lastDay,
          completedOrders,
          undefined,
          settings.posZCutoffTime || '23:57',
        )
        carryOut = breakdown.cardCarryOut
      }
      return {
        previousDayCarryOut: carryOut,
        hasPreviousClosedDay: true,
        previousDayNeverClosed: false,
      }
    } else {
      return {
        previousDayCarryOut: 0,
        hasPreviousClosedDay: false,
        previousDayNeverClosed: true,
      }
    }
  }, [businessDays, completedOrders, settings.posZCutoffTime])

  const handleOpenDay = useCallback(
    (params: OpenDayParams) => {
      setBusinessDays((prev) => {
        if (prev.some((d) => d.status === 'open')) return prev
        const newDay: BusinessDay = {
          id: generateUUID(),
          status: 'open',
          openedAt: new Date().toISOString(),
          openedBy: settings.cashierName || 'LEMOON',
          openingCash: params.openingCash,
          cardCarryIn: params.cardCarryIn,
          cardCarryInAuto: params.cardCarryInAuto,
          cardCarryInOverridden: params.cardCarryInOverridden,
          posZCutoffTime: settings.posZCutoffTime || '23:57',
          note: params.note,
        }
        return [newDay, ...prev]
      })
      setDayBlockedPromptOpen(false)
    },
    [settings.cashierName, settings.posZCutoffTime],
  )

  const handleCloseDay = useCallback((closedDay: BusinessDay) => {
    setBusinessDays((prev) =>
      prev.map((d) => (d.id === closedDay.id && d.status === 'open' ? closedDay : d)),
    )
  }, [])

  const handleEditProduct = useCallback((product: Product) => {
    setEditProductId(product.id)
    setIsProductsOpen(true)
  }, [])

  const handleViewDetail = useCallback((product: Product) => {
    setDetailProduct(product)
  }, [])

  const handleDeleteProduct = useCallback((id: string) => {
    setMenuProducts((current) => current.filter((item) => item.id !== id))
    setTables((current) => current.map(t => ({ ...t, cart: t.cart.filter(item => item.id !== id) })))
    setDirectCart((current) => current.filter((item) => item.id !== id))
    deleteProductApi(id)
      .catch(err => console.warn("Backend delete skipped or failed:", err))
  }, [])

  const handleResetData = useCallback(() => {
    localStorage.removeItem('tables')
    localStorage.removeItem('completedOrders')
    localStorage.removeItem('businessDays')
    localStorage.removeItem('menuProducts')
    localStorage.removeItem('appSettings')
    localStorage.removeItem('demoTables')
    localStorage.removeItem('demoCompletedOrders')
    localStorage.removeItem('demoMenuProducts')
    localStorage.removeItem('demoAppSettings')
    window.location.reload()
  }, [])


  const activeTable = useMemo(() => tables.find(t => t.id === activeTableId), [tables, activeTableId])
  const cart = activeTable ? activeTable.cart : directCart
  const discountRate = activeTable ? (activeTable.discountRate || 0) : directDiscountRate
  const note = activeTable ? (activeTable.note || '') : directNote
  const customerName = activeTable ? (activeTable.customerName || '') : ''
  const payments = activeTable ? (activeTable.payments || []) : directPayments
  const orderNumber = activeTable ? activeTable.name : ORDER_NUMBER

  const totals = useMemo(() => calculateTotals(cart, discountRate), [cart, discountRate])

  // Sync cart with customer display window (Electron only)
  useEffect(() => {
    if (isElectronEnvironment()) {
      const displayData = {
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          selectedOptions: item.selectedOptions?.map(o => ({
            optionName: o.optionName,
            priceDelta: o.priceDelta,
          })),
        })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        storeName: settings.storeName,
        storeSub: settings.storeSub,
      }
      updateCustomerDisplay(JSON.stringify(displayData)).catch(() => {})
    }
  }, [cart, totals, settings.storeName, settings.storeSub])

  const updateActiveCart = useCallback((updater: (current: CartItem[]) => CartItem[]) => {
    if (activeTableId) {
      setTables((current) =>
        current.map((t) =>
          t.id === activeTableId
            ? { ...t, cart: updater(t.cart), status: updater(t.cart).length > 0 ? 'occupied' : 'empty' }
            : t
        )
      )
    } else {
      setDirectCart(updater)
    }
  }, [activeTableId])

  const setDiscountRate = useCallback((rate: number) => {
    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, discountRate: rate } : t))
    } else {
      setDirectDiscountRate(rate)
    }
  }, [activeTableId])

  const setNote = useCallback((n: string) => {
    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, note: n } : t))
    } else {
      setDirectNote(n)
    }
  }, [activeTableId])

  const setCustomerName = useCallback((name: string) => {
    if (activeTableId) {
      setTables((current) => current.map((t) => t.id === activeTableId ? { ...t, customerName: name } : t))
    }
  }, [activeTableId])

  const addProduct = useCallback((productId: string) => {
    if (!openBusinessDay) {
      setDayBlockedPromptOpen(true)
      return
    }
    const product = menuProducts.find((item) => item.id === productId)
    if (!product) return

    if (product.optionGroups && product.optionGroups.length > 0) {
      setOptionModalProduct(product)
      return
    }

    updateActiveCart((current) => {
      const cartItemId = productId
      const existing = current.find((item) => item.cartItemId === cartItemId)
      if (existing) {
        return current.map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [...current, { ...product, cartItemId, quantity: 1 }]
    })
    setLastAddedId(productId)
  }, [menuProducts, updateActiveCart, openBusinessDay])

  const handleConfirmOption = useCallback((productId: string, quantity: number, selectedOptions: SelectedOption[]) => {
    if (!openBusinessDay) {
      setOptionModalProduct(null)
      setDayBlockedPromptOpen(true)
      return
    }
    const product = menuProducts.find((item) => item.id === productId)
    if (!product) return
    
    updateActiveCart((current) => {
      const optionStr = selectedOptions.map(o => o.optionId).sort().join('-')
      const cartItemId = `${productId}-${optionStr}`
      
      const existing = current.find((item) => item.cartItemId === cartItemId)
      if (existing) {
        return current.map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + quantity } : item,
        )
      }
      return [...current, { ...product, cartItemId, quantity, selectedOptions }]
    })
    setLastAddedId(`${productId}-${selectedOptions.map(o => o.optionId).sort().join('-')}`)
    setOptionModalProduct(null)
  }, [menuProducts, updateActiveCart, openBusinessDay])

  const updateQuantity = useCallback((cartItemId: string, change: number) => {
    if (change > 0 && !openBusinessDay) {
      setDayBlockedPromptOpen(true)
      return
    }
    updateActiveCart((current) =>
      current
        .map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + change } : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }, [updateActiveCart, openBusinessDay])

  const removeItem = useCallback((cartItemId: string) => {
    updateActiveCart((current) => current.filter((item) => item.cartItemId !== cartItemId))
  }, [updateActiveCart])

  const applyItemDiscount = useCallback((cartItemId: string, discount?: { type: 'percentage' | 'amount'; value: number }) => {
    updateActiveCart((current) =>
      current.map((item) =>
        item.cartItemId === cartItemId ? { ...item, itemDiscount: discount } : item
      )
    )
  }, [updateActiveCart])

  const clearCart = useCallback(() => {
    updateActiveCart(() => [])
    setDiscountRate(0)
    setNote('')
    setCustomerName('')
    if (activeTableId) {
      setTables((current) =>
        current.map((t) =>
          t.id === activeTableId
            ? { ...t, payments: [], status: 'empty' }
            : t
        )
      )
    } else {
      setDirectPayments([])
    }
    setLastAddedId(null)
    setConfirmClear(false)
  }, [updateActiveCart, setDiscountRate, setNote, setCustomerName, activeTableId])

  const handleOpenProducts = useCallback(() => setIsProductsOpen(true), [])
  const handleCompleteOrder = useCallback(() => {
    setActiveTableId(null)
  }, [])
  const handleOpenPayment = useCallback(() => {
    if (!openBusinessDay) {
      setDayBlockedPromptOpen(true)
      return
    }
    setIsPaymentOpen(true)
  }, [openBusinessDay])
  const handleOpenAdisyon = useCallback(() => setIsAdisyonOpen(true), [])
  const handleBackToTables = useCallback(() => {
    setActiveTableId(null)
  }, [])

  const handleViewChange = useCallback((nextView: 'home' | 'tables' | 'pos') => {
    setView((current) => {
      if (current !== nextView) {
        window.history.pushState({ view: nextView }, '')
      }
      return nextView
    })
    if (nextView === 'tables' || nextView === 'home') {
      setActiveTableId(null)
    }
  }, [])

  useEffect(() => {
    if (!window.history.state || !window.history.state.view) {
      window.history.replaceState({ view: 'home' }, '')
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextView = (event.state?.view as 'home' | 'tables' | 'pos') || 'home'
      setView(nextView)
      if (nextView === 'tables' || nextView === 'home') {
        setActiveTableId(null)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleCloseTable = useCallback((tableId: string) => {
    setTables((current) =>
      current.map((t) =>
        t.id === tableId
          ? { ...t, cart: [], discountRate: 0, note: '', customerName: '', payments: [], status: 'empty' }
          : t
      )
    )
  }, [])

  const handleCancelOrderForTable = useCallback((tableId: string) => {
    const targetTable = tables.find((t) => t.id === tableId)
    if (targetTable && targetTable.cart.length > 0) {
      const tableTotals = calculateTotals(targetTable.cart, targetTable.discountRate || 0)
      const cancelledOrder: CompletedOrder = {
        id: generateUUID(),
        orderNumber: targetTable.name,
        tableId: targetTable.id,
        tableName: targetTable.name,
        items: [...targetTable.cart],
        totals: { ...tableTotals },
        discountRate: targetTable.discountRate || 0,
        taxRate: settings.taxRate,
        paymentMethod: 'cash',
        date: new Date().toISOString(),
        cancelled: true,
        cancelledAt: new Date().toISOString(),
        businessDayId: openBusinessDay?.id,
        note: targetTable.note || undefined,
        customerName: targetTable.customerName || undefined,
        cashier: settings.cashierName || 'Kasiyer',
      }
      setCompletedOrders((prev) => [cancelledOrder, ...prev])
    }
    setTables((current) =>
      current.map((t) =>
        t.id === tableId
          ? { ...t, cart: [], discountRate: 0, note: '', customerName: '', payments: [], status: 'empty' }
          : t
      )
    )
  }, [tables, settings.taxRate, settings.cashierName, openBusinessDay?.id])

  const handleCompleteOrderForTable = useCallback((tableId: string) => {
    if (!openBusinessDay) {
      setDayBlockedPromptOpen(true)
      return
    }
    setActiveTableId(tableId)
    setIsPaymentOpen(true)
  }, [openBusinessDay])

  const handleViewAdisyonForTable = useCallback((tableId: string) => {
    setActiveTableId(tableId)
    setIsAdisyonOpen(true)
  }, [])

  const handleMoveTable = useCallback((sourceTableId: string, targetTableId: string) => {
    setTables((current) => moveTableOrder(current, sourceTableId, targetTableId))
    setActiveTableId((currentActive) => (currentActive === sourceTableId ? targetTableId : currentActive))
  }, [])

  const handleMergeTables = useCallback((mainTableId: string, sourceTableId: string) => {
    setTables((current) => mergeTablesOrder(current, mainTableId, sourceTableId))
    setActiveTableId((currentActive) => (currentActive === sourceTableId ? mainTableId : currentActive))
  }, [])

  const handleSplitTable = useCallback(
    (
      sourceTableId: string,
      targetTableId: string,
      splitItems: SplitItemSelection[],
    ) => {
      setTables((current) => {
        const updated = splitTableOrder(current, sourceTableId, targetTableId, splitItems)
        const updatedSource = updated.find((t) => t.id === sourceTableId)
        if (updatedSource && !isTableOccupied(updatedSource)) {
          setActiveTableId((currentActive) => (currentActive === sourceTableId ? null : currentActive))
        }
        return updated
      })
    },
    [],
  )

  const handleClearReports = useCallback(() => {
    // 1. Satış ve sipariş geçmişini temizle
    setCompletedOrders([])
    localStorage.removeItem('completedOrders')
    localStorage.removeItem('demoCompletedOrders')

    // 2. Geçmiş iş günlerini ve Z raporlarını temizle
    setBusinessDays([])
    localStorage.removeItem('businessDays')

    // 3. Masalardaki açık deneme siparişlerini ve bakiyeleri temizle
    setTables((current) =>
      current.map((t) => ({
        ...t,
        status: 'empty' as const,
        cart: [],
        discountRate: 0,
        note: '',
        payments: [],
        customerName: '',
      }))
    )

    // 4. Doğrudan kasa sepetini ve aktif seçimleri sıfırla
    setDirectCart([])
    setDirectDiscountRate(0)
    setDirectNote('')
    setDirectPayments([])
    setActiveTableId(null)
    setReportSelectedDayId(null)
  }, [])

  const finishPayment = (method: PaymentMethod) => {
    setPaidMethod(method)
  }

  const handleAddPayment = useCallback((payment: PartialPayment, isComplete: boolean, finalMethod: PaymentMethod) => {
    const paymentWithDay: PartialPayment = {
      ...payment,
      businessDayId: openBusinessDay?.id,
    }
    if (activeTableId) {
      setTables((current) =>
        current.map((t) =>
          t.id === activeTableId
            ? { ...t, payments: [...(t.payments || []), paymentWithDay] }
            : t
        )
      )
    } else {
      setDirectPayments((current) => [...current, paymentWithDay])
    }
    if (isComplete) {
      setPaidMethod(finalMethod)
    }
  }, [activeTableId, openBusinessDay?.id])

  const handleUndoLastPayment = useCallback(() => {
    if (activeTableId) {
      setTables((current) =>
        current.map((t) =>
          t.id === activeTableId
            ? { ...t, payments: (t.payments || []).slice(0, -1) }
            : t
        )
      )
    } else {
      setDirectPayments((current) => current.slice(0, -1))
    }
  }, [activeTableId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

      if (event.key === 'F2') {
        event.preventDefault()
        searchRef.current?.focus()
        kasaSearchRef.current?.focus()
      }
      // F4 and cart shortcuts only work when a table is active (in TableOrderView)
      if (event.key === 'F4' && cart.length > 0 && activeTableId) {
        event.preventDefault()
        if (!openBusinessDay) {
          setDayBlockedPromptOpen(true)
        } else {
          setIsPaymentOpen(true)
        }
      }
      if (event.key === 'Escape') {
        setIsPaymentOpen(false)
        setIsSummaryOpen(false)
        setIsHelpOpen(false)
        setConfirmClear(false)
        setDayBlockedPromptOpen(false)
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Backspace' && cart.length > 0 && activeTableId) {
        event.preventDefault()
        setConfirmClear(true)
      }
      if (!isTyping && event.key === '+' && lastAddedId && activeTableId) {
        event.preventDefault()
        updateQuantity(lastAddedId, 1)
      }
      if (!isTyping && event.key === '-' && lastAddedId && activeTableId) {
        event.preventDefault()
        updateQuantity(lastAddedId, -1)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [cart.length, lastAddedId, menuProducts, updateQuantity, activeTableId, openBusinessDay])

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  return (
      <main className="app-shell">
        <TopBar
          view={view}
          onViewChange={handleViewChange}
          onOpenSummary={() => {
            setReportSelectedDayId(null)
            setIsSummaryOpen(true)
          }}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenProducts={() => setIsProductsOpen(true)}
          onOpenLogoSettings={() => setIsLogoSettingsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenDayModal={() => setIsOpenDayModalOpen(true)}
          onCloseDayModal={() => setIsCloseDayModalOpen(true)}
          openBusinessDay={openBusinessDay}
          settings={settings}
        />

        {view === 'home' ? (
          <HomePage
            completedOrders={completedOrders}
            tables={tables}
            openBusinessDay={openBusinessDay}
            onOpenDayModal={() => setIsOpenDayModalOpen(true)}
            onCloseDayModal={() => setIsCloseDayModalOpen(true)}
            onViewChange={handleViewChange}
            onOpenSummary={() => {
              setReportSelectedDayId(null)
              setIsSummaryOpen(true)
            }}
            onOpenProducts={() => setIsProductsOpen(true)}
            settings={settings}
          />
        ) : view === 'tables' ? (
          activeTableId && activeTable ? (
            <TableOrderView
              tableName={activeTable.name}
              cart={cart}
              confirmClear={confirmClear}
              note={note}
              customerName={customerName}
              totals={totals}
              payments={payments}
              products={menuProducts}
              onAddProduct={addProduct}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeItem}
              onApplyItemDiscount={applyItemDiscount}
              onClear={clearCart}
              onConfirmClearChange={setConfirmClear}
              onNoteChange={setNote}
              onCustomerNameChange={setCustomerName}
              onCompleteOrder={handleCompleteOrder}
              onOpenPayment={handleOpenPayment}
              onOpenAdisyon={handleOpenAdisyon}
              onOpenProducts={handleOpenProducts}
              onBack={handleBackToTables}
              onEditProduct={handleEditProduct}
              onViewDetail={handleViewDetail}
              onDeleteProduct={handleDeleteProduct}
              isDayOpen={Boolean(openBusinessDay)}
              onOpenDayModal={() => setIsOpenDayModalOpen(true)}
            />
          ) : (
            <TableLayout
              tables={tables}
              onSelectTable={(id) => {
                const target = tables.find((t) => t.id === id)
                if (!openBusinessDay && (!target || !isTableOccupied(target))) {
                  setDayBlockedPromptOpen(true)
                  return
                }
                setActiveTableId(id)
              }}
              onOpenTableManager={() => setIsTableManagerOpen(true)}
              onCloseTable={handleCloseTable}
              onCancelOrder={handleCancelOrderForTable}
              onCompleteOrder={handleCompleteOrderForTable}
              onViewAdisyon={handleViewAdisyonForTable}
              onMoveTable={handleMoveTable}
              onMergeTables={handleMergeTables}
              onSplitTable={handleSplitTable}
              isDayOpen={Boolean(openBusinessDay)}
              onOpenDayModal={() => setIsOpenDayModalOpen(true)}
            />
          )
        ) : (
          <section className="kasa-catalog-layout" aria-label="LEMOON KAFE ürün kataloğu">
            <ProductExplorer
              category={kasaCategory}
              onCategoryChange={setKasaCategory}
              search={kasaSearch}
              onSearchChange={setKasaSearch}
              searchRef={kasaSearchRef}
              products={menuProducts}
              onOpenProducts={handleOpenProducts}
              onEditProduct={handleEditProduct}
              onViewDetail={handleViewDetail}
              onDeleteProduct={handleDeleteProduct}
              readOnly
            />
          </section>
        )}

        <PaymentModal
          cart={cart}
          discountRate={discountRate}
          isOpen={isPaymentOpen}
          note={note}
          customerName={customerName}
          onClose={() => {
            if (paidMethod) {
              const orderDate = new Date().toISOString()
              const effectivePayments: PartialPayment[] =
                payments.length > 0
                  ? [...payments]
                  : [
                      {
                        id: generateUUID(),
                        method: paidMethod === 'mixed' ? 'cash' : paidMethod,
                        amount: totals.total,
                        createdAt: orderDate,
                        businessDayId: openBusinessDay?.id,
                      },
                    ]

              const newOrder: CompletedOrder = {
                id: generateUUID(),
                orderNumber: orderNumber,
                tableId: activeTable?.id,
                tableName: activeTable?.name,
                items: [...cart],
                totals: { ...totals },
                discountRate: discountRate,
                taxRate: settings.taxRate,
                paymentMethod: paidMethod,
                payments: effectivePayments,
                date: orderDate,
                note: note,
                customerName: customerName || undefined,
                cashier: settings.cashierName || 'Kasiyer',
                businessDayId: openBusinessDay?.id,
              }
              setCompletedOrders(prev => [newOrder, ...prev])
              clearCart()
              setPaidMethod(null)
              setActiveTableId(null)
            }
            setIsPaymentOpen(false)
          }}
          onNewOrder={() => {
            if (paidMethod) {
              const orderDate = new Date().toISOString()
              const effectivePayments: PartialPayment[] =
                payments.length > 0
                  ? [...payments]
                  : [
                      {
                        id: generateUUID(),
                        method: paidMethod === 'mixed' ? 'cash' : paidMethod,
                        amount: totals.total,
                        createdAt: orderDate,
                        businessDayId: openBusinessDay?.id,
                      },
                    ]

              const newOrder: CompletedOrder = {
                id: generateUUID(),
                orderNumber: orderNumber,
                tableId: activeTable?.id,
                tableName: activeTable?.name,
                items: [...cart],
                totals: { ...totals },
                discountRate: discountRate,
                taxRate: settings.taxRate,
                paymentMethod: paidMethod,
                payments: effectivePayments,
                date: orderDate,
                note: note,
                customerName: customerName || undefined,
                cashier: settings.cashierName || 'Kasiyer',
                businessDayId: openBusinessDay?.id,
              }
              setCompletedOrders(prev => [newOrder, ...prev])
            }
            clearCart()
            setPaidMethod(null)
            setActiveTableId(null)
            setIsPaymentOpen(false)
          }}
          onPaid={finishPayment}
          onAddPayment={handleAddPayment}
          onUndoLastPayment={handleUndoLastPayment}
          orderNumber={orderNumber}
          paidMethod={paidMethod}
          payments={payments}
          settings={settings}
          totals={totals}
        />

        <ReportsModal
          isOpen={isSummaryOpen}
          onClose={() => {
            setIsSummaryOpen(false)
            setReportSelectedDayId(null)
          }}
          completedOrders={completedOrders}
          businessDays={businessDays}
          openBusinessDay={openBusinessDay}
          initialSelectedDayId={reportSelectedDayId}
          tables={tables}
          settings={settings}
          onClearReports={handleClearReports}
          onOpenDayModal={() => setIsOpenDayModalOpen(true)}
          onCloseDayModal={() => setIsCloseDayModalOpen(true)}
        />

        {isOpenDayModalOpen && (
          <OpenDayModal
            isOpen={isOpenDayModalOpen}
            cashierName={settings.cashierName || 'LEMOON'}
            previousDayCarryOut={previousDayCarryOut}
            hasPreviousClosedDay={hasPreviousClosedDay}
            previousDayNeverClosed={previousDayNeverClosed}
            posZCutoffTime={settings.posZCutoffTime || '23:57'}
            onClose={() => setIsOpenDayModalOpen(false)}
            onOpenDay={handleOpenDay}
          />
        )}

        <CloseDayModal
          isOpen={isCloseDayModalOpen}
          openDay={openBusinessDay}
          orders={completedOrders}
          tables={tables}
          settings={settings}
          onClose={() => setIsCloseDayModalOpen(false)}
          onCloseDay={handleCloseDay}
          onGoToTables={() => {
            handleViewChange('tables')
          }}
          onViewReport={(dayId) => {
            setReportSelectedDayId(dayId)
            setIsSummaryOpen(true)
          }}
        />

        {dayBlockedPromptOpen && !openBusinessDay && (
          <div
            className="overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Gün Kapalı"
            onClick={() => setDayBlockedPromptOpen(false)}
          >
            <div
              className="modal"
              style={{ width: 'min(440px, 92vw)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 grid place-items-center shrink-0">
                    <Sun size={18} />
                  </div>
                  <div>
                    <p className="section-kicker">GÜN KAPALI</p>
                    <h2 className="section-title text-lg">Sipariş Alınamıyor</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className="close-button"
                  onClick={() => setDayBlockedPromptOpen(false)}
                  aria-label="Kapat"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="payment-body text-center space-y-4">
                <p className="text-sm font-bold text-[#3b291f]">
                  Sipariş almak için önce günü açın
                </p>
                <p className="text-xs text-[#6d5a4e]">
                  Yeni sipariş oluşturmak, sepete ürün eklemek veya ödeme almak için önce kasa açılış tutarını girerek iş gününü başlatmalısınız.
                </p>
                <div className="success-actions mt-4">
                  <button
                    type="button"
                    className="outline-action"
                    onClick={() => setDayBlockedPromptOpen(false)}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    className="solid-action flex items-center justify-center gap-1.5"
                    onClick={() => {
                      setDayBlockedPromptOpen(false)
                      setIsOpenDayModalOpen(true)
                    }}
                  >
                    <Sun size={15} />
                    <span>Günü Aç</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        <AdisyonModal cart={cart} discountRate={discountRate} isOpen={isAdisyonOpen} note={note} customerName={customerName} onClose={() => setIsAdisyonOpen(false)} orderNumber={orderNumber} totals={totals} />
        <ProductManager
          isOpen={isProductsOpen}
          initialEditId={editProductId}
          onClose={() => {
            setIsProductsOpen(false)
            setEditProductId(null)
          }}
          products={menuProducts}
          onSave={(product, imageFile) => {
            let localImageUrl = product.image_url
            if (imageFile) {
              localImageUrl = URL.createObjectURL(imageFile)
            }

            const productToSave: Product = {
              ...product,
              image_url: localImageUrl,
            }

            // 1. Immediately update local state & localStorage so user sees product instantly
            setMenuProducts((current) => {
              const existingIndex = current.findIndex((item) => item.id === productToSave.id)
              if (existingIndex >= 0) {
                const copy = [...current]
                copy[existingIndex] = productToSave
                return copy
              }
              return [...current, productToSave]
            })

            // 2. Async backend sync via API layer (fetch to FastAPI)
            apiSaveProduct(product, imageFile)
              .then(savedProduct => {
                if (savedProduct && savedProduct.id) {
                  setMenuProducts((current) => current.map((item) => {
                    if (item.id === productToSave.id) {
                      return {
                        ...item,
                        id: savedProduct.id,
                        image_url: savedProduct.image_url || item.image_url
                      }
                    }
                    return item
                  }))
                }
              })
              .catch(err => console.warn("Backend save skipped or failed, product kept in local store:", err))
          }}
          onDelete={handleDeleteProduct}
        />
        <ProductDetailModal
          product={detailProduct}
          isOpen={!!detailProduct}
          onClose={() => setDetailProduct(null)}
          onEditProduct={handleEditProduct}
          onAddProduct={view === 'tables' && activeTableId ? addProduct : undefined}
        />
        {optionModalProduct && (
          <ProductOptionModal
            product={optionModalProduct}
            isOpen={true}
            onClose={() => setOptionModalProduct(null)}
            onConfirm={handleConfirmOption}
          />
        )}
        <TableManager
          isOpen={isTableManagerOpen}
          onClose={() => setIsTableManagerOpen(false)}
          tables={tables}
          onSave={(table) => setTables((current) => {
            const existing = current.some((t) => t.id === table.id)
            return existing 
              ? current.map((t) => t.id === table.id ? { ...t, name: table.name } : t)
              : [...current, { ...table, status: 'empty', cart: [], discountRate: 0, note: '' }]
          })}
          onDelete={(id) => {
            setTables((current) => current.filter((t) => t.id !== id))
            if (activeTableId === id) {
              handleViewChange('tables')
            }
          }}
        />
        <LogoSettingsModal
          isOpen={isLogoSettingsOpen}
          onClose={() => setIsLogoSettingsOpen(false)}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={setSettings}
          onOpenProducts={() => setIsProductsOpen(true)}
          onOpenTableManager={() => setIsTableManagerOpen(true)}
          onOpenLogoSettings={() => setIsLogoSettingsOpen(true)}
          onResetData={handleResetData}
        />
      </main>
  )
}

export default App
