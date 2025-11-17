#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$ROOT_DIR/krecord.config.json"
cat > "$CONFIG_FILE" <<JSON
{
  "dataRoot": "./content-demo"
}
JSON

echo "Data root reset to ./content-demo"
