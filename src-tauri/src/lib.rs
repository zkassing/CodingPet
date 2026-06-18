mod agent_hooks;
mod prefs;
mod server;
mod window_position;

use prefs::{load_prefs, save_prefs, Preferences};

use tauri::{Emitter, Manager, WebviewWindowBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::menu::{ContextMenu, Menu, MenuItem, PredefinedMenuItem};

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

#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("tray-main") {
        tray.set_visible(visible).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_click_through(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_ignore_cursor_events(enabled).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_right_click_menu(app: tauri::AppHandle) -> Result<(), String> {
    let settings_item = MenuItem::new(&app, "设置", true, None::<&str>)
        .map_err(|error| error.to_string())?;

    let settings_id = settings_item.id().clone();

    let menu = Menu::with_items(&app, &[&settings_item])
        .map_err(|error| error.to_string())?;

    // Listen for menu events on any menu item and check if it's our settings item
    app.on_menu_event(move |app_handle, event| {
        if event.id() == &settings_id {
            let _ = open_settings_window(app_handle.clone());
        }
    });

    // Show menu at cursor position on the main window
    if let Some(window) = app.get_webview_window("main") {
        menu.popup(window.as_ref().window().clone())
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn set_auto_start_enabled(enabled: bool) -> Result<(), String> {
    use std::process::Command;

    if enabled {
        let applescript = "tell application \"System Events\" to make login item at end with properties {path:\"/Applications/CodingPet.app\", hidden:false}";
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(applescript)
            .output()
            .map_err(|e| e.to_string())?;
    } else {
        let applescript = "tell application \"System Events\" to delete login item \"CodingPet.app\"";
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(applescript)
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_auto_start_enabled(enabled: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    let key = hkcu.open_subkey_with_flags(path, KEY_SET_VALUE).map_err(|e| e.to_string())?;

    if enabled {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value("CodingPet", &exe_path.to_string_lossy().to_string())
            .map_err(|e| e.to_string())?;
    } else {
        let _ = key.delete_value("CodingPet");
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn set_auto_start_enabled(_enabled: bool) -> Result<(), String> {
    Err("Auto-start is only supported on macOS and Windows".to_string())
}

#[tauri::command]
fn set_auto_start(enabled: bool) -> Result<(), String> {
    set_auto_start_enabled(enabled)
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
            set_tray_visible,
            set_click_through,
            set_auto_start,
            show_right_click_menu,
            agent_hooks::list_agent_hooks,
            agent_hooks::install_agent_hook,
            agent_hooks::uninstall_agent_hook,
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
                let _ = window.set_ignore_cursor_events(prefs.click_through);
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

            let tray = TrayIconBuilder::with_id("tray-main")
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

            // Apply tray visibility preference
            let _ = tray.set_visible(prefs.show_tray);

            // Spawn periodic update checker if enabled
            if prefs.auto_update_check {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Check every 24 hours
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60 * 60 * 24));
                    loop {
                        interval.tick().await;
                        // Reload prefs to check if still enabled
                        let current_prefs = load_prefs();
                        if !current_prefs.auto_update_check {
                            break;
                        }
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.emit("check-for-updates", ());
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
