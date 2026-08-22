---
date: "2026-08-21T13:06:40.311Z"
symptom: "运行更新DSH.bat 提示\".credentials.yaml 第 2 行不是合法的 KEY: value 条目 (值中不允许冒号)\"并中止升级，需手动从 backups 恢复。"
component: "dsh-ops-deploy"
severity: "major"
status: "fixed"
root_cause: "update-dsh.ps1 凭据守卫假设旧扁平 KEY: value 格式（值非空且不允许冒号），而 DSH 0.1.1-rc.1 启动时已把凭据文件迁移为 version: 1 + refs: 嵌套新格式（refs: 空值父键 + 缩进子键），守卫正则不认识新格式，把合法文件误判为损坏并中止升级。"
fix: "update-dsh.ps1 凭据校验重写为 Test-CredentialsYamlShape：兼容新版嵌套格式（version/refs/records 白名单 + 结构状态机）与旧扁平格式（自动迁移路径不拦截），值校验规则对齐官方 yaml 解析器（仅拒绝无引号 \": \" 序列）。"
related_files:
  - "E:\\DSH\\DSH-ops\\update-dsh.ps1"
---

现象：用户运行更新DSH.bat 报"错误: .credentials.yaml 第 2 行不是合法的 KEY: value 条目 (值中不允许冒号)，恢复: 从 backups 复制备份"，升级中止。

排查：句柄凭据文件为 version: 1 + refs: 嵌套结构（新版 0.1.1-rc.1 凭据体系格式：顶层只允许 version/refs/records，refs 键为标识符、值为非空标量；旧扁平 KEY: value 由新版启动时自动迁移）。旧守卫正则要求"值非空且不允许冒号"，不认识 refs: 空值父键与缩进子键，误判损坏。官方格式权威定义在 packages/credentials/credentials-local/src/index.ts parseCredentialsDocument：顶层白名单 {version,refs,records}；YAML 标量仅"冒号后跟空格"(: ) 无引号时非法，冒号后跟非空格（如 sk-abc:def）合法——旧守卫"值中不允许冒号"假设基于旧扁平文件的自有约定，已过时。

修复：update-dsh.ps1 新增 Test-CredentialsYamlShape 函数（从官方解析器规则推导）：状态机校验——顶层白名单 + version 数字值 + refs 块（标识符键、非空标量值、禁止更深嵌套）+ records 块（允许任意层级）+ 缩进结构 + 值冒号规则（允许冒号非空格、引号包裹任意）+ 无 version 的旧扁平格式兼容 + 扁平/新版混合检测。错误信息含具体行列。

验证：从脚本 AST 提取函数真身 16 场景测试全过（真实文件 OK、扁平兼容 OK、冒号非空格 OK、冒号+空格拦截、未知顶层键拦截、refs 空值拦截、混合拦截、records 深层放行、refs 深层拦截、缩进无块拦截、version 非数字拦截、注释空行放行、引号值放行、空 refs 放行）；D2 三检查（语法/BOM/无 powershell.exe）通过（含修复 $Path: 字符串插值语法错误 + edit 后补 BOM）；CheckOnly 端到端跑通：凭据结构 OK → TUN 直连 → fetch 成功 → 发现更新 exit 2。附带发现官方又推送新版本（本地 528c682e → 远端 b150a551b8d4）。
