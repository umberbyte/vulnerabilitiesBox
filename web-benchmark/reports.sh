#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
docker compose --profile report build report
docker compose --profile report run --rm -T --no-deps report
printf '%s\n' 'Report index: artifacts/index.html'
