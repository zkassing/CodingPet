mod server;

use tauri::{Manager, PhysicalPosition, Position};

const WINDOW_OFFSET_Y: i32 = 60;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            server::spawn_state_server(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                match window.outer_position() {
                    Ok(position) => {
                        let next_position = PhysicalPosition::new(position.x, position.y + WINDOW_OFFSET_Y);
                        if let Err(error) = window.set_position(Position::Physical(next_position)) {
                            eprintln!("failed to offset Clawd window: {error}");
                        }
                    }
                    Err(error) => eprintln!("failed to read Clawd window position: {error}"),
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
