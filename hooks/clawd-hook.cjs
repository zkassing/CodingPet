#!/usr/bin/env node

const { postStateToRunningServer } = require("./server-config.cjs");

const EVENT_TO_STATE = {
  SessionStart: "idle",
  SessionEnd: "sleeping",
  UserPromptSubmit: "thinking",
  PreToolUse: "working",
  PostToolUse: "working",
  PostToolUseFailure: "error",
  Stop: "attention",
  StopFailure: "error",
  SubagentStart: "juggling",
  SubagentStop: "working",
  PreCompact: "sweeping",
  PostCompact: "thinking",
  Notification: "notification",
  Elicitation: "notification",
  WorktreeCreate: "carrying",
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

function isTaskToolStart(event, payload) {
  return event === "PreToolUse" && payload && payload.tool_name === "Task";
}

function buildStateBody(event, payload = {}) {
  const state = EVENT_TO_STATE[event];
  if (!state) return null;

  const syntheticSubagentStart = isTaskToolStart(event, payload);
  const source = payload.source || payload.reason || "";
  const postCompactState = event === "PostCompact"
    ? (payload.trigger === "manual" ? "idle" : "thinking")
    : null;
  const resolvedState = syntheticSubagentStart
    ? "juggling"
    : (postCompactState || ((event === "SessionEnd" && source === "clear") ? "sweeping" : state));
  const resolvedEvent = syntheticSubagentStart ? "SubagentStart" : event;

  const body = {
    state: resolvedState,
    session_id: payload.session_id || "default",
    event: resolvedEvent,
  };

  if (typeof payload.cwd === "string" && payload.cwd) body.cwd = payload.cwd;
  if (typeof payload.tool_name === "string" && payload.tool_name) body.tool_name = payload.tool_name;
  if (typeof payload.session_title === "string" && payload.session_title.trim()) {
    body.session_title = payload.session_title.trim().slice(0, 80);
  }

  return body;
}

function main() {
  const event = process.argv[2];
  if (!EVENT_TO_STATE[event]) process.exit(0);

  readStdinJson()
    .then((payload) => {
      const body = buildStateBody(event, payload);
      if (!body) process.exit(0);
      postStateToRunningServer(JSON.stringify(body), { timeoutMs: 100 }, () => process.exit(0));
    })
    .catch(() => process.exit(0));
}

if (require.main === module) main();

module.exports = {
  EVENT_TO_STATE,
  buildStateBody,
};
