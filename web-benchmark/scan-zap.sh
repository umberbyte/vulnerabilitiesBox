#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export SCAN_PROFILE="${1:-baseline}"
export SCAN_SECONDS="${2:-120}"
export SCAN_REQUEST_BUDGET="${3:-300}"
export SCAN_AUTH="${4:-anonymous}"
export SCAN_USER="${5:-alice}"
docker compose up -d --wait
BENCHMARK_CONTROL_KEY="$(docker compose exec -T app node src/control.mjs key)"
ZAP_API_KEY="$(docker compose exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"
export BENCHMARK_CONTROL_KEY ZAP_API_KEY
cleanup() { docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >/dev/null; }
trap cleanup EXIT HUP INT TERM
docker compose -f compose.yaml -f compose.zap.yaml --profile scan up -d --no-deps --force-recreate zap
docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller
