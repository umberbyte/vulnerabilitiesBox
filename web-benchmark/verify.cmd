@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

docker compose up --build -d --wait
if errorlevel 1 goto startup_failed

set "BENCHMARK_CONTROL_KEY="
for /f "delims=" %%K in ('docker compose exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto key_failed

docker compose --profile test run --build --rm verify
set "verify_exit=%ERRORLEVEL%"
if not "%verify_exit%"=="0" echo Acceptance checks failed; see artifacts\acceptance.json. >&2
popd
exit /b %verify_exit%

:startup_failed
echo Docker startup failed. >&2
popd
exit /b 1

:key_failed
echo Unable to obtain the local control key. >&2
popd
exit /b 1
