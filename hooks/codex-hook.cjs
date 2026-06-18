#!/usr/bin/env node
// CodingPet — Codex official lifecycle hook.
//
// Codex hooks send the event payload through stdin, and the hook event name
// is included as `hook_event_name` in the JSON (not as argv). We map a small
// subset of those events onto Clawd states the Rust server understands.

const { postStateToRunningServer } = require("./server-config.cjs");

const EVENT_TO_STATE = {
  SessionStart: "idle",
  UserPromptSubmit: "thinking",
  PreToolUse: "working",
  PostToolUse: "working",
  Stop: "attention",
};

function readStdinJson() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 65536) process.stdin.destroy();
    });
    process.stdin.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    process.stdin.on("error", () => resolve({}));
  });
}

function buildStateBody(payload) {
  const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
  const state = EVENT_TO_STATE[event];
  if (!state) return null;
  // Codex re-fires Stop after our hook runs; ignore those echoes so Clawd
  // doesn't oscillate between attention and idle.
  if (event === "Stop" && payload.stop_hook_active === true) return null;

  const body = {
    state,
    session_id: typeof payload.session_id === "string" && payload.session_id
      ? `codex:${payload.session_id}`
      : "codex:default",
    event,
  };

  if (typeof payload.cwd === "string" && payload.cwd) body.cwd = payload.cwd;
  if (typeof payload.tool_name === "string" && payload.tool_name) body.tool_name = payload.tool_name;

  return body;
}

function main() {
  readStdinJson()
    .then((payload) => {
      const body = buildStateBody(payload || {});
      if (!body) {
        // Codex requires an empty JSON object on stdout when no decision is taken.
        process.stdout.write("{}\n");
        process.exit(0);
        return;
      }
      postStateToRunningServer(JSON.stringify(body), { timeoutMs: 100 }, () => {
        process.stdout.write("{}\n");
        process.exit(0);
      });
    })
    .catch(() => {
      process.stdout.write("{}\n");
      process.exit(0);
    });
}

if (require.main === module) main();

module.exports = {
  EVENT_TO_STATE,
  buildStateBody,
};
