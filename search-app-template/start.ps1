$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker command was not found. Start Docker Desktop first.'
}
docker info | Out-Null

$localEnv = Join-Path $PSScriptRoot '.env'
$courseEnv = Join-Path $PSScriptRoot '..\day-01\docker\.env'
if (Test-Path -LiteralPath $localEnv) {
  $envFile = $localEnv
} elseif (Test-Path -LiteralPath $courseEnv) {
  $envFile = $courseEnv
  Write-Host 'Using the Day 1 Docker .env file.'
} else {
  Write-Host 'First run in a copied project folder.'
  if ($env:ELASTIC_PASSWORD) {
    $plainPassword = $env:ELASTIC_PASSWORD
  } else {
    $securePassword = Read-Host 'Enter the elastic password used for the Day 1 ES cluster' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
      $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
  }
  if ([string]::IsNullOrWhiteSpace($plainPassword) -or $plainPassword -match "[`r`n]") {
    throw 'The password is empty or contains a line break.'
  }
  @(
    'APP_PORT=3000'
    'ES_URL=https://host.docker.internal:9200'
    'ES_USERNAME=elastic'
    "ELASTIC_PASSWORD=$plainPassword"
    'ES_TLS_REJECT_UNAUTHORIZED=false'
  ) | Set-Content -LiteralPath $localEnv -Encoding utf8
  $plainPassword = $null
  $envFile = $localEnv
  Write-Host 'Created .env automatically. This file is excluded from Git.'
}

docker compose --env-file $envFile up --build --detach
if ($LASTEXITCODE -ne 0) { throw 'Failed to start the search app.' }

$portLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^APP_PORT=' } | Select-Object -First 1
$appPort = if ($portLine) { $portLine.Substring('APP_PORT='.Length) } else { '3000' }
Write-Host ''
Write-Host "Search app is ready: http://localhost:$appPort"
Write-Host 'After changing the config, refresh or search again to see the result.'
