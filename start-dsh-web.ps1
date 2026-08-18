$ErrorActionPreference = 'Continue'
$ops = 'D:\GongJu\DSH-ops'
New-Item -ItemType Directory -Path $ops -Force | Out-Null
$log = Join-Path $ops 'dsh-switch.log'
$me = $PID

# 控制台 + 日志双输出。
function Write-Both([string]$msg) {
  Write-Host $msg
  "[$([DateTime]::Now)] $msg" | Out-File $log -Append
}

# 单实例保护：只匹配真正的 `pwsh/powershell -File start-dsh-web.ps1` 调用
# （不带 -Command），避免命令行里恰好提到脚本名的诊断进程被误判。
$others = Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" |
  Where-Object {
    $_.ProcessId -ne $me -and
    $_.CommandLine -match 'start-dsh-web\.ps1' -and
    $_.CommandLine -match '-File' -and
    $_.CommandLine -notmatch '-Command'
  }
if ($others) {
  Write-Both "另一个启动器已在运行 (pid $($others.ProcessId -join ',')), 本实例退出"
  exit 0
}

# 已在运行则直接成功退出（随后打开浏览器）。
$existing = Get-NetTCPConnection -State Listen -LocalPort 3080 -ErrorAction SilentlyContinue
if ($existing) {
  Write-Both "DSH 服务已在运行 (pid $($existing[0].OwningProcess))"
  "$($existing[0].OwningProcess)" | Out-File (Join-Path $ops 'dsh-web.pid')
  Start-Process 'http://127.0.0.1:3080'
  Start-Sleep -Seconds 2
  exit 0
}

# link 插件预检闸门：注册期抛错的插件会让每次启动尝试在监听端口前崩溃
# （13:05 事故：3 次重试死于同一错误）。先验证，把无意义重试变成一次明确报错。
& 'C:\Program Files\nodejs\node.exe' (Join-Path $ops 'validate-plugins.mjs') 2>&1 | ForEach-Object { Write-Both "plugins: $_" }
if ($LASTEXITCODE -ne 0) {
  Write-Both '启动中止: link 插件未通过预检 (见上方 plugins: 行); 修复插件后重试'
  exit 1
}

Write-Both '正在启动 DSH 服务，请稍候...'
for ($attempt = 1; $attempt -le 3; $attempt++) {
  $p = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
    -ArgumentList 'apps/cli/lib/bin.js', 'web' `
    -WorkingDirectory 'D:\GongJu\Deepseek_DSH' `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $ops 'dsh-web.log') `
    -RedirectStandardError (Join-Path $ops 'dsh-web.err.log') `
    -PassThru
  Write-Both "第 $attempt 次尝试: 进程 $($p.Id) 已启动, 等待就绪 (最多 15 秒)..."
  Start-Sleep -Seconds 15
  $c = Get-NetTCPConnection -State Listen -LocalPort 3080 -ErrorAction SilentlyContinue
  if ($c) {
    Write-Both "DSH 服务启动成功 (pid $($c[0].OwningProcess))"
    "$($c[0].OwningProcess)" | Out-File (Join-Path $ops 'dsh-web.pid')
    Start-Process 'http://127.0.0.1:3080'
    Start-Sleep -Seconds 2
    exit 0
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Write-Both "第 $attempt 次尝试未就绪, 已终止该进程"
}
Write-Both '启动失败: 3 次尝试均未成功, 请查看 dsh-web.err.log'
exit 1
