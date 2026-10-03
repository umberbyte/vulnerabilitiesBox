#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ "$#" -gt 1 ]; then printf '%s\n' 'Usage: sh verify.sh [full|tools]' >&2; exit 2; fi
case "${1:-full}" in
  tools)
    docker compose --profile test build tools-check
    docker compose --profile test run --rm -T --no-deps tools-check
    exit
    ;;
  full) ;;
  *) printf '%s\n' 'Usage: sh verify.sh [full|tools]' >&2; exit 2 ;;
esac
docker compose up --build -d --wait
docker compose --profile test build verify
BENCHMARK_CONTROL_KEY="$(docker compose exec -T app node src/control.mjs key)"
export BENCHMARK_CONTROL_KEY
trap 'unset BENCHMARK_CONTROL_KEY' 0
docker compose --profile test run --rm -T verify
unset BENCHMARK_CONTROL_KEY
