mod server;
mod window_position;

use tauri::Manager;

const WINDOW_OFFSET_Y: i32 = -60;

#[tauri::command]
fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    window_position::save_window_position(window_position::WindowPosition { x, y })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_window_position])
        .setup(|app| {
            server::spawn_state_server(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_shadow(false) {
                    eprintln!("failed to disable Clawd window shadow: {error}");
                }
                if let Err(error) = window.set_ignore_cursor_events(true) {
                    eprintln!("failed to enable Clawd window mouse passthrough: {error}");
                }
                window_position::restore_or_offset_window(&window, WINDOW_OFFSET_Y);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
