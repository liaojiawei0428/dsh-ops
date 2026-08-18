# DSH 插件开发与改动行为准则

本准则是 DSH 相关插件开发与系统改动的唯一权威规范。**每次开发新插件、修改既有插件、改动 profile 或启动链，必须完整执行本准则**，不允许任何插件问题导致 DSH 无法正常运行或启动，并确保出现问题的插件随时可以修复或摘除。

底线（违反任何一条即视为事故）：

1. **坏插件不得阻断 DSH 启动**——任何插件缺陷必须能被预检闸门在重启前拦截，或在紧急情况下可一键摘除。
2. **旧服务器不受更新过程影响**——所有检查通过之前，不得杀死正在运行的服务器。
3. **用户数据零损坏**——凭据、设置、profile 修改前必须备份，写入必须整体原子替换。

## 规则来源（每条规则对应一次真实事故）

| 事故 | 根因 | 形成的规则 |
|---|---|---|
| 2026-08-17 npm 撞名 | `dsh plugin add` 从 npm 装到同名旧版悬浮胶囊插件 | P1：自研插件 `private: true` 永不发布 npm，一律 link 安装 |
| 2026-08-18 凭据文件损坏 | `Set-Content -NoNewline` 把行数组无分隔拼接成非法 YAML，凭据插件 fail-loud，进程起不来 | D4：用户数据文件整体原子重写，禁止行级拼接 |
| 2026-08-18 BOM 乱码 | 编辑工具剥掉 .ps1 的 UTF-8 BOM，PowerShell 5.1 按 GBK 解析中文导致语法错误 | D5：.ps1 恒为 UTF-8 带 BOM；启动链恒用 pwsh 7 |
| 2026-08-18 13:05 启动阻断 | 插件 output schema 把 `required: true` 写进属性内部，违反核心 JSON Schema 方言，`assertSupportedJsonSchema` 抛错，插件树加载失败 | P4 + 预检闸门：注册路径必须在重启前经过真实核心校验器执行 |

## 第一部分：插件开发规范（P1–P10）

**P1 结构与发布**
- 目录名 = 包名，形如 `dsh-<role>`（如 `dsh-tool-python`）。
- `package.json` 必备：`"private": true`、`"type": "module"`、`main`、`exports`（含 `./cordis.patch.yml`）、`dsh.bundle.patch` 指向补丁文件。
- **永不发布到 npm 注册表**；部署一律 `link:` 本地路径。npm 上存在同名包时，`dsh plugin add` 会装错版本——这是既成事故。
- 入口导出 `name`、`inject`、`apply`。

**P2 零 workspace 依赖**
- 不得 `import` 任何 `@deepseek-ai/*` 包。link 安装没有自己的 node_modules，这类 import 会让服务器加载即崩。
- 只允许 `node:` 内置模块与注入服务。需要核心校验器等能力时，在插件外解决（闸门脚本负责），不进插件。

**P3 注入最小化**
- `inject` 只列硬依赖（缺它插件行应等待而非崩溃）。
- 可选服务一律 `ctx.get('name')` 读取并处理 `undefined`，绝不写进 `inject`。每多一个硬注入，就多一种"行未激活"的启动期失败模式。

**P4 schema 方言（13:05 事故的直接规则）**
- `required` 必须是**父对象上的字符串数组**：`required: ['kind', 'exitCode']`。
- 属性定义内部**禁止**出现 `required: true`；`string`/`boolean`/`number` 类型属性内禁止 `required`；`required` 不得与 `oneOf` 并列。
- 对象节点声明 `additionalProperties: false`；字面量用 `const`。
- 工具 `parameters` 用 `defineTool` 属性式写法时（注册表会提升为必填列表）不受此限，但**裸 `ctx.tools.register` 的 parameters 必须已是本方言**。
- 写完必须过闸门（真实核心校验器），不靠肉眼。

**P5 注册即效果**
- 一切注册（tools、路由、系统提示段、事件、定时器）必须包在 `ctx.effect(() => disposer)` 中，保证插件摘除/禁用时全部副作用可回收。

**P6 失败边界**
- 配置错误在 `apply()` 期间 fail-loud 抛错（闸门会在重启前捕获，旧服务器不受影响）。
- 执行期错误转为**工具错误结果**返回给模型，绝不抛出到进程级。

**P7 编码与输出**
- 子进程执行强制 UTF-8（如 `PYTHONUTF8=1`、PowerShell `[Console]::OutputEncoding` 前导），杜绝 OEM 代码页乱码。
- PowerShell 脚本与含中文的文件：UTF-8 带 BOM。

**P8 资源清理**
- 每次调用创建的临时文件/目录在 `finally` 中尽力清理；清理失败不报错。

**P9 平面归属**
- 只消费 host 服务的插件行松放、无 realm。
- 发布服务的行必须在挂载组合中置于 `isolate` realm（服务名冲突会让第二次挂载即崩）。

**P10 文档**
- 每个插件必有 README：工作方式、配置字段表、安装三步、验证方法、已知边界。骨架由脚手架生成，不得删除章节。

**P11 BUG 记录纪律（由 dsh-bug-log 插件执行）**
- 修复任何 BUG 后、继续下一步前，**必须**调用 `bug_report`（症状/根因/修复/组件/严重度/状态）——未记录视为任务未完成。
- 排查任何异常、错误、意外行为前，**先**调用 `bug_search`——历史记录通常已含根因与修复。
- 需要汇总时用 `bug_stats`（按组件/严重度/月份/状态聚合）。
- 绕过未根治的修复记 `status: workaround`，持续关注直到转 fixed。
- 记录落 `buglog/`（git 版本化、双机同步）；兜底启发式会在漏记的下一个会话提醒补录。

## 第二部分：新插件开发流程（S1–S5）

```
S1  node D:/GongJu/DSH-ops/new-plugin.mjs dsh-<role>
    —— 脚手架产出合规骨架（结构、insert 方言补丁、README）

S2  开发 index.js，遵守 P1–P10
    —— 随时验证：node D:/GongJu/DSH-ops/validate-plugins.mjs
    —— 全绿才能进入安装；红就修，不许带病安装

S3  安装三步（写入 profile）：
    1. profile package.json dependencies 加 "dsh-<role>": "link:D:/GongJu/DSH-ops/plugins/dsh-<role>"
    2. dsh.profile.bundles 数组追加 "dsh-<role>"
    3. profile 目录 pnpm install

S4  重启服务（restart-dsh-web.ps1 / update-dsh.ps1 / start-dsh-web.ps1）
    —— 三个脚本均已内置预检闸门：插件不过闸 → 重启中止，旧服务器原样运行

S5  验证：
    —— dump-config 出现插件行
    —— 新会话确认行为与工具列表
```

## 第三部分：修复流程（R1–R4）

```
R1  定位：看 C:/Users/<u>/.dsh/restart-dsh-web.log 与 dsh-web-stderr.log
    —— 闸门输出（plugins: 行）与服务器崩溃栈都在这里

R2  复现：node D:/GongJu/DSH-ops/validate-plugins.mjs
    —— FAIL 行给出插件名与精确原因（与生产校验器同一实现，错误逐字一致）

R3  修复 → 闸门全绿 → 重启

R4  紧急逃生（插件一时修不好，DSH 必须立即可用）：
    node D:/GongJu/DSH-ops/disable-plugin.mjs dsh-<role>
    —— 只从 dsh.profile.bundles 移除该插件；文件与 link 原样保留
    —— 重启后 DSH 干净启动；修复后把名字加回 bundles 数组即恢复
```

## 第四部分：DSH 改动规范（D1–D6）

**D1 profile 改动**：改完立即 `--dump-config` 验证组合树 + 跑闸门；两绿才算改完。

**D2 启动链改动**：改任何 `.ps1`/`.bat` 后——语法检查通过 + UTF-8 BOM 在位 + `powershell.exe` 引用为零（恒用 pwsh 7）。三个检查一个都不能省。

**D3 主仓库更新**：一律走 `update-dsh.ps1`（内置：工作区干净检查 → 凭据结构校验 → 配置备份 → ff-only 拉取 → frozen-lockfile 安装 → CLI 冒烟 → 构建 → dump-config 组合预检 → 插件闸门 → 重启 → HTTP 健康检查）。不得手工跳步。

**D4 用户数据文件**（credentials/settings/profile package.json）：改前备份到 `~/.dsh/backups/<时间戳>/`；写入必须**整体原子替换**（读 → 改 → 序列化全文 → 写），**禁止行级拼接**（`Set-Content -NoNewline` 数组拼接是既成事故）。

**D5 编码纪律**：`.ps1` 恒 UTF-8 带 BOM；编辑工具会剥 BOM，改完必须补回。

**D6 提交纪律**：DSH-ops 的改动审阅后入库；备份目录含密钥，**永不入库**。

## 工具索引

| 工具 | 作用 |
|---|---|
| `new-plugin.mjs` | 脚手架：产出合规骨架，从源头保证结构正确 |
| `validate-plugins.mjs` | 预检闸门：真实核心校验器执行每个 link 插件的注册路径 + client 语法检查 |
| `disable-plugin.mjs` | 紧急摘除：一键把坏插件移出加载列表，文件与 link 保留 |
| `test-standard.mjs` | 验收测试：T1–T4 证明脚手架合规、闸门拦截力、逃生通道可用 |
| `update-dsh.ps1` | 主仓库更新：全链路守卫（D3） |
| `start-dsh-web.ps1` / `restart-dsh-web.ps1` | 启动/重启：均先过闸门再动手 |

**闸门自身故障的排查**：闸门从 `DSH_TOOLS_LIB`（默认主仓库构建产物 `packages/core/tools/lib/index.js`）导入真实校验器，导入失败时闸门整体报错、按 fail-closed 中止重启。主仓库重构导致该路径变动时，设置环境变量 `DSH_TOOLS_LIB` 指向新位置即可，无需改插件或放行。

## 提交前检查清单（复制执行）

```
[ ] node D:/GongJu/DSH-ops/validate-plugins.mjs  全绿
[ ] dump-config 组合树含新插件行
[ ] README 五节齐全（工作方式/配置/安装/验证/已知边界）
[ ] package.json: private + type:module + exports + dsh.bundle.patch
[ ] index.js: 零 @deepseek-ai/* import；inject 最小；注册全包 ctx.effect
[ ] schema: required 全在父对象数组；属性内无 required；oneOf 旁无 required
[ ] .ps1 若有改动：语法 OK + BOM 在位 + 无 powershell.exe
[ ] 用户数据文件：已备份；整体原子写入
```

---

本准则由 DSH-ops 维护。修订时同步更新脚手架模板与检查清单，保持三者一致。
