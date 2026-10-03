@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
docker compose --profile report build report
if errorlevel 1 goto failed
docker compose --profile report run --rm -T --no-deps report
if errorlevel 1 goto failed
echo Report index: artifacts\index.html
popd
exit /b 0
:failed
echo Report index generation failed. >&2
popd
exit /b 1
