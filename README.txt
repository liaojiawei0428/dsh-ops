DSH 运维目录（D:\GongJu\DSH-ops）
==================================
本目录存放 DeepSeek Harness (DSH) Web 服务的运维文件，与源码仓库 D:\GongJu\Deepseek_DSH 分离，保持仓库干净。
本目录同时是一个 Git 仓库（GitHub 私有仓库），用于在多台电脑之间同步你的自定义配置。

【一键启动（推荐）】
  双击本目录的「启动DSH.bat」（或桌面快捷方式「DSH 启动」）：
  1) 自动检查更新：有新版本会黄色醒目提示（网络不通时静默跳过，不阻塞）
  2) 服务已在运行 → 直接打开浏览器页面 http://127.0.0.1:3080
     服务未运行   → 自动启动（最多重试 3 次，每次等待 15 秒）→ 成功后打开浏览器
  3) 启动失败     → 窗口提示错误并暂停，可查看 dsh-web.err.log
  有更新时，双击「更新DSH.bat」即可升级。

【一键升级】
  双击「更新DSH.bat」自动完成：检查远端 → git pull → pnpm install → 重新构建 →
  重启服务 → 打开页面。构建失败时旧服务不受影响（继续跑旧版本）。
  只想看有没有新版本（不动服务）：powershell -File update-dsh.ps1 -CheckOnly

【多台电脑维护同一套 DSH（家用 + 办公室）】
  你的所有自定义（启动器/更新器/代理库/locale 插件/settings 模板）都随本仓库同步；
  官方源码仓库 D:\GongJu\Deepseek_DSH 两台电脑【各自】clone，不要用网盘同步
  （node_modules 链接和构建产物会损坏）。版本一致靠两边各自运行「更新DSH.bat」，
  对比 check-update 输出的 commit 短 SHA 即可确认。

  ▶ 新电脑首次安装（一次性）：
     1) 安装 Node.js LTS (v22+)、git、pnpm（npm install -g pnpm）
     2) git clone 本私有仓库到 D:\GongJu\DSH-ops（GitHub 需开 VPN）
     3) 从旧电脑把 C:\Users\<用户名>\.dsh\.credentials.yaml 用 U 盘/私有渠道
        拷到新电脑同位置（API 凭据绝不进 git 仓库！）
     4) 双击本目录「安装DSH.bat」：自动克隆官方源码 → pnpm install → 构建 →
        注册 locale 插件 → 复制 settings.yaml → 建桌面快捷方式
     5) 之后与旧电脑用法完全相同（启动DSH.bat / 更新DSH.bat）
     注意：两台电脑都使用 D:\GongJu 路径约定（插件以绝对路径链接）。

  ▶ 日常双向同步：
     改了插件/脚本/settings 模板后：git add -A; git commit -m "..."; git push
     另一台电脑：git pull（然后按需重跑安装DSH.bat 或手动应用变更）

【手动操作】
  停止服务：
      Stop-Process -Id (Get-Content D:\GongJu\DSH-ops\dsh-web.pid) -Force
  或按任务管理器结束 dsh-web.pid 中的 node 进程。

文件说明：
  setup.ps1            新电脑一键安装（幂等，旧电脑重跑无害）
  安装DSH.bat          新电脑安装入口（纯 ASCII）
  config\settings.yaml DSH 用户配置模板（模型/主题等，安装时复制到 ~\.dsh\）
  plugins\dsh-locale-language\  自定义插件：模型思维链/回复跟随界面语言
  lib-proxy.ps1        公共库：动态读取系统代理（每次运行从注册表读当前 VPN 端口）
                       + 分级诊断（本地问题 vs 网络问题）
  check-update.ps1     启动时更新检查（动态代理，失败明确提示原因）
  start-dsh-web.ps1    核心启动器（UTF-8 带 BOM！）：启动/检测服务 + 打开浏览器
  update-dsh.ps1       一键升级（动态代理 + git pull + pnpm install + build + 重启服务）
  启动DSH.bat          双击入口（纯 ASCII，避免 cmd 编码问题），检查更新 + 启动
  更新DSH.bat          双击入口：一键升级
  dsh-switch.log      启动器运行日志
  dsh-web.log         dsh web 服务标准输出
  dsh-web.err.log     dsh web 服务错误输出
  dsh-web.pid         当前服务进程 PID

维护提醒：
  - 所有含中文的 .ps1（setup.ps1 / start-dsh-web.ps1 / check-update.ps1 /
    update-dsh.ps1 / lib-proxy.ps1）必须保持 UTF-8 带 BOM，否则 Windows
    PowerShell 5.1 会按 ANSI 解析导致乱码报错。若用编辑器/工具修改后丢了 BOM，
    用下面命令补回（以 setup.ps1 为例）：
        $b = [IO.File]::ReadAllBytes('D:\GongJu\DSH-ops\setup.ps1')
        if (-not ($b[0] -eq 0xEF)) { [IO.File]::WriteAllBytes(
          'D:\GongJu\DSH-ops\setup.ps1', [byte[]](0xEF,0xBB,0xBF) + $b) }
  - 所有 .bat 保持纯 ASCII（不要加中文），cmd 对编码最敏感的就是它。
  - 单实例保护：重复双击启动器不会叠加进程，已在运行会直接退出。
  - .gitignore 已排除 *.log 与 dsh-web.pid，凭据(.credentials.yaml)不在本目录，
    永远不要把它提交进仓库。
