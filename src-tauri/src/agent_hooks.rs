use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Copy)]
struct AgentSpec {
    id: &'static str,
    display_name: &'static str,
    install_script: &'static str,
    settings_marker_path: &'static [&'static str],
    marker: &'static str,
}

const AGENTS: &[AgentSpec] = &[
    AgentSpec {
        id: "claude-code",
        display_name: "Claude Code",
        install_script: "install-claude-hooks.cjs",
        settings_marker_path: &[".claude", "settings.json"],
        marker: "clawd-hook.cjs",
    },
    AgentSpec {
        id: "codex",
        display_name: "Codex",
        install_script: "install-codex-hooks.cjs",
        settings_marker_path: &[".codex", "hooks.json"],
        marker: "codex-hook.cjs",
    },
];

fn find_agent(id: &str) -> Option<&'static AgentSpec> {
    AGENTS.iter().find(|spec| spec.id == id)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn settings_path_for(spec: &AgentSpec) -> Option<PathBuf> {
    let mut path = home_dir()?;
    for segment in spec.settings_marker_path {
        path.push(segment);
    }
    Some(path)
}

fn agent_installed(spec: &AgentSpec) -> bool {
    let Some(path) = settings_path_for(spec) else {
        return false;
    };
    match std::fs::read_to_string(&path) {
        Ok(text) => text.contains(spec.marker),
        Err(_) => false,
    }
}

fn hooks_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    // Honor explicit override via env var (useful for tests/dev).
    if let Some(override_dir) = std::env::var_os("CODINGPET_HOOKS_DIR") {
        let path = PathBuf::from(override_dir);
        if path.exists() {
            return Ok(path);
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        // Tauri 2 maps `../hooks/...` resources under `_up_/hooks/...`.
        candidates.push(resource_dir.join("_up_").join("hooks"));
        candidates.push(resource_dir.join("hooks"));
        candidates.push(resource_dir.clone());
    }
    // Dev fallback: project root / hooks (when running pnpm tauri dev).
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("hooks"));

    for candidate in candidates {
        if candidate.join("install-claude-hooks.cjs").exists() {
            return Ok(candidate);
        }
    }

    Err("hooks directory not found".to_string())
}

fn node_executable() -> String {
    // On macOS GUI apps, $PATH usually doesn't include Homebrew/asdf shims.
    // Try a few common locations before falling back to bare `node`.
    for path in [
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
    ] {
        if Path::new(path).exists() {
            return path.to_string();
        }
    }
    "node".to_string()
}

fn run_install_script(app: &tauri::AppHandle, script: &str, uninstall: bool) -> Result<String, String> {
    let dir = hooks_dir(app)?;
    let script_path = dir.join(script);
    if !script_path.exists() {
        return Err(format!("install script missing: {}", script_path.display()));
    }

    let mut cmd = Command::new(node_executable());
    cmd.arg(&script_path);
    if uninstall {
        cmd.arg("--uninstall");
    }

    let output = cmd
        .output()
        .map_err(|err| format!("failed to spawn node: {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let detail = if !stderr.trim().is_empty() {
            stderr
        } else {
            stdout
        };
        return Err(format!(
            "{} exited with status {}: {}",
            script,
            output.status,
            detail.trim()
        ));
    }

    Ok(stdout)
}

#[tauri::command]
pub fn list_agent_hooks() -> Vec<AgentInfo> {
    AGENTS
        .iter()
        .map(|spec| AgentInfo {
            id: spec.id.to_string(),
            name: spec.display_name.to_string(),
            installed: agent_installed(spec),
        })
        .collect()
}

#[tauri::command]
pub fn install_agent_hook(app: tauri::AppHandle, agent_id: String) -> Result<AgentInfo, String> {
    let spec = find_agent(&agent_id).ok_or_else(|| format!("unknown agent: {agent_id}"))?;
    run_install_script(&app, spec.install_script, false)?;
    Ok(AgentInfo {
        id: spec.id.to_string(),
        name: spec.display_name.to_string(),
        installed: agent_installed(spec),
    })
}

#[tauri::command]
pub fn uninstall_agent_hook(app: tauri::AppHandle, agent_id: String) -> Result<AgentInfo, String> {
    let spec = find_agent(&agent_id).ok_or_else(|| format!("unknown agent: {agent_id}"))?;
    run_install_script(&app, spec.install_script, true)?;
    Ok(AgentInfo {
        id: spec.id.to_string(),
        name: spec.display_name.to_string(),
        installed: agent_installed(spec),
    })
}
