$ErrorActionPreference = 'Stop'
$repo = 'E:\DSH\DSH-ops\research\deploy-audit\_sandbox\overlay-test\ops'
$copy = Join-Path $repo 'Deepseek_DSH'
$userProfile = $env:USERPROFILE
  $localCfg = Join-Path $repo 'personal-hub\personal.local.json'
  if (-not (Test-Path $localCfg)) {
    $pwshPath = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    if (-not $pwshPath) { $pwshPath = 'C:\Program Files\PowerShell\7\pwsh.exe' }
    # python 定位：绕开 Microsoft Store 的 0 字节别名（裸 python 可能命中它）。
    # 探测失败就留空——缺 pythonPath 时 dsh-tool-python 自行按 roots 探测。
    $pythonPath = $null
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pyCmd -and $pyCmd.Source -and $pyCmd.Source -notmatch '\\WindowsApps\\') { $pythonPath = $pyCmd.Source }
    if (-not $pythonPath) {
      foreach ($base in @((Join-Path $env:LOCALAPPDATA 'Python'), (Join-Path $env:LOCALAPPDATA 'Programs\Python'))) {
        if (-not (Test-Path $base)) { continue }
        $dirs = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        foreach ($d in $dirs) {
          $cand = Join-Path $d.FullName 'python.exe'
          if (Test-Path $cand) { $pythonPath = $cand; break }
        }
        if ($pythonPath) { break }
      }
    }
    if (-not $pythonPath) {
      $py = Get-Command py -ErrorAction SilentlyContinue
      if ($py -and $py.Source) {
        $out = & $py.Source -3 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) {
          $trimmed = "$out".Trim()
          if (Test-Path $trimmed) { $pythonPath = $trimmed }
        }
      }
    }
    # 官方包 link 依赖：dsh-computer-use 的 cordis.patch.yml 会 insert 两行裸包名,
    # 它们必须在 profile 的 dependencies 里可解析（否则启动期 failed to import,
    # G3 兜底会摘掉该插件）。路径按本机副本位置派生, 盘符自由。
    $copyLink = $copy.Replace('\', '/')
    $localObj = @{
      _comment = '本机覆盖层（gitignore, 各机器自建）: 机器特定绝对路径。'
      extraPatches = @(
        @{ id = 'pwsh-sandbox'; name = '@deepseek-ai/dsh-pwsh-sandbox'; config = @{ pwshPath = $pwshPath } }
      )
      extraDependencies = @{
        '@deepseek-ai/dsh-computer-use' = "link:$copyLink/packages/computer-use/computer-use"
        '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native' = "link:$copyLink/packages/experimental/computer-use-cua-driver-native"
      }
    }
    if ($pythonPath) {
      $localObj['plugins'] = @(
        @{ name = 'dsh-tool-python'; patch = @{ config = @{ pythonPath = $pythonPath } } }
      )
    }
    # 注意: 只 ConvertTo-Json 一次。旧实现先转字符串再转一次, 落盘成 JSON 字符串
    # 字面量, 覆盖层被整层静默忽略（2026-09-19 部署审核 BUG）。
    [System.IO.File]::WriteAllText($localCfg, ($localObj | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  已生成覆盖层 $localCfg"
    Write-Host "    pwshPath          = $pwshPath"
    Write-Host "    pythonPath        = $(if ($pythonPath) { $pythonPath } else { '(未探测到, 留空由插件自行探测)' })"
    Write-Host "    extraDependencies = 2 条官方包 link（指向本机副本 packages, 盘符自由）"
  } else {
    Write-Host "  覆盖层已存在: $localCfg"
  }
Write-Host 'OVERLAY-HARNESS-DONE'
