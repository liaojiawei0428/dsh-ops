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

# 1.5 用户配置完整性校验（在动任何东西之前）。
# 背景: .credentials.yaml 一旦损坏, 凭据插件按设计 fail-loud, 进程在监听端口前
# 就退出, 启动器重试全部失败。该文件设计上是扁平的 KEY: value 结构,
# 值里不允许出现冒号 —— 行内出现第二个 ": " 即为损坏特征。
$credPath = Join-Path $env:USERPROFILE '.dsh\.credentials.yaml'
if (Test-Path $credPath) {
  $lineNo = 0
  foreach ($line in (Get-Content $credPath)) {
    $lineNo++
    if ($line -match '^\s*(#.*)?$') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^:]+?)\s*$') {
      Write-Both "错误: $credPath 第 $lineNo 行不是合法的 KEY: value 条目 (值中不允许冒号)"
      Write-Both "恢复: 从 $env:USERPROFILE\.dsh\backups\<时间戳>\ 复制最近的备份"
      exit 1
    }
  }
  Write-Both '凭据文件结构 OK'
}

# 1.6 备份用户配置（升级出错时可立即恢复; 含密钥, 必须留在本机, 不可提交仓库）。
$backupDir = Join-Path $env:USERPROFILE ("\.dsh\backups\" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($f in @('.credentials.yaml', 'settings.yaml')) {
  $p = Join-Path $env:USERPROFILE ".dsh\$f"
  if (Test-Path $p) { Copy-Item $p $backupDir }
}
$profPkg = Join-Path $env:USERPROFILE '.dsh\profiles\web\package.json'
if (Test-Path $profPkg) { Copy-Item $profPkg $backupDir }
Write-Both "用户配置已备份到 $backupDir"

# 1.7 记录升级前的版本号（用于升级成功后写入本地版本台账）。
$oldVer = 'unknown'
try { $oldVer = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version } catch {}

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

# 3.5 记录升级后的提交（用于版本台账; 无更新时与旧提交相同）。
$newSha = git -C $repo rev-parse HEAD

# 4. 重新安装依赖。
Push-Location $repo
try {
  Write-Both '安装依赖 (pnpm install --frozen-lockfile)...'
  pnpm install --frozen-lockfile
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
  Write-Both "回滚到升级前版本: git -C $repo checkout $($local.Substring(0, 12)) 后重跑本脚本"
  Pop-Location
  exit 1
}
Pop-Location

# 6. 新版本号确认。
$ver = node (Join-Path $repo 'apps\cli\lib\bin.js') --version
Write-Both "新版本: $ver"

# 6.5 profile 组合预检: profile 声明的每个 bundle 都必须能解析进组合树。
# 背景: 曾发生过 npm 上同名旧版插件被误装, 位置形态全错。这一步在重启前
# 就能发现 bundle 解析失败; 已链接插件指向的路径丢失也会在此暴露。
$dump = node (Join-Path $repo 'apps\cli\lib\bin.js') --profile web --dump-config 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Write-Both "错误: dump-config 失败, 中止 (旧服务不受影响): $dump"
  exit 1
}
$bundles = (Get-Content $profPkg -Raw | ConvertFrom-Json).dsh.profile.bundles
foreach ($b in @($bundles)) {
  if ($dump -notmatch [regex]::Escape($b)) {
    Write-Both "错误: profile 声明的 bundle '$b' 未出现在组合树中 (依赖丢失或未安装)"
    Write-Both "中止重启, 旧服务不受影响; 修复: 检查 $profPkg 与 node_modules 链接"
    exit 1
  }
}
Write-Both "profile 组合校验 OK ($(@($bundles).Count) 个 bundle 全部解析)"

# 6.7 link 插件预检闸门: 用真实核心校验器执行每个 link 插件的注册路径。
# 背景: 13:05 事故——插件注册期抛错 (schema 方言违规) 使进程在监听端口前
# 崩溃, 启动器 3 次重试全部死于同一错误。此闸门在动旧服务之前拦截该类故障。
& 'C:\Program Files\nodejs\node.exe' (Join-Path $ops 'validate-plugins.mjs') 2>&1 | ForEach-Object { Write-Both "plugins: $_" }
if ($LASTEXITCODE -ne 0) {
  Write-Both '错误: link 插件未通过预检, 中止重启 (旧服务不受影响)'
  Write-Both '修复对应插件后重跑本脚本; 也可临时从 profile bundles 移除该插件'
  exit 1
}
Write-Both 'link 插件预检 OK'

# 7. 重启服务让新构建生效。
Write-Both '重启 DSH 服务...'
# pid 文件可能缺失或过期（服务器由 restart 脚本/其他方式启动时不会更新它），
# 按端口 3080 找真实监听进程兜底，保证自动更新真的换上新构建。
$pidFile = Join-Path $ops 'dsh-web.pid'
$killed = $false
if (Test-Path $pidFile) {
  $old = Get-Content $pidFile
  $alive = Get-Process -Id $old -ErrorAction SilentlyContinue
  if ($alive) {
    Stop-Process -Id $old -Force -ErrorAction SilentlyContinue
    Write-Both "已停止旧服务 (pid $old)"
    $killed = $true
  }
}
if (-not $killed) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort 3080 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Both "已按端口停止旧服务 (pid $($listener.OwningProcess))"
  } else {
    Write-Both '未发现运行中的服务, 直接启动'
  }
}
Start-Sleep -Seconds 2
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ops 'start-dsh-web.ps1')
if ($LASTEXITCODE -ne 0) {
  Write-Both '服务重启失败, 请手动运行 启动DSH.bat 或查看 dsh-web.err.log'
  exit 1
}

# 7.5 HTTP 健康检查: 启动器退出码为 0 不等于服务已就绪。
$healthy = $false
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3080' -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -lt 500) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 3 }
}
if (-not $healthy) {
  Write-Both '错误: 服务 120 秒内未就绪, 排障: dsh-web.err.log / dsh-update.log'
  Write-Both "回滚: git -C $repo checkout $($local.Substring(0, 12)) && 重跑本脚本"
  exit 1
}
Write-Both '健康检查 OK (http://127.0.0.1:3080 已就绪)'

# 8. 写入本地版本台账（每次成功升级追加一行; 台账随 DSH-ops 双机同步）。
$historyFile = Join-Path $ops 'version-history.md'
if (-not (Test-Path $historyFile)) {
  @(
    '# DSH 本地版本台账',
    '',
    '每次成功升级由 update-dsh.ps1 自动追加。版本号来自官方 package.json（稳定），提交为 git commit 前 12 位（精确）。',
    '',
    '| 日期 | 升级前 | 升级后 | 提交 | 方式 |',
    '|---|---|---|---|---|'
  ) | Out-File -FilePath $historyFile -Encoding utf8
}
$method = if ($env:DSH_UPDATE_SOURCE -eq 'auto') { '自动更新' } else { '手动' }
$row = "| $((Get-Date).ToString('yyyy-MM-dd HH:mm')) | $oldVer | $ver | $($newSha.Substring(0, 12)) | $method |"
Add-Content -Path $historyFile -Value $row -Encoding utf8
Write-Both "版本台账已更新: $historyFile"

Write-Both '升级完成! 浏览器将自动打开页面'
exit 0
