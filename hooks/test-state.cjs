#!/usr/bin/env node

const { postStateToRunningServer } = require("./server-config.cjs");

const KNOWN_STATES = new Set([
  "idle",
  "thinking",
  "working",
  "juggling",
  "sweeping",
  "error",
  "attention",
  "notification",
  "carrying",
  "sleeping",
  "waking",
]);

const state = process.argv[2] || "idle";

if (!KNOWN_STATES.has(state)) {
  console.error(`Unknown state: ${state}`);
  console.error(`Known states: ${Array.from(KNOWN_STATES).join(", ")}`);
  process.exit(2);
}

const body = {
  state,
  session_id: "manual-test",
  event: "ManualStateTest",
  session_title: `Manual state: ${state}`,
};

postStateToRunningServer(JSON.stringify(body), { timeoutMs: 250 }, (ok, port) => {
  if (!ok) {
    console.error("Clawd app is not reachable. Start it first with: pnpm tauri dev");
    process.exit(1);
  }
  console.log(`Posted state '${state}' to 127.0.0.1:${port}/state`);
});
