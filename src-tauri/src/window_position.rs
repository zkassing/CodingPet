use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{PhysicalPosition, Position, WebviewWindow};

const POSITION_FILE_NAME: &str = "codingpet-window.json";
const VISIBLE_MARGIN: i32 = 50;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

pub fn load_window_position() -> Option<WindowPosition> {
    let path = config_path()?;
    let body = fs::read_to_string(path).ok()?;
    serde_json::from_str(&body).ok()
}

pub fn save_window_position(position: WindowPosition) -> Result<(), String> {
    let path = config_path().ok_or_else(|| "home directory is unavailable".to_string())?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let body = serde_json::to_string_pretty(&position).map_err(|error| error.to_string())?;
    fs::write(path, format!("{body}\n")).map_err(|error| error.to_string())
}

pub fn restore_or_offset_window(window: &WebviewWindow, offset_y: i32) {
    if let Some(position) = load_window_position() {
        let position = clamp_to_visible_area(window, position).unwrap_or(position);
        if set_window_position(window, position).is_ok() {
            return;
        }
    }
    offset_window(window, offset_y);
}

fn config_path() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".clawd").join(POSITION_FILE_NAME))
}

fn offset_window(window: &WebviewWindow, offset_y: i32) {
    match window.outer_position() {
        Ok(position) => {
            let next_position = WindowPosition {
                x: position.x,
                y: position.y + offset_y,
            };
            if let Err(error) = set_window_position(window, next_position) {
                eprintln!("failed to offset Clawd window: {error}");
            }
        }
        Err(error) => eprintln!("failed to read Clawd window position: {error}"),
    }
}

fn set_window_position(window: &WebviewWindow, position: WindowPosition) -> Result<(), String> {
    window
        .set_position(Position::Physical(PhysicalPosition::new(position.x, position.y)))
        .map_err(|error| error.to_string())
}

fn clamp_to_visible_area(
    window: &WebviewWindow,
    position: WindowPosition,
) -> Result<WindowPosition, String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or_else(|| "no monitor available".to_string())?;
    let work_area = monitor.work_area();
    let size = window.outer_size().map_err(|error| error.to_string())?;

    let min_x = work_area.position.x - size.width as i32 + VISIBLE_MARGIN;
    let min_y = work_area.position.y - size.height as i32 + VISIBLE_MARGIN;
    let max_x = work_area.position.x + work_area.size.width as i32 - VISIBLE_MARGIN;
    let max_y = work_area.position.y + work_area.size.height as i32 - VISIBLE_MARGIN;

    Ok(WindowPosition {
        x: position.x.clamp(min_x, max_x),
        y: position.y.clamp(min_y, max_y),
    })
}
