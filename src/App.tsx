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
import { calculateTotals } from './lib/format'
import { getProducts, saveProduct as apiSaveProduct, deleteProductApi, updateCustomerDisplay, isElectronEnvironment } from './lib/api'
import type { CartItem, PaymentMethod, Product, Table, CompletedOrder, SelectedOption, AppSettings } from './types'
import { ProductManager } from './components/ProductManager'
import { ProductOptionModal } from './components/ProductOptionModal'
import { ProductDetailModal } from './components/ProductDetailModal'
import { TableManager } from './components/TableManager'
import { initialTables } from './data/tables'
import { TableLayout } from './components/TableLayout'
import { HomePage } from './components/HomePage'
import { TableOrderView } from './components/TableOrderView'

const ORDER_NUMBER = 'EC-1042'

const defaultSettings: AppSettings = {
  theme: 'light',
  storeName: 'ECO COFFEE',
  storeSub: 'Kahvenin iyi hali',
  location: 'Eco Coffee · Nurdağı',
  cashierName: 'ECO',
  receiptFooter: 'Bizi tercih ettiğiniz için teşekkür ederiz! Yine bekleriz.',
  autoPrintReceipt: false,
  currencySymbol: '₺',
  taxRate: 10,
}

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [view, setView] = useState<'home' | 'tables' | 'pos'>('home')

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings') || localStorage.getItem('demoAppSettings')
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) }
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
  
  const [directCart, setDirectCart] = useState<CartItem[]>([])
  const [directDiscountRate, setDirectDiscountRate] = useState(0)
  const [directNote, setDirectNote] = useState('')

  // Kasa search state (read-only catalog)
  const [kasaSearch, setKasaSearch] = useState('')
  const [kasaCategory, setKasaCategory] = useState('Tümü')
  const kasaSearchRef = useRef<HTMLInputElement>(null)

  const [menuProducts, setMenuProducts] = useState<Product[]>(() => {
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
  const [optionModalProduct, setOptionModalProduct] = useState<Product | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [paidMethod, setPaidMethod] = useState<PaymentMethod | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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
  }, [menuProducts, updateActiveCart])

  const handleConfirmOption = useCallback((productId: string, quantity: number, selectedOptions: SelectedOption[]) => {
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
  }, [menuProducts, updateActiveCart])

  const updateQuantity = useCallback((cartItemId: string, change: number) => {
    updateActiveCart((current) =>
      current
        .map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + change } : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }, [updateActiveCart])

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
    setLastAddedId(null)
    setConfirmClear(false)
  }, [updateActiveCart, setDiscountRate, setNote, setCustomerName])

  const handleOpenProducts = useCallback(() => setIsProductsOpen(true), [])
  const handleCompleteOrder = useCallback(() => {
    setActiveTableId(null)
  }, [])
  const handleOpenPayment = useCallback(() => setIsPaymentOpen(true), [])
  const handleOpenAdisyon = useCallback(() => setIsAdisyonOpen(true), [])
  const handleBackToTables = useCallback(() => {
    setActiveTableId(null)
  }, [])

  const handleCloseTable = useCallback((tableId: string) => {
    setTables((current) =>
      current.map((t) =>
        t.id === tableId
          ? { ...t, cart: [], discountRate: 0, note: '', customerName: '', status: 'empty' }
          : t
      )
    )
  }, [])

  const handleCancelOrderForTable = useCallback((tableId: string) => {
    setTables((current) =>
      current.map((t) =>
        t.id === tableId
          ? { ...t, cart: [], discountRate: 0, note: '', customerName: '', status: 'empty' }
          : t
      )
    )
  }, [])

  const handleCompleteOrderForTable = useCallback((tableId: string) => {
    setActiveTableId(tableId)
    setIsPaymentOpen(true)
  }, [])

  const handleViewAdisyonForTable = useCallback((tableId: string) => {
    setActiveTableId(tableId)
    setIsAdisyonOpen(true)
  }, [])

  const handleClearReports = useCallback(() => {
    setCompletedOrders([])
    localStorage.removeItem('completedOrders')
    localStorage.removeItem('demoCompletedOrders')
  }, [])

  const finishPayment = (method: PaymentMethod) => {
    setPaidMethod(method)
  }

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
        setIsPaymentOpen(true)
      }
      if (event.key === 'Escape') {
        setIsPaymentOpen(false)
        setIsSummaryOpen(false)
        setIsHelpOpen(false)
        setConfirmClear(false)
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
  }, [cart.length, lastAddedId, menuProducts, updateQuantity, activeTableId])

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  return (
    <main className="app-shell">
      <TopBar
        view={view}
        onViewChange={(v) => {
          setView(v)
          if (v === 'tables') setActiveTableId(null)
          if (v === 'home') setActiveTableId(null)
        }}
        onOpenSummary={() => setIsSummaryOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenProducts={() => setIsProductsOpen(true)}
        onOpenLogoSettings={() => setIsLogoSettingsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        settings={settings}
      />

      {view === 'home' ? (
        <HomePage
          completedOrders={completedOrders}
          tables={tables}
          onViewChange={setView}
          onOpenSummary={() => setIsSummaryOpen(true)}
          onOpenProducts={() => setIsProductsOpen(true)}
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
          />
        ) : (
          <TableLayout
            tables={tables}
            onSelectTable={(id) => {
              setActiveTableId(id)
            }}
            onOpenTableManager={() => setIsTableManagerOpen(true)}
            onCloseTable={handleCloseTable}
            onCancelOrder={handleCancelOrderForTable}
            onCompleteOrder={handleCompleteOrderForTable}
            onViewAdisyon={handleViewAdisyonForTable}
          />
        )
      ) : (
        <section className="kasa-catalog-layout" aria-label="Eco Coffee ürün kataloğu">
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
        onClose={() => setIsPaymentOpen(false)}
        onNewOrder={() => {
          if (paidMethod) {
            const newOrder: CompletedOrder = {
              id: crypto.randomUUID(),
              orderNumber: orderNumber,
              items: [...cart],
              totals: { ...totals },
              paymentMethod: paidMethod,
              date: new Date().toISOString(),
              note: note,
              customerName: customerName || undefined,
              cashier: 'Kasiyer'
            }
            setCompletedOrders(prev => [newOrder, ...prev])
          }
          clearCart()
          setPaidMethod(null)
          setIsPaymentOpen(false)
        }}
        onPaid={finishPayment}
        orderNumber={orderNumber}
        paidMethod={paidMethod}
        totals={totals}
      />

      <ReportsModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        completedOrders={completedOrders}
        onClearReports={handleClearReports}
      />
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
            const existingIndex = current.findIndex((item) => item.id === productToSave.id || item.name === productToSave.name)
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
                  if (item.id === productToSave.id || item.name === productToSave.name) {
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
            setActiveTableId(null)
            setView('tables')
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
