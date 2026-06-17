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
cargo check --manifest-path src-tauri/Cargo.toml
```

`pnpm tauri build` creates updater artifacts and requires the updater signing private key environment variables described below.

## Auto update releases

CodingPet uses the Tauri 2 updater plugin and checks for updates from GitHub Releases when the app starts. The configured updater endpoint is:

```text
https://github.com/zkassing/CodingPet/releases/latest/download/latest.json
```

Before publishing updater builds, make sure the updater public key in `src-tauri/tauri.conf.json` matches the private key stored in GitHub Actions secrets.

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

Release builds create updater artifacts because `bundle.createUpdaterArtifacts` is enabled in `src-tauri/tauri.conf.json`. Local `pnpm tauri build` also needs the updater private key environment variables above; without them, use `pnpm build` and `cargo check --manifest-path src-tauri/Cargo.toml` for local validation.

## GitHub Actions releases

The `.github/workflows/release.yml` workflow builds and uploads macOS, Windows, and Linux bundles to a GitHub Release. It runs when you push a `v*` tag, and it can also be started manually from the Actions tab with a release tag input.

Before using the workflow, configure repository settings in GitHub:

1. Add repository secrets in **Settings → Secrets and variables → Actions**:
   - `TAURI_SIGNING_PRIVATE_KEY` - the full updater private key content.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - the key password, if one was set.
2. In **Settings → Actions → General → Workflow permissions**, enable **Read and write permissions** so `GITHUB_TOKEN` can create releases and upload assets.

For each release:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push the version bump.
3. Create and push a tag:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. Wait for the Release workflow to finish for macOS, Windows, and Linux.
5. Review the draft GitHub Release assets, including `latest.json`, then publish the release.
6. Start an older installed app and confirm it prompts for the new version, downloads it, installs it, and relaunches.
