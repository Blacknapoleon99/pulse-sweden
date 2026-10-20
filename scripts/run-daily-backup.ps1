param(
  [string]$ConfigPath = "$env:LOCALAPPDATA\TryggPulse\backup-config.dpapi",
  [ValidateSet('backup','verify','restore')][string]$Command = 'backup',
  [string]$Archive,
  [string]$RestoreDatabaseUrl
)
$ErrorActionPreference = 'Stop'
# DPAPI protects credentials and the encryption key for this Windows user.
$secureConfig = (Get-Content -LiteralPath $ConfigPath -Raw).Trim() | ConvertTo-SecureString
$configPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfig)
try {
  $backupConfig = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($configPointer) | ConvertFrom-Json
  $env:DATABASE_URL = $backupConfig.databaseUrl
  $env:BACKUP_ENCRYPTION_KEY = $backupConfig.encryptionKey
  $env:BACKUP_DIRECTORY = "$env:LOCALAPPDATA\TryggPulse\backups"
  if ($Command -eq 'restore') { if (!$RestoreDatabaseUrl) { throw 'An explicit restore target is required.' }; $env:RESTORE_DATABASE_URL = $RestoreDatabaseUrl }
  & node (Join-Path $PSScriptRoot 'database-backup.mjs') $Command $Archive
  if ($LASTEXITCODE -ne 0) { throw 'Daily database backup failed.' }
  if ($Command -eq 'restore') {
    $env:SOURCE_DATABASE_URL = $backupConfig.databaseUrl
    $env:TARGET_DATABASE_URL = $RestoreDatabaseUrl
    & node (Join-Path $PSScriptRoot 'database-compare.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Restore comparison failed. Do not switch production.' }
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($configPointer)
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:BACKUP_ENCRYPTION_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:SOURCE_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:TARGET_DATABASE_URL -ErrorAction SilentlyContinue
}
