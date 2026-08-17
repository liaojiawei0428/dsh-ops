# 公共库：动态系统代理读取 + 分级诊断。
# 被 check-update.ps1 / update-dsh.ps1 通过 dot-source 加载。
# 所有文件均为 UTF-8 带 BOM（Windows PowerShell 5.1 需要）。

# 从注册表读取当前系统代理（VPN 软件每次启动会自动更新这里）。
# @returns @{ Enabled; Url; Port; Status }
function Get-SystemProxy {
  try {
    $reg = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  } catch {
    return @{ Enabled = $false; Url = $null; Port = $null; Status = '无法读取系统代理设置 (注册表访问失败)' }
  }
  if ($reg.ProxyEnable -ne 1) {
    return @{ Enabled = $false; Url = $null; Port = $null; Status = '系统代理未启用 (ProxyEnable=0)' }
  }
  $server = [string]$reg.ProxyServer
  if ([string]::IsNullOrWhiteSpace($server)) {
    return @{ Enabled = $false; Url = $null; Port = $null; Status = '系统代理已启用但未配置服务器地址' }
  }
  # 解析 ProxyServer: 可能为 "127.0.0.1:7688" 或 "http=127.0.0.1:7688;https=127.0.0.1:7688"
  $url = $null
  foreach ($part in $server.Split(';')) {
    $part = $part.Trim()
    if ($part -eq '') { continue }
    if ($part -match '^([a-z]+)=(.+)$') {
      $scheme = $Matches[1]
      $addr = $Matches[2].Trim()
      if ($scheme -eq 'http' -or $scheme -eq 'https') { $url = "http://$addr"; break }
      if ($scheme -eq 'socks' -or $scheme -eq 'socks5') { $url = "socks5://$addr"; break }
    } elseif ($url -eq $null -and $part -notmatch '^[a-z]+=') {
      $url = "http://$part"
    }
  }
  if ($url -eq $null) {
    return @{ Enabled = $false; Url = $null; Port = $null; Status = "无法解析代理地址: $server" }
  }
  $port = $null
  if ($url -match ':(\d+)$') { $port = [int]$Matches[1] }
  return @{ Enabled = $true; Url = $url; Port = $port; Status = 'OK' }
}

# 检查代理端口是否有进程监听。
function Test-ProxyListening([int]$port) {
  if (-not $port) { return $false }
  $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  return [bool]$c
}

# 应用代理：设置 git 使用的环境变量，并输出分级诊断。
# @returns $true 代理可用（环境变量已设置）；$false 不可用（原因已输出）。
function Set-ProxyEnvironment($proxy) {
  if (-not $proxy.Enabled) {
    Write-Host "[代理诊断] $($proxy.Status)" -ForegroundColor Yellow
    Write-Host '[代理诊断] 这是本地配置问题: GitHub 需要代理才能访问, 请开启 VPN 软件并确认系统代理已启用' -ForegroundColor Yellow
    return $false
  }
  if (-not (Test-ProxyListening $proxy.Port)) {
    Write-Host "[代理诊断] 代理地址 $($proxy.Url) 的端口 $($proxy.Port) 没有服务在监听" -ForegroundColor Yellow
    Write-Host '[代理诊断] 这是本地问题: VPN 软件可能未运行或未启动代理服务, 请先开启 VPN' -ForegroundColor Yellow
    return $false
  }
  $env:http_proxy = $proxy.Url
  $env:https_proxy = $proxy.Url
  return $true
}
