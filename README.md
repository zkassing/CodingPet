# CodingPet

CodingPet is a Tauri 2 desktop pet that shows Clawd, the Claude Code crab, and reacts to local Claude Code hook events.

## Development

```bash
pnpm install
pnpm dev
pnpm tauri dev
```

## Build

```bash
pnpm build
pnpm tauri build
```

## Auto update releases

CodingPet uses the Tauri 2 updater plugin and checks for updates from GitHub Releases when the app starts. The configured updater endpoint is:

```text
https://github.com/zkassing/CodingPet/releases/latest/download/latest.json
```

Before publishing updater builds, replace the placeholder updater public key in `src-tauri/tauri.conf.json`:

```json
"pubkey": "TODO_REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY"
```

Generate updater keys with the Tauri CLI and keep the private key out of git:

```bash
pnpm tauri signer generate --write-keys ~/.tauri/codingpet-updater.key
```

Use the generated public key as `plugins.updater.pubkey`. During release builds, provide the private key through the environment expected by Tauri, for example:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/codingpet-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<key password if one was set>"
pnpm tauri build
```

Local builds do not create updater artifacts by default. For release builds, enable updater artifacts temporarily or in a release-specific config and build with the updater private key available:

```json
"bundle": {
  "createUpdaterArtifacts": true
}
```

For each release:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Enable `bundle.createUpdaterArtifacts` for the release build.
3. Build signed bundles with the updater private key available.
4. Create a GitHub Release for the version.
5. Upload the platform installers/archive artifacts and `latest.json` to that release.
6. Start an older installed app and confirm it prompts for the new version, downloads it, installs it, and relaunches.
