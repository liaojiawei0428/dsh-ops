# Agent Note: Harness session header on a per-route opt-in

Status: implemented

[English](2026-09-17-harness-session-header-route-opt-in.md) | 中文

## Problem

按对话路由并做提示缓存的网关，只有在请求点名了对话时才能这样做。opencode.ai 自 2026-09-05 起要求会话标头，缺失时返回 HTTP 400 `MissingSessionID`，使该网关背后的所有模型不可用。

`dsh-llm-deepseek` 已经在其提供方请求上发送 Harness 会话标头，因此该缺口是适配器特有的，而非协议级的：同一个对话到达一个提供方时携带其身份，到达另一个提供方时不携带，而只有后者失败。部署方可以包装进程的 `fetch` 来补偿，但包装对其他组合不可见，并把一个请求标头决策移出了拥有该请求的适配器。

## Decision

`PiAiProviderProfile` 新增 `harnessSessionHeader?: boolean`。设置该字段的路由上，[`PiAiAdapter`](../../../../packages/llm/llm-pi-ai/src/adapter.ts) 发送 `x-deepseek-harness-session-id`——与 `dsh-llm-deepseek` 发送的名称相同——携带 `String(GenerateOptions.sessionId)`。

该开关默认关闭。其取值正好点名一个对话，因此只有当部署判定其网关有权获知该身份时，路由才携带该身份；到达任意第三方网关的路由在有人写入该字段之前，逐字节保持原有行为。只有在路由选择开启**且**调用方点名了会话时才发送该标头，因此即使路由已开启，直接调用 `ctx.llm.stream()` 且不传 `sessionId` 也不发送任何内容。

会话标头在 profile 自身的 `headers` 之后并入请求，因此同名的部署条目会被覆盖而非采信：只有请求知道它属于哪个对话，而过期的配置值会把实时流量路由到已死对话的缓存。attribution 名称以同样方式、出于同样原因赢得冲突。

## Alternatives considered

**默认开启。** 该标头是产品协议事实，且 `dsh-llm-deepseek` 无条件发送它，因此对称性主张到处都发送。它因范围而落选：那个适配器拥有的是一个 DeepSeek 端点，而这个适配器服务于 profile 点名的任意网关，包括自托管服务器。当前契约并未要求这些路由接收的按对话标识符，不是可以假定部署方想要的默认值；为所有既有路由打开它，会在无人要求的情况下改变它们发送的字节。

**由端点 host 推导该决策。** 像部署层变通方案那样在适配器内匹配 `opencode.ai`，本可让该标头零配置生效。它落选是因为厂商域名不是本包应当持有的事实：本包已经发布的协议名（`api`、`compat`、`baseURL`）描述的是端点的线上行为，而非由谁运营；而对一个改名的端点或藏在另一域名之后的网关，host 列表会静默失效。

**用占位值扩展 `headers`。** 形如 `x-opencode-session: $session` 的模板本可复用现有字段而不新增字段。它落选是因为 `headers` 目前是纯字符串字典，其条目由 profile 解析按 Fetch 校验，其取值被 redactor 视为配置；占位语法会把每个既有条目光标为可能是模板的字符串，而每个消费者——发现、设置编辑器、redactor——都必须就该文法达成一致。

**pi-ai 自带的 `sendSessionAffinityHeaders` compat 开关。** pi-ai 已经为部分提供方发出会话亲和标头，而该 compat 字段是保留而非暴露给配置的。它落选是因为它发出的是 `x-session-affinity`，而 opencode.ai 不接受它作为会话身份：携带该标头的请求仍返回 HTTP 400 `MissingSessionID`。复用它无论如何都需要第二套机制。

## Consequences

网关要求会话标头的部署，现在每条路由设置一个布尔值，而无需安装进程级 `fetch` 包装。本机的 `dsh-opencode-session-id` 插件保持兼容——它仅在该标头缺失时追加 `x-opencode-session`，且两个名称彼此独立——因此组合可以在迁移某条路由期间同时运行两者。

该标头名在两个包中声明：本适配器，以及 `dsh-llm-deepseek` 的两个协议适配器。它们是同一个协议常量，此处记录该重复而不予修复，以把改动限制在缺失它的那个适配器内；出现第三个消费者之时，才是共享常量值得提取之时。

只有选择开启的路由受影响。发现请求不受影响：[`storedDiscoveryProfile`](../../../../packages/llm/llm-pi-ai/src/index.ts) 为端点询问提供标头与凭据，而模型列表不属于任何对话，因此不携带会话身份。

**覆盖。** [`adapter.spec.ts`](../../../../packages/llm/llm-pi-ai/tests/adapter.spec.ts) 固定三种状态：已开启的路由发送实时对话 id 并覆盖同名的 profile 条目；未设置该字段的路由在会话处于作用域内时不发送任何内容；已开启的路由在调用方未点名会话时不发送任何内容。第四个用例在插件加载时拒绝非布尔值。

**验证缺口。** 测试在 mock 服务器上断言该标头，并未对真实网关发起请求。某个具体运营方是否接受该标头名，是本仓库无法固定的外部契约，也是最可能无预警变化的事实；该开关的默认值是防止此类变化波及从未要求它的路由的原因。

## Related

本决策扩展的是会话标头可以到达的范围，而非它的归属。[DeepSeek 请求身份决策](2026-08-11-deepseek-request-user-id-header.zh.md)仍然拥有直连 DeepSeek 请求上的该标头，以及本适配器不发送的 `x-deepseek-harness-user-id` 伴随标头。[强制应用归属决策](../architecture/2026-06-21-mandatory-app-attribution-headers.zh.md)仍然拥有 `User-Agent`，并且仍是这样的规则：除非有决策接受，提供方不会收到更多身份标头——此处的按路由 opt-in 正是那个决策。
