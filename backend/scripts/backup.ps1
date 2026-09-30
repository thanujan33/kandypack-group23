$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '../..')
New-Item -ItemType Directory -Force backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path (Get-Location) "backups/kandypack-$stamp.sql"
$data = docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --no-tablespaces kandypack'
if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
[System.IO.File]::WriteAllLines($target, $data, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Saved $target"
