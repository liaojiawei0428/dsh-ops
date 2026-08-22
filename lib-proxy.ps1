# 公共库：动态系统代理读取 + 分级诊断 + 直连降级。
# 被 check-update.ps1 / update-dsh.ps1 通过 dot-source 加载。
# 所有文件均为 UTF-8 带 BOM（Windows PowerShell 5.1 需要）。

# 从注册表读取当前系统代理（VPN 软件每次启动会自动更新这里）。
# TUN/虚拟网卡模式的 VPN 不会开启系统代理（ProxyEnable=0），这是正常状态；
# 因此本函数只描述"系统代理是否存在"，最终可用性由 Set-ProxyEnvironment
# 结合直连探测决定，不再把 ProxyEnable=0 当作硬错误。
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

# 直连 GitHub 探测：TCP 连接 github.com:443，3 秒超时。
# TUN/虚拟网卡模式的 VPN 流量已全部走虚拟网卡，此探测通过即代表
# 无需系统代理也能访问 GitHub。
# @returns $true 直连可达；$false 不可达。
function Test-GitHubDirect {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $iar = $client.BeginConnect('github.com', 443, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(3000)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# 应用网络通道：优先系统代理（设置 git 使用的环境变量）；系统代理不可用
# 时降级为直连探测（TUN 虚拟网卡模式），直连通过则不设置代理环境变量。
# 输出分级诊断。
# @returns $true 网络通道可用；$false 不可用（原因已输出）。
function Set-ProxyEnvironment($proxy) {
  if ($proxy.Enabled) {
    if (-not (Test-ProxyListening $proxy.Port)) {
      Write-Host "[代理诊断] 代理地址 $($proxy.Url) 的端口 $($proxy.Port) 没有服务在监听" -ForegroundColor Yellow
      Write-Host '[代理诊断] 这是本地问题: VPN 软件可能未运行或未启动代理服务, 请先开启 VPN' -ForegroundColor Yellow
      return $false
    }
    $env:http_proxy = $proxy.Url
    $env:https_proxy = $proxy.Url
    Write-Host "[代理诊断] 系统代理已就绪: $($proxy.Url)" -ForegroundColor Green
    return $true
  }
  # 系统代理未启用（TUN/虚拟网卡 VPN 的正常状态）：先探直连，不直接判死。
  Write-Host "[代理诊断] $($proxy.Status), 探测直连 GitHub..." -ForegroundColor DarkGray
  if (Test-GitHubDirect) {
    Write-Host '[代理诊断] 直连可达（虚拟网卡/TUN 模式）, 本次将直连访问 GitHub, 无需系统代理' -ForegroundColor Green
    return $true
  }
  Write-Host "[代理诊断] $($proxy.Status) 且直连 GitHub 不可达" -ForegroundColor Yellow
  Write-Host '[代理诊断] 这是本地网络问题: 请开启 VPN 软件 (系统代理模式或 TUN 虚拟网卡模式均可)' -ForegroundColor Yellow
  return $false
}