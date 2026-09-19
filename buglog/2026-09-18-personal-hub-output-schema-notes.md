---
date: "2026-09-18T09:25:03.338Z"
symptom: "重启后首次调用 personal_hub_status 直接失败：tool \"personal_hub_status\" returned invalid output: \"value.notes\" is not a declared property (additionalProperties: false)"
component: "dsh-personal-hub"
severity: "major"
status: "fixed"
root_cause: "DSH 工具的 output.schema 是 additionalProperties:false 的强校验白名单。本次给 statusReport 新增 notes 后只改了实现与 client 渲染，未同步该工具 output.schema 的 properties/required，返回体因此多出未声明字段，整次工具调用被判定为 invalid output。execute 的 catch 兜底返回同样漏了 notes，构成第二条触发路径。validate-plugins.mjs 的 \"schemas valid\" 只覆盖 input schema 方言，对 output schema 与实现形状的一致性没有检查，故闸门全绿仍会在真实调用时失败。"
fix: "personal_hub_status 的 output.schema 补 notes（required + properties）；render 追加非漂移提示段；execute 的 catch 兜底分支补 notes: []"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
---

## 暴露路径
给 `statusReport` 新增 `notes` 字段、改完 client 与 README 后重启服务，第一次调用 `personal_hub_status` 直接失败：
`Error: tool "personal_hub_status" returned invalid output: "value.notes" is not a declared property (additionalProperties: false)`
——即 **DSH 工具的输出是强校验的**，返回体多一个未声明字段会让整次调用失败（不是忽略多余字段）。

## 根因
`personal_hub_status` 的 tool 定义（index.js 第 70-82 行）用 `output.schema` 白名单：
`additionalProperties: false` + `required: ['ok','drift','summary']` + 只有三个 properties。
本次改动只更新了**实现返回值**与 **client 渲染**，漏掉了三处必须同步的地方：schema 的 `required`/`properties`、`render` 函数（不同步则模型看到的内容里没有提示段）、以及 `execute` 的 `catch` 兜底分支（原本返回 `{ok:false, drift:[], summary}`，同样缺 `notes`，会在异常路径上二次触发同一错误）。

## 闸门盲区（本次未修，仅记录）
`node validate-plugins.mjs` 报 "schemas valid" 只覆盖 **input** schema 的方言约束（P3 那类 `required` 位置错误），**不校验 output schema 与实现返回形状的一致性** —— 所以这次闸门全绿却在实际调用时炸掉。判断是否值得给闸门加这条检查：需要静态分析 `execute` 的返回表达式，误报风险高；更实际的对策是把"改返回形状必须同步 output.schema"写成准则条款。

## 修复
- `output.schema.required` 加 `notes`，`properties` 加 `notes: { type: 'array', items: { type: 'string' } }`；
- `render` 改为：先出漂移/无漂移行，`notes.length > 0` 时追加"提示（非漂移，reapply 会保留）："段，让提示真正到达模型与用户；
- `catch` 分支返回值补 `notes: []`。

## 验证
临时脚本 import 插件模块，把 `statusReport` 的实际 keys 与 schema `required` 列表对拍：
`statusReport keys = ["ok","drift","notes","summary"]`、`missing required = []`、`undeclared extra = []`、`shape OK = true`；
同时 `ok = true`、`drift = []`、`notes = ["cordis.patch.yml 存在非托管条目 id tool-agent-team（保留，不计为错误，仅供知悉）"]`、`validate.ok = true`；`validate-plugins.mjs` 全绿。脚本用后即删。

## 教训（通用）
给 DSH 工具增加返回字段时，**四处必须同改**：实现返回值、`output.schema.properties`、`output.schema.required`、`render`；有 `catch` 兜底返回的分支要一起改，否则正常路径修好了、异常路径仍会炸。input schema 错了闸门会拦，output schema 错了只有真调用才发现。
