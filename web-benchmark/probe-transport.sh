#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ "$#" -ne 0 ]; then echo 'Usage: ./probe-transport.sh' >&2; exit 1; fi
docker compose up -d --wait
BENCHMARK_CONTROL_KEY=$(docker compose exec -T app node src/control.mjs key)
ZAP_API_KEY=$(docker compose exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")
export BENCHMARK_CONTROL_KEY ZAP_API_KEY
docker compose exec -T app node --input-type=module -e "import {readFile} from 'node:fs/promises'; const key=await readFile('/tmp/benchmark-control.key','utf8'); const r=await fetch('http://127.0.0.1:8099/measurement',{headers:{'x-benchmark-key':key},signal:AbortSignal.timeout(5000)}); if(!r.ok)process.exit(1); const m=await r.json(); if(m.active!==false||['activeRequests','openRequests','pendingHandlers'].some(k=>m[k]!==0))process.exit(1);"
cleanup() { docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >/dev/null; }
trap cleanup EXIT HUP INT TERM
docker compose -f compose.yaml -f compose.zap.yaml --profile scan up -d --no-deps --force-recreate zap
docker compose -f compose.yaml -f compose.zap.yaml --profile test run --build --rm -T --no-deps -e BENCHMARK_CONTROL_KEY -e ZAP_API_KEY verify node tests/dual-transport-probe.mjs
