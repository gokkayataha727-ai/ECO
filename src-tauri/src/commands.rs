use tauri::State;
use std::sync::Mutex;
use crate::db::{
    Database, Product, SaveProductInput, CreateOrderInput,
    SummaryReport, SalesTrendResponse, TopProduct, PaginatedReceipts, Order,
};

pub struct DbState(pub Mutex<Database>);

// ──────────────────────────────────────────────
// Product Commands
// ──────────────────────────────────────────────

#[tauri::command]
pub fn get_products(state: State<DbState>) -> Result<Vec<Product>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.get_all_products().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_product(state: State<DbState>, input: SaveProductInput) -> Result<Product, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.save_product(input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_product(state: State<DbState>, product_id: String) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.delete_product(&product_id).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────────
// Order Commands
// ──────────────────────────────────────────────

#[tauri::command]
pub fn create_order(state: State<DbState>, input: CreateOrderInput) -> Result<Order, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.create_order(input).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────────
// Report Commands
// ──────────────────────────────────────────────

#[tauri::command]
pub fn get_summary(state: State<DbState>, days: i32) -> Result<SummaryReport, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.get_summary(days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sales_trend(state: State<DbState>, days: i32) -> Result<SalesTrendResponse, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.get_sales_trend(days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_top_products(state: State<DbState>, days: i32) -> Result<Vec<TopProduct>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.get_top_products(days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_receipts(
    state: State<DbState>,
    days: i32,
    page: i32,
    page_size: i32,
) -> Result<PaginatedReceipts, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.get_receipts(days, page, page_size).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────────
// Logo Upload
// ──────────────────────────────────────────────

#[tauri::command]
pub fn upload_logo(
    state: State<DbState>,
    data: String,    // base64 encoded
    ext: String,     // e.g. "png"
) -> Result<String, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| e.to_string())?;
    db.save_logo(&bytes, &ext).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────────
// Customer Display Window
// ──────────────────────────────────────────────

#[tauri::command]
pub async fn open_customer_display(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    // Check if window already exists
    if let Some(window) = app.get_webview_window("customer-display") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Try to find the secondary monitor
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;

    let secondary_monitor = monitors.iter().find(|m| {
        if let Some(ref primary) = primary {
            m.position() != primary.position()
        } else {
            false
        }
    });

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "customer-display",
        tauri::WebviewUrl::App("/customer-display.html".into()),
    )
    .title("ECO COFFEE - Müşteri Ekranı")
    .decorations(false)
    .resizable(false)
    .always_on_top(true);

    if let Some(monitor) = secondary_monitor {
        let pos = monitor.position();
        let size = monitor.size();
        builder = builder
            .position(pos.x as f64, pos.y as f64)
            .inner_size(size.width as f64, size.height as f64)
            .fullscreen(true);
    } else {
        // No secondary monitor — open as a smaller window
        builder = builder
            .inner_size(800.0, 600.0)
            .center();
    }

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_customer_display(
    app: tauri::AppHandle,
    cart_json: String,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("customer-display") {
        window.emit("cart-update", &cart_json).map_err(|e| e.to_string())?;
    }
    Ok(())
}
