---
date: "2026-09-19T07:22:22.713Z"
symptom: "新机执行 bootstrap-personal.ps1 生成的 personal-hub/personal.local.json 是一个 JSON 字符串字面量（外层带引号、内部转义），dsh-personal-hub 的 readManifest 因 typeof !== 'object' 静默忽略整层覆盖，导致新机 profile 缺 pwsh-sandbox/tool-python 的 cordis.patch.yml 托管块，而 reapply 仍返回 ok:true、\"复检无漂移\""
component: "bootstrap-personal.ps1"
severity: "major"
status: "open"
root_cause: "bootstrap-personal.ps1:80-86 对同一哈希表做了两次 ConvertTo-Json：第 85 行 `$local = @{...} | ConvertTo-Json -Depth 5` 已把哈希表转成字符串，第 86 行写文件时又 `($local | ConvertTo-Json -Depth 5)` 再转换一次，于是落盘内容是带引号转义的 JSON 字符串；plugins/dsh-personal-hub/index.js:228 的合并前置条件是 `local !== null && typeof local === 'object' && !Array.isArray(local)`，字符串不满足，覆盖层被静默丢弃（第 228-231 行整段跳过）"
fix: "待修（本次任务写入范围只允许 repro-findings.md，未改脚本）。建议：$local 直接保存哈希表，仅在写盘处 ConvertTo-Json 一次，例如 `$localJson = $local | ConvertTo-Json -Depth 5`；并在 reapply 后校验托管块存在。临时绕过（新机手工）：删除 bootstrap 生成的 personal.local.json，按 personal-hub/README 的字段说明手工写入正确 JSON 对象（含 pwsh-sandbox、tool-python.patch.config.pythonPath、extraDependencies 两条 link）"
related_files:
  - "E:\\DSH\\DSH-ops\\bootstrap-personal.ps1"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.local.json"
dsh_commit: "05e2dda00dd695014ed1f30c2518395c71bc22bd"
---

实证（隔离沙箱，未触碰真实 ~/.dsh）：\n1) 用 pwsh 逐行复现 bootstrap-personal.ps1:77-90 的片段（仅把输出路径换到 _sandbox/manifest/personal.local.json），生成物 341 字节，首字符是 `"`，形如 `"{\\r\\n  \\"extraPatches\\": ...}"`。\n2) python json.loads 后顶层类型为 str，模拟 index.js:228 条件 → 不成立 → 覆盖层被跳过。\n3) 在该沙箱 DSH_HOME 下跑 `node reapply-cli.mjs <sandbox 清单>`（PATH 前置 pnpm shim 拦截内部 pnpm install），返回 ok:true、exit 0、"复检无漂移"，但生成的 cordis.patch.yml 只有 deepseek-balance/plugin-guide/restart-resume/web-search-deepseek 四块，缺 pwsh-sandbox。\n4) 对照组（场景C）：把覆盖层换成一个结构正确的 JSON 对象（含 pwsh-sandbox + tool-python patch + extraDependencies），同一沙箱重跑 reapply → 生成的 package.json dependencies 与开发机逐字节相同、cordis.patch.yml 六块齐全（只差非托管的 tool-agent-team），证明装配逻辑本身没问题，差异全部来自覆盖层这一层。\n5) 该缺陷位于已提交的 HEAD（`git diff --stat HEAD -- bootstrap-personal.ps1` 无输出，工作区==HEAD），因此新机 clone 必然复现，不是本机脏工作区现象。\n影响：新机 dsh-tool-python 失去固定解释器（回退 PATH 探测），pwsh-sandbox 行长丢失；且 reapply 报成功，属静默不一致，人眼难以发现。
