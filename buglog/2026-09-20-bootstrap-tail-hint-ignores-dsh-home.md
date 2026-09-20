---
date: "2026-09-20T02:12:14.278Z"
symptom: "隔离演练（设了 DSH_HOME）跑完 bootstrap 后，收尾提示仍写「恢复用户数据: ~/.dsh/settings.yaml 与 .credentials.yaml」——指向正式环境而非实际装配目录。"
component: "bootstrap-personal.ps1"
severity: "minor"
status: "fixed"
root_cause: "收尾提示是硬编码字面量，未跟随运行时解析出的用户数据根；同时 `$dshHome` 的赋值位置藏在可选分支里，导致 -SkipProfile 路径下该变量根本未定义——两个问题叠加，使提示在隔离与跳过装配两种情况下都会指错。"
fix: "bootstrap-personal.ps1：① 前置检查段新增 `$isolated`，并在 fatal 检查之后统一定义 `$dshHome`（隔离取 DSH_HOME，否则 ~/.dsh）；② 收尾提示改用 `$dshHome`，隔离分支额外打印演练专用指引（不要跑会按 3080 判存活的脚本、改用直起 CLI + 空闲端口、验证完按端口 pid 停）；③ profile 装配分支删除重复的 `$dshHome` 赋值。"
related_files:
  - "bootstrap-personal.ps1"
  - "DEPLOY.md"
  - "research/deploy-sim/doc-defects.md"
dsh_commit: "3664f90d81"
---

发现路径：隔离部署（DSH_HOME=F:\ceshi_1\.dsh-home）跑完后，bootstrap 收尾打印「1. 恢复用户数据: ~/.dsh/settings.yaml 与 .credentials.yaml」，而 profile 实际装配在 F:\ceshi_1\.dsh-home——照着这句做会把用户数据放进正式环境。同一脚本第 5 步已经正确打印了 `DSH_HOME = F:\ceshi_1\.dsh-home（个人 profile 装配到这里）`，只是收尾提示写死了 ~/.dsh。修复时顺带发现一个更隐蔽的问题：`$dshHome` 原本只在 `if (-not $SkipProfile)` 分支里赋值，所以带 `-SkipProfile` 运行时它是未定义的，收尾提示会打印成 `\settings.yaml`（缺盘符）。已把 `$dshHome` 提到前置检查之后统一定义（前置检查已保证非隔离时 %USERPROFILE% 非空，不会触发 Join-Path 空值报错），profile 分支改为复用。验证：把收尾块提取成文件、分别用 `$isolated=$true/$false` 跑——隔离时打印隔离目录绝对路径 + 演练专用启动指引（不要跑 start-dsh-web.ps1、改直起 CLI --port 3081、也别跑 health-check）；正式时保持原提示。语法检查 0 错误、BOM 在位、T5 闸门通过。
