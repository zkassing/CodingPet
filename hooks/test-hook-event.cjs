#!/usr/bin/env node

const { spawn } = require("child_process");
const { EVENT_TO_STATE } = require("./clawd-hook.cjs");

const STATE_TO_EVENT = {
  idle: "SessionStart",
  sleeping: "SessionEnd",
  thinking: "UserPromptSubmit",
  working: "PreToolUse",
  error: "PostToolUseFailure",
  attention: "Stop",
  juggling: "SubagentStart",
  sweeping: "PreCompact",
  notification: "Notification",
  carrying: "WorktreeCreate",
};

function firstArg() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  return args[0] || "UserPromptSubmit";
}

const requested = firstArg();
const event = EVENT_TO_STATE[requested] ? requested : STATE_TO_EVENT[requested];

if (!event) {
  console.error(`Unknown hook event or state: ${requested}`);
  console.error(`Known events: ${Object.keys(EVENT_TO_STATE).join(", ")}`);
  console.error(`Known states: ${Object.keys(STATE_TO_EVENT).join(", ")}`);
  process.exit(2);
}

const payload = {
  session_id: "manual-hook-test",
  cwd: process.cwd(),
  tool_name: event === "PreToolUse" || event === "PostToolUse" ? "Bash" : undefined,
  session_title: `Manual hook event: ${event}`,
};

const child = spawn(process.execPath, [require.resolve("./clawd-hook.cjs"), event], {
  stdio: ["pipe", "inherit", "inherit"],
});

child.stdin.end(`${JSON.stringify(payload)}\n`);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Posted hook event '${event}' -> state '${EVENT_TO_STATE[event]}'`);
  }
  process.exit(code || 0);
});
