mod prefs;
mod server;
mod window_position;

use prefs::{load_prefs, save_prefs, Preferences};

use tauri::{Emitter, Manager, WebviewWindowBuilder};
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

#[tauri::command]
fn load_preferences() -> Result<Preferences, String> {
    Ok(load_prefs())
}

#[tauri::command]
fn save_preferences(app: tauri::AppHandle, prefs: Preferences) -> Result<(), String> {
    save_prefs(&prefs)?;
    app.emit("preferences-changed", prefs)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    // Check if window already exists
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_focus();
        return Ok(());
    }

    // Create new settings window
    WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("/settings".into()))
        .title("CodingPet 设置")
        .inner_size(580.0, 520.0)
        .min_inner_size(500.0, 400.0)
        .resizable(true)
        .decorations(true)
        .transparent(false)
        .always_on_top(false)
        .visible(true)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(enabled).map_err(|error| error.to_string())?;
    }
    Ok(())
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
            load_preferences,
            save_preferences,
            open_settings_window,
            set_always_on_top,
        ])
        .setup(|app| {
            server::spawn_state_server(app.handle().clone());
            let prefs = load_prefs();
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_shadow(false) {
                    eprintln!("failed to disable Clawd window shadow: {error}");
                }
                window_position::restore_or_offset_window(&window, WINDOW_OFFSET_Y);
                // Apply saved preferences
                let _ = window.set_always_on_top(prefs.always_on_top);
            }

            // Create system tray
            let show_item = MenuItem::new(app, "显示 Clawd", true, None::<&str>)?;
            let hide_item = MenuItem::new(app, "隐藏 Clawd", true, None::<&str>)?;
            let settings_item = MenuItem::new(app, "设置", true, None::<&str>)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("退出"))?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &settings_item, &quit_item])?;

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
                    id if id == settings_item.id().as_ref() => {
                        let _ = open_settings_window(app.clone());
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
