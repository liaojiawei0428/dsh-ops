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

# ---------- 0. 前置条件检查（2026-09-19 部署审核 M2/M5/S4/D4） ----------
# 新机最容易缺的是 git / pnpm。不先检查的后果是：缺 git 时克隆那行抛 PowerShell 英文
# CommandNotFoundException（走不到下面「VPN/代理需先就绪」的中文提示，M5）；缺 pnpm 或
# Node 版本不符时，要等 3~4 分钟的依赖安装或构建阶段才以英文报错炸出来（M2）。
# 这里把校验提前到第 0 步，并对每个缺口给出可直接执行的安装命令（= DEPLOY.md 第 0 步）。
if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "必须用 PowerShell 7 运行本脚本（当前 $($PSVersionTable.PSVersion)）。安装: winget install Microsoft.PowerShell"
}

function Test-CommandVersion {
  param([string]$Exe, [string[]]$VersionArgs)
  $cmd = Get-Command $Exe -ErrorAction SilentlyContinue
  if (-not $cmd) { return @{ Present = $false; Version = ''; Path = '' } }
  $raw = $null
  try { $raw = (& $Exe @VersionArgs 2>$null | Select-Object -First 1) } catch { $raw = $null }
  # 坑（2026-09-19 实测）：命令无输出时 $raw 是 AutomationNull，而 [string]AutomationNull
  # 得到的是 $null 而不是 ''，于是 ([string]$raw).Trim() 抛
  # "You cannot call a method on a null-valued expression"；在 $ErrorActionPreference='Stop'
  # 下这会中断整个脚本，连后面的 exit 1 都跑不到（表现为"报了错却继续执行"）。
  # 所以必须先判 $null 再做字符串化。
  $ver = if ($null -eq $raw) { '' } else { "$raw".Trim() }
  return @{ Present = $true; Version = $ver; Path = [string]$cmd.Source }
}

$fatal = @()

# git：克隆与升级链的硬依赖
$git = Test-CommandVersion -Exe 'git' -VersionArgs @('--version')
if (-not $git.Present) {
  $fatal += "未找到 git。安装: winget install Git.Git（装完重开终端）"
} else {
  Write-Host "前置 OK : git $($git.Version)"
}

# Node.js：官方要求 ^22.19 || >=24
$node = Test-CommandVersion -Exe 'node' -VersionArgs @('-v')
if (-not $node.Present) {
  $fatal += "未找到 node。安装 Node.js ^22.19 或 >=24: winget install OpenJS.NodeJS.LTS（或用 nvm/fnm/volta，脚本走定位链）"
} elseif ($node.Version -eq '') {
  $fatal += 'node 命令存在但读不到版本（`node -v` 失败或无输出）—— 请在该终端手动运行 node -v 确认；常见原因是环境变量不完整'
} else {
  $nv = $node.Version -replace '^v', ''
  $parts = $nv.Split('.')
  $maj = 0; $min = 0
  [void][int]::TryParse($parts[0], [ref]$maj)
  if ($parts.Length -gt 1) { [void][int]::TryParse($parts[1], [ref]$min) }
  $nodeOk = ($maj -gt 24) -or ($maj -eq 24) -or ($maj -eq 22 -and $min -ge 19)
  if (-not $nodeOk) {
    $fatal += "Node 版本不符: 当前 $($node.Version)，官方要求 ^22.19 或 >=24"
  } else {
    Write-Host "前置 OK : node $($node.Version)"
  }
}

# pnpm：官方 lockfile 用 pnpm 11
$pnpm = Test-CommandVersion -Exe 'pnpm' -VersionArgs @('-v')
if (-not $pnpm.Present) {
  $fatal += "未找到 pnpm。安装: corepack enable（Node 自带 corepack）或 npm i -g pnpm@11"
} elseif ($pnpm.Version -eq '') {
  # 实测：%USERPROFILE% 为空时 pnpm 自身会失败（它要靠这些环境变量定位 store/缓存），
  # 此时报"未找到 pnpm"是错的——命令其实在，只是跑不起来。
  $fatal += 'pnpm 命令存在但读不到版本（`pnpm -v` 失败或无输出）—— 请手动运行 pnpm -v；常见原因是环境变量不完整（如 %USERPROFILE%/%APPDATA% 为空）或 shim 损坏'
} else {
  $pmaj = 0
  [void][int]::TryParse(($pnpm.Version -split '\.')[0], [ref]$pmaj)
  if ($pmaj -lt 11) {
    $fatal += "pnpm 版本过低: 当前 $($pnpm.Version)，官方 lockfile 需要 pnpm 11+（npm i -g pnpm@11）"
  } else {
    Write-Host "前置 OK : pnpm $($pnpm.Version)"
  }
}

# 用户数据根：DSH_HOME 缺省取 %USERPROFILE%\.dsh。服务账户下 USERPROFILE 可能为空，
# 那样 profile 会被装到相对路径且不报错（D4），所以这里直接拦住。
# $isolated 供收尾提示区分「隔离演练」与「正式部署」（2026-09-20 部署模拟 D5）。
$userProfile = $env:USERPROFILE
$isolated = [bool]($env:DSH_HOME -and $env:DSH_HOME.Trim() -ne '')
if (-not $isolated -and (-not $userProfile -or $userProfile.Trim() -eq '')) {
  $fatal += '未设置 DSH_HOME 且 %USERPROFILE% 为空 —— 无法确定用户数据根目录。请显式设置 DSH_HOME 后重试'
}

# python：非致命（bootstrap 本身不需要），但缺了会让 dsh-tool-python 不可用、
# 且个人覆盖层探测不到 pythonPath —— 第 4 步验收必红，所以提前警告并给安装命令。
# 注意：Microsoft Store 的 python 桩（…\WindowsApps\python.exe）会被 Get-Command 找到，
# 但它不可用（DEPLOY.md 第 0 步明写「勿用」；health-check 与下面的路径探测都排除它）。
# 2026-09-20 部署模拟 D6：原实现把该桩报成「前置 OK」，与第 0 步自相矛盾。
$py = Get-Command python -ErrorAction SilentlyContinue
$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
$pyIsStub = $py -and $py.Source -like '*\WindowsApps\*'
if ($pyIsStub) { $py = $null }
if (-not $py -and -not $pyLauncher) {
  if ($pyIsStub) {
    Write-Host '前置警告: python 解析到 Microsoft Store 桩（…\WindowsApps\python.exe），不会被采用。'
  } else {
    Write-Host '前置警告: 未找到 python（命令 python / py 均不可用）。'
  }
  Write-Host '          dsh-tool-python 与 health-check 的体检第 1 条都依赖它，建议现在装:'
  Write-Host '          winget install Python.Python.3.12（勿用 Microsoft Store 版；装完重开终端）'
} else {
  Write-Host "前置 OK : python（$(if ($py) { $py.Source } else { 'py launcher' })）"
}

if ($fatal.Count -gt 0) {
  Write-Host ''
  Write-Host '前置条件不满足，部署未开始（命令行环境不完整时继续只会得到英文报错）:'
  foreach ($f in $fatal) { Write-Host "  - $f" }
  Write-Host ''
  Write-Host '完整清单见 DEPLOY.md 第 0 步；装完请重开终端（PATH 才会刷新）后重跑本脚本。'
  exit 1
}
Write-Host ''

# 用户数据根在这里就定下来（前置检查已保证非隔离时 %USERPROFILE% 非空）：
# 收尾提示与 -SkipProfile 路径都要用，不能只在 profile 装配分支里赋值。
$dshHome = if ($isolated) { $env:DSH_HOME.Trim() } else { Join-Path $userProfile '.dsh' }

$repo = $PSScriptRoot
$copy = Join-Path $repo 'Deepseek_DSH'

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
  # $dshHome 已在前置检查之后统一定义（隔离演练取 DSH_HOME，否则 ~/.dsh）
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
# 收尾提示必须跟随实际的 DSH_HOME：隔离演练时写 ~/.dsh 会把人指到正式环境去
# （2026-09-20 部署模拟 D5）。
Write-Host "  1. 恢复用户数据: $dshHome\settings.yaml 与 .credentials.yaml（备份或手工配置）"
if ($isolated) {
  Write-Host '     （当前是隔离演练: DSH_HOME 已指向上面这个目录，不是 ~/.dsh）'
  Write-Host '  2. 启动服务: 不要跑 start-dsh-web.ps1 —— 它按 3080 判存活，本机正式服务在跑时'
  Write-Host '     会误判「已在运行」并打开正式页面。改用直起 CLI（换一个空闲端口）:'
  Write-Host '       $env:DSH_HOME = ''<上面的隔离目录>'''
  Write-Host '       node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --port 3081 --no-open'
  Write-Host '     验证完按该端口的监听 pid 停掉；也别在同机演练时跑 health-check（它按 3080 判存活）。'
} else {
  Write-Host '  2. 启动服务: pwsh -File start-dsh-web.ps1（或双击 启动DSH.bat）'
}
Write-Host "  3. 验证: 插件闸门 node .\validate-plugins.mjs 应 11/11 PASS；服务起来后浏览器打开"
Write-Host '     本机端口（默认 http://127.0.0.1:3080；用日志里带 token 的地址，裸地址 401）'