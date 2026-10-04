@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
if not "%~1"=="" goto usage

docker compose up -d --wait
if errorlevel 1 goto failed
for /f "delims=" %%K in ('docker compose exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto failed
for /f "delims=" %%K in ('docker compose exec -T app node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"') do set "ZAP_API_KEY=%%K"
if not defined ZAP_API_KEY goto failed
docker compose exec -T app node --input-type=module -e "import {readFile} from 'node:fs/promises'; const key=await readFile('/tmp/benchmark-control.key','utf8'); const r=await fetch('http://127.0.0.1:8099/measurement',{headers:{'x-benchmark-key':key},signal:AbortSignal.timeout(5000)}); if(!r.ok)process.exit(1); const m=await r.json(); if(m.active!==false||['activeRequests','openRequests','pendingHandlers'].some(k=>m[k]!==0))process.exit(1);"
if errorlevel 1 goto failed

docker compose -f compose.yaml -f compose.zap.yaml --profile scan up -d --no-deps --force-recreate zap
if errorlevel 1 goto cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml --profile test run --build --rm -T --no-deps -e BENCHMARK_CONTROL_KEY -e ZAP_API_KEY verify node tests/dual-transport-probe.mjs
set "probe_exit=%ERRORLEVEL%"
docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >nul
if errorlevel 1 set "probe_exit=1"
popd
exit /b %probe_exit%

:cleanup_failed
docker compose -f compose.yaml -f compose.zap.yaml --profile scan rm -sf zap >nul
:failed
echo Dual-transport prerequisite probe failed. Inspect its saved artifact. >&2
popd
exit /b 1
:usage
echo Usage: probe-transport.cmd >&2
popd
exit /b 1
