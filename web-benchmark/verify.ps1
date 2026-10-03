$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose up --build -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed' }
    docker compose --profile test build verify
    if ($LASTEXITCODE -ne 0) { throw 'Docker verification image build failed' }
    $controlKey = docker compose exec -T app node src/control.mjs key
    if ($LASTEXITCODE -ne 0) { throw 'Unable to obtain local control key' }
    $env:BENCHMARK_CONTROL_KEY = $controlKey.Trim()
    docker compose --profile test run --rm -T verify
    if ($LASTEXITCODE -ne 0) { throw 'Regression failed; see artifacts/full-regression.md' }
} finally {
    Remove-Item Env:\BENCHMARK_CONTROL_KEY -ErrorAction SilentlyContinue
    Pop-Location
}
