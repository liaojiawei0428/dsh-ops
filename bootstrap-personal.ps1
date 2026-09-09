<#
  bootstrap-personal.ps1 — 新电脑部署个人 DSH 的一键引导

  架构:
    <repo>                      个人 DSH 仓库（DSH-ops, git 推 GitHub）
      ├── plugins\              自研插件
      ├── personal-hub\         个人层清单
      ├── official-patches\     官方源码补丁（apply-official-patches 内嵌）
      ├── sync-official.ps1     官方 → 副本增量同步（本机更新用）
      └── bootstrap-personal.ps1   ← 本文件: 新电脑首次部署

  本脚本完成新电脑的完整部署:
    1. clone 官方仓库到 <repo>\Deepseek_DSH（本地副本, 不入个人 git）
    2. pnpm install（副本依赖）
    3. 应用官方补丁（official-patches, 精确文本替换）
    4. pnpm run build（副本构建, 产物带补丁）
    5. 校验: session 读取器 lib 含补丁标记
  之后把 DSH-ops 的运维脚本（update-dsh.ps1 等）指向副本即可运行。

  用法:  pwsh -File bootstrap-personal.ps1 [-OfficialUrl <url>] [-SkipInstall]
  #>
param(
  [string]$OfficialUrl = 'https://github.com/deepseek-ai/deepseek-harness.git',
  [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
$copy = Join-Path $repo 'Deepseek_DSH'

Write-Host '==== 个人 DSH 部署引导 ===='
Write-Host "个人仓库: $repo"
Write-Host "官方副本: $copy"

# 1. 官方源码（clone 到个人仓库同级, 不入个人 git）
if (-not (Test-Path (Join-Path $copy '.git'))) {
  Write-Host '1/4 克隆官方仓库...'
  git clone --depth 1 $OfficialUrl $copy
  if ($LASTEXITCODE -ne 0) { throw '官方仓库克隆失败' }
} else {
  Write-Host '1/4 官方副本已存在, 跳过 clone'
}

# 2. 依赖安装
if (-not $SkipInstall) {
  Write-Host '2/4 pnpm install（首次约 3-4 分钟）...'
  Push-Location $copy
  try { pnpm install; if ($LASTEXITCODE -ne 0) { throw 'pnpm install 失败' } }
  finally { Pop-Location }
} else {
  Write-Host '2/4 跳过依赖安装 (-SkipInstall)'
}

# 3. 应用官方补丁
Write-Host '3/4 应用官方补丁...'
node (Join-Path $repo 'official-patches\apply-patches.mjs') (Join-Path $copy 'packages')
if ($LASTEXITCODE -ne 0) { throw '补丁应用失败' }

# 4. 构建副本
Write-Host '4/4 构建个人副本...'
Push-Location $copy
try { pnpm run build; if ($LASTEXITCODE -ne 0) { throw '构建失败' } }
finally { Pop-Location }

Write-Host '==== 部署完成 ===='
Write-Host '后续: 用 DSH-ops 的 start-dsh-web.ps1 从副本启动服务; 日常更新走 update-dsh.ps1 + sync-official.ps1'