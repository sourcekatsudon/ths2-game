#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js / npm が必要です: https://nodejs.org/"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[THS LAB] Installing dependencies..."
  npm install
fi

echo "[THS LAB] Building production bundle..."
npm run build

APP_PORT="${PORT:-4173}"
APP_URL="http://localhost:${APP_PORT}"

echo "[THS LAB] Starting at ${APP_URL}"
npm run preview -- --port "$APP_PORT" --strictPort &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in {1..50}; do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if command -v open >/dev/null 2>&1; then
  open "$APP_URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" >/dev/null 2>&1 || true
else
  echo "ブラウザで ${APP_URL} を開いてください。"
fi

wait "$SERVER_PID"
