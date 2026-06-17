mod server;
mod window_position;

use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

const WINDOW_OFFSET_Y: i32 = -60;

#[tauri::command]
fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    window_position::save_window_position(window_position::WindowPosition { x, y })
}

#[tauri::command]
fn get_cursor_position(app: tauri::AppHandle) -> Result<(f64, f64), String> {
    let position = app.cursor_position().map_err(|error| error.to_string())?;
    Ok((position.x, position.y))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_window_position,
            get_cursor_position,
        ])
        .setup(|app| {
            server::spawn_state_server(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_shadow(false) {
                    eprintln!("failed to disable Clawd window shadow: {error}");
                }
                window_position::restore_or_offset_window(&window, WINDOW_OFFSET_Y);
            }

            // Create system tray
            let show_item = MenuItem::new(app, "Show Clawd", true, None::<&str>)?;
            let hide_item = MenuItem::new(app, "Hide Clawd", true, None::<&str>)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            // Load custom tray icon from embedded bytes
            let tray_icon_bytes = include_bytes!("../icons/tray-icon.png");
            let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)?;

            let _tray = TrayIconBuilder::with_id("tray-main")
                .icon(tray_icon)
                .icon_as_template(true) // For macOS: makes it adapt to light/dark mode
                .tooltip("Clawd Coding Pet")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    id if id == show_item.id().as_ref() => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                        }
                    }
                    id if id == hide_item.id().as_ref() => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
