use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

const PREFS_FILE_NAME: &str = "codingpet-prefs.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Preferences {
    pub version: u32,
    pub size: f64,
    pub lang: String,
    pub show_tray: bool,
    pub auto_start: bool,
    pub auto_update_check: bool,
    pub always_on_top: bool,
    pub click_through: bool,
    /// Custom Clawd body color (hex string like "#4A90D9").
    /// None / missing in old prefs files means "use default #DE886D".
    /// Option<...> makes this backward-compatible without a version migration.
    #[serde(default)]
    pub body_color: Option<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            version: 1,
            size: 1.0,
            lang: "zh".to_string(),
            show_tray: true,
            auto_start: false,
            auto_update_check: true,
            always_on_top: true,
            click_through: false,
            body_color: None,
        }
    }
}

fn config_path() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".clawd").join(PREFS_FILE_NAME))
}

pub fn load_prefs() -> Preferences {
    let path = match config_path() {
        Some(p) => p,
        None => return Preferences::default(),
    };

    if !path.exists() {
        return Preferences::default();
    }

    match fs::read_to_string(&path) {
        Ok(body) => match serde_json::from_str::<Preferences>(&body) {
            Ok(mut prefs) => {
                // Migrate if needed
                if prefs.version < 1 {
                    prefs.version = 1;
                }
                prefs
            }
            Err(_) => {
                // Backup bad file
                let _ = fs::rename(&path, path.with_extension("json.bak"));
                Preferences::default()
            }
        },
        Err(_) => Preferences::default(),
    }
}

pub fn save_prefs(prefs: &Preferences) -> Result<(), String> {
    let path = config_path().ok_or_else(|| "home directory is unavailable".to_string())?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let body = serde_json::to_string_pretty(prefs).map_err(|error| error.to_string())?;
    fs::write(path, format!("{body}\n")).map_err(|error| error.to_string())
}
