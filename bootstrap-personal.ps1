<#
  bootstrap-personal.ps1 — 新电脑部署个人 DSH 的一键引导

  架构（见 ARCHITECTURE.md）:
    <repo>（DSH-ops, git 推 GitHub）
      ├── Deepseek_DSH\         官方源码副本（运行源, 独立 node_modules + 补丁, .gitignore 不入个人 git）
      ├── plugins\              自研插件
      ├── personal-hub\         个人层清单
      ├── official-patches\     官方补丁（apply-patches.mjs 精确替换）
      └── bootstrap-personal.ps1   ← 本文件

  本脚本完成新电脑的完整部署（代码 + 构建 + profile 装配）:
    1. clone 官方仓库到 <repo>\Deepseek_DSH（本地副本, 不入个人 git）
    2. pnpm install（副本依赖, 首次约 3-4 分钟）
    3. 应用官方补丁（精确文本替换, 目标串唯一校验）
    4. pnpm run build（副本构建, 产物带补丁）
    5. profile 装配（reapply-cli 按清单重建 ~/.dsh/profiles/web, link 路径运行时派生）
 之后启动服务（start-dsh-web.ps1 或 启动DSH.bat）; 日常更新走 update-dsh.ps1 + sync-official.ps1。
 用户数据（~/.dsh/settings.yaml、.credentials.yaml）含密钥, 不在本脚本生成——
 按 DEPLOY.md「用户配置」节恢复（备份/手工）。

  用法:  pwsh -File bootstrap-personal.ps1 [-OfficialUrl <url>] [-SkipInstall] [-SkipProfile]
  #>
param(
  [string]$OfficialUrl = 'https://github.com/deepseek-ai/deepseek-harness.git',
  [switch]$SkipInstall,
  [switch]$SkipProfile
)
$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
$copy = Join-Path $repo 'Deepseek_DSH'
$home = $env:USERPROFILE

Write-Host '==== 个人 DSH 部署引导 ===='
Write-Host "个人仓库 : $repo"
Write-Host "官方副本 : $copy"

# ---------- 1. 官方源码（clone 到个人仓库内, 不入个人 git） ----------
if (-not (Test-Path (Join-Path $copy '.git'))) {
  Write-Host '1/5 克隆官方仓库...'
  git clone --depth 1 $OfficialUrl $copy
  if ($LASTEXITCODE -ne 0) { throw '官方仓库克隆失败（VPN/代理需先就绪）' }
} else {
  Write-Host '1/5 官方副本已存在, 跳过 clone'
}

# ---------- 2. 依赖安装 ----------
if (-not $SkipInstall) {
  Write-Host '2/5 pnpm install（首次约 3-4 分钟）...'
  Push-Location $copy
  try { pnpm install; if ($LASTEXITCODE -ne 0) { throw 'pnpm install 失败' } }
  finally { Pop-Location }
} else {
  Write-Host '2/5 跳过依赖安装 (-SkipInstall)'
}

# ---------- 3. 应用官方补丁 ----------
Write-Host '3/5 应用官方补丁...'
node (Join-Path $repo 'official-patches\apply-patches.mjs') (Join-Path $copy 'packages')
if ($LASTEXITCODE -ne 0) { throw '补丁应用失败' }

# ---------- 4. 构建副本 ----------
Write-Host '4/5 构建个人副本...'
Push-Location $copy
try { pnpm run build; if ($LASTEXITCODE -ne 0) { throw '构建失败' } }
finally { Pop-Location }

# ---------- 5. profile 装配（按个人层清单重建 web profile） ----------
if (-not $SkipProfile) {
  Write-Host '5/5 装配 web profile（reapply-cli 按清单重建）...'
  # 隔离演练: 尊重 DSH_HOME（默认 ~/.dsh）。演练机/生产机设置 DSH_HOME 可完全隔离
  $dshHome = if ($env:DSH_HOME -and $env:DSH_HOME.Trim() -ne '') { $env:DSH_HOME } else { Join-Path $home '.dsh' }
  Write-Host "  DSH_HOME = $dshHome（个人 profile 装配到这里）"
  # 机器特定覆盖层（personal.local.json）——reapply 依赖它作为合并层, 缺失时生成
  $localCfg = Join-Path $repo 'personal-hub\personal.local.json'
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
    Write-Host "  已生成覆盖层 $localCfg（pwshPath=$pwshPath, 请核对）"
  } else {
    Write-Host "  覆盖层已存在: $localCfg"
  }
  node (Join-Path $repo 'reapply-cli.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'reapply-cli 失败（profile 装配未完成）' }
} else {
  Write-Host '5/5 跳过 profile 装配 (-SkipProfile)'
}

Write-Host '==== 部署完成 ===='
Write-Host '下一步（详见 DEPLOY.md）:'
Write-Host '  1. 恢复用户数据: ~/.dsh/settings.yaml 与 .credentials.yaml（备份或手工配置）'
Write-Host '  2. 启动服务: pwsh -File start-dsh-web.ps1（或双击 启动DSH.bat）'
Write-Host '  3. 验证: 浏览器打开 http://127.0.0.1:3080, 插件闸门应 10/10 通过'