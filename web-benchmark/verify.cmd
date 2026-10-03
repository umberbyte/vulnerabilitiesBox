@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

docker compose up --build -d --wait
if errorlevel 1 goto startup_failed

docker compose --profile test build verify
if errorlevel 1 goto build_failed

set "BENCHMARK_CONTROL_KEY="
for /f "delims=" %%K in ('docker compose exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto key_failed

docker compose --profile test run --rm -T verify
set "verify_exit=%ERRORLEVEL%"
if not "%verify_exit%"=="0" echo Regression failed; see artifacts\full-regression.md. >&2
popd
exit /b %verify_exit%

:startup_failed
echo Docker startup failed. >&2
popd
exit /b 1

:build_failed
echo Docker verification image build failed. >&2
popd
exit /b 1

:key_failed
echo Unable to obtain the local control key. >&2
popd
exit /b 1
