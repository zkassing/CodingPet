# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

CodingPet is a Tauri 2 desktop application with a React 19 + Vite frontend and a Rust backend.

- Frontend code lives in `src/` and is served by Vite during development.
- Native desktop/backend code lives in `src-tauri/`.
- `src-tauri/tauri.conf.json` wires Tauri to the frontend: dev mode runs `pnpm dev` and expects Vite at `http://localhost:1420`; production builds run `pnpm build` and bundle `../dist`.
- The current UI/backend are still close to the Tauri React template: `src/App.jsx` invokes the Rust `greet` command exposed from `src-tauri/src/lib.rs`.

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

### Frontend-to-backend boundary

The React app calls Rust through Tauri commands using `invoke` from `@tauri-apps/api/core`. For example, `src/App.jsx` calls `invoke("greet", { name })`; the matching command is `#[tauri::command] fn greet(...)` registered in `tauri::generate_handler![greet]` in `src-tauri/src/lib.rs`.

When adding a new native capability:

1. Implement the Rust function in `src-tauri/src/lib.rs` and annotate it with `#[tauri::command]`.
2. Add it to the `invoke_handler` list.
3. Call it from React via `invoke("command_name", payload)`.
4. If the feature needs Tauri permissions/plugins, update `src-tauri/capabilities/default.json` and `src-tauri/Cargo.toml`/frontend dependencies as appropriate.

### Tauri app structure

`src-tauri/src/main.rs` is intentionally thin and delegates to `codingpet_lib::run()`. The library crate is configured in `src-tauri/Cargo.toml` as `codingpet_lib` with crate types required by Tauri. Keep application setup, plugin registration, and command registration in `src-tauri/src/lib.rs` unless there is a clear reason to split modules.

The default capability in `src-tauri/capabilities/default.json` applies to the main window and currently grants `core:default` and `opener:default`, matching the `tauri-plugin-opener` plugin initialized in Rust.

### Frontend structure

`src/main.jsx` mounts React under `React.StrictMode` and renders `App`. `src/App.jsx` currently owns the template state and UI. Styling is centralized in `src/App.css`, including light/dark styles via `prefers-color-scheme`.

### Development configuration

`vite.config.js` is tailored for Tauri:

- fixed dev server port `1420` with `strictPort: true`;
- optional host/HMR configuration via `TAURI_DEV_HOST`;
- `clearScreen: false` so Rust errors remain visible;
- file watching ignores `src-tauri/**`.

Recommended editor extensions are listed in `.vscode/extensions.json`: Tauri and rust-analyzer.
