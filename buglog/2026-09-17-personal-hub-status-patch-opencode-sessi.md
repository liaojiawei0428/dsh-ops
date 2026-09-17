---
date: "2026-09-17T02:18:46.028Z"
symptom: "personal_hub_status 报「patch 条目 opencode-session-id config.providers 不在清单中」；只读模拟证明 personal_hub_reapply 重建 cordis.patch.yml 后会丢失 providers: [] 覆盖（opencode 自定义路由将重新 400 MissingSessionID），同时首块注释重复输出。"
component: "dsh-personal-hub"
severity: "major"
status: "open"
root_cause: "dsh-personal-hub 的清单渲染器 renderManagedBlock 只支持单引号标量（`${key}: '${String(value)}'`），无法表达数组 config，于是 `config.providers: []` 不能写进清单、只能以手工 YAML 存在于 live cordis.patch.yml；reapply 时 rebuildPatchYaml 以「清单 patch 字段」为准重建托管块（index.js:461 `{ id, name, ...entry.patch }`），清单里没有 config → 该覆盖被静默删除。比对端 statusReport 用 String(value) 规范化（String([]) === ''），即使把数组补进清单也会误报漂移，故渲染端与比对端需同步修改。"
fix: "尚未修复（已给出两条路径，待用户选择）：路径 1 —— renderManagedBlock 按类型渲染（字符串单引号，其余 JSON.stringify，YAML flow 兼容）+ statusReport 比对统一用同一规范化函数 + parsePatchBlocks 回退紧邻注释行；路径 2 —— 从 personal.json 摘除 dsh-opencode-session-id 的 patch 声明，使其成为 foreign 块被原样保留。临时规避：不要执行 personal_hub_reapply。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.json"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
---

发现路径：2026-09-17 用户升级官方仓库到 0.1.6-alpha.1 后做"个人部署影响检查"，personal_hub_status 报 1 项漂移「patch 条目 opencode-session-id config.providers 不在清单中」。为确认后果，抽取 dsh-personal-hub/index.js 的真源码函数（parsePatchBlocks / blockIdentity / unquoteYaml / renderManagedBlock / managedIds / rebuildPatchYaml）+ 按 personal.local.json 声明的合并语义手工合并清单，对 live cordis.patch.yml 做**只读重建**（不写任何文件）：

- 清单托管 id：deepseek-balance, tool-python, plugin-guide, restart-resume, opencode-session-id, pwsh-sandbox
- live 条目 opencode-session-id 的 config 解析为 {"providers":"[]"}
- 重建输出中 opencode-session-id 块变为只有 id+name，`providers` 覆盖消失（断言 rebuilt.includes('providers') === false）

三个叠加成因：

(a) renderManagedBlock（index.js:418-430）只渲染单引号标量 `${key}: '${String(value)}'`，无法表达数组/数字/布尔。因此清单里不能写 `config: { providers: [] }` —— 会被渲染成 `providers: '[]'`（字符串），破坏 dsh-opencode-session-id 期待的数组类型。live 里的 `providers: []` 只能是手工 YAML。这是本轮漂移的根因。

(b) statusReport（index.js:510-516）比对时用 `String(value)` 规范化：`String([])` 得空串，而 blockIdentity 从 live 解析出的是字符串 `'[]'`，即使把数组写进清单也会误报漂移 —— 渲染端与比对端需一起改。

(c) 附带缺陷：parsePatchBlocks（index.js:360-388）的 headEnd 只推进到第一个 `- id:` 之前，未回退紧邻的注释行，把第一块的 preamble 注释吞进 header；重建时该注释又由托管块输出一次 → 只读重建输出里出现两行相同的 `# deepseek-balance: repoDir/opsDir derive...`。仅噪声，无害。

影响面：只要执行 personal_hub_reapply（常规操作，用于按清单重建 profile、换机装配、加插件后同步），live 里的 `providers: []` 就会静默丢失，导致 opencode.ai 网关请求不再注入 x-opencode-session 头，自定义命名的路由（如 opencode-live）会重新 HTTP 400 MissingSessionID（参见 2026-09-07-opencode-go-missing-session-id）。reapply 会先备份 profile 文件，所以可恢复，但属于静默功能退化。

与本次官方升级无关：cordis.patch.yml 的 mtime 为 09-14 10:17:48，本次升级（09-17 10:05）未改写它；漂移在升级前就存在。已提供两条修复路径待用户选择：(1) 增强渲染/解析/比对以支持非标量 config 并修注释重复（需一次服务重启）；(2) 把该 patch 从清单声明中摘除，使 live 块转为"非托管条目"原样保留（不需重启，但清单仍不完整）。
