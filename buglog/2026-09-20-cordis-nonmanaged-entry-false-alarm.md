---
date: "2026-09-20T02:12:29.024Z"
symptom: "对比两台机器的 cordis.patch.yml 与组合树，新机少了 `- id: tool-agent-team / disabled: false` 一条，疑似「新机 Agent Teams 被禁用」——实际是功能等价的冗余显式启用，属误报。"
component: "DEPLOY.md"
severity: "minor"
status: "fixed"
root_cause: "不是缺陷，是「显式写出默认值」造成的表面差异：Cordis 里行默认启用（`enabled: !entry.disabled`），开发机曾被插件管理器写入一条等价的 `disabled: false`，新机由 reapply 生成的覆盖层不会生成非托管条目，于是两份文件在文本上不同而语义相同。"
fix: "不改代码（本来就不是缺陷）。在 DEPLOY.md「已知差异/边界」的非托管条目一节补一段实测结论：该条目缺失不影响功能，附 `enabled: !entry.disabled` 的代码依据与官方 bundle 的 insert 写法，明确\"对比两机 cordis.patch.yml 时别把这条差异当部署失败\"。"
related_files:
  - "DEPLOY.md"
  - "research/deploy-sim/verification.md"
  - "research/deploy-sim/lead-verdict.md"
dsh_commit: "3664f90d81"
---

场景：对比"新机隔离部署"与"开发机"的 profiles\web\cordis.patch.yml，发现开发机末尾多一条 `- id: tool-agent-team` + `disabled: false`，隔离部署没有；组合树 dump 也因此差 2 行（630 vs 632），而 tool-agent-team 正是支撑本会话团队模式的工具层。第一反应是"新机丢了团队功能"，属于必须查清的高危疑点。查证过程：① 逐行 diff 两份 dump——差异只有两处：`patched by <路径>` 注释里的机器路径，以及开发机多出的 `disabled: false` 一行；② 读官方 bundle `packages/experimental/agent-team-profile/cordis.patch.yml`：tool-agent-team 是用 `insert:` 引入的，**不带 disabled 字段**；③ 找 `disabled` 的默认语义：`packages/host/plugin-inventory/src/index.ts:88` 为 `enabled: !entry.disabled`，另 `boot/plugin-manager/src/patch.ts:39` 把启用写成 `disabled: !enabled`（即显式 `disabled: false` 就是"启用"的啰嗦写法）。结论：两边组合树**功能等价**，开发机那条是历史遗留的冗余显式启用；隔离部署没有它不代表团队工具不可用。副产品：确认 DEPLOY.md「非托管条目由官方组件在首次运行时补写」这句在本场景**不成立**——隔离实例真实起来过一次，该条目仍未出现，所以文档已改为"别把这条差异当部署失败"并给出语义依据。
