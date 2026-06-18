#!/usr/bin/env node
// CodingPet — Install / uninstall Codex official hooks.
//
// Writes hook commands into ~/.codex/hooks.json and toggles
// [features].hooks = true in ~/.codex/config.toml so Codex will load them.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CODEX_DIR = path.join(os.homedir(), ".codex");
const HOOKS_PATH = path.join(CODEX_DIR, "hooks.json");
const CONFIG_PATH = path.join(CODEX_DIR, "config.toml");
const MARKER = "codex-hook.cjs";
const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
];

function readHooksSettings() {
  try {
    return JSON.parse(fs.readFileSync(HOOKS_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function writeHooksSettings(settings) {
  fs.mkdirSync(path.dirname(HOOKS_PATH), { recursive: true });
  fs.writeFileSync(HOOKS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function findNodeBin() {
  return process.execPath || "node";
}

function hookCommand() {
  const script = path.resolve(__dirname, "codex-hook.cjs");
  return `"${findNodeBin()}" "${script}"`;
}

function timeoutForEvent(event) {
  // PermissionRequest needs longer; we don't register it here, but keep the
  // helper in case future events do.
  return event === "PermissionRequest" ? 600 : 30;
}

function hasCodexHook(entry) {
  if (!entry || typeof entry !== "object") return false;
  return Array.isArray(entry.hooks) && entry.hooks.some((hook) => {
    return hook && typeof hook.command === "string" && hook.command.includes(MARKER);
  });
}

function ensureFeaturesHooksEnabled() {
  let text = "";
  try {
    text = fs.readFileSync(CONFIG_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") return;
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text ? text.split(/\r?\n/) : [];

  // Find [features] section
  let featuresStart = -1;
  let featuresEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "[features]") {
      featuresStart = i;
    } else if (featuresStart !== -1 && /^\[/.test(trimmed)) {
      featuresEnd = i;
      break;
    }
  }

  if (featuresStart !== -1) {
    for (let i = featuresStart + 1; i < featuresEnd; i++) {
      const m = lines[i].match(/^\s*hooks\s*=\s*(true|false)\s*$/);
      if (m) {
        if (m[1] === "false") lines[i] = "hooks = true";
        fs.writeFileSync(CONFIG_PATH, `${lines.join(newline).replace(/\s*$/, "")}${newline}`, "utf8");
        return;
      }
    }
    lines.splice(featuresStart + 1, 0, "hooks = true");
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push("[features]", "hooks = true");
  }

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${lines.join(newline).replace(/\s*$/, "")}${newline}`, "utf8");
}

function install() {
  fs.mkdirSync(CODEX_DIR, { recursive: true });
  const settings = readHooksSettings();
  if (!settings.hooks || typeof settings.hooks !== "object") settings.hooks = {};

  let added = 0;
  let skipped = 0;
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    if (settings.hooks[event].some(hasCodexHook)) {
      skipped++;
      continue;
    }
    settings.hooks[event].push({
      hooks: [{
        type: "command",
        command: hookCommand(),
        timeout: timeoutForEvent(event),
      }],
    });
    added++;
  }

  writeHooksSettings(settings);
  ensureFeaturesHooksEnabled();
  console.log(`Codex hooks installed to ${HOOKS_PATH}`);
  console.log(`Added: ${added}, skipped: ${skipped}`);
  console.log("Next step: open Codex CLI and run /hooks to review and trust the new hooks.");
}

function uninstall() {
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(HOOKS_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("Codex hooks already absent.");
      return;
    }
    throw error;
  }
  if (!settings.hooks || typeof settings.hooks !== "object") return;

  let removed = 0;
  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event];
    if (!Array.isArray(entries)) continue;
    const nextEntries = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        nextEntries.push(entry);
        continue;
      }
      if (Array.isArray(entry.hooks)) {
        const nextHooks = entry.hooks.filter((hook) => !(hook && typeof hook.command === "string" && hook.command.includes(MARKER)));
        removed += entry.hooks.length - nextHooks.length;
        if (nextHooks.length > 0) nextEntries.push({ ...entry, hooks: nextHooks });
        continue;
      }
      nextEntries.push(entry);
    }
    if (nextEntries.length > 0) settings.hooks[event] = nextEntries;
    else delete settings.hooks[event];
  }

  writeHooksSettings(settings);
  console.log(`Codex hooks removed from ${HOOKS_PATH}`);
  console.log(`Removed: ${removed}`);
}

if (require.main === module) {
  if (process.argv.includes("--uninstall")) uninstall();
  else install();
}

module.exports = { install, uninstall, HOOK_EVENTS, MARKER };
