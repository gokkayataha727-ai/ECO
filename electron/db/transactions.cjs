const {
  OPEN_TABLE_ORDER_PREFIX,
  insertPaymentsForOrder,
  insertSingleCompletedOrder,
  upsertSingleBusinessDay,
  insertSingleRefund,
  prependActivityLog,
  saveTables,
} = require('./repository.cjs')

function maybeFailStep(stepName, options) {
  if (!options) return
  if (typeof options.onStep === 'function') {
    options.onStep(stepName)
  }
  if (options.failAtStep === stepName) {
    throw new Error(`Simulated transaction failure at step: ${stepName}`)
  }
}

/**
 * 1) Adisyon Kapatma (Complete Order + Clear Table + Activity Log) in a single atomic transaction.
 */
function completeOrderTransaction(db, params, options = {}) {
  const { order, tableId, activityLog } = params || {}
  if (!order || !order.id) {
    throw new Error('completeOrderTransaction: Geçerli bir sipariş (order) nesnesi gereklidir.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_insert_order', options)

    // Shift existing non-open orders sort_order by +1 so the new order stays at index 0
    db.prepare("UPDATE orders SET sort_order = sort_order + 1 WHERE state != 'open'").run()
    insertSingleCompletedOrder(db, order, 0)

    maybeFailStep('after_insert_order', options)

    // Clear the table if this was a table order
    if (tableId) {
      const openOrderId = `${OPEN_TABLE_ORDER_PREFIX}${tableId}`
      db.prepare('DELETE FROM orders WHERE id = ?').run(openOrderId)

      maybeFailStep('after_delete_open_order', options)

      db.prepare(`
        UPDATE tables
        SET status = 'empty',
            discount_rate = 0,
            note = '',
            customer_name = '',
            updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), tableId)
    }

    maybeFailStep('after_clear_table', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true, orderId: order.id }
}

/**
 * 2) Ara / Kısmi Ödeme Alma veya Geri Alma (Update Table Payments + Activity Log) in a single atomic transaction.
 */
function updateTablePaymentsTransaction(db, params, options = {}) {
  const { table, activityLog } = params || {}
  if (!table || !table.id) {
    throw new Error('updateTablePaymentsTransaction: Geçerli bir masa (table) nesnesi gereklidir.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_update_payments', options)

    const now = new Date().toISOString()
    const openOrderId = `${OPEN_TABLE_ORDER_PREFIX}${table.id}`

    const existingOpen = db
      .prepare('SELECT id FROM orders WHERE id = ?')
      .get(openOrderId)

    if (!existingOpen) {
      db.prepare(`
        INSERT INTO orders (
          id, order_number, state, table_id, table_name,
          subtotal_kurus, discount_kurus, total_kurus, discount_rate, tax_rate,
          date, note, customer_name, cancelled, reopened, sort_order
        ) VALUES (?, ?, 'open', ?, ?, 0, 0, 0, ?, 10, ?, ?, ?, 0, 0, 0)
      `).run(
        openOrderId,
        table.name,
        table.id,
        table.name,
        table.discountRate || 0,
        now,
        table.note ?? null,
        table.customerName ?? null,
      )
    }

    db.prepare('DELETE FROM payments WHERE order_id = ?').run(openOrderId)
    if (Array.isArray(table.payments) && table.payments.length > 0) {
      insertPaymentsForOrder(db, openOrderId, table.id, table.payments)
    }

    maybeFailStep('after_update_payments', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true }
}

/**
 * 3) İade İşlemi (Ürün İadesi veya Tüm Masa İadesi: Insert Refund + Update Table + Activity Log)
 */
function refundTransaction(db, params, options = {}) {
  const { refund, updatedTables, activityLog } = params || {}
  if (!refund || !refund.id) {
    throw new Error('refundTransaction: Geçerli bir iade (refund) nesnesi gereklidir.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_insert_refund', options)

    db.prepare('UPDATE refunds SET sort_order = sort_order + 1').run()
    insertSingleRefund(db, refund, 0)

    maybeFailStep('after_insert_refund', options)

    if (Array.isArray(updatedTables)) {
      saveTables(db, updatedTables)
    }

    maybeFailStep('after_update_tables', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true, refundId: refund.id }
}

/**
 * 4) Adisyon Geri Açma (Mark Order Reopened + Restore Items/Payments to Table + Activity Log)
 */
function reopenOrderTransaction(db, params, options = {}) {
  const {
    orderId,
    reopenedAt,
    reopenedBy,
    reopenReason,
    updatedTables,
    activityLog,
  } = params || {}

  if (!orderId) {
    throw new Error('reopenOrderTransaction: orderId zorunludur.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_mark_reopened', options)

    const info = db.prepare(`
      UPDATE orders
      SET state = 'reopened',
          reopened = 1,
          reopened_at = ?,
          reopened_by = ?,
          reopen_reason = ?
      WHERE id = ?
    `).run(
      reopenedAt || new Date().toISOString(),
      reopenedBy || 'Yönetici',
      reopenReason || 'Geri açıldı',
      orderId,
    )

    if (info.changes === 0) {
      throw new Error(`Geri açılacak sipariş bulunamadı: ${orderId}`)
    }

    maybeFailStep('after_mark_reopened', options)

    if (Array.isArray(updatedTables)) {
      saveTables(db, updatedTables)
    }

    maybeFailStep('after_restore_table', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true, orderId }
}

/**
 * 5) İş Günü Açma (Verify No Open Day + Insert Open BusinessDay + Activity Log)
 */
function openBusinessDayTransaction(db, params, options = {}) {
  const { businessDay, activityLog } = params || {}
  if (!businessDay || !businessDay.id) {
    throw new Error('openBusinessDayTransaction: Geçerli bir iş günü nesnesi gereklidir.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_check_open_day', options)

    const existingOpen = db
      .prepare("SELECT id FROM business_days WHERE status = 'open' LIMIT 1")
      .get()
    if (existingOpen) {
      throw new Error('Zaten açık bir iş günü mevcut.')
    }

    db.prepare('UPDATE business_days SET sort_order = sort_order + 1').run()
    upsertSingleBusinessDay(db, { ...businessDay, status: 'open' }, 0)

    maybeFailStep('after_insert_open_day', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true, businessDayId: businessDay.id }
}

/**
 * 6) İş Günü Kapatma (Close BusinessDay + Save Z Report Snapshot + Activity Log)
 */
function closeBusinessDayTransaction(db, params, options = {}) {
  const { closedDay, activityLog } = params || {}
  if (!closedDay || !closedDay.id) {
    throw new Error('closeBusinessDayTransaction: Geçerli bir iş günü nesnesi gereklidir.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_close_day', options)

    const existing = db
      .prepare('SELECT id, status, sort_order FROM business_days WHERE id = ?')
      .get(closedDay.id)
    if (!existing || existing.status !== 'open') {
      throw new Error('Kapatılacak açık iş günü bulunamadı veya zaten kapatılmış.')
    }

    upsertSingleBusinessDay(
      db,
      { ...closedDay, status: 'closed' },
      existing.sort_order,
    )

    maybeFailStep('after_save_z_report', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true, businessDayId: closedDay.id }
}

/**
 * 7) Masa Taşıma / Birleştirme / Ayırma (Update Source & Target Tables + Activity Log)
 */
function transferMergeSplitTableTransaction(db, params, options = {}) {
  const { updatedTables, activityLog } = params || {}
  if (!Array.isArray(updatedTables)) {
    throw new Error('transferMergeSplitTableTransaction: updatedTables dizisi gereklidir.')
  }

  const tx = db.transaction(() => {
    maybeFailStep('before_save_tables', options)

    saveTables(db, updatedTables)

    maybeFailStep('after_save_tables', options)

    if (activityLog && activityLog.id) {
      prependActivityLog(db, activityLog)
    }

    maybeFailStep('before_commit', options)
  })

  tx()
  return { success: true }
}

module.exports = {
  completeOrderTransaction,
  updateTablePaymentsTransaction,
  refundTransaction,
  reopenOrderTransaction,
  openBusinessDayTransaction,
  closeBusinessDayTransaction,
  transferMergeSplitTableTransaction,
}
