---
date: "2026-09-09T02:07:43.626Z"
symptom: "每次更新官方 DSH 时 update-dsh.ps1 提示\"仓库有未提交的修改, 中止升级\"，即使推送插件显示全部同步也无法更新"
component: "update-dsh.ps1"
severity: "major"
status: "fixed"
root_cause: "update-dsh.ps1 把\"官方 checkout 工作树干净\"当升级前置条件硬中止，而本地补丁常态存在，导致拉取官方更新被本地未提交修改卡死。"
fix: "update-dsh.ps1：硬中止改为 检测报告 + pull 前 stash 暂存 + pull 后 pop 恢复（冲突保留 stash 并提示）；CheckOnly 不动工作树。"
related_files:
  - "E:\\DSH\\DSH-ops\\update-dsh.ps1"
---

用户长期困扰：update-dsh.ps1 第 23-29 行的"本地工作区必须干净"检查在官方仓库 Deepseek_DSH 有未提交修改时硬性 `exit 1` 中止升级。而该官方 checkout 因为承载本地补丁（如 rpc-host.ts 的上游 connection 回归修复 `owner.webServer → owner.root.webServer`）几乎常态不干净——用户每次拉官方更新都被卡住，误以为"推送插件没同步"。本质：更新目标是官方 origin，push 状态（本地未推送提交/未提交修改）与拉取官方代码无关，不该成为升级前置条件。修复：1) 检查改为"检测 + 报告"，不再中止；2) git pull 前若 $dirty 非空则 `git stash push -u -m 'dsh-update-auto'`（含未跟踪文件）自动暂存；3) pull 成功后 `git stash pop` 恢复，冲突时保留 stash 并给出处理指引（不静默丢失）；4) pull 失败时提示 stash 内容保留；5) -CheckOnly 模式永不 stash、不动工作树（只报告）。设计要点：stash 动作放在 fetch 成功且确认有更新之后、pull 之前，使网络/凭据/代理等前置失败路径不会留下待恢复的暂存内容；无更新路径（local==remote）$stashed 恒为 false 不触发 pop。验证：PowerShell 语法解析通过；-CheckOnly 实测——工作树有 rpc-host.ts 修改时不中止，凭据校验/备份/代理/fetch 全通过，报告"发现更新: 本地 c389f96bf3a9 -> 远端 5dda764ed3aa"（exit 2 有更新信号，符合 CheckOnly 语义）；test-standard 4/4。注意：远端 5dda764ed3aa 为 09-09 官方新提交，用户此前因硬中止错过了本次更新，可随时重跑 更新DSH.bat 完成升级。


> 2026-09-09 架构分离更新: 补丁载体已从官方 checkout（现已纯净）迁移到个人运行副本 `E:\DSH\DSH-ops\Deepseek_DSH`，由 `official-patches/apply-patches.mjs` 精确文本替换管理（见 ARCHITECTURE.md）。官方升级后由 sync-official.ps1 自动重打。
