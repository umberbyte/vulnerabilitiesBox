@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "SCAN_PROFILE=%~1"
if not defined SCAN_PROFILE set "SCAN_PROFILE=baseline"
set "SCAN_SECONDS=%~2"
if not defined SCAN_SECONDS set "SCAN_SECONDS=120"
set "SCAN_REQUEST_BUDGET=%~3"
if not defined SCAN_REQUEST_BUDGET set "SCAN_REQUEST_BUDGET=300"
set "SCAN_AUTH=%~4"
if not defined SCAN_AUTH set "SCAN_AUTH=anonymous"
set "SCAN_USER=%~5"
if not defined SCAN_USER set "SCAN_USER=alice"

docker compose up -d --wait
if errorlevel 1 goto failed
set "BENCHMARK_CONTROL_KEY="
for /f "delims=" %%K in ('docker compose exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto failed
set "ZAP_API_KEY="
for /f "delims=" %%K in ('docker compose exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"') do set "ZAP_API_KEY=%%K"
if not defined ZAP_API_KEY goto failed

docker compose -f compose.yaml -f compose.zap.yaml --profile scan up -d --no-deps --force-recreate zap
if errorlevel 1 goto cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller
set "scan_exit=%ERRORLEVEL%"
docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >nul
popd
exit /b %scan_exit%

:cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >nul
:failed
echo ZAP runner startup failed. Check Docker Desktop and README-zap.md. >&2
popd
exit /b 1
