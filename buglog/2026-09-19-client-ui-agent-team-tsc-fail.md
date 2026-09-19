---
date: "2026-09-19T07:41:50.351Z"
symptom: "运行副本执行 pnpm run build 时 client 阶段失败：client-ui-agent-team/src/client/mount.ts 报 SessionStore 缺少 binding / refreshSubagents / retainInfo（TS2339），阻断全量构建"
component: "client-ui-agent-team（官方实验包）"
severity: "major"
status: "fixed"
root_cause: "**已确证，与初次记录的两点猜测都不同**——是运行副本本地 patch 引入的 Host 面类型泄漏：patch 在 `agent-team` 的公共 `types.ts` 里加了 `import type { AgentOptions } from '@deepseek-ai/dsh-agent'`（Host 面包），而该文件经本包 `./client` 出口被 client 面传递性拉入，dsh-agent 的声明文件又从根出口导入 `@deepseek-ai/dsh-session`，后者含 `declare module '@deepseek-ai/cordis' { interface Context { sessions: SessionStore } }` 的 Context 合并，使 client 编译单元里 `ctx.sessions` 解析成 Host 的 class 而非 client 面的 ISessions。**完整根因、排除过程与决定性证据见 2026-09-19-agent-team-host-type-leak-client.md**（本记录是该现象的首次发现，两者为同一 bug，以那条为准）。关键判别证据：报错类型名是 Host 面类名 `SessionStore`；若为增量状态问题，报出的应是 client 面 `ISessions`。纯净官方 checkout（git ddefc45，工作树干净）四种编译方式全部 exit 0，已排除官方不兼容。"
fix: "已修。修复与验证详见 2026-09-19-agent-team-host-type-leak-client.md：改用结构等价的本地 `TeammateAgentOptions` 替代 Host 面 import，并在运行副本执行 `pnpm exec tsc -b tsconfig.client.json` 确认 exit 0。"
related_files:
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\client-ui-agent-team\\src\\client\\mount.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\client-ui-agent-team\\package.json"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\tool-agent-team\\lib\\index.js"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\scripts\\build.ts"
---

## 症状
在运行副本执行官方全量构建 `pnpm run build`，client 阶段失败：
```
$ tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client
packages/experimental/client-ui-agent-team/src/client/mount.ts(36,30): error TS2339: Property 'binding' does not exist on type 'SessionStore'.
packages/experimental/client-ui-agent-team/src/client/mount.ts(57,22): error TS2339: Property 'refreshSubagents' does not exist on type 'SessionStore'.
packages/experimental/client-ui-agent-team/src/client/mount.ts(58,21): error TS2339: Property 'retainInfo' does not exist on type 'SessionStore'.
Error: build: build:lib exited with 2
```
三处都指向 `SessionStore` 缺少 `binding`、`refreshSubagents`、`retainInfo`。该包提供的正是 Agent Teams 的浏览器侧（成员名册、任务板、队友会话导航）。

## 与本次改动无关的证据
本次会话对 host 侧做了 patch（`agent-team`、`tool-agent-team` 增加队友模型选择），**未触碰任何 client 包**。host 侧产物实际已正常生成：
- `agent-team/lib/index.js` 09-19 15:41:07，75079 字节
- `tool-agent-team/lib/index.js` 09-19 15:40:58，19534 字节（含 `teammateAgentOptions` / `agentOptions` / `subagent-model-selection`）

即 host 面成功、client 面失败。

## 未确证的两种可能
1. **官方既有不兼容**：`client-ui-agent-team` 期望的 `SessionStore`（来自 `@deepseek-ai/dsh-client-ui-session`）带这三个成员，而该版本实际类型没有。若如此，纯净官方 checkout 同样编译失败。
2. **运行副本增量构建状态**：`tsc -b` 为增量模式，`.tsbuildinfo` 与源码不同步时，可能只在被下游改动触发重建时才暴露既有错误。本次 patch 改了 `agent-team`，而 `client-ui-agent-team` 依赖它，故被拉入重建。

**判定方法**：在纯净官方 checkout 单独跑
`pnpm --filter @deepseek-ai/dsh-client-ui-agent-team exec tsc -b tsconfig.client.json`

## 影响
阻断 `pnpm run build` 全量构建。Web GUI 的 dist 产物在 `packages/client/web`，与 `client-ui-agent-team` 无关，主界面不受影响（Agent Teams 的 Web UI 面板是否受影响未验证）。host 侧构建可走「包内 `tsc -p tsconfig.json` + 包内 tsdown」绕过。

## 附带记录：手工单独构建 host 包的三个坑
1. 根 `tsdown.config.ts` 是 workspace 模式（entry 相对仓库根），在包目录下跑必报 "No workspace packages found"；
2. 用 `--config` 指定外部配置时，tsdown 以**配置文件所在目录**为基准解析相对 entry，`lib/types/index.js` 会被解析到错误位置而报 `UNRESOLVED_ENTRY`——必须给绝对路径；
3. 即使跑通，缺 `deps` 外部化设置会把 devDependencies 一并内联（实测 669 kB，官方产物 19.5 kB），产物不可用。故优先走官方构建链。
