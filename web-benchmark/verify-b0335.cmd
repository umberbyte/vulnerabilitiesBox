@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "DOCKER=docker"
where docker >nul 2>nul
if errorlevel 1 if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" set "DOCKER=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe"
"%DOCKER%" compose -f compose.yaml -f compose.b0335.yaml up --build -d --wait app
if errorlevel 1 goto failed
"%DOCKER%" compose -f compose.yaml -f compose.b0335.yaml --profile b0335 build verify-b0335
if errorlevel 1 goto failed
set "BENCHMARK_CONTROL_KEY="
for /f "delims=" %%K in ('"%DOCKER%" compose -f compose.yaml -f compose.b0335.yaml exec -T app node src/control.mjs key') do set "BENCHMARK_CONTROL_KEY=%%K"
if not defined BENCHMARK_CONTROL_KEY goto failed
"%DOCKER%" compose -f compose.yaml -f compose.b0335.yaml --profile b0335 run --rm -T verify-b0335
set "verify_exit=%ERRORLEVEL%"
popd
exit /b %verify_exit%
:failed
echo B0335 Docker verification failed. >&2
popd
exit /b 1
