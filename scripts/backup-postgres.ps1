$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $PSScriptRoot "..\backups"
$backupFile = Join-Path $backupDirectory "melihik-tutor-$timestamp.sql"

New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
docker compose exec -T postgres pg_dump -U postgres -d melihik_tutor --clean --if-exists --format=plain | Out-File -FilePath $backupFile -Encoding utf8

if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL backup failed"
}

Write-Output "Backup created: $backupFile"
