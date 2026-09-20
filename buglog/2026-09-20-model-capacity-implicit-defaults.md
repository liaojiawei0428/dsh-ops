---
date: "2026-09-20T10:41:40.416Z"
symptom: "agnes-3.0-flash、union-alpha、unlimitds 三个 *_jail（以及 bai 两个）模型的上下文/输出容量在仓库脚本与官方目录里都查不到，实际值隐式来自官方代码常量；llm-deepseek 段若为空则静默回退官方默认目录——两者都无法从仓库还原、也无法被当时的核对脚本发现。"
component: "settings.yaml"
severity: "minor"
status: "fixed"
root_cause: "容量元数据有两级来源（模型条目 / pi-ai 目录），两级都没有时才落到 provider 默认值，而 provider 默认值本身又是「配置文件里没写就用官方代码常量」。于是「既不在目录里、又没写进配置」的模型，其容量只存在于官方源码常量中——对使用者不可见、对配置对比不可见，且随官方升级可漂移。核对脚本当时只比段名，连 llm-deepseek 整段被清空都发现不了。"
fix: "① settings.yaml（开发机用户数据，改前已备份到 ~/.dsh/backups/20260920-183348/settings.yaml）给 unlimitds / bai / agnes / opencode-live-anthropic 四个 provider 各加 `defaultContextWindow: 262144` + `defaultMaxTokens: 32768`（= 改动前的生效值，行为不变；provider 级默认不会覆盖模型自身或目录里的显式值，故对已在目录中的模型无影响）。② functional-parity.mjs 新增 `llm_deepseek_models`（id/contextWindow/inputModalities/imagePixelBudget/imageMaxBytes）与 `capacity_rows`（按解析链算出每个模型的生效容量 + 来源：model / provider-default / implicit-code-default），两者都纳入逐项比对，并对仍为 implicit-code-default 的模型报 WARN。③ 重新导出 config/expected-functional.json。④ DEPLOY.md 第 3 步说明容量已显式钉住及其原因。"
related_files:
  - "functional-parity.mjs"
  - "config/expected-functional.json"
  - "DEPLOY.md"
  - "settings.yaml"
dsh_commit: "826d08281c"
---

用户指出「模型容量元数据：agnes-3.0-flash、union-alpha、unlimitds 三个 *_jail 模型在仓库脚本和官方目录里都没有显式 contextWindow/maxTokens」以及「llm-deepseek 段只写为空段（用官方默认模型目录），因为开发机的覆盖值没有随仓库提供」。逐条核实：① 这 5 个 id 在官方源码（packages/ 全量，排除 node_modules）里 **0 命中** —— 既无 pi-ai 目录条目，也无任何显式元数据；仓库里只以字符串形式出现在 buglog/DEPLOY.md/expected-functional.json；② 解析链是 `llm-pi-ai/src/catalog.ts:901,905` 的 `entry.contextWindow ?? base?.contextWindow ?? request.defaultContextWindow`，而 `request.defaultContextWindow` 来自 provider profile，缺省即官方常量 `DEFAULT_CONTEXT_WINDOW=262144` / `DEFAULT_MAX_TOKENS=32768`（`config.ts:64,67,339-340,480-481`）。所以这些模型的容量今天**能复现**（同一份官方源码 + 同一份 settings.yaml），但值是**隐式**的：官方升级改了常量就会悄悄漂移，而且它不在任何配置文件里、肉眼与旧版核对脚本都看不到。③ llm-deepseek 同理：开发机有显式覆盖目录（4 个模型，含 vision 变体与 imagePixelBudget/imageMaxBytes），而仓库骨架里没有该段；我原先的核对脚本只比了「settings 顶层段名」，**空段也会通过**，是个真实漏洞。修法：把 4 个 provider（unlimitds / bai / agnes / opencode-live-anthropic）的 defaultContextWindow/defaultMaxTokens 显式写进开发机 settings.yaml（值 = 改动前生效值，行为不变），并把 llm-deepseek 目录与「按解析链算出的生效容量」纳入功能基线；工具上线时还多查出一处人工未列的同类问题——bai 的 glm-5.3-flash / qwen3.8-flash 同样靠官方常量兜底。验证：结构级 diff 备份→当前只有 8 个新增键、其余逐项未变；自检由 27 项升到 30 项一致、0 不一致、0 提示；隐式兜底 WARN 从 2 项归零。
