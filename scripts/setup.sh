#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Installing frontend dependencies"
if command -v pnpm >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && pnpm install)
else
  echo "pnpm is not installed. Please install it (https://pnpm.io/installation)."
fi

if command -v go >/dev/null 2>&1; then
  echo "==> Downloading Go modules"
  (cd "$ROOT_DIR/backend" && go mod tidy)
else
  echo "Go is not installed. Please install Go 1.22+."
fi

echo "Setup complete."
