param(
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$repo = 'D:\GongJu\Deepseek_DSH'
$ops = 'D:\GongJu\DSH-ops'
$log = Join-Path $ops 'dsh-update.log'
. (Join-Path $ops 'lib-proxy.ps1')

function Write-Both([string]$msg) {
  Write-Host $msg
  "[$([DateTime]::Now)] $msg" | Out-File $log -Append
}

Write-Both '==== DSH 升级检查 ===='
if (-not (Test-Path (Join-Path $repo '.git'))) {
  Write-Both "错误: 未找到仓库 $repo"
  exit 1
}

# 1. 本地工作区必须干净（.npmrc 等未跟踪文件不算）。
$dirty = git -C $repo status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
if ($dirty) {
  Write-Both "警告: 仓库有未提交的修改, 中止升级:`n$dirty"
  exit 1
}
Write-Both '本地工作区干净 OK'

# 2. 代理诊断（本地问题在此明确中止）。
$proxy = Get-SystemProxy
if (-not (Set-ProxyEnvironment $proxy)) {
  Write-Both "升级中止: $($proxy.Status)"
  Write-Both '提示: 这是本地配置问题, 请开启 VPN 并确认系统代理已启用后重试'
  exit 1
}
Write-Both "使用系统代理: $($proxy.Url)"

# 3. 获取远端信息（走动态代理）。
Write-Both '正在检查远端更新 (git fetch)...'
git -C $repo -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 fetch origin 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Both '升级中止: 代理已就绪但访问 GitHub 失败 (可能是 VPN 节点失效或网络波动)'
  Write-Both '请切换 VPN 节点或检查网络后重试'
  exit 1
}
$local = git -C $repo rev-parse HEAD
$remote = git -C $repo rev-parse origin/master
$localShort = $local.Substring(0, 12)
$remoteShort = $remote.Substring(0, 12)

if ($local -eq $remote) {
  Write-Both "本地已是最新: $localShort (origin/master 相同)"
  if ($CheckOnly) { exit 0 }
  Write-Both '没有新提交, 跳过 git pull'
} else {
  Write-Both "发现更新: 本地 $localShort -> 远端 $remoteShort"
  if ($CheckOnly) { exit 2 }
  git -C $repo pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Both 'git pull 失败 (可能本地有提交, 需要手动处理)'; exit 1 }
  Write-Both 'git pull 完成 OK'
}

if ($CheckOnly) { exit 0 }

# 4. 重新安装依赖。
Push-Location $repo
try {
  Write-Both '安装依赖 (pnpm install)...'
  pnpm install
  if ($LASTEXITCODE -ne 0) { throw 'pnpm install 失败' }
  Write-Both '依赖安装完成 OK'

  # 5. 重新构建（lib + web）。
  Write-Both '构建中 (pnpm run build, 约 2-5 分钟, 请勿关闭窗口)...'
  pnpm run build
  if ($LASTEXITCODE -ne 0) { throw 'pnpm run build 失败' }
  Write-Both '构建完成 OK'
} catch {
  Write-Both "构建阶段失败: $($_.Exception.Message)"
  Write-Both '旧服务仍在运行, 不受影响 (可继续使用旧版本)'
  Pop-Location
  exit 1
}
Pop-Location

# 6. 新版本号确认。
$ver = node (Join-Path $repo 'apps\cli\lib\bin.js') --version
Write-Both "新版本: $ver"

# 7. 重启服务让新构建生效。
Write-Both '重启 DSH 服务...'
$pidFile = Join-Path $ops 'dsh-web.pid'
if (Test-Path $pidFile) {
  $old = Get-Content $pidFile
  Stop-Process -Id $old -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ops 'start-dsh-web.ps1')
if ($LASTEXITCODE -ne 0) {
  Write-Both '服务重启失败, 请手动运行 启动DSH.bat 或查看 dsh-web.err.log'
  exit 1
}
Write-Both '升级完成! 浏览器将自动打开页面'
exit 0
