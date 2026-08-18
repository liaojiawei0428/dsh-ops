---
date: "2026-08-18T14:02:58.894Z"
symptom: "版本胶囊显示 \"DSH unknown\"，repo-status 报 git -C D:\\Deepseek_DSH 路径不存在"
component: "dsh-deepseek-balance"
severity: "major"
status: "fixed"
root_cause: "自动路径推导的目录层级数算错：插件位于 DSH-ops/plugins/<name>/，到 DSH-ops 只需两级 ..，实现写了三级，导致推导到父目录、REPO_DIR 指向不存在的 D:\\Deepseek_DSH。"
fix: "resolveOpsDir 的 .. 层级从三级改为两级（plugins/<name> 到 DSH-ops 只需两级）；bug-log 的 buglogDir 同样修正。"
related_files:
  - "D:/GongJu/DSH-ops/plugins/dsh-deepseek-balance/index.js"
  - "D:/GongJu/DSH-ops/plugins/dsh-bug-log/index.js"
---

为支持任意盘符部署，给 balance 与 bug-log 插件加了从自身位置推导仓库路径的逻辑。balance 插件位于 DSH-ops/plugins/dsh-deepseek-balance/index.js，从插件目录到 DSH-ops 只需两级 ..（dsh-deepseek-balance→plugins→DSH-ops），但实现写了三级 ..，推导结果 OPS_DIR=D:\GongJu（父目录），REPO_DIR=D:\Deepseek_DSH（不存在）→ repo-status 报 "git -C D:\Deepseek_DSH fetch origin: No such file or directory"，version 读不到 package.json 显示 unknown，版本胶囊显示"DSH unknown"。bug-log 的 buglogDir 同样三级错误。定位：用户报障后直接计算 dirname/join 推导路径，对比实际目录层级发现多算一级。修复：两处 .. 从三级改两级；用真实路径验证 OPS_DIR/REPO_DIR/BUGLOG 均存在。验证：闸门全绿；此事故再次证明任何路径推导改动必须用真实路径断言验证。
