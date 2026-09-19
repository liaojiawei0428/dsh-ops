---
date: "2026-09-19T07:58:23.552Z"
symptom: "运行副本 pnpm run build 的 client 阶段失败，client-ui-agent-team/src/client/mount.ts 报 SessionStore 缺 binding/refreshSubagents/retainInfo（TS2339）"
component: "client-ui-agent-team（官方实验包）/ agent-team"
severity: "major"
status: "fixed"
root_cause: "运行副本本地 patch（commit 407839f）在 agent-team 的公共 types.ts 中新增 `import type { AgentOptions } from '@deepseek-ai/dsh-agent'`（Host 面包）。该文件经 package.json 的 `./client` 出口（client.d.ts → types.ts）被 client-ui-agent-team 的 client 面传递性拉入，而 dsh-agent 的 index.d.ts 又从根出口导入 `@deepseek-ai/dsh-session`，后者含 `declare module '@deepseek-ai/cordis' { interface Context { sessions: SessionStore } }`。于是 client 编译单元里 ctx.sessions 被解析为 Host 面 class SessionStore（而非 client 面 ISessions），三处成员访问全部 TS2339。纯净官方无此 import，故编译通过。"
fix: "已修（Lead 按本记录给出的方向实施）：① `agent-team/src/types.ts` 删除 `import type { AgentOptions } from '@deepseek-ai/dsh-agent'`，改为声明结构等价的本地 `TeammateAgentOptions`（provider/model 两个可选字段），`SpawnTeammateRequest.agentOptions` 改用它；② `official-patches/apply-patches.mjs` 的第 1 条 patch 同步改为插入该本地类型（锚点由 `Branded` 行改为 `SessionId` 行，避免插进 import 块中间造成语法错误），第 2 条 patch 的字段类型一并改为 `TeammateAgentOptions`。**验证**：`tsc -p tsconfig.json` 在 agent-team 与 tool-agent-team 两个包均 exit 0（证明本地类型与 Host 的 `AgentOptions` 结构兼容，无需转换）；在运行副本执行 `pnpm exec tsc -b tsconfig.client.json`（整个 client 面）**exit 0 且无任何 error TS** —— 该命令正是修复前的失败点。另核实 `lib/types/types.d.ts` 中残留的 `dsh-agent` 字样仅出现在新加的注释里，非 import；其余 import `Agent` 的源码文件（index/journal/mailbox/roster/task-board）都不在 `./client` 出口内，不构成污染。"
related_files:
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\agent-team\\src\\types.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\experimental\\client-ui-agent-team\\src\\client\\mount.ts"
  - "E:\\DSH\\Deepseek_DSH\\packages\\experimental\\agent-team\\lib\\types\\types.d.ts"
  - "E:\\DSH\\Deepseek_DSH\\packages\\core\\session\\lib\\types\\index.d.ts"
  - "E:\\DSH\\Deepseek_DSH\\packages\\api\\session-controller\\src\\client\\index.ts"
---

## 判定实验（纯净官方 E:\DSH\Deepseek_DSH，git ddefc45，工作树干净）

任务给的命令本身有两处错误，先如实记录：
1. 包名错：真实名是 `@deepseek-ai/dsh-experimental-client-ui-agent-team`（带 `experimental-`）。用任务给的名字跑 `pnpm --filter ... exec tsc -b tsconfig.client.json` 得到 `No projects matched the filters`，exit 0（空跑，非通过）。
2. 配置错：该包内**不存在** `tsconfig.client.json`（只有 `tsconfig.json`，extends `tsconfig.base.client.json`）。用真实包名跑同一命令 → `error TS5083: Cannot read file '.../tsconfig.client.json'`，exit 1。

真正的 client 面入口是 root 级 `tsconfig.client.json`（`build:lib:client` = `tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client`，其 references 第 90 行含 `./packages/experimental/client-ui-agent-team`）。

四种方式全部通过：
- 包级 `tsc -b tsconfig.json`：exit 0
- 包级 `--force`（全量重建）：exit 0
- root 级 `pnpm exec tsc -b tsconfig.client.json`：exit 0
- root 级 `--force`（重建 60+ 项目，含该包，tsbuildinfo mtime 更新到 15:53:47）：exit 0

结论：**排除「官方既有不兼容」**（纯净官方增量和全量都通过）。

## 真正根因：本地 patch 把 Host 面类型泄漏进 client 编译单元

全树对比两边 packages/ 5682 个文件，仅 14 个不同，其中相关的只有本地 patch（运行副本 commit 407839f「chore: DSH sync」，非未提交改动）：
- `agent-team/src/types.ts` 新增 `import type { AgentOptions } from '@deepseek-ai/dsh-agent'`，并给 `SpawnTeammateRequest` 加 `readonly agentOptions?: AgentOptions`
- `agent-team/src/roster.ts`、`tool-agent-team/src/index.ts` 配套改动（队友模型选择功能）

污染链（逐环已验证）：
1. `client-ui-agent-team/src/client/mount.ts:3-6` 从 `@deepseek-ai/dsh-experimental-agent-team/client` 导入 `TeamView`/`TeamMemberView`
2. 该出口（package.json exports `./client`）→ `lib/types/client.d.ts` → `export type {...} from './types.ts'`，整模块被拉入
3. 运行副本的 `agent-team/lib/types/types.d.ts` 顶部含 `import type { AgentOptions } from '@deepseek-ai/dsh-agent';`（纯净官方同文件**无**此行）
4. `@deepseek-ai/dsh-agent` 是 Host 面包，其 `lib/types/index.d.ts` 含 `import type {...} from '@deepseek-ai/dsh-session'`（**根出口**，非 `/types` 子路径）
5. `dsh-session/lib/types/index.d.ts` 含 `declare module '@deepseek-ai/cordis' { interface Context { sessions: SessionStore } }` —— Host 面的 Context 合并
6. 于是 client 编译单元里 `ctx.sessions` 被解析成 Host 面的 class `SessionStore`，而非 client 面的 `ISessions`（`dsh-api-session-controller/src/client/index.ts:90-95` 合并的才是 `ISessions`）
7. `mount.ts:34 const sessions = ctx.sessions` → 类型为 `SessionStore` → 访问 `binding`(36)/`refreshSubagents`(57)/`retainInfo`(58) 全部 TS2339

这解释了报错类型名为何恰好是 Host 面类名 `SessionStore`（若为增量状态问题，报出的应是 client 面 `ISessions`）。纯净官方 `agent-team/lib/types/types.d.ts` 只 import `dsh-brand` / `dsh-llm/types` / `dsh-session/types`（子路径，纯类型，无 Context 合并），故不污染。

## 判定
既不是官方既有不兼容，也不是单纯的「增量状态不同步」——增量只是被 patch 触发重建的导火索；根因是**本地 patch 让 Host 面类型经 `./client` 出口进入 client 编译单元**。属「其他」：运行副本源码自身被改坏。

## 未实测项（如实声明）
按任务约束未在运行副本跑任何命令（另一位队友在做只读收集），故「运行副本 `--force` 也会失败」是基于上述源码差异的强推论，未实测。

## 修复方向（未实施）
不要在 `agent-team/src/types.ts` 里直接引用 Host 面的 `AgentOptions`；应改为结构等价的本地/共享类型，或把 `agentOptions` 移到不进 client 出口的独立模块（如 `./host` 子路径），避免 `./client` 出口传递性拉入 `dsh-agent`。
