# 启动时快速检查 DSH 是否有新版本。
# 动态读取系统代理；任何失败都会明确提示原因，但绝不阻塞启动流程。
# 路径约定：本脚本位于 <root>\DSH-ops，官方仓库为同级 <root>\Deepseek_DSH，
# 盘符任意，仅要求两仓库同父目录。
$ops = $PSScriptRoot
$repo = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'
. (Join-Path $ops 'lib-proxy.ps1')

# 1. 代理诊断（本地问题在这里被明确拦截并提示）。
$proxy = Get-SystemProxy
if (-not (Set-ProxyEnvironment $proxy)) {
  Write-Host '[更新检查] 已跳过本次检查 (不影响启动)' -ForegroundColor DarkGray
  exit 0
}

# 2. 增量 fetch，带低速超时保护（10 秒无进展即放弃）。
git -C $repo -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 fetch origin 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host '[更新检查] 网络通道已就绪 (系统代理或直连), 但访问 GitHub 失败' -ForegroundColor Yellow
  Write-Host '[更新检查] 这不是本地通道问题, 可能是 VPN 节点失效或网络波动, 请切换节点后重试' -ForegroundColor Yellow
  exit 0
}

$local = git -C $repo rev-parse HEAD
$remote = git -C $repo rev-parse origin/master
if ($LASTEXITCODE -ne 0 -or $local.Length -lt 12 -or $remote.Length -lt 12) { exit 0 }

if ($local -ne $remote) {
  $count = git -C $repo rev-list --count "$local..$remote"
  Write-Host ''
  Write-Host '================================================' -ForegroundColor Yellow
  Write-Host '  发现 DSH 新版本！' -ForegroundColor Yellow
  Write-Host "  本地: $($local.Substring(0, 12))  远端: $($remote.Substring(0, 12))" -ForegroundColor Yellow
  Write-Host "  新增提交: $count 个" -ForegroundColor Yellow
  Write-Host '  如需升级，请双击「更新DSH.bat」' -ForegroundColor Yellow
  Write-Host '================================================' -ForegroundColor Yellow
  Write-Host ''
} else {
  Write-Host "DSH 已是最新版本 ($($local.Substring(0, 12)))" -ForegroundColor Green
}
exit 0
