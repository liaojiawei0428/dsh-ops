#Requires -Version 7
<#
health-check.ps1 — DSH-ops 一键体检包装器（D7 统一定位入口，修复“命令行 python 解析到 MS Store 桩”）

问题: 命令行裸 `python` 解析到 Microsoft Store 桩 (WindowsApps\python.exe),
运行 health-check.py 会报 “Python was not found ...”。本包装器用定位链找到
本机真实 python, 再执行 health-check.py, 参数与退出码原样透传。

定位链 (依次尝试, 取第一个可用):
  1. personal-hub\personal.local.json 中 dsh-tool-python 的 pythonPath (本机权威配置)
  2. py launcher (py -3) 解析出的 sys.executable
  3. PATH 中非 WindowsApps 的 python.exe
  4. LOCALAPPDATA 常见安装位置 glob

用法:
  pwsh -NoProfile -File .\health-check.ps1            # 全量体检（约 10 秒）
  pwsh -NoProfile -File .\health-check.ps1 --quick    # 快速体检（跳过闸门/回归）
  .\health-check.cmd [--quick]                       # 双击/命令行入口
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ForwardArgs
)

$ErrorActionPreference = 'Stop'
$hcPy = Join-Path $PSScriptRoot 'health-check.py'
if (-not (Test-Path -LiteralPath $hcPy)) {
    Write-Host "[health-check] 缺少 health-check.py: $hcPy" -ForegroundColor Red
    exit 2
}

function Find-Python {
    # 1. 本机权威配置: personal-hub\personal.local.json -> dsh-tool-python.patch.config.pythonPath
    $localJson = Join-Path $PSScriptRoot 'personal-hub\personal.local.json'
    if (Test-Path -LiteralPath $localJson) {
        try {
            $cfg = Get-Content -Raw -LiteralPath $localJson -Encoding UTF8 | ConvertFrom-Json
            foreach ($p in @($cfg.plugins)) {
                if ($p.name -eq 'dsh-tool-python' -and $p.patch.config.pythonPath) {
                    $cand = [string]$p.patch.config.pythonPath
                    if (Test-Path -LiteralPath $cand) { return $cand }
                }
            }
        } catch { }
    }
    # 2. py launcher
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $out = & py -3 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) {
            $exe = ($out | Select-Object -Last 1).Trim()
            if ($exe -and (Test-Path -LiteralPath $exe)) { return $exe }
        }
    }
    # 3. PATH 中排除 Store 桩
    foreach ($c in @(Get-Command python -All -ErrorAction SilentlyContinue)) {
        if ($c.Source -and $c.Source -notmatch 'WindowsApps') {
            if (Test-Path -LiteralPath $c.Source) { return $c.Source }
        }
    }
    # 4. LOCALAPPDATA 常见安装位置
    foreach ($root in @((Join-Path $env:LOCALAPPDATA 'Programs\Python'), (Join-Path $env:LOCALAPPDATA 'Python'))) {
        if (Test-Path -LiteralPath $root) {
            $hit = Get-ChildItem -LiteralPath $root -Recurse -Filter 'python.exe' -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch 'WindowsApps' } |
                Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    return $null
}

$py = Find-Python
if (-not $py) {
    Write-Host '[health-check] 未找到可用 python。' -ForegroundColor Red
    Write-Host '  请安装 Python 3.12+，或在 personal-hub\personal.local.json 配置 dsh-tool-python 的 pythonPath。'
    exit 2
}

& $py -c "pass" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[health-check] python 不可执行: $py" -ForegroundColor Red
    exit 2
}

Write-Host "[health-check] 使用 python: $py" -ForegroundColor DarkGray
& $py -X utf8 $hcPy @ForwardArgs
exit $LASTEXITCODE
