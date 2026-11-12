const {
  toKurus,
  checkKurusPrecision,
} = require('./currency.cjs')
const {
  saveTables,
  saveCompletedOrders,
  saveBusinessDays,
  saveMenuProducts,
  saveRefunds,
  saveActivityLogs,
  saveUsers,
  saveUserPermissionOverridesMap,
  saveSettings,
  setKvItem,
  getTables,
  getCompletedOrders,
  getBusinessDays,
  getMenuProducts,
  getRefunds,
  getActivityLogs,
  getUsers,
  getMeta,
  setMeta,
  clearAllOperationalData,
} = require('./repository.cjs')

const MIGRATION_RETENTION_DAYS = 30
const MIGRATION_RETENTION_MS = MIGRATION_RETENTION_DAYS * 24 * 60 * 60 * 1000

/**
 * Computes effective unit price of a cart item (base price + selected option deltas).
 */
function getEffectivePriceTl(item) {
  const base = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0
  const delta = Array.isArray(item.selectedOptions)
    ? item.selectedOptions.reduce(
        (sum, o) => sum + (typeof o.priceDelta === 'number' && Number.isFinite(o.priceDelta) ? o.priceDelta : 0),
        0,
      )
    : 0
  return Math.max(0, Math.round((base + delta) * 100) / 100)
}

/**
 * Computes line total after item-level discount in TL.
 */
function getLineAfterItemDiscountTl(item) {
  const gross = Math.round(getEffectivePriceTl(item) * (item.quantity || 0) * 100) / 100
  if (!item.itemDiscount) return gross
  if (item.itemDiscount.type === 'percentage') {
    const pct = Math.min(100, Math.max(0, Number(item.itemDiscount.value) || 0))
    const disc = Math.round(((gross * pct) / 100) * 100) / 100
    return Math.max(0, Math.round((gross - disc) * 100) / 100)
  }
  const disc = Math.min(gross, Math.max(0, Number(item.itemDiscount.value) || 0))
  return Math.max(0, Math.round((gross - disc) * 100) / 100)
}

/**
 * Computes table cart total in kuruş using the same rules as src/lib/format.ts calculateTotals.
 */
function computeCartTotalKurus(cart, discountRate = 0) {
  if (!Array.isArray(cart) || cart.length === 0) return 0
  const activeItems = cart.filter((i) => i && i.status !== 'refunded')
  const afterItemDiscountsTl = activeItems.reduce(
    (sum, item) => sum + getLineAfterItemDiscountTl(item),
    0,
  )
  const clampedRate = Math.min(1, Math.max(0, Number(discountRate) || 0))
  const orderLevelDiscountTl = Math.round(afterItemDiscountsTl * clampedRate * 100) / 100
  const totalTl = Math.max(0, Math.round((afterItemDiscountsTl - orderLevelDiscountTl) * 100) / 100)
  return toKurus(totalTl)
}

/**
 * Computes deterministic financial totals (in integer kuruş) for a dataset
 * to verify zero rounding or data drift between localStorage and SQLite.
 */
function computeFinancialSummary(data) {
  const tables = Array.isArray(data.tables) ? data.tables : []
  const completedOrders = Array.isArray(data.completedOrders) ? data.completedOrders : []
  const refunds = Array.isArray(data.refunds) ? data.refunds : []

  let completedOrdersGrossKurus = 0
  let cardPaymentsKurus = 0
  let cashPaymentsKurus = 0
  let ibanPaymentsKurus = 0

  const validOrders = completedOrders.filter((o) => o && !o.cancelled && !o.reopened)

  for (const order of validOrders) {
    const orderTotalKurus = toKurus(order.totals?.total ?? 0)
    completedOrdersGrossKurus += orderTotalKurus

    if (Array.isArray(order.payments) && order.payments.length > 0) {
      for (const p of order.payments) {
        const amtKurus = toKurus(p.amount)
        if (p.method === 'card') cardPaymentsKurus += amtKurus
        else if (p.method === 'iban') ibanPaymentsKurus += amtKurus
        else cashPaymentsKurus += amtKurus
      }
    } else {
      if (order.paymentMethod === 'card') cardPaymentsKurus += orderTotalKurus
      else if (order.paymentMethod === 'iban') ibanPaymentsKurus += orderTotalKurus
      else cashPaymentsKurus += orderTotalKurus
    }
  }

  const totalPaymentsKurus = cardPaymentsKurus + cashPaymentsKurus + ibanPaymentsKurus

  let refundsTotalKurus = 0
  for (const r of refunds) {
    if (!r) continue
    refundsTotalKurus += toKurus(r.amount)
  }

  const netRevenueKurus = Math.max(0, totalPaymentsKurus - refundsTotalKurus)

  let openTableCartsTotalKurus = 0
  let openTablePaymentsTotalKurus = 0
  let openTableCardPaymentsKurus = 0
  let openTableCashPaymentsKurus = 0
  let openTableIbanPaymentsKurus = 0

  for (const t of tables) {
    if (!t) continue
    const isOccupied =
      t.status === 'occupied' ||
      (Array.isArray(t.cart) && t.cart.some((i) => i && i.status !== 'refunded'))
    if (!isOccupied) continue

    openTableCartsTotalKurus += computeCartTotalKurus(t.cart, t.discountRate || 0)

    if (Array.isArray(t.payments)) {
      for (const p of t.payments) {
        if (!p) continue
        const amtKurus = toKurus(p.amount)
        openTablePaymentsTotalKurus += amtKurus
        if (p.method === 'card') openTableCardPaymentsKurus += amtKurus
        else if (p.method === 'iban') openTableIbanPaymentsKurus += amtKurus
        else openTableCashPaymentsKurus += amtKurus
      }
    }
  }

  const openTableRemainingBalanceKurus = Math.max(
    0,
    openTableCartsTotalKurus - openTablePaymentsTotalKurus,
  )

  return {
    completedOrdersGrossKurus,
    totalPaymentsKurus,
    cardPaymentsKurus,
    cashPaymentsKurus,
    ibanPaymentsKurus,
    refundsTotalKurus,
    netRevenueKurus,
    openTableCartsTotalKurus,
    openTablePaymentsTotalKurus,
    openTableCardPaymentsKurus,
    openTableCashPaymentsKurus,
    openTableIbanPaymentsKurus,
    openTableRemainingBalanceKurus,
  }
}

/**
 * Verifies that every monetary field in the payload can be represented in integer kuruş
 * without precision loss (beyond 2 decimal places).
 */
function verifyPayloadKurusPrecision(payload) {
  const errors = []

  const checkVal = (val, label) => {
    if (val === undefined || val === null) return
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      errors.push(`${label}: Geçersiz sayısal tutar (${String(val)})`)
      return
    }
    // Check if value has more than 2 decimal places causing > 0.0001 TL rounding error
    const scaled = val * 100
    const rounded = Math.round(scaled)
    if (Math.abs(scaled - rounded) > 1e-4) {
      errors.push(
        `${label}: Kuruş dönüşümünde yuvarlama farkı tespit edildi (değer: ${val}, kuruş: ${rounded})`,
      )
    }
    const res = checkKurusPrecision(val)
    if (!res.exact) {
      errors.push(`${label}: Kuruş round-trip hatası (${val} != ${res.restoredTl})`)
    }
  }

  for (const p of payload.menuProducts || []) {
    checkVal(p.price, `product[${p.id}].price`)
  }
  for (const t of payload.tables || []) {
    for (const item of t.cart || []) {
      checkVal(item.price, `table[${t.id}].cart[${item.cartItemId}].price`)
    }
    for (const pay of t.payments || []) {
      checkVal(pay.amount, `table[${t.id}].payment[${pay.id}].amount`)
    }
  }
  for (const o of payload.completedOrders || []) {
    checkVal(o.totals?.subtotal, `order[${o.id}].totals.subtotal`)
    checkVal(o.totals?.discount, `order[${o.id}].totals.discount`)
    checkVal(o.totals?.total, `order[${o.id}].totals.total`)
    for (const item of o.items || []) {
      checkVal(item.price, `order[${o.id}].item[${item.cartItemId}].price`)
    }
    for (const pay of o.payments || []) {
      checkVal(pay.amount, `order[${o.id}].payment[${pay.id}].amount`)
    }
  }
  for (const r of payload.refunds || []) {
    checkVal(r.amount, `refund[${r.id}].amount`)
  }
  for (const d of payload.businessDays || []) {
    checkVal(d.openingCash, `businessDay[${d.id}].openingCash`)
    checkVal(d.closingCash, `businessDay[${d.id}].closingCash`)
    checkVal(d.expectedCash, `businessDay[${d.id}].expectedCash`)
    checkVal(d.expectedZ, `businessDay[${d.id}].expectedZ`)
    checkVal(d.enteredZ, `businessDay[${d.id}].enteredZ`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Compares two financial summaries and returns whether they match 100% identically.
 */
function compareFinancialSummaries(expected, actual) {
  const keys = Object.keys(expected)
  const mismatches = []

  for (const k of keys) {
    if (expected[k] !== actual[k]) {
      mismatches.push(`${k}: beklenen=${expected[k]} kuruş, gerçekleşen=${actual[k]} kuruş`)
    }
  }

  return {
    matches: mismatches.length === 0,
    mismatches,
  }
}

/**
 * Migrates validated localStorage payload into SQLite atomically.
 * - If a previous migration was interrupted ('in_progress'), cleans partial data first.
 * - Verifies kuruş precision and post-migration financial totals (revenue, payments, open table balances).
 * - If totals do not match or an error occurs mid-migration, rolls back the entire transaction so SQLite remains clean.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} payload
 * @param {object} [options]
 * @param {string} [options.failAtStep]
 * @param {(db: any) => void} [options.tamperAfterWrite]
 */
function migratePayloadToSqlite(db, payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      rolledBack: false,
      error: 'Migrasyon verisi geçersiz.',
    }
  }

  // 1) Check if previous migration was interrupted
  const prevStatus = getMeta(db, 'migration_status')
  const wasInterrupted = prevStatus === 'in_progress'
  if (wasInterrupted) {
    clearAllOperationalData(db)
  }

  // 2) Verify kuruş conversion precision before starting
  const precisionCheck = verifyPayloadKurusPrecision(payload)
  if (!precisionCheck.valid) {
    return {
      success: false,
      rolledBack: true,
      error: `Kuruş yuvarlama doğrulaması başarısız: ${precisionCheck.errors.join('; ')}`,
      errors: precisionCheck.errors,
    }
  }

  // 3) Compute expected financial summary from source data
  const sourceSummary = computeFinancialSummary(payload)

  // Mark migration as in_progress before atomic write
  setMeta(db, 'migration_status', 'in_progress')

  try {
    const runAtomicMigration = db.transaction(() => {
      clearAllOperationalData(db)

      if (options.failAtStep === 'after_clear') {
        throw new Error('Simulated power failure after clear')
      }

      if (Array.isArray(payload.tables)) {
        saveTables(db, payload.tables)
      }

      if (options.failAtStep === 'after_tables') {
        throw new Error('Simulated power failure after tables')
      }

      if (Array.isArray(payload.completedOrders)) {
        saveCompletedOrders(db, payload.completedOrders)
      }

      if (options.failAtStep === 'after_orders') {
        throw new Error('Simulated power failure after completedOrders')
      }

      if (Array.isArray(payload.businessDays)) {
        saveBusinessDays(db, payload.businessDays)
      }

      if (Array.isArray(payload.menuProducts)) {
        saveMenuProducts(db, payload.menuProducts)
      }

      if (Array.isArray(payload.refunds)) {
        saveRefunds(db, payload.refunds)
      }

      if (Array.isArray(payload.activityLogs)) {
        saveActivityLogs(db, payload.activityLogs)
      }

      if (Array.isArray(payload.appUsers)) {
        saveUsers(db, payload.appUsers)
      }

      if (payload.appSettings && typeof payload.appSettings === 'object') {
        saveSettings(db, payload.appSettings)
      }

      if (payload.userPermissionOverrides && typeof payload.userPermissionOverrides === 'object') {
        saveUserPermissionOverridesMap(db, payload.userPermissionOverrides)
        setKvItem(
          db,
          'appUserPermissionOverrides',
          JSON.stringify(payload.userPermissionOverrides),
        )
        setKvItem(
          db,
          'userPermissionOverrides',
          JSON.stringify(payload.userPermissionOverrides),
        )
      }

      if (payload.waitstaffPermissionTemplate && typeof payload.waitstaffPermissionTemplate === 'object') {
        setKvItem(
          db,
          'appPermissionTemplate',
          JSON.stringify(payload.waitstaffPermissionTemplate),
        )
        setKvItem(
          db,
          'waitstaffPermissionTemplate',
          JSON.stringify(payload.waitstaffPermissionTemplate),
        )
      }

      if (Array.isArray(payload.initialWaitstaffPins)) {
        setKvItem(db, 'initialWaitstaffPins', JSON.stringify(payload.initialWaitstaffPins))
      }

      if (typeof payload.customAppLogo === 'string') {
        setKvItem(db, 'customAppLogo', payload.customAppLogo)
      }

      if (typeof payload.menuCatalogVersion === 'string') {
        setKvItem(db, 'menuCatalogVersion', payload.menuCatalogVersion)
      }

      if (payload.extraKv && typeof payload.extraKv === 'object') {
        for (const [k, v] of Object.entries(payload.extraKv)) {
          if (typeof v === 'string') {
            setKvItem(db, k, v)
          }
        }
      }

      // Optional test hook to simulate post-write tampering / financial mismatch
      if (typeof options.tamperAfterWrite === 'function') {
        options.tamperAfterWrite(db)
      }

      // 4) Read back from SQLite inside the transaction and verify financial totals match 100%
      const migratedData = {
        tables: getTables(db) || [],
        completedOrders: getCompletedOrders(db) || [],
        refunds: getRefunds(db) || [],
        businessDays: getBusinessDays(db) || [],
        menuProducts: getMenuProducts(db) || [],
        activityLogs: getActivityLogs(db) || [],
        appUsers: getUsers(db) || [],
      }

      const sqliteSummary = computeFinancialSummary(migratedData)
      const comparison = compareFinancialSummaries(sourceSummary, sqliteSummary)
      if (!comparison.matches) {
        throw new Error(
          `Aktarım sonrası finansal toplam uyuşmazlığı tespit edildi: ${comparison.mismatches.join(', ')}`,
        )
      }

      const nowIso = new Date().toISOString()
      const retainUntilIso = new Date(Date.now() + MIGRATION_RETENTION_MS).toISOString()
      setMeta(db, 'migration_status', 'completed')
      setMeta(db, 'migrated_at', nowIso)
      setMeta(db, 'legacy_retain_until', retainUntilIso)

      return {
        migratedAt: nowIso,
        retainUntil: retainUntilIso,
        sourceSummary,
        sqliteSummary,
      }
    })

    const txResult = runAtomicMigration()

    return {
      success: true,
      rolledBack: false,
      recoveredFromInterruption: wasInterrupted,
      migratedAt: txResult.migratedAt,
      retainUntil: txResult.retainUntil,
      summary: txResult.sqliteSummary,
    }
  } catch (err) {
    return {
      success: false,
      rolledBack: true,
      recoveredFromInterruption: wasInterrupted,
      error: err && err.message ? err.message : String(err),
    }
  }
}

module.exports = {
  MIGRATION_RETENTION_DAYS,
  MIGRATION_RETENTION_MS,
  computeFinancialSummary,
  verifyPayloadKurusPrecision,
  compareFinancialSummaries,
  migratePayloadToSqlite,
}
