# DSH 环境运行规则（用户全局）— 部署模板

> **部署方法**：新机首选**直接复制旧机的 `%USERPROFILE%\.dsh\AGENTS.md`**（内容最全）；
> 没有旧机时用本模板，把其中 `<盘符>` 全部替换为实际盘符。该文件会被 DSH 指令加载器注入
> **所有会话**（任何 profile、任何项目工作目录），是本机 AI 协作的统一运行规则底座。
> **同步规则**：改过开发机的 `%USERPROFILE%\.dsh\AGENTS.md` 后，须重新导出本模板
> （本文件由它生成，只把机器特定路径换成占位符）；完整规范唯一权威版本：DSH-ops 仓库的 `PLUGIN-STANDARD.md`。

**语言**：始终使用简体中文思考与回复，除非用户明确要求其他语言。

本文件由 DSH 指令加载器对**所有会话**注入，无论会话工作目录在哪个项目。它是本机 AI 协作的统一运行规则底座。完整规范唯一权威版本：`<盘符>:\DSH\DSH-ops\PLUGIN-STANDARD.md`。项目级 AGENTS.md 只补充项目细节，不得覆盖本节硬规则。

## 工具分工（D7 纪律，硬规则）

- **默认用 python**：一切计算、数据处理、日志/文本文件读写、JSON/CSV 解析、多步逻辑、DSH 状态检查。
- **pwsh 仅限白名单**：Windows 系统对象（服务/进程/端口/WMI/注册表）、git/pnpm/node 等进程编排、运行 .ps1 脚本。
- 反例（必须用 python 而非 pwsh）：读日志（Get-Content）、改 JSON 配置（ConvertFrom-Json）、文本搜索（Select-String）、端口/文件轮询循环。
- pwsh 必须为 7.x（5.1 禁用）：**永远不要硬编码 pwsh 路径**，用定位链（Get-Command 优先、常见安装位置回退）；非标准安装位时设 `DSH_PWSH_PATH` 或加入 PATH。

## 子代理模型分派（个人偏好，硬规则）

用户始终在「设置 → 插件 → Subagent」里授权**两个**模型，派子代理时按任务**显式指定** `provider` 与 `model`：

- **弱档 = `agnes/agnes-3.0-flash`（固定不变）**：用于**简单、繁琐、以搜索与罗列为主**的任务——搜文件、枚举清单、批量读文档、grep 定位、格式转换、跑测试。这类任务的结果可机械核对，用弱档即可。
- **强档 = 授权清单里 agnes 之外的另一个模型（名字不固定）**：用户会按需调配，**不要把名字写死**。用 `list_subagent_models`（不带参数）现查当前授权了哪两个，取非 agnes 的那个。用于写代码、改文件、代码审查、对抗性验证、交叉核对关键结论，以及**拿不准该用哪个**的时候。
- **团队模式（`spawn_teammate`）也支持指定模型**：传 `provider` + `model` 即可（本地补丁打通三层，见 buglog 关键词 `agent-team-teammate-cannot-select-model`），与 `subagent` 受**同一份** `subagent-model-selection` 授权清单约束；省略则队友继承 Lead 的模型。**差别**：它读的是**实时 settings**，所以改完授权立刻可用，不受下面第 1 条"会话固化"的限制（`subagent` 受）。
- **验证类任务绝不用弱档**：弱模型的"我没发现问题"没有信息量，那种通过是假的。
- **派活粒度按档位切，不能只按类型切**（2026-09-19 实测）：弱档的瓶颈是**吞吐量，不是正确性**——同一个 bug，强档约 10 分钟走完 6 环因果链、跑完 4 组对照实验、并比对了两个 checkout 的 5682 个文件差异；弱档同样时间只完成 5 个子步骤中的第 1 个（方向找对了，但没交完）。所以**给弱档派活要切成单点任务**（例：「读某文件第 25-70 行，列出三处报错的上下文」），**不要一次塞多个子步骤或开放项**（如「找出某类型的定义位置」），宁可多派几轮。**开放式调查即使交给强档也要写清收敛条件与时间盒**，否则一样会发散。

**两个机制坑**（决定上面这套能不能真的生效，详见 buglog 关键词 `subagent-model-policy-frozen-per-session`）：

1. **授权清单在会话创建时固化，一份会话只采样一次**——用户改设置只对**新会话**生效，**重启服务无效**，回到旧会话状态照旧。诊断方法：读 `%USERPROFILE%\.dsh\storages\session_projcache\sessions\<sessionId>.json` 的 `record.rows.subagentModelSelectionPolicy.val`。
2. **不显式指定模型时，子代理继承父 Agent 的模型**（这条路径不受清单约束）——所以"派子代理没报错"**不等于**"分派策略生效了"。要按上表分派，必须显式传 `provider` 与 `model`。

## DSH 服务纪律（硬规则）

- DSH 状态检查统一入口：`<盘符>:\DSH\DSH-ops\health-check.cmd` 或 `pwsh -NoProfile -File <盘符>:\DSH\DSH-ops\health-check.ps1`（内部自动定位真实 python，规避命令行裸 `python` 解析到 MS Store 桩；全绿退出 0；发现服务/看门狗异常时自动复活后复查）。
- 服务重启只能走标准重启链（request_restart → start-dsh-web.ps1，经 WMI 独立进程）；禁止另起服务器替代本 GUI 服务。
- 改动自研插件落盘前必须先过闸门 `<盘符>:\DSH\DSH-ops\validate-plugins.mjs`：任何插件（无论好坏）都不得妨碍 DSH 正常启动运行。
- 修复任何 bug 后必须 `bug_report` 记录；调查任何异常前先 `bug_search` 查既有记录。

## 本机环境事实（按新机实际情况修改本节）

- DSH 工作区：`<盘符>:\DSH`（ops 工具链 + 自研插件）；harness 源码 checkout：`<盘符>:\DSH\Deepseek_DSH`。
- Web GUI：`http://127.0.0.1:3080`；DSH_HOME：`%USERPROFILE%\.dsh`。
- 看门狗 G5 常驻守护服务（30 秒心跳 + 黑匣子 + 自动复活）；体检与看门狗结论冲突时以体检输出为准。
