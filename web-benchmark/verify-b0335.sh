#!/bin/sh
set -eu
cd "$(dirname "$0")"
docker compose -f compose.yaml -f compose.b0335.yaml up --build -d --wait app
docker compose -f compose.yaml -f compose.b0335.yaml --profile b0335 build verify-b0335
BENCHMARK_CONTROL_KEY="$(docker compose -f compose.yaml -f compose.b0335.yaml exec -T app node src/control.mjs key)"
export BENCHMARK_CONTROL_KEY
trap 'unset BENCHMARK_CONTROL_KEY' 0
docker compose -f compose.yaml -f compose.b0335.yaml --profile b0335 run --rm -T verify-b0335
