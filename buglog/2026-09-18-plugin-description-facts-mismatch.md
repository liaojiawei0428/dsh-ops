---
date: "2026-09-18T10:40:22.077Z"
symptom: "插件管理页与插件说明页里，dsh-deepseek-balance 与 dsh-plugin-guide 的说明与实际功能不符（余额胶囊被写成在「会话头部」，实际在作曲器下方且是两个；界面语言插件被写成「通用设置里的界面语言切换行」，实际是注入全局提示词指令）"
component: "dsh-plugin-guide / dsh-deepseek-balance"
severity: "minor"
status: "fixed"
root_cause: "文案来源本身有误：① dsh-deepseek-balance 的 package.json description（英文原文即写错 session header，实际注册在 dsh.personal.bar 且是两个胶囊），Lead 中文化时直译沿用；② dsh-plugin-guide 的 GUIDE 字典两条为历史遗留的错误描述（把官方设置功能说成本插件、沿用了同源的「会话头部」错误），以及一条描述该插件并不具备的卡片注入能力。"
fix: "把 dsh-deepseek-balance 的 package.json description 改为准确表述（作曲器下方个人胶囊行的余额与 DSH 版本两个胶囊）；修正 dsh-plugin-guide GUIDE 字典中 locale-language 与 deepseek-balance 两条错误说明；顺手改正 plugin-guide 自述中不存在的「卡片注入」能力描述"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\package.json"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-plugin-guide\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-locale-language\\index.js"
  - "E:\\DSH\\DSH-ops\\plugin-display-names.md"
---

## 发现路径
用户要求「插件管理页所有插件都显示中文名称与中文说明」。建团队后由队友 inventory 盘点 19 个 bundle 时，在附录 B 里指出两处文案与实际功能不符；Lead 逐条独立核实后确认成立并修复。

## 两处错误
**1. `dsh-deepseek-balance` 的说明写「会话头部显示 DeepSeek 账户余额胶囊」——位置和数量都错。**
- 实际：`plugins/dsh-deepseek-balance/client.js` 第 220-225 行注册在 `slots.inject('dsh.personal.bar', ...)`，即**作曲器下方**的个人胶囊行（该容器由 `dsh-personal-bar` 提供），且是**两个**插槽：`deepseek-balance`（order 100）与 `deepseek-balance-version`（order 101）。
- 该插件的 README 首段本来就写对了（「输入卡下方横排一行」），错的是 `package.json` 的 description。
- **这是 Lead 自己在 2026-09-18 引入的**：为了中文化插件说明，按英文原文直译，而英文原文（`DSH system component: DeepSeek account balance capsule in the session header`）本身就写错了「session header」。教训：直译既有文案会把原文档的错误一并继承，中文化时应以代码/README 为准复核事实。

**2. `dsh-plugin-guide` 的 GUIDE 字典两条张冠李戴。**
- `locale-language` 原写「通用设置里的界面语言切换行（个人插件）」——「界面语言切换行」是**官方**设置功能；该插件实际是注入一条全局提示词指令，让模型的思维链与回复跟随界面语言（见其 `index.js` 头部 JSDoc）。该插件目录下**没有 README.md**，依据只能是 JSDoc + `package.json`。
- `deepseek-balance` 原写「会话头部显示 DeepSeek 账户余额与版本胶囊」——与错误 1 同源。
- 同文件第 193 行 `plugin-guide` 自述「在插件清单卡片里注入中文说明」也不符：该插件只注册 `settings.plugins.tab`（第 269-270 行），**没有**任何卡片注入能力，实际只是在设置页提供一份可搜索的说明清单。此条由 Lead 顺手改正。

## 修复
- `plugins/dsh-deepseek-balance/package.json` 的 description 改为「作曲器下方个人胶囊行的余额与 DSH 版本两个胶囊」（22 字，按卡片单行约束定稿）。
- `plugins/dsh-plugin-guide/client.js` 的 GUIDE 字典两条文案改正（inventory 执行，diff 仅 2 行），`plugin-guide` 一条由 Lead 改正。
- 新增 `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY`（17 条 bundle 级中文名与说明），供官方插件管理页使用；建立 `plugin-display-names.md` 作为文案台账，每条都带依据来源。

## 验证
- `node --check plugins/dsh-plugin-guide/client.js` 通过；`validate-plugins.mjs` 11/11 PASS。
- `git diff --stat` 显示 GUIDE 更正仅 2 处增删，未波及其他条目。
- 说明字段的端到端效果需重启服务后在插件管理页确认（description 由 profile 解析时读取）。

## 遗留
- 本次只修了「说明」与 GUIDE 文案；卡片**标题**的中文化另需 patch（见 `plugin-display-names.md` 的「实现方式」），不属于本条记录范围。
- `dsh-locale-language` 缺 README.md（P10 要求每个插件必有 README），本次未补。
