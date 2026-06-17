# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project overview

CodingPet is a Tauri 2 desktop application with a React 19 + Vite frontend and a Rust backend.

- Frontend code lives in `src/` and is served by Vite during development.
- Native desktop/backend code lives in `src-tauri/`.
- `src-tauri/tauri.conf.json` wires Tauri to the frontend: dev mode runs `pnpm dev` and expects Vite at `http://localhost:1420`; production builds run `pnpm build` and bundle `../dist`.
- The app is a minimal Clawd-only desktop pet. Codex hooks post state updates to the Rust local HTTP server, and the React frontend renders matching Clawd SVG animations.

## Common commands

Use `pnpm` for the JavaScript/Tauri commands because Tauri config invokes `pnpm dev` and `pnpm build`.

```bash
# Install frontend dependencies
pnpm install

# Run frontend only in Vite dev server
pnpm dev

# Run the Tauri desktop app in development
pnpm tauri dev

# Build frontend only
pnpm build

# Build/package the Tauri app
pnpm tauri build

# Preview the built frontend
pnpm preview

# Install/uninstall Codex state hooks
pnpm run install:Codex-hooks
pnpm run uninstall:Codex-hooks

# Manually test Clawd state and hook transitions while the app is running
pnpm run test:state -- thinking
pnpm run test:hook -- PreToolUse
pnpm run test:hook -- thinking
pnpm run test:sequence -- all
```

Rust-side checks can be run from `src-tauri/`:

```bash
cd src-tauri
cargo check
cargo test
cargo test <test_name>
cargo fmt --check
cargo clippy --all-targets --all-features
```

There is currently no JavaScript test runner or lint script configured in `package.json`. Add scripts there before documenting frontend test/lint commands.

## Git workflow

After completing each independent code modification task, create one git commit for that completed task unless the user explicitly says not to. Do not push unless the user explicitly asks.

Before committing, inspect `git status` and the relevant diff. Run the relevant build/check/test command when practical, and report any skipped checks.

## Architecture notes

### Codex hook boundary

The Rust backend starts a local HTTP server on `127.0.0.1:23333-23337` and writes the active port to `~/.clawd/runtime.json`. Codex command hooks in `hooks/clawd-hook.cjs` read hook JSON from stdin, map Codex events to Clawd states, and POST to `/state`.

The server validates incoming states and emits `clawd-state-change` through Tauri. The React frontend listens for that event in `src/clawd/ClawdPet.jsx`, maps the state through `src/clawd/theme.js`, and renders SVG assets from `public/clawd/svg/`.

Dragged window position is saved to `~/.clawd/codingpet-window.json` and restored on startup. Delete that file to reset placement to the default startup offset.

This MVP intentionally does not implement `/permission` approval bubbles; Codex permissions remain in Codex's native flow.

### Tauri app structure

`src-tauri/src/main.rs` is intentionally thin and delegates to `codingpet_lib::run()`. The library crate is configured in `src-tauri/Cargo.toml` as `codingpet_lib` with crate types required by Tauri. Keep application setup, plugin registration, and command registration in `src-tauri/src/lib.rs` unless there is a clear reason to split modules.

The default capability in `src-tauri/capabilities/default.json` applies to the main window and currently grants `core:default` and `opener:default`, matching the `tauri-plugin-opener` plugin initialized in Rust.

### Frontend structure

`src/main.jsx` mounts React under `React.StrictMode` and renders `App`. `src/App.jsx` delegates to the Clawd renderer in `src/clawd/ClawdPet.jsx`. Styling is centralized in `src/App.css`; keep the window transparent-friendly because the Tauri window is configured as a small undecorated desktop pet.

### Development configuration

`vite.config.js` is tailored for Tauri:

- fixed dev server port `1420` with `strictPort: true`;
- optional host/HMR configuration via `TAURI_DEV_HOST`;
- `clearScreen: false` so Rust errors remain visible;
- file watching ignores `src-tauri/**`.

Recommended editor extensions are listed in `.vscode/extensions.json`: Tauri and rust-analyzer.
