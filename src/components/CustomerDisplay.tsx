import { useEffect, useState } from 'react'

/**
 * Müşteri Ekranı — İkinci monitörde gösterilir.
 * Electron IPC üzerinden ana pencereden gelen sepet güncellemelerini dinler.
 */

interface CartDisplayItem {
  name: string
  quantity: number
  price: number
  selectedOptions?: { optionName: string; priceDelta: number }[]
}

interface CartData {
  items: CartDisplayItem[]
  subtotal: number
  discount: number
  total: number
  storeName: string
  storeSub: string
}

export function CustomerDisplay() {
  const [cart, setCart] = useState<CartData>({
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    storeName: 'ECO COFFEE',
    storeSub: 'Kahvenin iyi hali',
  })
  const [currentTime, setCurrentTime] = useState(new Date())

  // Listen for cart updates from main window (Electron IPC)
  useEffect(() => {
    let cleanup: (() => void) | undefined

    try {
      const electronAPI = (window as any).electronAPI
      if (electronAPI?.onCartUpdate) {
        cleanup = electronAPI.onCartUpdate((cartJson: string) => {
          try {
            const data = JSON.parse(cartJson)
            setCart(data)
          } catch (e) {
            console.error('Failed to parse cart update:', e)
          }
        })
      } else {
        console.log('Customer display: Not in Electron environment, using demo mode')
      }
    } catch {
      console.log('Customer display: Not in Electron environment, using demo mode')
    }

    return () => { cleanup?.() }
  }, [])

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount)

  const timeStr = currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = currentTime.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#f8fafc',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      cursor: 'none',
    }}>
      {/* Header */}
      <header style={{
        padding: '24px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #92400e, #b45309)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            fontWeight: 'bold',
            letterSpacing: '-1px',
            boxShadow: '0 4px 15px rgba(180, 83, 9, 0.3)',
          }}>
            EC
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.5px' }}>{cart.storeName}</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '400' }}>{cart.storeSub}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>{dateStr}</div>
        </div>
      </header>

      {/* Cart Items */}
      <div style={{
        flex: 1,
        padding: '24px 40px',
        overflowY: 'auto',
      }}>
        {cart.items.length === 0 ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            opacity: 0.4,
          }}>
            <div style={{ fontSize: '64px' }}>☕</div>
            <div style={{ fontSize: '20px', fontWeight: '500' }}>Hoş Geldiniz</div>
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>Siparişiniz burada görünecektir</div>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 120px',
              padding: '12px 16px',
              color: '#64748b',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span>Ürün</span>
              <span style={{ textAlign: 'center' }}>Adet</span>
              <span style={{ textAlign: 'right' }}>Fiyat</span>
            </div>

            {cart.items.map((item, i) => {
              const optionExtra = item.selectedOptions?.reduce((sum, o) => sum + o.priceDelta, 0) || 0
              const lineTotal = (item.price + optionExtra) * item.quantity

              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 120px',
                    padding: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    alignItems: 'center',
                    animation: 'fadeIn 0.3s ease',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: '500' }}>{item.name}</div>
                    {item.selectedOptions && item.selectedOptions.length > 0 && (
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        {item.selectedOptions.map(o => o.optionName).join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '17px', fontWeight: '600' }}>
                    {item.quantity}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(lineTotal)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Footer — Total */}
      {cart.items.length > 0 && (
        <footer style={{
          padding: '24px 40px',
          background: 'rgba(0,0,0,0.3)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {cart.discount > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              color: '#f59e0b',
              fontSize: '16px',
            }}>
              <span>İndirim</span>
              <span>-{formatCurrency(cart.discount)}</span>
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '12px',
          }}>
            <span style={{ fontSize: '24px', fontWeight: '600' }}>TOPLAM</span>
            <span style={{
              fontSize: '48px',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-1px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatCurrency(cart.total)}
            </span>
          </div>
        </footer>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  )
}
