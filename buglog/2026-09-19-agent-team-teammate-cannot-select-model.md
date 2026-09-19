---
date: "2026-09-19T07:34:42.598Z"
symptom: "Agent Teams 团队模式下无法让队友使用指定模型（如 agnes/agnes-3.0-flash），两次尝试均失败；spawn_teammate 没有任何模型相关参数"
component: "tool-agent-team / agent-team（官方实验包）"
severity: "major"
status: "fixed"
root_cause: "契约层面缺失：spawn_teammate 工具的 parameters 只有 name/description/prompt/context 四项，没有 provider/model/reasoning_effort；服务契约 SpawnTeammateRequest 也只含一个语义为 subagent provider（spawn/fork）的 provider 字段，没有 model 或 agentOptions。因此队友的 LLM 模型无法被指定，只能继承 Lead 模型。这与支持完整模型选择的 subagent/subagent_fork 工具形成对比，「子代理能选模型」的印象不适用于团队模式。"
fix: "已修（本地补丁）：用 7 条补丁（official-patches/apply-patches.mjs）打通三层——① tool-agent-team 的 spawn_teammate 暴露 provider/model 两个参数并在调用点做授权校验；② SpawnTeammateRequest 增加 agentOptions 字段；③ roster 把 agentOptions 透传给 startContinuable（subagent seam 层本来就接受 agentOptions，只是从未被透传）。校验读取实时 settings 的 subagent-model-selection，未授权路由被拒。7 条补丁的锚点已在纯净官方 checkout 逐条验证各命中一次，将来 sync 可重放"
related_files:
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\tool-agent-team\\src\\index.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\agent-team\\src\\types.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\agent-team\\src\\roster.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\subagent\\tool-subagent\\src\\index.ts"
  - "C:\\Users\\Administrator\\.dsh\\AGENTS.md"
---

## 症状
用户在 Agent Teams（团队模式）里两次尝试让队友使用弱模型 `agnes/agnes-3.0-flash`，均无法实现。团队模式下没有任何途径能为队友指定 LLM 模型。

## 根因（契约层面缺失，非参数被忽略）
1. **工具 schema 没有该参数**：`packages/experimental/tool-agent-team/src/index.ts` 第 171-182 行，`spawn_teammate` 的 `parameters` **只有四项**——`name` / `description` / `prompt` / `context`，**没有** `provider`、`model`、`reasoning_effort`。
2. **服务契约也没有**：`packages/experimental/agent-team/src/types.ts` 第 144-152 行的 `SpawnTeammateRequest` 只有 `provider: string`，且该字段语义是 **subagent provider**（`spawn` / `fork`），**不是 LLM provider**。没有 `model`，也没有 `agentOptions`。
3. **execute 只透传 provider**：`tool-agent-team/src/index.ts` 第 187-197 行调用 `ctx.agentTeams.spawnTeammate(agent, { name, description, prompt, context, provider: context === 'fork' ? config.forkProvider : config.freshProvider, signal })`。

**结论**：队友的 LLM 模型在**契约层面无法指定**，只能继承 Lead 的模型（`agent-team` 的 roster 在读取成员信息时用 `live?.options.model ?? root.options.model`，即子级没有自己的 model 时回落到 root/Lead）。

## 与 subagent 工具的对比（易混淆点）
`tool-subagent` 的 `subagent` / `subagent_fork` 工具**支持**完整的 `provider` / `model` / `reasoning_effort`，并受 `subagent-model-selection` 授权清单约束（`assertAllowedModelSelection`）。因此"子代理能选模型"这个印象来自 `subagent` 系工具，**不适用于 `spawn_teammate`**。两者同为"派生子代理"，但契约完全不同：
- `subagent` / `subagent_fork`：一次性委派，**可指定模型**，受授权清单约束；
- `spawn_teammate`：持久命名队友（可续聊、可互相通信、共享任务板），**不可指定模型**。

## 影响
用户在全局指令 `~/.dsh/AGENTS.md` 的「子代理模型分派」一节里写入了"弱档 agnes-3.0-flash 做搜索类任务"的策略。该策略对 `subagent` 系工具有效，但**对团队模式完全无效**——团队模式必然把所有队友跑在 Lead 的模型上，成本与延迟都不受策略控制。已在该节补注此限制。

## 规避（无代码修复）
- **需要按模型分派时，用 `subagent` / `subagent_fork` 而非 `spawn_teammate`**；代价是失去持久队友、互相通信与共享任务板（即失去团队模式的意义）。
- **团队模式下接受"队友统一继承 Lead 模型"**：把 Lead 切成便宜模型会让全体变便宜，但 Lead 自身的判断力也一起下降。
- 若确需让队友可配模型，只能 patch 官方三处（`types.ts` 的 `SpawnTeammateRequest` 增加 agentOptions、`roster.ts` 的 spawn 透传、`tool-agent-team` 的 parameters 与 execute），并纳入 `official-patches/apply-patches.mjs`。改动涉及公开契约，需评估后再做。

## 验证（2026-09-19 实测，四项全部通过）
补丁应用于运行副本并重启服务后：
1. **schema 已暴露参数**：`cordis_inspect_query`（platform=host, provider=Tool, method=listTools）确认 `spawn_teammate` 的 parameters 现在含 `provider` 与 `model`（此前只有 name/description/prompt/context）。
2. **授权校验生效**：`spawn_teammate(name=probe-denied, provider="bai", model="qwen3.8-flash")` 被拒，原文 `Error: teammate LLM route "bai/qwen3.8-flash" is not allowed by the deployment settings` —— 该路由确实不在 settings 的 `allowedModels` 内。
3. **已授权路由放行且真正生效**：`spawn_teammate(name=agnes-retry, provider="agnes", model="agnes-3.0-flash")` 创建成功（返回体 `"model":"agnes-3.0-flash"`），队友完成后回传 `OK` —— **证明 agentOptions 已透传到子代理并实际生效**。
4. **未破坏原路径**：`spawn_teammate` 不传 provider/model（`inherit-check`）仍正常创建并回传 `OK`，模型显示为 Lead 的 `deepseek-v4.1-flash`（继承语义未变）。

**一个附带发现（影响预期）**：该补丁的校验读的是**实时 settings**（`ctx.get('settings')?.get('subagent-model-selection')`），因此**不受** `subagent` 工具那条"授权清单随会话固化、重启无效"的限制——改完授权立即生效。原计划用"传 agnes-3.0-flash 应被拒"验证校验，实际却放行了，因为用户此时已在 settings 里授权该模型（本会话投影中的旧策略 `agnes/agnes-2.5-flash` 与本补丁无关）。改用真正未授权的 `bai/qwen3.8-flash` 才完成校验验证。

**一次偶发失败**：首次尝试（`probe-agnes`）创建成功但队友运行中失败且无收尾消息，`list_agents` 显示其 model 回落到 `deepseek-v4.1-flash`；同参数重试（`agnes-retry`）即成功。判定为 agnes 上游偶发抖动，非补丁缺陷——未取得该次失败的诊断输出（`dsh-web.err.log` 为空）。

## 构建方式备忘
host 侧改动后 `pnpm run build` 会被既有问题阻断（见 buglog `client-ui-agent-team-tsc-fail`）。可走「包内 `tsc -p tsconfig.json` + 包内 tsdown」单独构建，但要避开 tsdown 的三个坑（根 config 是 workspace 模式、外部 `--config` 以配置所在目录为基准解析相对 entry、缺 deps 外部化会把 devDependencies 内联成错误产物），详见该记录。
