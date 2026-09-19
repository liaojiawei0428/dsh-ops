---
date: "2026-09-19T07:30:12.429Z"
symptom: "新机跑 bootstrap-personal.ps1 后 personal.local.json 是 JSON 字符串字面量（首字符为引号），覆盖层被 reapply 整层静默忽略，pwsh-sandbox/tool-python 托管块全丢，而 reapply 仍报 ok:true「复检无漂移」"
component: "bootstrap-personal.ps1"
severity: "major"
status: "fixed"
root_cause: "bootstrap-personal.ps1 第 5 步对同一个哈希表连续调用了两次 ConvertTo-Json：先 `$local = @{...} | ConvertTo-Json -Depth 5`（哈希表变成字符串），再 `WriteAllText(..., ($local | ConvertTo-Json -Depth 5))`（对字符串再转义一次）。dsh-personal-hub/index.js 的合并层守卫要求 typeof === 'object'，字符串不满足即静默跳过整层覆盖；statusReport 也不把该差异计入 drift，所以 reapply 的「复检无漂移」是假绿。"
fix: "改为先建哈希表 $localObj（含 extraPatches.pwsh-sandbox、探测到的 pythonPath 的 plugins[tool-python] 覆盖、2 条指向本机副本的 extraDependencies），只调用一次 ConvertTo-Json 后写盘；并在 health-check.py 新增第 5b 段「机器覆盖层」结构自检（顶层非 object 即 exit 1），防止同类回归再次静默通过。"
related_files:
  - "DSH-ops/bootstrap-personal.ps1"
  - "DSH-ops/health-check.py"
  - "DSH-ops/plugins/dsh-personal-hub/index.js"
---

发现路径：新机部署兼容性团队审核（task-3 实证 + task-4 对抗复核）。验证：① 用 pwsh 逐行复现旧片段，落盘 341 字节、首字符为 "；② 修后把 bootstrap 中真实的覆盖层生成段整段提取到沙箱 harness 执行，产出可被 json.loads 解析为 dict，含 plugins/extraPatches/extraDependencies 三项；③ 用该结构的覆盖层在隔离 DSH_HOME 下跑 node reapply-cli.mjs → exit 0、ok:true，生成的 profile dependencies 13 条与 bundles 15 条与开发机完全一致，cordis.patch.yml 托管块（含 pythonPath、pwshPath）齐全；④ 开发机 health-check 新增段实测「结构正常（extraPatches 1 · extraDependencies 2 · plugins 覆盖 1）」。同源记录（发现未修复）：buglog/2026-09-19-bootstrap-personal-ps1-personal-hub-pers.md。
