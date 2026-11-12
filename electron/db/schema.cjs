/**
 * SQLite Schema & Versioned Migration Infrastructure
 * Uses PRAGMA user_version to track schema version and runs migrations inside atomic transactions.
 */

const CURRENT_SCHEMA_VERSION = 1

const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial POS relational schema with integer kuruş monetary columns',
    up(db) {
      db.exec(`
        -- 1. Schema & Migration Metadata
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        -- 2. Menu Products
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          price_kurus INTEGER NOT NULL CHECK (price_kurus >= 0),
          category TEXT NOT NULL,
          badge TEXT,
          image_url TEXT,
          option_groups_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        -- 3. Tables (Masalar)
        CREATE TABLE IF NOT EXISTS tables (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'occupied')),
          note TEXT,
          customer_name TEXT,
          discount_rate REAL NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        -- 4. Business Days (İş Günleri)
        CREATE TABLE IF NOT EXISTS business_days (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
          opened_at TEXT NOT NULL,
          opened_by TEXT NOT NULL,
          opening_cash_kurus INTEGER NOT NULL DEFAULT 0,
          closed_at TEXT,
          closed_by TEXT,
          counted_cash_kurus INTEGER,
          closing_cash_kurus INTEGER,
          expected_cash_kurus INTEGER,
          cash_difference_kurus INTEGER,
          note TEXT,
          close_note TEXT,
          expected_z_kurus INTEGER,
          entered_z_kurus INTEGER,
          z_difference_kurus INTEGER,
          extra_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_business_days_status ON business_days(status);

        -- 5. Z Reports (Gün Sonu Raporları)
        CREATE TABLE IF NOT EXISTS z_reports (
          business_day_id TEXT PRIMARY KEY REFERENCES business_days(id) ON DELETE CASCADE,
          generated_at TEXT NOT NULL,
          total_revenue_kurus INTEGER NOT NULL DEFAULT 0,
          order_count INTEGER NOT NULL DEFAULT 0,
          average_basket_kurus INTEGER NOT NULL DEFAULT 0,
          total_tax_kurus INTEGER NOT NULL DEFAULT 0,
          total_discount_kurus INTEGER NOT NULL DEFAULT 0,
          cancelled_count INTEGER NOT NULL DEFAULT 0,
          cancelled_total_kurus INTEGER NOT NULL DEFAULT 0,
          total_refunds_kurus INTEGER NOT NULL DEFAULT 0,
          refund_count INTEGER NOT NULL DEFAULT 0,
          card_total_kurus INTEGER NOT NULL DEFAULT 0,
          cash_total_kurus INTEGER NOT NULL DEFAULT 0,
          iban_total_kurus INTEGER NOT NULL DEFAULT 0,
          expected_z_kurus INTEGER,
          entered_z_kurus INTEGER,
          z_difference_kurus INTEGER,
          report_json TEXT NOT NULL
        );

        -- 6. Orders (Hem açık masa siparişleri hem tamamlanmış/iptal/geri açılmış siparişler)
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          order_number TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('open', 'completed', 'cancelled', 'reopened')),
          table_id TEXT,
          table_name TEXT,
          business_day_id TEXT,
          subtotal_kurus INTEGER NOT NULL DEFAULT 0,
          discount_kurus INTEGER NOT NULL DEFAULT 0,
          total_kurus INTEGER NOT NULL DEFAULT 0,
          discount_rate REAL NOT NULL DEFAULT 0,
          tax_rate REAL NOT NULL DEFAULT 10,
          payment_method TEXT,
          date TEXT NOT NULL,
          note TEXT,
          customer_name TEXT,
          cashier TEXT,
          cancelled INTEGER NOT NULL DEFAULT 0,
          cancelled_at TEXT,
          reopened INTEGER NOT NULL DEFAULT 0,
          reopened_at TEXT,
          reopen_reason TEXT,
          reopened_by TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
        CREATE INDEX IF NOT EXISTS idx_orders_business_day ON orders(business_day_id);
        CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);

        -- 7. Order Items (Sipariş ve Masa Sepet Kalemleri)
        CREATE TABLE IF NOT EXISTS order_items (
          order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          cart_item_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          product_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL,
          unit_price_kurus INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          badge TEXT,
          image_url TEXT,
          option_groups_json TEXT,
          selected_options_json TEXT,
          item_discount_type TEXT,
          item_discount_value_kurus INTEGER,
          item_discount_raw REAL,
          batch_id TEXT,
          batch_number INTEGER,
          added_at TEXT,
          added_by TEXT,
          updated_at TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          refunded_qty INTEGER,
          refund_reason TEXT,
          refunded_at TEXT,
          refunded_by TEXT,
          PRIMARY KEY (order_id, cart_item_id, sort_order)
        );
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

        -- 8. Payments (Kısmi ve Tam Ödemeler)
        CREATE TABLE IF NOT EXISTS payments (
          order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          table_id TEXT,
          business_day_id TEXT,
          method TEXT NOT NULL,
          amount_kurus INTEGER NOT NULL,
          received_amount_kurus INTEGER,
          change_kurus INTEGER,
          created_at TEXT NOT NULL,
          cashier TEXT,
          user_id TEXT,
          is_manual_amount INTEGER,
          selected_items_total_kurus INTEGER,
          paid_items_json TEXT,
          PRIMARY KEY (order_id, id, sort_order)
        );
        CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
        CREATE INDEX IF NOT EXISTS idx_payments_business_day ON payments(business_day_id);

        -- 9. Refunds (İadeler)
        CREATE TABLE IF NOT EXISTS refunds (
          id TEXT PRIMARY KEY,
          business_day_id TEXT,
          order_id TEXT,
          table_id TEXT,
          table_name TEXT,
          order_item_id TEXT,
          product_name TEXT,
          quantity INTEGER,
          unit_price_kurus INTEGER,
          amount_kurus INTEGER NOT NULL,
          payment_method TEXT,
          reason TEXT NOT NULL,
          created_at TEXT,
          created_by TEXT,
          refunded_at TEXT,
          refunded_by TEXT,
          items_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_refunds_business_day ON refunds(business_day_id);

        -- 10. Users (Kullanıcılar)
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          username TEXT NOT NULL,
          role TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          pin_hash TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          created_by TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

        -- 11. User Permission Overrides
        CREATE TABLE IF NOT EXISTS user_permissions (
          user_id TEXT NOT NULL,
          permission_key TEXT NOT NULL,
          allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)),
          updated_by TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, permission_key)
        );

        -- 12. Settings & Key-Value Store
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        -- 13. Activity Logs (İşlem Logu — Hash Zincirli & Append-Only)
        CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY,
          business_day_id TEXT,
          type TEXT NOT NULL,
          table_name TEXT,
          table_id TEXT,
          order_id TEXT,
          product_name TEXT,
          old_value_json TEXT,
          new_value_json TEXT,
          amount_kurus INTEGER,
          reason TEXT,
          user_name TEXT NOT NULL,
          user_role TEXT,
          user_id TEXT,
          created_at TEXT NOT NULL,
          details TEXT,
          prev_hash TEXT,
          hash TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_business_day ON activity_logs(business_day_id);

        -- 14. Activity Logs Archive (Arşivlenmiş İşlem Logları)
        CREATE TABLE IF NOT EXISTS activity_logs_archive (
          id TEXT PRIMARY KEY,
          business_day_id TEXT,
          type TEXT NOT NULL,
          table_name TEXT,
          table_id TEXT,
          order_id TEXT,
          product_name TEXT,
          old_value_json TEXT,
          new_value_json TEXT,
          amount_kurus INTEGER,
          reason TEXT,
          user_name TEXT NOT NULL,
          user_role TEXT,
          user_id TEXT,
          created_at TEXT NOT NULL,
          details TEXT,
          prev_hash TEXT,
          hash TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_logs_archive_created_at ON activity_logs_archive(created_at DESC);
      `)
    },
  },
]

/**
 * Ensures hash-chain columns (`prev_hash`, `hash`) and `activity_logs_archive` table
 * exist on already-migrated v1 databases without altering PRAGMA user_version.
 * @param {import('better-sqlite3').Database} db
 */
function ensureActivityLogChainSchema(db) {
  try {
    const cols = db.pragma('table_info(activity_logs)')
    if (Array.isArray(cols) && cols.length > 0) {
      const colNames = new Set(cols.map((c) => c.name))
      if (!colNames.has('prev_hash')) {
        db.exec('ALTER TABLE activity_logs ADD COLUMN prev_hash TEXT')
      }
      if (!colNames.has('hash')) {
        db.exec('ALTER TABLE activity_logs ADD COLUMN hash TEXT')
      }
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs_archive (
        id TEXT PRIMARY KEY,
        business_day_id TEXT,
        type TEXT NOT NULL,
        table_name TEXT,
        table_id TEXT,
        order_id TEXT,
        product_name TEXT,
        old_value_json TEXT,
        new_value_json TEXT,
        amount_kurus INTEGER,
        reason TEXT,
        user_name TEXT NOT NULL,
        user_role TEXT,
        user_id TEXT,
        created_at TEXT NOT NULL,
        details TEXT,
        prev_hash TEXT,
        hash TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_archive_created_at ON activity_logs_archive(created_at DESC);
    `)
  } catch {}
}

/**
 * Returns the current PRAGMA user_version of the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getSchemaVersion(db) {
  const version = db.pragma('user_version', { simple: true })
  return typeof version === 'number' ? version : 0
}

/**
 * Runs pending schema migrations up to targetVersion.
 * Each migration step runs inside an atomic transaction вместе with updating PRAGMA user_version.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @param {number} [options.targetVersion]
 * @param {Array<{version: number, description?: string, up: (db: any) => void}>} [options.migrations]
 * @returns {{ previousVersion: number, currentVersion: number, appliedVersions: number[] }}
 */
function runSchemaMigrations(db, options = {}) {
  const migrations = options.migrations || MIGRATIONS
  const targetVersion =
    typeof options.targetVersion === 'number' ? options.targetVersion : CURRENT_SCHEMA_VERSION

  const previousVersion = getSchemaVersion(db)
  const appliedVersions = []

  const sorted = [...migrations].sort((a, b) => a.version - b.version)

  for (const migration of sorted) {
    const currentVer = getSchemaVersion(db)
    if (migration.version <= currentVer) continue
    if (migration.version > targetVersion) break

    const applySingle = db.transaction(() => {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO schema_meta (key, value, updated_at)
         VALUES ('schema_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(String(migration.version), now)
    })

    applySingle()
    appliedVersions.push(migration.version)
  }

  ensureActivityLogChainSchema(db)

  return {
    previousVersion,
    currentVersion: getSchemaVersion(db),
    appliedVersions,
  }
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  getSchemaVersion,
  runSchemaMigrations,
  ensureActivityLogChainSchema,
}
