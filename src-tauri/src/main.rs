// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let err_msg = format!("CRASH: {:?}", info);
        let _ = std::fs::write("C:\\eco_hata.txt", &err_msg);
    }));
    eco_coffee_pos_lib::run();
}
