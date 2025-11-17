#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ADDR="${LDS_ADDR:-:8080}"
PORT="${BACKEND_ADDR##*:}"

if command -v lsof >/dev/null 2>&1; then
  if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
    echo "==> Port ${PORT} in use; terminating existing process..."
    lsof -ti tcp:"${PORT}" | xargs kill -9 >/dev/null 2>&1 || true
    sleep 1
  fi
fi

echo "==> Starting Go backend on ${BACKEND_ADDR}"
(
  cd "$ROOT_DIR/backend"
  LDS_ADDR="$BACKEND_ADDR" go run ./cmd/server
) &
BACKEND_PID=$!

cleanup() {
  echo "==> Shutting down backend (PID $BACKEND_PID)"
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$ROOT_DIR"
echo "==> Starting frontend via pnpm dev"
pnpm dev
