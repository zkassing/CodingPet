#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const MARKER = "clawd-hook.cjs";
const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
  "Elicitation",
];

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function findNodeBin() {
  return process.execPath || "node";
}

function hookCommand(event) {
  const script = path.resolve(__dirname, "clawd-hook.cjs");
  return `"${findNodeBin()}" "${script}" ${event}`;
}

function hasClawdHook(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.command === "string" && entry.command.includes(MARKER)) return true;
  return Array.isArray(entry.hooks) && entry.hooks.some((hook) => {
    return hook && typeof hook.command === "string" && hook.command.includes(MARKER);
  });
}

function install() {
  const settings = readSettings();
  if (!settings.hooks || typeof settings.hooks !== "object") settings.hooks = {};

  let added = 0;
  let skipped = 0;
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(settings.hooks[event])) {
      const existing = settings.hooks[event];
      settings.hooks[event] = existing && typeof existing === "object" ? [existing] : [];
    }

    if (settings.hooks[event].some(hasClawdHook)) {
      skipped++;
      continue;
    }

    settings.hooks[event].push({
      matcher: "",
      hooks: [{
        type: "command",
        command: hookCommand(event),
        async: true,
        timeout: 5,
      }],
    });
    added++;
  }

  writeSettings(settings);
  console.log(`Claude Code hooks installed to ${SETTINGS_PATH}`);
  console.log(`Added: ${added}, skipped: ${skipped}`);
}

function uninstall() {
  const settings = readSettings();
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
      if (typeof entry.command === "string" && entry.command.includes(MARKER)) {
        removed++;
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

  writeSettings(settings);
  console.log(`Claude Code hooks removed from ${SETTINGS_PATH}`);
  console.log(`Removed: ${removed}`);
}

if (process.argv.includes("--uninstall")) uninstall();
else install();
