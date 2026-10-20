param([Parameter(Mandatory=$true)][string]$PlainConfigPath)
$ErrorActionPreference = 'Stop'
$taskConfigRoot = [IO.Path]::GetFullPath("$env:LOCALAPPDATA\TryggPulse")
$taskPlainPath = [IO.Path]::GetFullPath($PlainConfigPath)
if (!$taskPlainPath.StartsWith($taskConfigRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Config must be in the private TryggPulse local directory.' }
$taskJson = Get-Content -LiteralPath $taskPlainPath -Raw
$taskJson | ConvertFrom-Json | Out-Null
$taskSecure = ConvertTo-SecureString $taskJson -AsPlainText -Force
$taskSecure | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $taskConfigRoot 'backup-config.dpapi')
Remove-Item -LiteralPath $taskPlainPath
Write-Output 'Backup credentials protected for the current Windows user outside Git.'
