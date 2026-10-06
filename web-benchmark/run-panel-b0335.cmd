@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
if "%~1"=="" goto usage
if "%~2"=="" goto usage
if not "%~3"=="" goto usage
where docker >nul 2>nul
if errorlevel 1 if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
where docker >nul 2>nul
if errorlevel 1 goto failed
set "PANEL_PATH=%~1"
set "PANEL_LEDGER=%~2"
if /I not "%PANEL_LEDGER:~-11%"=="ledger.json" goto invalid_files
if not exist "%PANEL_PATH%" goto invalid_files
if exist "%PANEL_LEDGER%" goto invalid_files
set "PANEL_PATH=%PANEL_PATH:\=/%"
set "PANEL_LEDGER=%PANEL_LEDGER:\=/%"
set "SCAN_CONTROLLER_TARGET=verify"
set "SCAN_CUSTOM_MODE=none"

docker compose -f compose.yaml -f compose.b0335.yaml up -d --wait
if errorlevel 1 goto failed
set "BENCHMARK_CONTROL_KEY="
for /f "delims=" %%K in ('docker compose -f compose.yaml -f compose.b0335.yaml exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto failed
set "ZAP_API_KEY="
for /f "delims=" %%K in ('docker compose -f compose.yaml -f compose.b0335.yaml exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"') do set "ZAP_API_KEY=%%K"
if not defined ZAP_API_KEY goto failed
docker compose -f compose.yaml -f compose.b0335.yaml exec -T app node --input-type=module -e "import {readFile} from 'node:fs/promises'; const key=await readFile('/tmp/benchmark-control.key','utf8'); const r=await fetch('http://127.0.0.1:8099/measurement',{headers:{'x-benchmark-key':key},signal:AbortSignal.timeout(5000)}); if(!r.ok)process.exit(1); const m=await r.json(); if(m.active!==false||['activeRequests','openRequests','pendingHandlers'].some(k=>m[k]!==0))process.exit(1);"
if errorlevel 1 goto busy

docker compose -f compose.yaml -f compose.zap.yaml -f compose.b0335.yaml -f compose.zap-b0335.yaml --profile scan up -d --no-deps --force-recreate zap
if errorlevel 1 goto cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml -f compose.b0335.yaml -f compose.zap-b0335.yaml --profile scan run --build --rm --no-deps scan-controller node src/runner/panel-runner.mjs
set "panel_exit=%ERRORLEVEL%"
docker compose -f compose.yaml -f compose.zap.yaml -f compose.b0335.yaml -f compose.zap-b0335.yaml --profile scan rm -sf zap >nul
if errorlevel 1 set "panel_exit=1"
popd
exit /b %panel_exit%

:cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml -f compose.b0335.yaml -f compose.zap-b0335.yaml --profile scan rm -sf zap >nul
:failed
echo B0335 panel worker failed. Retain the saved ledger and run artifacts. >&2
popd
exit /b 1
:busy
echo Target measurement is active or unsettled; no scanner replacement was attempted. >&2
popd
exit /b 1
:invalid_files
echo An existing plan and a new *ledger.json file under artifacts are required. >&2
popd
exit /b 1
:usage
echo Usage: run-panel-b0335.cmd artifacts/PLAN.json artifacts/NEW-LEDGER.json >&2
popd
exit /b 2
