use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;
use chrono::{Utc, Duration, NaiveDateTime};

// ──────────────────────────────────────────────
// Data Models
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub category: String,
    pub price: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badge: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub option_groups: Option<String>,
    #[serde(rename = "optionGroups", skip_serializing_if = "Option::is_none")]
    pub option_groups_parsed: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderItem {
    pub id: String,
    pub order_id: String,
    pub product_id: String,
    pub quantity: i32,
    pub unit_price: f64,
    pub line_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: String,
    pub created_at: String,
    pub total_amount: f64,
    pub discount_amount: f64,
    pub payment_type: String,
    pub cashier: String,
    pub status: String,
    #[serde(default)]
    pub items: Vec<OrderItemWithProduct>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderItemWithProduct {
    pub id: String,
    pub order_id: String,
    pub product_id: String,
    pub quantity: i32,
    pub unit_price: f64,
    pub line_total: f64,
    pub product: Product,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryReport {
    pub total_revenue: f64,
    pub total_orders: i32,
    pub avg_basket: f64,
    pub revenue_growth: f64,
    pub orders_growth: f64,
    pub avg_basket_growth: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTrend {
    pub date: String,
    pub revenue: f64,
    pub orders: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentDistribution {
    pub name: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesTrendResponse {
    pub trend: Vec<DailyTrend>,
    pub payment_distribution: Vec<PaymentDistribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopProduct {
    pub id: String,
    pub name: String,
    pub category: String,
    pub quantity: i32,
    pub revenue: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedReceipts {
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
    pub items: Vec<Order>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProductInput {
    pub id: Option<String>,
    pub name: String,
    pub category: String,
    pub price: f64,
    pub description: Option<String>,
    pub badge: Option<String>,
    pub option_groups: Option<String>,
    pub image_data: Option<String>, // base64 encoded image
    pub image_ext: Option<String>,  // file extension
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrderInput {
    pub total_amount: f64,
    pub discount_amount: f64,
    pub payment_type: String,
    pub cashier: String,
    pub items: Vec<CreateOrderItemInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrderItemInput {
    pub product_id: String,
    pub quantity: i32,
    pub unit_price: f64,
    pub line_total: f64,
}

// ──────────────────────────────────────────────
// Database Manager
// ──────────────────────────────────────────────

pub struct Database {
    conn: Connection,
    uploads_dir: PathBuf,
}

impl Database {
    /// Open (or create) the SQLite database at the standard app-data location.
    pub fn new(app_data_dir: &PathBuf) -> Result<Self> {
        std::fs::create_dir_all(app_data_dir).ok();
        let db_path = app_data_dir.join("eco_coffee.db");
        let uploads_dir = app_data_dir.join("uploads");
        std::fs::create_dir_all(&uploads_dir).ok();

        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let db = Database { conn, uploads_dir };
        db.create_tables()?;
        Ok(db)
    }

    /// Import an existing SQLite database file (for migration).
    pub fn import_from(source_path: &std::path::Path, app_data_dir: &PathBuf) -> Result<Self> {
        std::fs::create_dir_all(app_data_dir).ok();
        let target_path = app_data_dir.join("eco_coffee.db");

        if source_path.exists() && !target_path.exists() {
            std::fs::copy(source_path, &target_path).ok();
        }

        Self::new(app_data_dir)
    }

    fn create_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                image_url TEXT,
                description TEXT,
                badge TEXT,
                option_groups TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
            CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                created_at DATETIME DEFAULT (datetime('now')),
                total_amount REAL DEFAULT 0.0,
                discount_amount REAL DEFAULT 0.0,
                payment_type TEXT,
                cashier TEXT,
                status TEXT DEFAULT 'Tamamlandı'
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                quantity INTEGER DEFAULT 1,
                unit_price REAL,
                line_total REAL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
            "
        )?;
        Ok(())
    }

    // ── Products ────────────────────────────────

    pub fn get_all_products(&self) -> Result<Vec<Product>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, price, image_url, description, badge, option_groups FROM products"
        )?;

        let products = stmt.query_map([], |row| {
            let option_groups: Option<String> = row.get(7)?;
            let parsed = option_groups.as_ref().and_then(|og| serde_json::from_str(og).ok());

            Ok(Product {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                price: row.get(3)?,
                image_url: row.get(4)?,
                description: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                badge: row.get(6)?,
                option_groups: option_groups.clone(),
                option_groups_parsed: parsed,
            })
        })?.collect::<Result<Vec<_>>>()?;

        Ok(products)
    }

    pub fn save_product(&self, input: SaveProductInput) -> Result<Product> {
        let mut image_url: Option<String> = None;

        // Handle base64 image data
        if let (Some(ref data), Some(ref ext)) = (&input.image_data, &input.image_ext) {
            if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data) {
                let filename = format!("{}.{}", Uuid::new_v4(), ext);
                let filepath = self.uploads_dir.join(&filename);
                if std::fs::write(&filepath, &bytes).is_ok() {
                    image_url = Some(format!("asset://localhost/uploads/{}", filename));
                }
            }
        }

        let product_id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let description = input.description.unwrap_or_default();
        let badge = input.badge;
        let option_groups = input.option_groups;

        // Upsert: try update first, then insert
        let updated = self.conn.execute(
            "UPDATE products SET name=?1, category=?2, price=?3, description=?4, badge=?5, option_groups=?6, image_url=COALESCE(?7, image_url) WHERE id=?8",
            params![input.name, input.category, input.price, description, badge, option_groups, image_url, product_id],
        )?;

        if updated == 0 {
            // Also check by name
            let existing_by_name: Option<String> = self.conn.query_row(
                "SELECT id FROM products WHERE name = ?1",
                params![input.name],
                |row| row.get(0),
            ).ok();

            if let Some(existing_id) = existing_by_name {
                self.conn.execute(
                    "UPDATE products SET category=?1, price=?2, description=?3, badge=?4, option_groups=?5, image_url=COALESCE(?6, image_url) WHERE id=?7",
                    params![input.category, input.price, description, badge, option_groups, image_url, existing_id],
                )?;
            } else {
                self.conn.execute(
                    "INSERT INTO products (id, name, category, price, description, badge, option_groups, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![product_id, input.name, input.category, input.price, description, badge, option_groups, image_url],
                )?;
            }
        }

        // Fetch and return the saved product
        let product = self.conn.query_row(
            "SELECT id, name, category, price, image_url, description, badge, option_groups FROM products WHERE id=?1 OR name=?2 LIMIT 1",
            params![product_id, input.name],
            |row| {
                let og: Option<String> = row.get(7)?;
                let parsed = og.as_ref().and_then(|s| serde_json::from_str(s).ok());
                Ok(Product {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    price: row.get(3)?,
                    image_url: row.get(4)?,
                    description: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                    badge: row.get(6)?,
                    option_groups: og,
                    option_groups_parsed: parsed,
                })
            }
        )?;

        Ok(product)
    }

    pub fn delete_product(&self, product_id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM products WHERE id = ?1", params![product_id])?;
        Ok(())
    }

    // ── Orders ──────────────────────────────────

    pub fn create_order(&self, input: CreateOrderInput) -> Result<Order> {
        let order_id = Uuid::new_v4().to_string();
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

        self.conn.execute(
            "INSERT INTO orders (id, created_at, total_amount, discount_amount, payment_type, cashier, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'Tamamlandı')",
            params![order_id, now, input.total_amount, input.discount_amount, input.payment_type, input.cashier],
        )?;

        for item in &input.items {
            let item_id = Uuid::new_v4().to_string();
            self.conn.execute(
                "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, line_total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![item_id, order_id, item.product_id, item.quantity, item.unit_price, item.line_total],
            )?;
        }

        Ok(Order {
            id: order_id,
            created_at: now,
            total_amount: input.total_amount,
            discount_amount: input.discount_amount,
            payment_type: input.payment_type,
            cashier: input.cashier,
            status: "Tamamlandı".to_string(),
            items: vec![],
        })
    }

    // ── Reports ─────────────────────────────────

    pub fn get_summary(&self, days: i32) -> Result<SummaryReport> {
        let now = Utc::now();
        let start = (now - Duration::days(days as i64)).format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let prev_start = (now - Duration::days((days * 2) as i64)).format("%Y-%m-%dT%H:%M:%SZ").to_string();

        // Current period
        let (current_revenue, current_count): (f64, i32) = self.conn.query_row(
            "SELECT COALESCE(SUM(total_amount), 0), COUNT(*) FROM orders WHERE created_at >= ?1",
            params![start],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        // Previous period
        let (prev_revenue, prev_count): (f64, i32) = self.conn.query_row(
            "SELECT COALESCE(SUM(total_amount), 0), COUNT(*) FROM orders WHERE created_at >= ?1 AND created_at < ?2",
            params![prev_start, start],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let current_avg = if current_count > 0 { current_revenue / current_count as f64 } else { 0.0 };
        let prev_avg = if prev_count > 0 { prev_revenue / prev_count as f64 } else { 0.0 };

        let calc_growth = |curr: f64, prev: f64| -> f64 {
            if prev == 0.0 { if curr > 0.0 { 100.0 } else { 0.0 } }
            else { ((curr - prev) / prev) * 100.0 }
        };

        Ok(SummaryReport {
            total_revenue: current_revenue,
            total_orders: current_count,
            avg_basket: current_avg,
            revenue_growth: calc_growth(current_revenue, prev_revenue),
            orders_growth: calc_growth(current_count as f64, prev_count as f64),
            avg_basket_growth: calc_growth(current_avg, prev_avg),
        })
    }

    pub fn get_sales_trend(&self, days: i32) -> Result<SalesTrendResponse> {
        let now = Utc::now();
        let start = now - Duration::days(days as i64);
        let start_str = start.format("%Y-%m-%dT%H:%M:%SZ").to_string();

        let mut stmt = self.conn.prepare(
            "SELECT created_at, total_amount, payment_type FROM orders WHERE created_at >= ?1"
        )?;

        let rows = stmt.query_map(params![start_str], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?.collect::<Result<Vec<_>>>()?;

        // Build daily map
        let mut daily: std::collections::BTreeMap<String, (f64, i32)> = std::collections::BTreeMap::new();
        for i in 0..days {
            let d = (start + Duration::days(i as i64)).format("%Y-%m-%d").to_string();
            daily.insert(d, (0.0, 0));
        }

        let mut payment_dist: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

        for (created_at, amount, payment_type) in &rows {
            let date_key = &created_at[..10]; // "YYYY-MM-DD"
            if let Some(entry) = daily.get_mut(date_key) {
                entry.0 += amount;
                entry.1 += 1;
            }
            let pt = payment_type.as_deref().unwrap_or("Nakit").to_string();
            *payment_dist.entry(pt).or_insert(0.0) += amount;
        }

        let trend: Vec<DailyTrend> = daily.into_iter().map(|(date, (revenue, orders))| {
            DailyTrend { date, revenue, orders }
        }).collect();

        let payment_distribution: Vec<PaymentDistribution> = payment_dist.into_iter().map(|(name, value)| {
            PaymentDistribution { name, value }
        }).collect();

        Ok(SalesTrendResponse { trend, payment_distribution })
    }

    pub fn get_top_products(&self, days: i32) -> Result<Vec<TopProduct>> {
        let start = (Utc::now() - Duration::days(days as i64)).format("%Y-%m-%dT%H:%M:%SZ").to_string();

        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.name, p.category, COALESCE(SUM(oi.quantity), 0), COALESCE(SUM(oi.line_total), 0)
             FROM products p
             JOIN order_items oi ON oi.product_id = p.id
             JOIN orders o ON o.id = oi.order_id
             WHERE o.created_at >= ?1
             GROUP BY p.id
             ORDER BY SUM(oi.line_total) DESC
             LIMIT 10"
        )?;

        let products = stmt.query_map(params![start], |row| {
            Ok(TopProduct {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                quantity: row.get(3)?,
                revenue: row.get(4)?,
            })
        })?.collect::<Result<Vec<_>>>()?;

        Ok(products)
    }

    pub fn get_receipts(&self, days: i32, page: i32, page_size: i32) -> Result<PaginatedReceipts> {
        let start = (Utc::now() - Duration::days(days as i64)).format("%Y-%m-%dT%H:%M:%SZ").to_string();

        let total: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM orders WHERE created_at >= ?1",
            params![start],
            |row| row.get(0),
        )?;

        let offset = (page - 1) * page_size;
        let mut stmt = self.conn.prepare(
            "SELECT id, created_at, total_amount, discount_amount, payment_type, cashier, status
             FROM orders WHERE created_at >= ?1
             ORDER BY created_at DESC
             LIMIT ?2 OFFSET ?3"
        )?;

        let orders = stmt.query_map(params![start, page_size, offset], |row| {
            Ok(Order {
                id: row.get(0)?,
                created_at: row.get(1)?,
                total_amount: row.get(2)?,
                discount_amount: row.get(3)?,
                payment_type: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "Nakit".to_string()),
                cashier: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "Kasiyer".to_string()),
                status: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "Tamamlandı".to_string()),
                items: vec![],
            })
        })?.collect::<Result<Vec<_>>>()?;

        Ok(PaginatedReceipts {
            total,
            page,
            page_size,
            items: orders,
        })
    }

    // ── Logo ────────────────────────────────────

    pub fn save_logo(&self, data: &[u8], ext: &str) -> Result<String> {
        let filename = format!("logo.{}", ext);
        let filepath = self.uploads_dir.join(&filename);
        std::fs::write(&filepath, data).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        Ok(format!("asset://localhost/uploads/{}", filename))
    }

    pub fn get_uploads_dir(&self) -> &PathBuf {
        &self.uploads_dir
    }
}
