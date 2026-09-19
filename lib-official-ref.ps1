# 公共库：官方源码版本锚点解析（DSH_OFFICIAL_REF → 入库声明文件 → 远端默认分支）。
# 被 bootstrap-personal.ps1 / sync-official.ps1 / update-dsh.ps1 通过 dot-source 加载。
# 所有文件均为 UTF-8 带 BOM（Windows PowerShell 5.1 需要）。
#
# 为什么需要锚点（2026-09-19 部署审核 B2）：official-patches 的每条补丁都是针对官方
# 源码**具体文本**的精确替换。官方默认分支一动，新机克隆到的就是另一份源码，补丁可能
# 失配。锚点决定的是「新机首装拿到哪一份官方源码」。
#
# 取值顺序：
#   1. 环境变量 DSH_OFFICIAL_REF —— 临时指定或覆盖，优先级最高
#   2. <OpsRoot>\official-patches\official-ref.txt 的首个非注释行 —— 入库的声明值，
#      新机**不设任何环境变量**也复现同一份官方源码
#   3. 两者都没有 —— 返回 $null，调用方不追加参数，克隆远端默认分支（旧行为，不变）
#
# 限制：git clone --branch 只接受 tag 或分支名，**不接受裸 commit SHA**。
# 官方发版即打 tag（如 dsh-v0.1.6-alpha.2），要钉版本请用 tag。

function Get-OfficialRef {
  param([Parameter(Mandatory = $true)][string]$OpsRoot)

  $fromEnv = $env:DSH_OFFICIAL_REF
  if ($fromEnv -and $fromEnv.Trim() -ne '') {
    return @{ Value = $fromEnv.Trim(); Source = 'DSH_OFFICIAL_REF' }
  }

  $file = Join-Path $OpsRoot 'official-patches\official-ref.txt'
  if (Test-Path $file) {
    $line = Get-Content $file -ErrorAction SilentlyContinue |
      Where-Object { $_ -and $_.Trim() -ne '' -and -not $_.TrimStart().StartsWith('#') } |
      Select-Object -First 1
    if ($line -and $line.Trim() -ne '') {
      return @{ Value = $line.Trim(); Source = 'official-patches\official-ref.txt' }
    }
  }

  return @{ Value = $null; Source = $null }
}

# 供 git clone 直接展开的实参数组：有锚点 → @('--branch', <值>)；无锚点 → @()。
# 调用方一律写成 $refArgs = @(Get-OfficialRefArgs -OpsRoot $ops)，
# 再用 git clone --depth 1 @refArgs <url> <dest>。
# （外面那层 @() 是必要的：函数返回空数组时 PowerShell 会解包成 $null。）
function Get-OfficialRefArgs {
  param([Parameter(Mandatory = $true)][string]$OpsRoot)
  $ref = Get-OfficialRef -OpsRoot $OpsRoot
  if ($ref.Value) { return @('--branch', $ref.Value) }
  return @()
}

# 钉锚点克隆（git clone --branch <tag>）会落在**游离 HEAD**，而且 --single-branch 隐含的
# refspec 只取那个 tag —— 于是 origin/<默认分支> 根本不存在：update-dsh.ps1 的
# `git rev-parse origin/master` 报 "Needed a single revision"，升级链直接断掉。
# 本函数只做一件事：把 refspec 恢复成标准的分支映射，让后续 `git fetch origin` 能创建
# origin/<默认分支>。幂等——未钉锚点的普通克隆本来就是这个 refspec，调用无副作用。
#
# ⚠️ **不要**试图把游离 HEAD 变成本地分支：浅克隆的边界让 git 无法证明祖先关系，
# 于是 `git status` 报 "ahead 1, behind 1"、`git pull --ff-only` 报
# "Not possible to fast-forward"，升级链反而被锁死（实测）。正确做法是保持游离 HEAD，
# 由 update-dsh.ps1 走「检出远端分支尖端」。实测连续多次升级均正常、上游删除的文件会
# 被真正清掉，且仓库保持 shallow——不需要为了升级下载 287 MB 全量历史。
function Initialize-PinnedClone {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Branch = 'master'
  )
  $desired = '+refs/heads/*:refs/remotes/origin/*'
  $current = (git -C $Path config --get remote.origin.fetch) -join ';'
  if ($current -ne $desired) {
    git -C $Path config remote.origin.fetch $desired
    return "origin refspec: '$current' → '$desired'"
  }
  return $null
}
