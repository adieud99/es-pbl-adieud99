$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localEnv = Join-Path $PSScriptRoot '.env'
$courseEnv = Join-Path $PSScriptRoot '..\day-01\docker\.env'
$envFile = if (Test-Path -LiteralPath $localEnv) { $localEnv } elseif (Test-Path -LiteralPath $courseEnv) { $courseEnv } else { $null }
if (-not $envFile) { throw '.env was not found. Run start.ps1 first.' }

$portLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^APP_PORT=' } | Select-Object -First 1
$appPort = if ($portLine) { $portLine.Substring('APP_PORT='.Length) } else { '3000' }
docker compose --env-file $envFile ps
try {
  $result = Invoke-RestMethod -Uri "http://localhost:$appPort/api/health" -TimeoutSec 5
  Write-Host "APP: $($result.status) / INDEX: $($result.index)"
} catch {
  Write-Host 'APP: no response. Run: docker compose logs search-app'
}
