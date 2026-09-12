mod db;
mod commands;

use commands::DbState;
use db::Database;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            use tauri::Manager;

            // Get the app data directory for storing the database
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");

            // Try to import existing database from the backend directory (migration)
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()));

            let db = if let Some(ref exe_dir) = exe_dir {
                // Check common locations for existing db
                let possible_paths = vec![
                    exe_dir.join("backend").join("eco_coffee.db"),
                    exe_dir.join("eco_coffee.db"),
                    // During development, look in the project root
                    std::path::PathBuf::from("backend/eco_coffee.db"),
                ];

                let mut imported = None;
                for path in possible_paths {
                    if path.exists() {
                        match Database::import_from(&path, &app_data_dir) {
                            Ok(db) => {
                                println!("✅ Database imported from: {:?}", path);
                                imported = Some(db);
                                break;
                            }
                            Err(e) => {
                                eprintln!("⚠️ Failed to import database from {:?}: {}", path, e);
                            }
                        }
                    }
                }

                imported.unwrap_or_else(|| {
                    Database::new(&app_data_dir).expect("Failed to create database")
                })
            } else {
                Database::new(&app_data_dir).expect("Failed to create database")
            };

            app.manage(DbState(Mutex::new(db)));

            // Enable autostart
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart = app.autolaunch();
                let _ = autostart.enable();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_products,
            commands::save_product,
            commands::delete_product,
            commands::create_order,
            commands::get_summary,
            commands::get_sales_trend,
            commands::get_top_products,
            commands::get_receipts,
            commands::upload_logo,
            commands::open_customer_display,
            commands::update_customer_display,
        ])
        .run(tauri::generate_context!())
        .expect("Uygulama başlatılamadı");
}
