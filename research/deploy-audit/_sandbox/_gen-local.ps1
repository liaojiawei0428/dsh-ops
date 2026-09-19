$ErrorActionPreference = 'Stop'
$localCfg = 'E:\DSH\DSH-ops\research\deploy-audit\_sandbox\manifest\personal.local.json'
if (-not (Test-Path $localCfg)) {
  $pwshPath = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
  if (-not $pwshPath) { $pwshPath = 'C:\Program Files\PowerShell\7\pwsh.exe' }
  $local = @{
    _comment = '本机覆盖层（gitignore, 各机器自建）: 机器特定绝对路径。'
    extraPatches = @(
      @{ id = 'pwsh-sandbox'; name = '@deepseek-ai/dsh-pwsh-sandbox'; config = @{ pwshPath = $pwshPath } }
    )
  } | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($localCfg, ($local | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "  [repro] generated $localCfg (pwshPath=$pwshPath)"
}
Write-Host "  [repro] file bytes: $((Get-Item $localCfg).Length)"
