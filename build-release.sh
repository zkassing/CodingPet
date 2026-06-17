#!/usr/bin/env bash
set -euo pipefail

# CodingPet release build script
# Usage: ./build-release.sh [--with-password]

SIGNER_KEY_PATH="${TAURI_SIGNER_KEY_PATH:-~/.tauri/codingpet-updater.key}"

# Expand tilde
SIGNER_KEY_PATH="$(eval echo "${SIGNER_KEY_PATH}")"

if [ ! -f "${SIGNER_KEY_PATH}" ]; then
  echo "Error: signer key not found at ${SIGNER_KEY_PATH}"
  echo "Generate one with: pnpm tauri signer generate --write-keys ~/.tauri/codingpet-updater.key"
  exit 1
fi

export TAURI_SIGNING_PRIVATE_KEY="$(cat "${SIGNER_KEY_PATH}")"

if [ $# -gt 0 ] && [ "$1" = "--with-password" ]; then
  echo "Enter your key password: "
  read -r TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi

echo "Building release..."
exec pnpm tauri build
