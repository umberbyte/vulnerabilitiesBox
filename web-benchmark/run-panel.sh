#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo 'Usage: sh run-panel.sh artifacts/PLAN.json artifacts/NEW-LEDGER.json [custom|custom-only]' >&2
  exit 1
fi
case "${3:-}" in ''|custom|custom-only) ;; *) echo 'Unknown scanner mode.' >&2; exit 1 ;; esac
SCAN_CUSTOM_MODE="${3:-none}"
export SCAN_CUSTOM_MODE
export PANEL_PATH="$1" PANEL_LEDGER="$2"
case "$PANEL_LEDGER" in *ledger.json) ;; *) echo 'Ledger filename must end in ledger.json for the offline report index.' >&2; exit 1 ;; esac
if [ ! -f "$PANEL_PATH" ] || [ -e "$PANEL_LEDGER" ]; then
  echo 'An existing plan and a new ledger are required. Both paths must be inside artifacts.' >&2
  exit 1
fi
docker compose up -d --wait
BENCHMARK_CONTROL_KEY="$(docker compose exec -T app node src/control.mjs key)"
ZAP_API_KEY="$(docker compose exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"
export BENCHMARK_CONTROL_KEY ZAP_API_KEY
# Refuse to replace the shared scanner when the private target meter is busy.
docker compose exec -T app node --input-type=module -e "import {readFile} from 'node:fs/promises'; const key=await readFile('/tmp/benchmark-control.key','utf8'); const r=await fetch('http://127.0.0.1:8099/measurement',{headers:{'x-benchmark-key':key},signal:AbortSignal.timeout(5000)}); if(!r.ok)process.exit(1); const m=await r.json(); if(m.active!==false||['activeRequests','openRequests','pendingHandlers'].some(k=>m[k]!==0))process.exit(1);"
cleanup() { docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >/dev/null; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
docker compose -f compose.yaml -f compose.zap.yaml --profile scan up -d --no-deps --force-recreate zap
if [ "${3:-}" = custom ]; then
  docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/install-custom-rules.mjs
elif [ "${3:-}" = custom-only ]; then
  docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/install-custom-rules.mjs --only-custom
fi
docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/panel-runner.mjs
