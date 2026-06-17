#!/usr/bin/env node

const { postStateToRunningServer } = require("./server-config.cjs");

const sequenceName = process.argv[2] || "basic";

const SEQUENCES = {
  basic: [
    ["idle", 900],
    ["thinking", 1200],
    ["working", 1200],
    ["attention", 1800],
    ["idle", 0],
  ],
  all: [
    ["idle", 900],
    ["thinking", 900],
    ["working", 900],
    ["juggling", 900],
    ["sweeping", 900],
    ["notification", 900],
    ["carrying", 900],
    ["error", 1200],
    ["attention", 1200],
    ["sleeping", 900],
    ["waking", 900],
    ["idle", 0],
  ],
  error: [
    ["thinking", 1000],
    ["working", 1000],
    ["error", 2500],
    ["idle", 0],
  ],
  subagent: [
    ["thinking", 1000],
    ["juggling", 2500],
    ["working", 1000],
    ["attention", 1800],
    ["idle", 0],
  ],
};

const sequence = SEQUENCES[sequenceName];

if (!sequence) {
  console.error(`Unknown sequence: ${sequenceName}`);
  console.error(`Known sequences: ${Object.keys(SEQUENCES).join(", ")}`);
  process.exit(2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postState(state) {
  const body = {
    state,
    session_id: `manual-sequence-${sequenceName}`,
    event: "ManualSequenceTest",
    session_title: `Manual sequence: ${sequenceName}`,
  };

  return new Promise((resolve, reject) => {
    postStateToRunningServer(JSON.stringify(body), { timeoutMs: 250 }, (ok, port) => {
      if (!ok) {
        reject(new Error("Clawd app is not reachable. Start it first with: pnpm tauri dev"));
        return;
      }
      console.log(`Posted state '${state}' to 127.0.0.1:${port}/state`);
      resolve();
    });
  });
}

async function main() {
  for (const [state, delay] of sequence) {
    await postState(state);
    if (delay > 0) await sleep(delay);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
