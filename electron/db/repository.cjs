const crypto = require('crypto')
const {
  toKurus,
  fromKurus,
  toKurusNullable,
  fromKurusOptional,
} = require('./currency.cjs')

const OPEN_TABLE_ORDER_PREFIX = 'open_table_order::'
const GENESIS_LOG_HASH = '0000000000000000000000000000000000000000000000000000000000000000'
const ARCHIVE_ANCHOR_META_KEY = 'activity_logs_archive_anchor_hash'
const CHAIN_HEAD_META_KEY = 'activity_logs_head_hash'

function computeActivityLogHashCjs(log, prevHash) {
  const amountKurus =
    log.amount !== undefined && log.amount !== null && Number.isFinite(Number(log.amount))
      ? Math.round(Number(log.amount) * 100)
      : null
  const canonicalPayload = JSON.stringify([
    String(prevHash || GENESIS_LOG_HASH),
    String(log.id ?? ''),
    String(log.createdAt ?? ''),
    String(log.businessDayId ?? ''),
    String(log.type ?? ''),
    String(log.tableName ?? ''),
    String(log.tableId ?? ''),
    String(log.orderId ?? ''),
    String(log.productName ?? ''),
    log.oldValue !== undefined && log.oldValue !== null ? String(log.oldValue) : '',
    log.newValue !== undefined && log.newValue !== null ? String(log.newValue) : '',
    amountKurus !== null ? String(amountKurus) : '',
    String(log.reason ?? ''),
    String(log.userName ?? ''),
    String(log.userRole ?? ''),
    String(log.userId ?? ''),
    String(log.details ?? ''),
  ])
  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')
}

function serializeOptionGroups(optionGroups) {
  if (!Array.isArray(optionGroups)) return null
  const normalized = optionGroups.map((g) => ({
    ...g,
    options: Array.isArray(g.options)
      ? g.options.map((opt) => ({
          ...opt,
          priceDeltaKurus: toKurus(opt.priceDelta),
        }))
      : [],
  }))
  return JSON.stringify(normalized)
}

function deserializeOptionGroups(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return undefined
  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return undefined
    return parsed.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      required: Boolean(g.required),
      options: Array.isArray(g.options)
        ? g.options.map((opt) => ({
            id: opt.id,
            name: opt.name,
            priceDelta:
              typeof opt.priceDeltaKurus === 'number'
                ? fromKurus(opt.priceDeltaKurus)
                : Number(opt.priceDelta || 0),
            isDefault: Boolean(opt.isDefault),
          }))
        : [],
    }))
  } catch {
    return undefined
  }
}

function serializeSelectedOptions(selectedOptions) {
  if (!Array.isArray(selectedOptions)) return null
  const normalized = selectedOptions.map((opt) => ({
    ...opt,
    priceDeltaKurus: toKurus(opt.priceDelta),
  }))
  return JSON.stringify(normalized)
}

function deserializeSelectedOptions(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return undefined
  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return undefined
    return parsed.map((opt) => ({
      groupId: opt.groupId,
      groupName: opt.groupName,
      optionId: opt.optionId,
      optionName: opt.optionName,
      priceDelta:
        typeof opt.priceDeltaKurus === 'number'
          ? fromKurus(opt.priceDeltaKurus)
          : Number(opt.priceDelta || 0),
    }))
  } catch {
    return undefined
  }
}

function insertOrderItemsForOrder(db, orderId, items) {
  if (!Array.isArray(items) || items.length === 0) return
  const stmt = db.prepare(`
    INSERT INTO order_items (
      order_id, cart_item_id, sort_order, product_id, name, description,
      category, unit_price_kurus, quantity, badge, image_url,
      option_groups_json, selected_options_json,
      item_discount_type, item_discount_value_kurus, item_discount_raw,
      batch_id, batch_number, added_at, added_by, updated_at,
      status, refunded_qty, refund_reason, refunded_at, refunded_by
    ) VALUES (
      @order_id, @cart_item_id, @sort_order, @product_id, @name, @description,
      @category, @unit_price_kurus, @quantity, @badge, @image_url,
      @option_groups_json, @selected_options_json,
      @item_discount_type, @item_discount_value_kurus, @item_discount_raw,
      @batch_id, @batch_number, @added_at, @added_by, @updated_at,
      @status, @refunded_qty, @refund_reason, @refunded_at, @refunded_by
    )
  `)

  items.forEach((item, index) => {
    const discountType =
      item.itemDiscount && (item.itemDiscount.type === 'percentage' || item.itemDiscount.type === 'amount')
        ? item.itemDiscount.type
        : null
    const discountValueKurus =
      discountType === 'amount'
        ? toKurus(item.itemDiscount.value)
        : discountType === 'percentage'
          ? Math.round(Number(item.itemDiscount.value || 0) * 100)
          : null
    const discountRaw =
      discountType !== null && typeof item.itemDiscount.value === 'number'
        ? item.itemDiscount.value
        : null

    stmt.run({
      order_id: orderId,
      cart_item_id: item.cartItemId || `item_${index}`,
      sort_order: index,
      product_id: item.id || `prod_${index}`,
      name: item.name || '',
      description: item.description || '',
      category: item.category || 'Sıcak Kahveler',
      unit_price_kurus: toKurus(item.price),
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      badge: item.badge ?? null,
      image_url: item.image_url ?? null,
      option_groups_json: serializeOptionGroups(item.optionGroups),
      selected_options_json: serializeSelectedOptions(item.selectedOptions),
      item_discount_type: discountType,
      item_discount_value_kurus: discountValueKurus,
      item_discount_raw: discountRaw,
      batch_id: item.batchId ?? null,
      batch_number: typeof item.batchNumber === 'number' ? item.batchNumber : null,
      added_at: item.addedAt ?? null,
      added_by: item.addedBy ?? null,
      updated_at: item.updatedAt ?? null,
      status: item.status === 'refunded' ? 'refunded' : 'active',
      refunded_qty: typeof item.refundedQty === 'number' ? item.refundedQty : null,
      refund_reason: item.refundReason ?? null,
      refunded_at: item.refundedAt ?? null,
      refunded_by: item.refundedBy ?? null,
    })
  })
}

function mapRowToCartItem(row) {
  const item = {
    id: row.product_id,
    name: row.name,
    description: row.description || '',
    price: fromKurus(row.unit_price_kurus),
    category: row.category,
    cartItemId: row.cart_item_id,
    quantity: row.quantity,
  }

  if (row.badge) item.badge = row.badge
  if (row.image_url) item.image_url = row.image_url

  const optGroups = deserializeOptionGroups(row.option_groups_json)
  if (optGroups) item.optionGroups = optGroups

  const selOpts = deserializeSelectedOptions(row.selected_options_json)
  if (selOpts) item.selectedOptions = selOpts

  if (row.item_discount_type === 'amount' || row.item_discount_type === 'percentage') {
    item.itemDiscount = {
      type: row.item_discount_type,
      value:
        row.item_discount_type === 'amount'
          ? fromKurus(row.item_discount_value_kurus)
          : typeof row.item_discount_raw === 'number'
            ? row.item_discount_raw
            : fromKurus(row.item_discount_value_kurus),
    }
  }

  if (row.batch_id !== null && row.batch_id !== undefined) item.batchId = row.batch_id
  if (typeof row.batch_number === 'number') item.batchNumber = row.batch_number
  if (row.added_at) item.addedAt = row.added_at
  if (row.added_by) item.addedBy = row.added_by
  if (row.updated_at) item.updatedAt = row.updated_at
  if (row.status) item.status = row.status
  if (typeof row.refunded_qty === 'number') item.refundedQty = row.refunded_qty
  if (row.refund_reason) item.refundReason = row.refund_reason
  if (row.refunded_at) item.refundedAt = row.refunded_at
  if (row.refunded_by) item.refundedBy = row.refunded_by

  return item
}

function insertPaymentsForOrder(db, orderId, tableId, payments) {
  if (!Array.isArray(payments) || payments.length === 0) return
  const stmt = db.prepare(`
    INSERT INTO payments (
      order_id, id, sort_order, table_id, business_day_id, method,
      amount_kurus, received_amount_kurus, change_kurus, created_at,
      cashier, user_id, is_manual_amount, selected_items_total_kurus, paid_items_json
    ) VALUES (
      @order_id, @id, @sort_order, @table_id, @business_day_id, @method,
      @amount_kurus, @received_amount_kurus, @change_kurus, @created_at,
      @cashier, @user_id, @is_manual_amount, @selected_items_total_kurus, @paid_items_json
    )
  `)

  payments.forEach((p, index) => {
    let paidItemsJson = null
    if (Array.isArray(p.items)) {
      paidItemsJson = JSON.stringify(
        p.items.map((pi) => ({
          lineId: pi.lineId,
          quantity: pi.quantity,
          amountKurus: toKurus(pi.amount),
        })),
      )
    }

    stmt.run({
      order_id: orderId,
      id: p.id || `pay_${index}`,
      sort_order: index,
      table_id: tableId ?? null,
      business_day_id: p.businessDayId ?? null,
      method: p.method || 'cash',
      amount_kurus: toKurus(p.amount),
      received_amount_kurus: toKurusNullable(p.receivedAmount),
      change_kurus: toKurusNullable(p.change),
      created_at: p.createdAt || new Date().toISOString(),
      cashier: p.cashier ?? null,
      user_id: p.userId ?? null,
      is_manual_amount:
        p.isManualAmount === undefined ? null : p.isManualAmount ? 1 : 0,
      selected_items_total_kurus: toKurusNullable(p.selectedItemsTotal),
      paid_items_json: paidItemsJson,
    })
  })
}

function mapRowToPayment(row) {
  const payment = {
    id: row.id,
    method: row.method,
    amount: fromKurus(row.amount_kurus),
    createdAt: row.created_at,
  }

  const received = fromKurusOptional(row.received_amount_kurus)
  if (received !== undefined) payment.receivedAmount = received

  const change = fromKurusOptional(row.change_kurus)
  if (change !== undefined) payment.change = change

  if (row.business_day_id) payment.businessDayId = row.business_day_id
  if (row.cashier) payment.cashier = row.cashier
  if (row.user_id) payment.userId = row.user_id
  if (row.is_manual_amount !== null && row.is_manual_amount !== undefined) {
    payment.isManualAmount = Boolean(row.is_manual_amount)
  }

  const selectedTotal = fromKurusOptional(row.selected_items_total_kurus)
  if (selectedTotal !== undefined) payment.selectedItemsTotal = selectedTotal

  if (row.paid_items_json) {
    try {
      const parsed = JSON.parse(row.paid_items_json)
      if (Array.isArray(parsed)) {
        payment.items = parsed.map((pi) => ({
          lineId: pi.lineId,
          quantity: pi.quantity,
          amount:
            typeof pi.amountKurus === 'number'
              ? fromKurus(pi.amountKurus)
              : Number(pi.amount || 0),
        }))
      }
    } catch {}
  }

  return payment
}

// ────────────────────────────────────────────────────────────
// 1. Tables Repository (Masalar & Açık Masa Adisyonları)
// ────────────────────────────────────────────────────────────

function getTables(db) {
  const tableRows = db
    .prepare('SELECT * FROM tables ORDER BY sort_order ASC, rowid ASC')
    .all()
  if (tableRows.length === 0) return null

  const itemStmt = db.prepare(
    'SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order ASC',
  )
  const paymentStmt = db.prepare(
    'SELECT * FROM payments WHERE order_id = ? ORDER BY sort_order ASC',
  )

  return tableRows.map((row) => {
    const openOrderId = `${OPEN_TABLE_ORDER_PREFIX}${row.id}`
    const itemRows = itemStmt.all(openOrderId)
    const paymentRows = paymentStmt.all(openOrderId)

    const table = {
      id: row.id,
      name: row.name,
      status: row.status === 'occupied' ? 'occupied' : 'empty',
      cart: itemRows.map(mapRowToCartItem),
      discountRate: typeof row.discount_rate === 'number' ? row.discount_rate : 0,
      payments: paymentRows.map(mapRowToPayment),
    }

    if (row.note !== null && row.note !== undefined) table.note = row.note
    if (row.customer_name !== null && row.customer_name !== undefined) {
      table.customerName = row.customer_name
    }

    return table
  })
}

function saveTables(db, tables) {
  if (!Array.isArray(tables)) {
    throw new Error('tables dizi (array) olmalıdır.')
  }

  const run = db.transaction((list) => {
    // Delete all existing open table orders (cascades to order_items and payments for open tables)
    db.prepare("DELETE FROM orders WHERE state = 'open'").run()
    db.prepare('DELETE FROM tables').run()

    const now = new Date().toISOString()
    const insertTableStmt = db.prepare(`
      INSERT INTO tables (id, name, status, note, customer_name, discount_rate, sort_order, updated_at)
      VALUES (@id, @name, @status, @note, @customer_name, @discount_rate, @sort_order, @updated_at)
    `)
    const insertOpenOrderStmt = db.prepare(`
      INSERT INTO orders (
        id, order_number, state, table_id, table_name,
        subtotal_kurus, discount_kurus, total_kurus, discount_rate, tax_rate,
        date, note, customer_name, cancelled, reopened, sort_order
      ) VALUES (
        @id, @order_number, 'open', @table_id, @table_name,
        0, 0, 0, @discount_rate, 10,
        @date, @note, @customer_name, 0, 0, @sort_order
      )
    `)

    list.forEach((t, idx) => {
      insertTableStmt.run({
        id: t.id,
        name: t.name,
        status: t.status === 'occupied' ? 'occupied' : 'empty',
        note: t.note ?? null,
        customer_name: t.customerName ?? null,
        discount_rate: typeof t.discountRate === 'number' ? t.discountRate : 0,
        sort_order: idx,
        updated_at: now,
      })

      const hasCart = Array.isArray(t.cart) && t.cart.length > 0
      const hasPayments = Array.isArray(t.payments) && t.payments.length > 0

      if (hasCart || hasPayments || t.status === 'occupied') {
        const openOrderId = `${OPEN_TABLE_ORDER_PREFIX}${t.id}`
        insertOpenOrderStmt.run({
          id: openOrderId,
          order_number: t.name,
          table_id: t.id,
          table_name: t.name,
          discount_rate: typeof t.discountRate === 'number' ? t.discountRate : 0,
          date: now,
          note: t.note ?? null,
          customer_name: t.customerName ?? null,
          sort_order: idx,
        })

        if (hasCart) {
          insertOrderItemsForOrder(db, openOrderId, t.cart)
        }
        if (hasPayments) {
          insertPaymentsForOrder(db, openOrderId, t.id, t.payments)
        }
      }
    })
  })

  run(tables)
  return true
}

// ────────────────────────────────────────────────────────────
// 2. Completed Orders Repository (Tamamlanmış / İptal / Geri Açılmış Siparişler)
// ────────────────────────────────────────────────────────────

function getCompletedOrders(db) {
  const orderRows = db
    .prepare("SELECT * FROM orders WHERE state != 'open' ORDER BY sort_order ASC, rowid ASC")
    .all()

  const itemStmt = db.prepare(
    'SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order ASC',
  )
  const paymentStmt = db.prepare(
    'SELECT * FROM payments WHERE order_id = ? ORDER BY sort_order ASC',
  )

  return orderRows.map((row) => {
    const itemRows = itemStmt.all(row.id)
    const paymentRows = paymentStmt.all(row.id)

    const order = {
      id: row.id,
      orderNumber: row.order_number,
      items: itemRows.map(mapRowToCartItem),
      totals: {
        subtotal: fromKurus(row.subtotal_kurus),
        discount: fromKurus(row.discount_kurus),
        total: fromKurus(row.total_kurus),
      },
      paymentMethod: row.payment_method || 'cash',
      payments: paymentRows.map(mapRowToPayment),
      date: row.date,
      discountRate: typeof row.discount_rate === 'number' ? row.discount_rate : 0,
      taxRate: typeof row.tax_rate === 'number' ? row.tax_rate : 10,
      cancelled: Boolean(row.cancelled),
      reopened: Boolean(row.reopened),
    }

    if (row.note !== null && row.note !== undefined) order.note = row.note
    if (row.customer_name !== null && row.customer_name !== undefined) {
      order.customerName = row.customer_name
    }
    if (row.cashier !== null && row.cashier !== undefined) order.cashier = row.cashier
    if (row.business_day_id !== null && row.business_day_id !== undefined) {
      order.businessDayId = row.business_day_id
    }
    if (row.table_id !== null && row.table_id !== undefined) order.tableId = row.table_id
    if (row.table_name !== null && row.table_name !== undefined) {
      order.tableName = row.table_name
    }
    if (row.cancelled_at) order.cancelledAt = row.cancelled_at
    if (row.reopened_at) order.reopenedAt = row.reopened_at
    if (row.reopen_reason) order.reopenReason = row.reopen_reason
    if (row.reopened_by) order.reopenedBy = row.reopened_by

    return order
  })
}

function insertSingleCompletedOrder(db, order, sortOrder = 0) {
  const state = order.cancelled
    ? 'cancelled'
    : order.reopened
      ? 'reopened'
      : 'completed'

  db.prepare(`
    INSERT INTO orders (
      id, order_number, state, table_id, table_name, business_day_id,
      subtotal_kurus, discount_kurus, total_kurus, discount_rate, tax_rate,
      payment_method, date, note, customer_name, cashier,
      cancelled, cancelled_at, reopened, reopened_at, reopen_reason, reopened_by, sort_order
    ) VALUES (
      @id, @order_number, @state, @table_id, @table_name, @business_day_id,
      @subtotal_kurus, @discount_kurus, @total_kurus, @discount_rate, @tax_rate,
      @payment_method, @date, @note, @customer_name, @cashier,
      @cancelled, @cancelled_at, @reopened, @reopened_at, @reopen_reason, @reopened_by, @sort_order
    )
  `).run({
    id: order.id,
    order_number: order.orderNumber || '',
    state,
    table_id: order.tableId ?? null,
    table_name: order.tableName ?? null,
    business_day_id: order.businessDayId ?? null,
    subtotal_kurus: toKurus(order.totals?.subtotal),
    discount_kurus: toKurus(order.totals?.discount),
    total_kurus: toKurus(order.totals?.total),
    discount_rate: typeof order.discountRate === 'number' ? order.discountRate : 0,
    tax_rate: typeof order.taxRate === 'number' ? order.taxRate : 10,
    payment_method: order.paymentMethod || 'cash',
    date: order.date || new Date().toISOString(),
    note: order.note ?? null,
    customer_name: order.customerName ?? null,
    cashier: order.cashier ?? null,
    cancelled: order.cancelled ? 1 : 0,
    cancelled_at: order.cancelledAt ?? null,
    reopened: order.reopened ? 1 : 0,
    reopened_at: order.reopenedAt ?? null,
    reopen_reason: order.reopenReason ?? null,
    reopened_by: order.reopenedBy ?? null,
    sort_order: sortOrder,
  })

  if (Array.isArray(order.items) && order.items.length > 0) {
    insertOrderItemsForOrder(db, order.id, order.items)
  }
  if (Array.isArray(order.payments) && order.payments.length > 0) {
    insertPaymentsForOrder(db, order.id, order.tableId ?? null, order.payments)
  }
}

function saveCompletedOrders(db, orders) {
  if (!Array.isArray(orders)) {
    throw new Error('completedOrders dizi (array) olmalıdır.')
  }

  const run = db.transaction((list) => {
    db.prepare("DELETE FROM orders WHERE state != 'open'").run()
    list.forEach((order, idx) => {
      insertSingleCompletedOrder(db, order, idx)
    })
  })

  run(orders)
  return true
}

// ────────────────────────────────────────────────────────────
// 3. Business Days & Z Reports Repository
// ────────────────────────────────────────────────────────────

function serializeReportSnapshot(report) {
  if (!report || typeof report !== 'object') return null
  return JSON.stringify(report)
}

function deserializeReportSnapshot(zRow) {
  if (!zRow) return undefined
  let base = {}
  try {
    base = JSON.parse(zRow.report_json)
  } catch {}

  const report = {
    ...base,
    generatedAt: zRow.generated_at,
    totalRevenue: fromKurus(zRow.total_revenue_kurus),
    orderCount: zRow.order_count,
    averageBasket: fromKurus(zRow.average_basket_kurus),
    totalTax: fromKurus(zRow.total_tax_kurus),
    totalDiscount: fromKurus(zRow.total_discount_kurus),
    cancelledCount: zRow.cancelled_count,
    cancelledTotal: fromKurus(zRow.cancelled_total_kurus),
    paymentDistribution: {
      card: fromKurus(zRow.card_total_kurus),
      cash: fromKurus(zRow.cash_total_kurus),
      iban: fromKurus(zRow.iban_total_kurus),
    },
    cancelledOrders: Array.isArray(base.cancelledOrders) ? base.cancelledOrders : [],
    soldProducts: Array.isArray(base.soldProducts) ? base.soldProducts : [],
    categorySales: Array.isArray(base.categorySales) ? base.categorySales : [],
    hourlySales: Array.isArray(base.hourlySales) ? base.hourlySales : [],
  }

  if (base.totalRefunds !== undefined || zRow.total_refunds_kurus > 0) {
    report.totalRefunds = fromKurus(zRow.total_refunds_kurus)
  }
  if (base.refundCount !== undefined || zRow.refund_count > 0) {
    report.refundCount = zRow.refund_count
  }

  const expZ = fromKurusOptional(zRow.expected_z_kurus)
  if (expZ !== undefined) report.expectedZ = expZ

  const entZ = fromKurusOptional(zRow.entered_z_kurus)
  if (entZ !== undefined) report.enteredZ = entZ

  const diffZ = fromKurusOptional(zRow.z_difference_kurus)
  if (diffZ !== undefined) report.zDifference = diffZ

  return report
}

function getBusinessDays(db) {
  const rows = db
    .prepare('SELECT * FROM business_days ORDER BY sort_order ASC, rowid ASC')
    .all()
  const zStmt = db.prepare('SELECT * FROM z_reports WHERE business_day_id = ?')

  return rows.map((row) => {
    const zRow = zStmt.get(row.id)
    let extra = {}
    if (row.extra_json) {
      try {
        extra = JSON.parse(row.extra_json)
      } catch {}
    }

    const day = {
      ...extra,
      id: row.id,
      status: row.status === 'closed' ? 'closed' : 'open',
      openedAt: row.opened_at,
      openedBy: row.opened_by,
      openingCash: fromKurus(row.opening_cash_kurus),
    }

    if (row.closed_at) day.closedAt = row.closed_at
    if (row.closed_by) day.closedBy = row.closed_by

    const counted = fromKurusOptional(row.counted_cash_kurus)
    if (counted !== undefined) day.countedCash = counted

    const closing = fromKurusOptional(row.closing_cash_kurus)
    if (closing !== undefined) day.closingCash = closing

    const expected = fromKurusOptional(row.expected_cash_kurus)
    if (expected !== undefined) day.expectedCash = expected

    const diff = fromKurusOptional(row.cash_difference_kurus)
    if (diff !== undefined) day.cashDifference = diff

    if (row.note !== null && row.note !== undefined) day.note = row.note
    if (row.close_note !== null && row.close_note !== undefined) day.closeNote = row.close_note

    const expZ = fromKurusOptional(row.expected_z_kurus)
    if (expZ !== undefined) day.expectedZ = expZ

    const entZ = fromKurusOptional(row.entered_z_kurus)
    if (entZ !== undefined) day.enteredZ = entZ

    const diffZ = fromKurusOptional(row.z_difference_kurus)
    if (diffZ !== undefined) day.zDifference = diffZ

    const report = deserializeReportSnapshot(zRow)
    if (report) day.report = report

    return day
  })
}

function upsertSingleBusinessDay(db, day, sortOrder = 0) {
  const extra = {}
  const legacyFields = [
    'posZCutoffTime',
    'cardCarryIn',
    'cardCarryInAuto',
    'cardCarryInOverridden',
    'cardCarryOut',
    'cardBeforeCutoff',
    'cardAfterCutoff',
  ]
  for (const key of legacyFields) {
    if (day[key] !== undefined) extra[key] = day[key]
  }

  db.prepare(`
    INSERT INTO business_days (
      id, status, opened_at, opened_by, opening_cash_kurus,
      closed_at, closed_by, counted_cash_kurus, closing_cash_kurus,
      expected_cash_kurus, cash_difference_kurus, note, close_note,
      expected_z_kurus, entered_z_kurus, z_difference_kurus, extra_json, sort_order
    ) VALUES (
      @id, @status, @opened_at, @opened_by, @opening_cash_kurus,
      @closed_at, @closed_by, @counted_cash_kurus, @closing_cash_kurus,
      @expected_cash_kurus, @cash_difference_kurus, @note, @close_note,
      @expected_z_kurus, @entered_z_kurus, @z_difference_kurus, @extra_json, @sort_order
    )
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      opened_at = excluded.opened_at,
      opened_by = excluded.opened_by,
      opening_cash_kurus = excluded.opening_cash_kurus,
      closed_at = excluded.closed_at,
      closed_by = excluded.closed_by,
      counted_cash_kurus = excluded.counted_cash_kurus,
      closing_cash_kurus = excluded.closing_cash_kurus,
      expected_cash_kurus = excluded.expected_cash_kurus,
      cash_difference_kurus = excluded.cash_difference_kurus,
      note = excluded.note,
      close_note = excluded.close_note,
      expected_z_kurus = excluded.expected_z_kurus,
      entered_z_kurus = excluded.entered_z_kurus,
      z_difference_kurus = excluded.z_difference_kurus,
      extra_json = excluded.extra_json,
      sort_order = excluded.sort_order
  `).run({
    id: day.id,
    status: day.status === 'closed' ? 'closed' : 'open',
    opened_at: day.openedAt,
    opened_by: day.openedBy || 'Kasiyer',
    opening_cash_kurus: toKurus(day.openingCash),
    closed_at: day.closedAt ?? null,
    closed_by: day.closedBy ?? null,
    counted_cash_kurus: toKurusNullable(day.countedCash),
    closing_cash_kurus: toKurusNullable(day.closingCash),
    expected_cash_kurus: toKurusNullable(day.expectedCash),
    cash_difference_kurus: toKurusNullable(day.cashDifference),
    note: day.note ?? null,
    close_note: day.closeNote ?? null,
    expected_z_kurus: toKurusNullable(day.expectedZ),
    entered_z_kurus: toKurusNullable(day.enteredZ),
    z_difference_kurus: toKurusNullable(day.zDifference),
    extra_json: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
    sort_order: sortOrder,
  })

  if (day.report && typeof day.report === 'object') {
    const r = day.report
    db.prepare(`
      INSERT INTO z_reports (
        business_day_id, generated_at, total_revenue_kurus, order_count,
        average_basket_kurus, total_tax_kurus, total_discount_kurus,
        cancelled_count, cancelled_total_kurus, total_refunds_kurus, refund_count,
        card_total_kurus, cash_total_kurus, iban_total_kurus,
        expected_z_kurus, entered_z_kurus, z_difference_kurus, report_json
      ) VALUES (
        @business_day_id, @generated_at, @total_revenue_kurus, @order_count,
        @average_basket_kurus, @total_tax_kurus, @total_discount_kurus,
        @cancelled_count, @cancelled_total_kurus, @total_refunds_kurus, @refund_count,
        @card_total_kurus, @cash_total_kurus, @iban_total_kurus,
        @expected_z_kurus, @entered_z_kurus, @z_difference_kurus, @report_json
      )
      ON CONFLICT(business_day_id) DO UPDATE SET
        generated_at = excluded.generated_at,
        total_revenue_kurus = excluded.total_revenue_kurus,
        order_count = excluded.order_count,
        average_basket_kurus = excluded.average_basket_kurus,
        total_tax_kurus = excluded.total_tax_kurus,
        total_discount_kurus = excluded.total_discount_kurus,
        cancelled_count = excluded.cancelled_count,
        cancelled_total_kurus = excluded.cancelled_total_kurus,
        total_refunds_kurus = excluded.total_refunds_kurus,
        refund_count = excluded.refund_count,
        card_total_kurus = excluded.card_total_kurus,
        cash_total_kurus = excluded.cash_total_kurus,
        iban_total_kurus = excluded.iban_total_kurus,
        expected_z_kurus = excluded.expected_z_kurus,
        entered_z_kurus = excluded.entered_z_kurus,
        z_difference_kurus = excluded.z_difference_kurus,
        report_json = excluded.report_json
    `).run({
      business_day_id: day.id,
      generated_at: r.generatedAt || new Date().toISOString(),
      total_revenue_kurus: toKurus(r.totalRevenue),
      order_count: typeof r.orderCount === 'number' ? r.orderCount : 0,
      average_basket_kurus: toKurus(r.averageBasket),
      total_tax_kurus: toKurus(r.totalTax),
      total_discount_kurus: toKurus(r.totalDiscount),
      cancelled_count: typeof r.cancelledCount === 'number' ? r.cancelledCount : 0,
      cancelled_total_kurus: toKurus(r.cancelledTotal),
      total_refunds_kurus: toKurus(r.totalRefunds),
      refund_count: typeof r.refundCount === 'number' ? r.refundCount : 0,
      card_total_kurus: toKurus(r.paymentDistribution?.card),
      cash_total_kurus: toKurus(r.paymentDistribution?.cash),
      iban_total_kurus: toKurus(r.paymentDistribution?.iban),
      expected_z_kurus: toKurusNullable(r.expectedZ ?? day.expectedZ),
      entered_z_kurus: toKurusNullable(r.enteredZ ?? day.enteredZ),
      z_difference_kurus: toKurusNullable(r.zDifference ?? day.zDifference),
      report_json: serializeReportSnapshot(r),
    })
  } else {
    db.prepare('DELETE FROM z_reports WHERE business_day_id = ?').run(day.id)
  }
}

function saveBusinessDays(db, days) {
  if (!Array.isArray(days)) {
    throw new Error('businessDays dizi (array) olmalıdır.')
  }

  const run = db.transaction((list) => {
    db.prepare('DELETE FROM z_reports').run()
    db.prepare('DELETE FROM business_days').run()
    list.forEach((day, idx) => {
      upsertSingleBusinessDay(db, day, idx)
    })
  })

  run(days)
  return true
}

// ────────────────────────────────────────────────────────────
// 4. Menu Products Repository
// ────────────────────────────────────────────────────────────

function getMenuProducts(db) {
  const rows = db
    .prepare('SELECT * FROM products ORDER BY sort_order ASC, rowid ASC')
    .all()
  if (rows.length === 0) return null

  return rows.map((row) => {
    const product = {
      id: row.id,
      name: row.name,
      description: row.description || '',
      price: fromKurus(row.price_kurus),
      category: row.category,
    }
    if (row.badge) product.badge = row.badge
    if (row.image_url) product.image_url = row.image_url
    const optGroups = deserializeOptionGroups(row.option_groups_json)
    if (optGroups) product.optionGroups = optGroups
    return product
  })
}

function saveMenuProducts(db, products) {
  if (!Array.isArray(products)) {
    throw new Error('menuProducts dizi (array) olmalıdır.')
  }

  const run = db.transaction((list) => {
    db.prepare('DELETE FROM products').run()
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO products (
        id, name, description, price_kurus, category, badge, image_url,
        option_groups_json, sort_order, updated_at
      ) VALUES (
        @id, @name, @description, @price_kurus, @category, @badge, @image_url,
        @option_groups_json, @sort_order, @updated_at
      )
    `)
    list.forEach((p, idx) => {
      stmt.run({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price_kurus: Math.max(0, toKurus(p.price)),
        category: p.category || 'Sıcak Kahveler',
        badge: p.badge ?? null,
        image_url: p.image_url ?? null,
        option_groups_json: serializeOptionGroups(p.optionGroups),
        sort_order: idx,
        updated_at: now,
      })
    })
  })

  run(products)
  return true
}

// ────────────────────────────────────────────────────────────
// 5. Refunds Repository
// ────────────────────────────────────────────────────────────

function getRefunds(db) {
  const rows = db
    .prepare('SELECT * FROM refunds ORDER BY sort_order ASC, rowid ASC')
    .all()

  return rows.map((row) => {
    const refund = {
      id: row.id,
      amount: fromKurus(row.amount_kurus),
      reason: row.reason || 'İade',
    }
    if (row.business_day_id) refund.businessDayId = row.business_day_id
    if (row.order_id) refund.orderId = row.order_id
    if (row.table_id) refund.tableId = row.table_id
    if (row.table_name) refund.tableName = row.table_name
    if (row.order_item_id) refund.orderItemId = row.order_item_id
    if (row.product_name) refund.productName = row.product_name
    if (typeof row.quantity === 'number') refund.quantity = row.quantity

    const unitPrice = fromKurusOptional(row.unit_price_kurus)
    if (unitPrice !== undefined) refund.unitPrice = unitPrice

    if (row.payment_method) refund.paymentMethod = row.payment_method
    if (row.created_at) refund.createdAt = row.created_at
    if (row.created_by) refund.createdBy = row.created_by
    if (row.refunded_at) refund.refundedAt = row.refunded_at
    if (row.refunded_by) refund.refundedBy = row.refunded_by

    if (row.items_json) {
      try {
        const parsed = JSON.parse(row.items_json)
        if (Array.isArray(parsed)) {
          refund.items = parsed.map((ri) => ({
            ...(ri.productId ? { productId: ri.productId } : {}),
            name: ri.name,
            quantity: ri.quantity,
            unitPrice:
              typeof ri.unitPriceKurus === 'number'
                ? fromKurus(ri.unitPriceKurus)
                : Number(ri.unitPrice || 0),
            totalPrice:
              typeof ri.totalPriceKurus === 'number'
                ? fromKurus(ri.totalPriceKurus)
                : Number(ri.totalPrice || 0),
          }))
        }
      } catch {}
    }

    return refund
  })
}

function insertSingleRefund(db, r, sortOrder = 0) {
  let itemsJson = null
  if (Array.isArray(r.items)) {
    itemsJson = JSON.stringify(
      r.items.map((ri) => ({
        ...(ri.productId ? { productId: ri.productId } : {}),
        name: ri.name,
        quantity: ri.quantity,
        unitPriceKurus: toKurus(ri.unitPrice),
        totalPriceKurus: toKurus(ri.totalPrice),
      })),
    )
  }

  db.prepare(`
    INSERT INTO refunds (
      id, business_day_id, order_id, table_id, table_name,
      order_item_id, product_name, quantity, unit_price_kurus,
      amount_kurus, payment_method, reason,
      created_at, created_by, refunded_at, refunded_by, items_json, sort_order
    ) VALUES (
      @id, @business_day_id, @order_id, @table_id, @table_name,
      @order_item_id, @product_name, @quantity, @unit_price_kurus,
      @amount_kurus, @payment_method, @reason,
      @created_at, @created_by, @refunded_at, @refunded_by, @items_json, @sort_order
    )
  `).run({
    id: r.id,
    business_day_id: r.businessDayId ?? null,
    order_id: r.orderId ?? null,
    table_id: r.tableId ?? null,
    table_name: r.tableName ?? null,
    order_item_id: r.orderItemId ?? null,
    product_name: r.productName ?? null,
    quantity: typeof r.quantity === 'number' ? r.quantity : null,
    unit_price_kurus: toKurusNullable(r.unitPrice),
    amount_kurus: Math.max(0, toKurus(r.amount)),
    payment_method: r.paymentMethod ?? null,
    reason: r.reason || 'İade',
    created_at: r.createdAt ?? null,
    created_by: r.createdBy ?? null,
    refunded_at: r.refundedAt ?? null,
    refunded_by: r.refundedBy ?? null,
    items_json: itemsJson,
    sort_order: sortOrder,
  })
}

function saveRefunds(db, refunds) {
  if (!Array.isArray(refunds)) {
    throw new Error('refunds dizi (array) olmalıdır.')
  }

  const run = db.transaction((list) => {
    db.prepare('DELETE FROM refunds').run()
    list.forEach((r, idx) => {
      insertSingleRefund(db, r, idx)
    })
  })

  run(refunds)
  return true
}

// ────────────────────────────────────────────────────────────
// 6. Activity Logs Repository (Hash Zincirli & Append-Only)
// ────────────────────────────────────────────────────────────

function mapRowToActivityLog(row) {
  const log = {
    id: row.id,
    type: row.type,
    userName: row.user_name,
    createdAt: row.created_at,
  }
  if (row.business_day_id) log.businessDayId = row.business_day_id
  if (row.table_name) log.tableName = row.table_name
  if (row.table_id) log.tableId = row.table_id
  if (row.order_id) log.orderId = row.order_id
  if (row.product_name) log.productName = row.product_name

  if (row.old_value_json !== null && row.old_value_json !== undefined) {
    try {
      log.oldValue = JSON.parse(row.old_value_json)
    } catch {
      log.oldValue = row.old_value_json
    }
  }
  if (row.new_value_json !== null && row.new_value_json !== undefined) {
    try {
      log.newValue = JSON.parse(row.new_value_json)
    } catch {
      log.newValue = row.new_value_json
    }
  }

  const amount = fromKurusOptional(row.amount_kurus)
  if (amount !== undefined) log.amount = amount

  if (row.reason) log.reason = row.reason
  if (row.user_role) log.userRole = row.user_role
  if (row.user_id) log.userId = row.user_id
  if (row.details) log.details = row.details
  if (row.prev_hash) log.prevHash = row.prev_hash
  if (row.hash) log.hash = row.hash

  return log
}

function getActivityLogs(db) {
  const rows = db
    .prepare('SELECT * FROM activity_logs ORDER BY sort_order ASC, rowid ASC')
    .all()

  return rows.map(mapRowToActivityLog)
}

function getArchivedActivityLogs(db) {
  try {
    const rows = db
      .prepare('SELECT * FROM activity_logs_archive ORDER BY sort_order ASC, rowid ASC')
      .all()
    return rows.map(mapRowToActivityLog)
  } catch {
    return []
  }
}

function insertSingleActivityLog(db, log, sortOrder = 0) {
  db.prepare(`
    INSERT OR REPLACE INTO activity_logs (
      id, business_day_id, type, table_name, table_id, order_id,
      product_name, old_value_json, new_value_json, amount_kurus,
      reason, user_name, user_role, user_id, created_at, details,
      prev_hash, hash, sort_order
    ) VALUES (
      @id, @business_day_id, @type, @table_name, @table_id, @order_id,
      @product_name, @old_value_json, @new_value_json, @amount_kurus,
      @reason, @user_name, @user_role, @user_id, @created_at, @details,
      @prev_hash, @hash, @sort_order
    )
  `).run({
    id: log.id,
    business_day_id: log.businessDayId ?? null,
    type: log.type,
    table_name: log.tableName ?? null,
    table_id: log.tableId ?? null,
    order_id: log.orderId ?? null,
    product_name: log.productName ?? null,
    old_value_json:
      log.oldValue !== undefined ? JSON.stringify(log.oldValue) : null,
    new_value_json:
      log.newValue !== undefined ? JSON.stringify(log.newValue) : null,
    amount_kurus: toKurusNullable(log.amount),
    reason: log.reason ?? null,
    user_name: log.userName || 'Kullanıcı',
    user_role: log.userRole ?? null,
    user_id: log.userId ?? null,
    created_at: log.createdAt || new Date().toISOString(),
    details: log.details ?? null,
    prev_hash: log.prevHash ?? null,
    hash: log.hash ?? null,
    sort_order: sortOrder,
  })
}

/**
 * Ensures any legacy unhashed records in activity_logs have their hash chain computed once
 * before appending new records. Never modifies records that already have a hash.
 */
function sealLegacyActivityLogsIfNeeded(db) {
  const unhashedCount = db
    .prepare('SELECT COUNT(*) as cnt FROM activity_logs WHERE hash IS NULL OR prev_hash IS NULL')
    .get()
  if (!unhashedCount || unhashedCount.cnt === 0) return

  const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_logs').get()
  // Only auto-seal if ALL existing logs are legacy unhashed records
  if (totalCount && unhashedCount.cnt === totalCount.cnt) {
    const rows = getActivityLogs(db)
    const anchor = getMeta(db, ARCHIVE_ANCHOR_META_KEY) || GENESIS_LOG_HASH
    let currentPrev = anchor
    const updateStmt = db.prepare(
      'UPDATE activity_logs SET prev_hash = ?, hash = ? WHERE id = ?',
    )
    for (let i = rows.length - 1; i >= 0; i--) {
      const item = rows[i]
      const computed = computeActivityLogHashCjs(item, currentPrev)
      updateStmt.run(currentPrev, computed, item.id)
      currentPrev = computed
    }
    if (rows.length > 0) {
      setMeta(db, CHAIN_HEAD_META_KEY, currentPrev)
    }
  }
}

function saveActivityLogs(db, logs) {
  if (!Array.isArray(logs)) {
    throw new Error('activityLogs dizi (array) olmalıdır.')
  }

  // If none of the incoming logs have a hash yet (e.g. legacy migration), compute their chain once.
  // If any log already has a hash, preserve the exact prevHash and hash values so tamper detection works.
  const anyHashed = logs.some((l) => Boolean(l && (l.hash || l.prevHash)))
  let preparedLogs = logs
  if (!anyHashed && logs.length > 0) {
    const anchor = getMeta(db, ARCHIVE_ANCHOR_META_KEY) || GENESIS_LOG_HASH
    let currentPrev = anchor
    const cloned = logs.map((l) => ({ ...l }))
    for (let i = cloned.length - 1; i >= 0; i--) {
      const item = cloned[i]
      item.prevHash = currentPrev
      item.hash = computeActivityLogHashCjs(item, currentPrev)
      currentPrev = item.hash
    }
    preparedLogs = cloned
  }

  const run = db.transaction((list) => {
    db.prepare('DELETE FROM activity_logs').run()
    list.forEach((log, idx) => {
      insertSingleActivityLog(db, log, idx)
    })
    if (list.length > 0 && list[0].hash) {
      setMeta(db, CHAIN_HEAD_META_KEY, list[0].hash)
    } else if (list.length === 0) {
      removeMeta(db, CHAIN_HEAD_META_KEY)
    }
  })

  run(preparedLogs)
  return true
}

function prependActivityLog(db, log) {
  sealLegacyActivityLogsIfNeeded(db)

  const latestRow = db
    .prepare('SELECT hash, sort_order FROM activity_logs ORDER BY sort_order ASC, rowid ASC LIMIT 1')
    .get()

  const minRow = db
    .prepare('SELECT MIN(sort_order) as minOrder FROM activity_logs')
    .get()
  const nextSortOrder =
    minRow && typeof minRow.minOrder === 'number' ? minRow.minOrder - 1 : 0

  const prevHash =
    log.prevHash ||
    (latestRow && latestRow.hash) ||
    getMeta(db, ARCHIVE_ANCHOR_META_KEY) ||
    GENESIS_LOG_HASH

  const normalizedLog = {
    ...log,
    userName: log.userName || 'Kullanıcı',
    createdAt: log.createdAt || new Date().toISOString(),
    prevHash,
  }
  if (!normalizedLog.hash) {
    normalizedLog.hash = computeActivityLogHashCjs(normalizedLog, prevHash)
  }

  insertSingleActivityLog(db, normalizedLog, nextSortOrder)
  setMeta(db, CHAIN_HEAD_META_KEY, normalizedLog.hash)
  return normalizedLog
}

/**
 * Moves activity logs older than `keepCount` into `activity_logs_archive`
 * and links the archive's latest hash as `activity_logs_archive_anchor_hash` in `schema_meta`.
 */
function archiveActivityLogs(db, options = {}) {
  const keepCount =
    typeof options.keepCount === 'number' && options.keepCount >= 0
      ? Math.floor(options.keepCount)
      : 500

  const tx = db.transaction(() => {
    sealLegacyActivityLogsIfNeeded(db)
    const rows = db
      .prepare('SELECT * FROM activity_logs ORDER BY sort_order ASC, rowid ASC')
      .all()

    if (rows.length <= keepCount) {
      return {
        archivedCount: 0,
        remainingCount: rows.length,
        archiveAnchorHash: getMeta(db, ARCHIVE_ANCHOR_META_KEY) || GENESIS_LOG_HASH,
      }
    }

    const toArchive = rows.slice(keepCount) // indices keepCount .. rows.length - 1 (older records)
    const newestArchived = toArchive[0] // index keepCount is the newest of the archived records
    const newAnchorHash = newestArchived.hash || GENESIS_LOG_HASH
    const archivedAt = new Date().toISOString()

    const insertArchiveStmt = db.prepare(`
      INSERT OR REPLACE INTO activity_logs_archive (
        id, business_day_id, type, table_name, table_id, order_id,
        product_name, old_value_json, new_value_json, amount_kurus,
        reason, user_name, user_role, user_id, created_at, details,
        prev_hash, hash, sort_order, archived_at
      ) VALUES (
        @id, @business_day_id, @type, @table_name, @table_id, @order_id,
        @product_name, @old_value_json, @new_value_json, @amount_kurus,
        @reason, @user_name, @user_role, @user_id, @created_at, @details,
        @prev_hash, @hash, @sort_order, @archived_at
      )
    `)
    const deleteActiveStmt = db.prepare('DELETE FROM activity_logs WHERE id = ?')

    for (const r of toArchive) {
      insertArchiveStmt.run({
        ...r,
        archived_at: archivedAt,
      })
      deleteActiveStmt.run(r.id)
    }

    setMeta(db, ARCHIVE_ANCHOR_META_KEY, newAnchorHash)

    return {
      archivedCount: toArchive.length,
      remainingCount: keepCount,
      archiveAnchorHash: newAnchorHash,
    }
  })

  return tx()
}

// ────────────────────────────────────────────────────────────
// 7. Users & User Permissions Repository
// ────────────────────────────────────────────────────────────

function getUsers(db) {
  const rows = db
    .prepare('SELECT * FROM users ORDER BY sort_order ASC, rowid ASC')
    .all()

  return rows.map((row) => {
    const user = {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      role: row.role,
      passwordHash: row.password_hash || '',
      status: row.status === 'inactive' ? 'inactive' : 'active',
      isDeleted: Boolean(row.is_deleted),
      mustChangePassword: Boolean(row.must_change_password),
      createdAt: row.created_at,
    }
    if (row.pin_hash) user.pinHash = row.pin_hash
    if (row.deleted_at) user.deletedAt = row.deleted_at
    if (row.last_login_at) user.lastLoginAt = row.last_login_at
    if (row.created_by) user.createdBy = row.created_by
    return user
  })
}

function saveUsers(db, users) {
  if (!Array.isArray(users)) {
    throw new Error('users dizi (array) olmalıdır.')
  }

  const run = db.transaction((list) => {
    db.prepare('DELETE FROM users').run()
    const stmt = db.prepare(`
      INSERT INTO users (
        id, full_name, username, role, password_hash, pin_hash,
        status, is_deleted, deleted_at, must_change_password,
        last_login_at, created_at, created_by, sort_order
      ) VALUES (
        @id, @full_name, @username, @role, @password_hash, @pin_hash,
        @status, @is_deleted, @deleted_at, @must_change_password,
        @last_login_at, @created_at, @created_by, @sort_order
      )
    `)
    list.forEach((u, idx) => {
      stmt.run({
        id: u.id,
        full_name: u.fullName || '',
        username: u.username,
        role: u.role || 'waiter',
        password_hash: u.passwordHash || '',
        pin_hash: u.pinHash ?? null,
        status: u.status === 'inactive' ? 'inactive' : 'active',
        is_deleted: u.isDeleted ? 1 : 0,
        deleted_at: u.deletedAt ?? null,
        must_change_password: u.mustChangePassword ? 1 : 0,
        last_login_at: u.lastLoginAt ?? null,
        created_at: u.createdAt || new Date().toISOString(),
        created_by: u.createdBy ?? null,
        sort_order: idx,
      })
    })
  })

  run(users)
  return true
}

function getUserPermissionOverridesMap(db) {
  const rows = db.prepare('SELECT * FROM user_permissions').all()
  const map = {}
  for (const row of rows) {
    if (!map[row.user_id]) map[row.user_id] = {}
    map[row.user_id][row.permission_key] = Boolean(row.allowed)
  }
  return map
}

function saveUserPermissionOverridesMap(db, overridesMap, updatedBy = 'Yönetici') {
  const run = db.transaction((mapObj) => {
    db.prepare('DELETE FROM user_permissions').run()
    if (!mapObj || typeof mapObj !== 'object') return
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO user_permissions (user_id, permission_key, allowed, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const [userId, perms] of Object.entries(mapObj)) {
      if (!perms || typeof perms !== 'object') continue
      for (const [permKey, allowed] of Object.entries(perms)) {
        stmt.run(userId, permKey, allowed ? 1 : 0, updatedBy, now)
      }
    }
  })

  run(overridesMap)
  return true
}

// ────────────────────────────────────────────────────────────
// 8. App Settings & Generic Key-Value / Meta Store
// ────────────────────────────────────────────────────────────

function getKvItem(db, key) {
  const row = db
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get(String(key))
  return row ? row.value_json : null
}

function setKvItem(db, key, valueStr) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(String(key), String(valueStr), now)
  return true
}

function removeKvItem(db, key) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(String(key))
  return true
}

function getSettings(db, defaultSettings = {}) {
  const raw = getKvItem(db, 'appSettings')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...defaultSettings, ...parsed }
    }
  } catch {}
  return null
}

function saveSettings(db, settings) {
  if (!settings || typeof settings !== 'object') {
    throw new Error('appSettings geçerli bir nesne olmalıdır.')
  }
  return setKvItem(db, 'appSettings', JSON.stringify(settings))
}

function getMeta(db, key) {
  const row = db
    .prepare('SELECT value FROM schema_meta WHERE key = ?')
    .get(String(key))
  return row ? row.value : null
}

function setMeta(db, key, value) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO schema_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(String(key), String(value), now)
  return true
}

function removeMeta(db, key) {
  db.prepare('DELETE FROM schema_meta WHERE key = ?').run(String(key))
  return true
}

/**
 * Reads the entire database state into a single cohesive object for fast renderer hydration or backup.
 */
function getAllDatabaseState(db) {
  const kvRows = db.prepare('SELECT key, value_json FROM settings').all()
  const kvMap = {}
  for (const r of kvRows) {
    kvMap[r.key] = r.value_json
  }

  const permOverrides = getUserPermissionOverridesMap(db)
  if (Object.keys(permOverrides).length > 0 && !kvMap.appUserPermissionOverrides) {
    kvMap.appUserPermissionOverrides = JSON.stringify(permOverrides)
  }

  return {
    tables: getTables(db),
    completedOrders: getCompletedOrders(db),
    businessDays: getBusinessDays(db),
    menuProducts: getMenuProducts(db),
    appSettings: getSettings(db),
    refunds: getRefunds(db),
    activityLogs: getActivityLogs(db),
    appUsers: getUsers(db),
    userPermissionOverrides: permOverrides,
    kvMap,
    migrationStatus: getMeta(db, 'migration_status'),
    migratedAt: getMeta(db, 'migrated_at'),
  }
}

/**
 * Clears all POS operational data inside a single transaction.
 */
function clearAllOperationalData(db) {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM order_items').run()
    db.prepare('DELETE FROM payments').run()
    db.prepare('DELETE FROM orders').run()
    db.prepare('DELETE FROM z_reports').run()
    db.prepare('DELETE FROM business_days').run()
    db.prepare('DELETE FROM tables').run()
    db.prepare('DELETE FROM products').run()
    db.prepare('DELETE FROM refunds').run()
    db.prepare('DELETE FROM activity_logs').run()
    try {
      db.prepare('DELETE FROM activity_logs_archive').run()
    } catch {}
    db.prepare('DELETE FROM users').run()
    db.prepare('DELETE FROM user_permissions').run()
    db.prepare('DELETE FROM settings').run()
    removeMeta(db, ARCHIVE_ANCHOR_META_KEY)
    removeMeta(db, CHAIN_HEAD_META_KEY)
  })
  run()
  return true
}

module.exports = {
  OPEN_TABLE_ORDER_PREFIX,
  GENESIS_LOG_HASH,
  ARCHIVE_ANCHOR_META_KEY,
  CHAIN_HEAD_META_KEY,
  computeActivityLogHashCjs,
  insertOrderItemsForOrder,
  insertPaymentsForOrder,
  insertSingleCompletedOrder,
  upsertSingleBusinessDay,
  insertSingleRefund,
  insertSingleActivityLog,
  prependActivityLog,
  archiveActivityLogs,
  getArchivedActivityLogs,
  getTables,
  saveTables,
  getCompletedOrders,
  saveCompletedOrders,
  getBusinessDays,
  saveBusinessDays,
  getMenuProducts,
  saveMenuProducts,
  getRefunds,
  saveRefunds,
  getActivityLogs,
  saveActivityLogs,
  getUsers,
  saveUsers,
  getUserPermissionOverridesMap,
  saveUserPermissionOverridesMap,
  getKvItem,
  setKvItem,
  removeKvItem,
  getSettings,
  saveSettings,
  getMeta,
  setMeta,
  removeMeta,
  getAllDatabaseState,
  clearAllOperationalData,
}
