---
date: "2026-09-19T07:30:12.606Z"
symptom: "新电脑若 node 不装在 C:\\Program Files\\nodejs（nvm-windows/fnm/volta/scoop 或装在别的盘），start-dsh-web.ps1 三次启动尝试全灭、服务根本起不来；update-dsh.ps1 在 $ErrorActionPreference='Stop' 下直接中止"
component: "start-dsh-web.ps1"
severity: "major"
status: "fixed"
root_cause: "服务启动链把 node.exe 写死为绝对路径 'C:\\Program Files\\nodejs\\node.exe' 共 4 处：start-dsh-web.ps1:127（插件闸门）、:183（启动服务本体）、:242（隔离坏插件）、update-dsh.ps1:284（插件闸门）。同一脚本里 pwsh 却有完整定位链 Resolve-PwshPath，说明作者已知该风险但只覆盖了 pwsh 与看门狗（watchdog-dsh.ps1:173-174 有 node 定位链并注释「禁止写死」）。"
fix: "在 start-dsh-web.ps1 与 update-dsh.ps1 各加 Resolve-NodePath（DSH_NODE_PATH 环境变量 → Get-Command node → %ProgramFiles%\\nodejs\\node.exe → %ProgramFiles(x86)%\\nodejs\\node.exe，与 watchdog 同纪律），启动器在解析失败时明确报错并提示 DSH_NODE_PATH，4 处硬编码全部替换为 $node；update-dsh.ps1 中两处裸 `node`（版本确认、dump-config）一并改为 `& $node`。DEPLOY.md 的定位链条目补 DSH_NODE_PATH。"
related_files:
  - "DSH-ops/start-dsh-web.ps1"
  - "DSH-ops/update-dsh.ps1"
  - "DSH-ops/watchdog-dsh.ps1"
  - "DSH-ops/DEPLOY.md"
---

发现路径：B 脚本扫描 BLOCKER-2 + D 对抗验证 A3，两路独立扫描逐字吻合。验证：改后 Select-String 确认两文件中 'Program Files\nodejs' 零命中；PowerShell AST 解析 6 个脚本全 OK；本机 Get-Command node 解析到 C:\Program Files\nodejs\node.exe（定位链在标准安装位仍走同一条路径，不改变现有行为）；health-check 全绿（含闸门 11 PASS）。
