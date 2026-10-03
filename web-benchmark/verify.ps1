param([ValidateSet('full','tools')][string]$Mode='full')
$ErrorActionPreference = 'Stop'
$savedControlKey=$env:BENCHMARK_CONTROL_KEY
Push-Location $PSScriptRoot
try {
    if ($Mode -eq 'tools') {
        docker compose --profile test build tools-check
        if ($LASTEXITCODE -ne 0) { throw 'Docker tools image build failed' }
        docker compose --profile test run --rm -T --no-deps tools-check
        if ($LASTEXITCODE -ne 0) { throw 'Tool verification failed; see artifacts/tools-check.md' }
        return
    }
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
    if ($null -eq $savedControlKey) { Remove-Item Env:\BENCHMARK_CONTROL_KEY -ErrorAction SilentlyContinue } else { $env:BENCHMARK_CONTROL_KEY=$savedControlKey }
    Pop-Location
}
