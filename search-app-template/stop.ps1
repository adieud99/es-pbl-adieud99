$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localEnv = Join-Path $PSScriptRoot '.env'
$courseEnv = Join-Path $PSScriptRoot '..\day-01\docker\.env'
$envFile = if (Test-Path -LiteralPath $localEnv) { $localEnv } elseif (Test-Path -LiteralPath $courseEnv) { $courseEnv } else { $null }
if (-not $envFile) { throw '.env was not found. Run start.ps1 first.' }
docker compose --env-file $envFile down
if ($LASTEXITCODE -ne 0) { throw 'Failed to stop the search app.' }
Write-Host 'Search app stopped.'
