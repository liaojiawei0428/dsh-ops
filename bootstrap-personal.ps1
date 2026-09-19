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
$userProfile = $env:USERPROFILE

# 官方源码版本锚点（2026-09-19 部署审核 B2）：解析顺序 = 环境变量 DSH_OFFICIAL_REF
# → official-patches\official-ref.txt（入库声明值）→ 远端默认分支。见 lib-official-ref.ps1。
# 注意：git clone --branch 只接受 tag 或分支名，不接受裸 commit SHA——要钉某个提交
# 请用 tag（官方发版即打 tag，如 dsh-v0.1.6-alpha.2）。浅克隆默认不取 tag 对象，
# 指定 --branch <tag> 时 git 会按 ref 拉取，因此 pin tag 在 --depth 1 下可用。
. (Join-Path $repo 'lib-official-ref.ps1')
$refArgs = @(Get-OfficialRefArgs -OpsRoot $repo)
$refInfo = Get-OfficialRef -OpsRoot $repo
if ($refInfo.Value) { Write-Host "官方版本锚点 : $($refInfo.Value)（来源: $($refInfo.Source)）" }

Write-Host '==== 个人 DSH 部署引导 ===='
Write-Host "个人仓库 : $repo"
Write-Host "官方副本 : $copy"

# ---------- 1. 官方源码（clone 到个人仓库内, 不入个人 git） ----------
if (-not (Test-Path (Join-Path $copy '.git'))) {
  Write-Host '1/5 克隆官方仓库...'
  git clone --depth 1 @refArgs $OfficialUrl $copy
  if ($LASTEXITCODE -ne 0) { throw '官方仓库克隆失败（VPN/代理需先就绪）' }
  $fix = Initialize-PinnedClone -Path $copy
  if ($fix) { Write-Host "     $fix" }
} else {
  Write-Host '1/5 官方副本已存在, 跳过 clone'
}

# ---------- 1b. 平级官方 checkout（升级链的拉取源） ----------
# update-dsh.ps1 / sync-official.ps1 / check-update.ps1 都用 Split-Path $ops -Parent
# 定位官方 checkout（<root>\Deepseek_DSH, 与本仓库平级）。它不在本仓库内, 新机
# 必须单独克隆——否则「更新DSH.bat」第一次升级就失败（2026-09-19 部署审核）。
$officialRoot = Join-Path (Split-Path $repo -Parent) 'Deepseek_DSH'
if (-not (Test-Path (Join-Path $officialRoot '.git'))) {
  Write-Host '1b/5 克隆平级官方 checkout（升级链拉取源）...'
  Write-Host "     $officialRoot"
  git clone --depth 1 @refArgs $OfficialUrl $officialRoot
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $officialRoot '.git'))) {
    throw "平级官方 checkout 克隆失败（网络/代理需就绪）: $officialRoot"
  }
  # 升级链（update-dsh.ps1）要能解析 origin/master，见 Initialize-PinnedClone 的注释。
  $fix = Initialize-PinnedClone -Path $officialRoot
  if ($fix) { Write-Host "     $fix" }
} else {
  Write-Host "1b/5 平级官方 checkout 已存在, 跳过 clone ($officialRoot)"
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
  $dshHome = if ($env:DSH_HOME -and $env:DSH_HOME.Trim() -ne '') { $env:DSH_HOME } else { Join-Path $userProfile '.dsh' }
  Write-Host "  DSH_HOME = $dshHome（个人 profile 装配到这里）"
  # 机器特定覆盖层（personal.local.json）——reapply 依赖它作为合并层, 缺失时生成
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
  # 确保 profile 目录有最小 package.json（reapply 的 validateManifest 要求它存在）
  New-Item -ItemType Directory -Path (Join-Path $dshHome 'profiles\web') -Force | Out-Null
  $profPkg = Join-Path $dshHome 'profiles\web\package.json'
  if (-not (Test-Path $profPkg)) {
    '{"name":"dsh-profile-web","private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}' |
      Set-Content $profPkg -Encoding UTF8
    Write-Host "  已初始化 profile 骨架: $profPkg"
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
Write-Host '  3. 验证: 浏览器打开 http://127.0.0.1:3080, 插件闸门 (validate-plugins.mjs) 应全部 PASS'