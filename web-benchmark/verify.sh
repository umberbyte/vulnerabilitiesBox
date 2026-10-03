#!/bin/sh
set -eu
cd "$(dirname "$0")"
docker compose up --build -d --wait
docker compose --profile test build verify
BENCHMARK_CONTROL_KEY="$(docker compose exec -T app node src/control.mjs key)"
export BENCHMARK_CONTROL_KEY
docker compose --profile test run --rm -T verify
unset BENCHMARK_CONTROL_KEY
