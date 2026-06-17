mod server;
mod window_position;

#[cfg(not(target_os = "macos"))]
use enigo::Mouse;
use tauri::Manager;

const WINDOW_OFFSET_Y: i32 = -60;

#[tauri::command]
fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    window_position::save_window_position(window_position::WindowPosition { x, y })
}

#[tauri::command]
fn get_cursor_position() -> Result<(f64, f64), String> {
    #[cfg(target_os = "macos")]
    {
        use core_graphics::display::{CGDisplayBounds, CGMainDisplayID};
        use core_graphics::event::CGEvent;
        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

        let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
            .map_err(|_| "Failed to create CGEventSource")?;
        let event = CGEvent::new(source).map_err(|_| "Failed to create CGEvent")?;
        let point = event.location();

        unsafe {
            let main_display = CGMainDisplayID();
            let bounds = CGDisplayBounds(main_display);
            let screen_height = bounds.size.height;
            // Core Graphics uses bottom-left origin, flip to top-left
            let flipped_y = screen_height - point.y;
            Ok((point.x as f64, flipped_y as f64))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        use enigo::Mouse;
        let enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|error| error.to_string())?;
        enigo.location()
            .map(|(x, y)| (x as f64, y as f64))
            .map_err(|error| error.to_string())
    }
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
