# setup.ps1 — 在新电脑上一键部署你自己的 DSH（家用/办公室各运行一次）
# 前提：已安装 Node.js / pnpm / git；本目录(DSH-ops)已 clone 到 D:\GongJu\DSH-ops
# 用法：双击 安装DSH.bat（可带参数：.\setup.ps1 -RepoDir 'D:\GongJu\Deepseek_DSH'）
# 凭据(.credentials.yaml)不含在本仓库中，需从旧电脑手动拷贝一次，见末尾提示。

param(
    [string]$RepoDir = 'D:\GongJu\Deepseek_DSH'
)

$ErrorActionPreference = 'Stop'
$opsRoot = $PSScriptRoot
$officialRemote = 'https://github.com/deepseek-ai/deepseek-harness.git'

function Write-Step($msg) { Write-Host ''; Write-Host ('==> ' + $msg) -ForegroundColor Cyan }

# ---------- [0/7] 工具链检查 ----------
Write-Step '[0/7] 检查工具链 (node / pnpm / git)'
$missing = @()
foreach ($tool in @('node', 'pnpm', 'git')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { $missing += $tool }
}
if ($missing.Count -gt 0) {
    Write-Host ('缺少工具: ' + ($missing -join ', ')) -ForegroundColor Red
    Write-Host '  node : https://nodejs.org 下载 LTS (v22+) 安装后重开终端'
    Write-Host '  pnpm : npm install -g pnpm'
    Write-Host '  git  : https://git-scm.com/download/win'
    exit 1
}
Write-Host ('node ' + (node --version) + '  pnpm ' + (pnpm --version) + '  git ' + (git --version)) -ForegroundColor Green

# ---------- [1/7] 系统代理（GitHub 克隆需要） ----------
Write-Step '[1/7] 检查系统代理 (仅 GitHub 克隆需要, pnpm 走国内镜像不受影响)'
. (Join-Path $opsRoot 'lib-proxy.ps1')
$proxy = Get-SystemProxy
$gitProxyArgs = @()
if ($proxy.Enabled -and $proxy.Status -eq 'OK' -and (Test-ProxyListening $proxy.Port)) {
    Write-Host ('使用系统代理: ' + $proxy.Url) -ForegroundColor Green
    $gitProxyArgs = @('-c', ('http.proxy=' + $proxy.Url), '-c', ('https.proxy=' + $proxy.Url))
} else {
    Write-Host '系统代理不可用: ' -NoNewline
    Write-Host ($proxy.Status) -ForegroundColor Yellow
    Write-Host 'GitHub 直连通常被重置, 克隆大概率失败; 建议先开启 VPN 再继续' -ForegroundColor Yellow
    $answer = Read-Host '仍要继续尝试吗? (y/n)'
    if ($answer -notmatch '^[yY]') { exit 1 }
}

# ---------- [2/7] 克隆官方仓库 ----------
Write-Step ('[2/7] 官方源码仓库: ' + $RepoDir)
if (Test-Path (Join-Path $RepoDir '.git')) {
    Write-Host '已存在, 跳过克隆 (升级请运行 更新DSH.bat)' -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Force (Split-Path $RepoDir) | Out-Null
    & git @gitProxyArgs clone $officialRemote $RepoDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host '克隆失败: 若提示连接被重置/超时, 是 VPN 代理未生效, 不是 DSH 的问题' -ForegroundColor Red
        exit 1
    }
    Write-Host '克隆完成' -ForegroundColor Green
}
# 国内 npm 镜像, 避免官方 registry 卡住 (与旧电脑保持一致)
$npmrc = Join-Path $RepoDir '.npmrc'
if (-not (Test-Path $npmrc)) {
    Set-Content -Path $npmrc -Value 'registry=https://registry.npmmirror.com/' -Encoding ascii
    Write-Host '已写入 .npmrc (npmmirror 镜像)' -ForegroundColor Green
}

# ---------- [3/7] 安装依赖 ----------
Write-Step '[3/7] pnpm install (几分钟, 请耐心)'
Push-Location $RepoDir
& pnpm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host 'pnpm install 失败' -ForegroundColor Red; exit 1 }

# ---------- [4/7] 构建 ----------
Write-Step '[4/7] pnpm run build (几分钟, 请耐心)'
& pnpm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host '构建失败, 请把上方报错发给我' -ForegroundColor Red; exit 1 }
Pop-Location

# ---------- [5/7] 注册自定义插件 ----------
Write-Step '[5/7] 注册自定义插件 (dsh-locale-language, 界面语言跟随)'
$pluginDir = Join-Path $opsRoot 'plugins\dsh-locale-language'
& node (Join-Path $RepoDir 'apps\cli\lib\bin.js') plugin --profile web add $pluginDir
if ($LASTEXITCODE -ne 0) { Write-Host '插件注册失败' -ForegroundColor Red; exit 1 }
Write-Host '插件已注册' -ForegroundColor Green

# ---------- [6/7] 配置文件 ----------
Write-Step '[6/7] DSH 用户配置 (~\.dsh\settings.yaml)'
$dshHome = Join-Path $env:USERPROFILE '.dsh'
New-Item -ItemType Directory -Force $dshHome | Out-Null
$settingsDst = Join-Path $dshHome 'settings.yaml'
if (Test-Path $settingsDst) {
    Write-Host '已存在, 保留不覆盖 (如需重置请手动删除后再运行)' -ForegroundColor Green
} else {
    Copy-Item (Join-Path $opsRoot 'config\settings.yaml') $settingsDst
    Write-Host '已从 config\settings.yaml 复制 (模型/主题等与旧电脑一致)' -ForegroundColor Green
}

# ---------- [7/7] 桌面快捷方式 ----------
Write-Step '[7/7] 创建桌面快捷方式'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'DSH 启动.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = Join-Path $opsRoot '启动DSH.bat'
$sc.WorkingDirectory = $opsRoot
$sc.Description = '启动 DSH (自动检查更新并打开页面)'
$sc.Save()
Write-Host ('已创建: ' + $lnk) -ForegroundColor Green

# ---------- 完成 ----------
Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host ' 安装完成!' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green
$cred = Join-Path $dshHome '.credentials.yaml'
if (-not (Test-Path $cred)) {
    Write-Host ''
    Write-Host '[重要] 还差最后一步: API 凭据不随仓库分发, 需要从旧电脑拷贝一次' -ForegroundColor Yellow
    Write-Host ('  旧电脑: ' + 'C:\Users\<用户名>\.dsh\.credentials.yaml') -ForegroundColor Yellow
    Write-Host ('  拷贝到: ' + $cred) -ForegroundColor Yellow
    Write-Host '  (用 U 盘/私有渠道, 不要通过网盘或聊天工具明文传输)' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '日常使用: 双击桌面 "DSH 启动" 或 DSH-ops\启动DSH.bat' -ForegroundColor Green
Write-Host '升级版本: 双击 DSH-ops\更新DSH.bat (两台电脑各自运行)' -ForegroundColor Green
