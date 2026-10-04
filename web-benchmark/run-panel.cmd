@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
if "%~1"=="" goto usage
if "%~2"=="" goto usage
if not "%~4"=="" goto usage
set "CUSTOM_MODE=%~3"
if not "%CUSTOM_MODE%"=="" if not "%CUSTOM_MODE%"=="custom" if not "%CUSTOM_MODE%"=="custom-only" goto usage
set "SCAN_CUSTOM_MODE=%CUSTOM_MODE%"
if "%SCAN_CUSTOM_MODE%"=="" set "SCAN_CUSTOM_MODE=none"
set "PANEL_PATH=%~1"
set "PANEL_LEDGER=%~2"
rem The offline report index discovers operator ledgers by this suffix.
if /I not "%PANEL_LEDGER:~-11%"=="ledger.json" goto invalid_files
if not exist "%PANEL_PATH%" goto invalid_files
if exist "%PANEL_LEDGER%" goto invalid_files
set "PANEL_PATH=%PANEL_PATH:\=/%"
set "PANEL_LEDGER=%PANEL_LEDGER:\=/%"

docker compose up -d --wait
if errorlevel 1 goto failed
set "BENCHMARK_CONTROL_KEY="
for /f "delims=" %%K in ('docker compose exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto failed
set "ZAP_API_KEY="
for /f "delims=" %%K in ('docker compose exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"') do set "ZAP_API_KEY=%%K"
if not defined ZAP_API_KEY goto failed
rem Check the private meter before replacing this Compose project's scanner.
docker compose exec -T app node --input-type=module -e "import {readFile} from 'node:fs/promises'; const key=await readFile('/tmp/benchmark-control.key','utf8'); const r=await fetch('http://127.0.0.1:8099/measurement',{headers:{'x-benchmark-key':key},signal:AbortSignal.timeout(5000)}); if(!r.ok)process.exit(1); const m=await r.json(); if(m.active!==false||['activeRequests','openRequests','pendingHandlers'].some(k=>m[k]!==0))process.exit(1);"
if errorlevel 1 goto busy

docker compose -f compose.yaml -f compose.zap.yaml --profile scan up -d --no-deps --force-recreate zap
if errorlevel 1 goto cleanup_failed
if "%CUSTOM_MODE%"=="custom" (
  docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/install-custom-rules.mjs
  if errorlevel 1 goto cleanup_failed
)
if "%CUSTOM_MODE%"=="custom-only" (
  docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/install-custom-rules.mjs --only-custom
  if errorlevel 1 goto cleanup_failed
)
docker compose -f compose.yaml -f compose.zap.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/panel-runner.mjs
set "panel_exit=%ERRORLEVEL%"
docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >nul
if errorlevel 1 set "panel_exit=1"
popd
exit /b %panel_exit%

:cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >nul
:failed
echo Panel worker failed. Check Docker Desktop, the saved ledger, and README-panel.md. >&2
popd
exit /b 1
:busy
echo Target measurement is active, busy, or unavailable. No scanner replacement was attempted. >&2
popd
exit /b 1
:invalid_files
echo An existing plan and a new *ledger.json file are required. Both paths must be inside artifacts. >&2
popd
exit /b 1
:usage
echo Usage: run-panel.cmd artifacts/PLAN.json artifacts/NEW-LEDGER.json [custom^|custom-only] >&2
popd
exit /b 1
