$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose up --build -d --wait
    if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed' }
    $controlKey = docker compose exec -T app node src/control.mjs key
    if ($LASTEXITCODE -ne 0) { throw 'Unable to obtain local control key' }
    $env:BENCHMARK_CONTROL_KEY = $controlKey.Trim()
    docker compose --profile test run --build --rm verify
    if ($LASTEXITCODE -ne 0) { throw 'Acceptance checks failed; see artifacts/acceptance.json' }
} finally {
    Remove-Item Env:\BENCHMARK_CONTROL_KEY -ErrorAction SilentlyContinue
    Pop-Location
}
