<#
  sync-official.ps1 — 官方源码 → 个人副本同步 + 补丁应用

  架构:
    E:\DSH\Deepseek_DSH           官方 checkout（纯净, 只拉官方, 跟随官方一致性）
    E:\DSH\DSH-ops\Deepseek_DSH   个人部署副本（独立 node_modules + 本地补丁, 运行源）

  职责:
    - 默认: 官方源码增量复制到副本 → 应用补丁 → 重建副本（补丁源码在副本 → 产物带补丁）
    - -ApplyPatchesOnly: 只对副本应用官方补丁（bootstrap 新电脑用时）
    - -SkipBuild: 同步 + 应用补丁, 不构建

  补丁说明（official-patches/ 内嵌替换对）:
    官方 checkout 永远纯净（不手改）; 补丁以精确文本替换的形式保存在
    official-patches/apply-patches.ps1, 对副本的源码进行替换。官方升级若改动了
    同一处代码, 替换会因找不到目标串而 fail-loud, 避免静默漏补。

  用法:
    pwsh -File sync-official.ps1 [-ApplyPatchesOnly] [-SkipBuild]
  #>
param(
  [switch]$ApplyPatchesOnly,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'

$ops = $PSScriptRoot
$official = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'
$copy = Join-Path $ops 'Deepseek_DSH'

if (-not (Test-Path (Join-Path $copy 'package.json'))) { throw "个人副本缺失: $copy" }

# ---------- 1. 官方源码 → 副本增量同步（-ApplyPatchesOnly 时跳过） ----------
if (-not $ApplyPatchesOnly) {
  if (-not (Test-Path (Join-Path $official '.git'))) { throw "官方仓库缺失: $official" }
  Write-Host "同步官方源码 → 个人副本`n  官方: $official`n  副本: $copy"
  $excludeDirs = @('.git', 'node_modules', '.artifacts', '.dsh-build', '__pycache__', '.tmp-inspect')
  $dirArgs = @(); foreach ($d in $excludeDirs) { $dirArgs += @('/XD', $d) }
  robocopy $official $copy /E $dirArgs /XJ /NFL /NDL /NP
  $rc = $LASTEXITCODE
  if ($rc -ge 8) { throw "robocopy 失败 (exit $rc)" }
  Write-Host "源码同步完成 (robocopy exit $rc, 0/1 = 无变化/已复制)"
} elseif (Test-Path $ops) {
  Write-Host '模式: 仅应用补丁（跳过官方同步）'
}

# ---------- 2. 应用官方补丁（精确文本替换, Node 脚本） ----------
Write-Host '应用官方补丁...'
& node (Join-Path $ops 'official-patches\apply-patches.mjs') (Join-Path $copy 'packages')
if ($LASTEXITCODE -ne 0) { throw '补丁应用失败' }

# ---------- 3. 构建副本 ----------
if (-not $SkipBuild -and -not $ApplyPatchesOnly) {
  Write-Host '构建个人副本...'
  Push-Location $copy
  try { pnpm run build; if ($LASTEXITCODE -ne 0) { throw "副本构建失败 (exit $LASTEXITCODE)" } }
  finally { Pop-Location }
  Write-Host '副本构建完成 OK'
} elseif ($SkipBuild) {
  Write-Host '跳过构建 (-SkipBuild)'
} else {
  Write-Host '补丁已应用（构建由 bootstrap 流程负责）'
}

Write-Host '完成。'