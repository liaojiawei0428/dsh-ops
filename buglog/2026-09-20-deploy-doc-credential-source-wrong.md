---
date: "2026-09-20T09:53:36.453Z"
symptom: "DEPLOY.md 第 3 步声称「只复制 .credentials.yaml 不够，OPENCODE_GO_API_KEY 走环境变量通道」——与实测相反，会让新机用户白折腾去设一个本不需要的环境变量。"
component: "DEPLOY.md"
severity: "minor"
status: "fixed"
root_cause: "把配置里的 `apiKeyEnv` 字段名当成了「必须存在的 OS 环境变量」，而没有去读它的解析链——它其实是 credential-ref（凭据引用），由凭据库优先解析，进程环境只是兜底。这个仓库的凭据设计恰恰是「配置文件里永不出现密钥值」，所以密钥必然在凭据库里。"
fix: "DEPLOY.md 第 3 步重写：把原来那条「环境变量」项并入第 2 项 `.credentials.yaml`（列明 6 个 Key 名 + 明文可移植），新增一段解析顺序说明与显式更正声明；第 4 项补 `github-push\\state.json` 与 `server-ssh\\state.json`（并提示绑定路径是旧机的、需在新机改）；第 5 项补 `sessions`/`storages`（可选、与一致性无关、附体积）；新增「千万不要复制 profiles\\」的警告（旧机的 link: 依赖带盘符，拷过去插件全解析失败）。"
related_files:
  - "DEPLOY.md"
  - "research/deploy-sim/doc-conformance.md"
dsh_commit: "2f2e8a5f41"
---

起因：用户问「我需要复制用户数据到新机？」。为给出准确答复，逐项核对了凭据来源，结果推翻了我上一轮刚写进 DEPLOY.md 的一句话。我上轮写的是：第 3 步第 6 项「环境变量（不在文件里，最易漏）——OPENCODE_GO_API_KEY … 只复制 .credentials.yaml 不够，上面这个 key 走的是环境变量通道」。实测：① 遍历 settings.yaml + personal.json extraPatches + cordis.patch.yml 收集全部 apiKeyEnv 名字（UNLIMITDS/BAI/AGNES/OPENCODE/OPENCODE_GO），逐个在 Python 进程环境里查——**一个都没设**；② 这些名字全部出现在 ~/.dsh/.credentials.yaml 的 refs 里（该文件顶层是 version/refs/records，共 6 条 Key + 1 条 browser-session 记录）；③ 读官方解析链 web-search-deepseek/src/index.ts:94-104 —— 先 `credentials.resolve(apiKeyEnv)` 查凭据库，查不到才回退 `launchEnvironmentOf(ctx).get(apiKeyEnv)` 读进程环境；④ credentials-local/src/index.ts 头注释写明分层是「进程环境变量 > $DSH_HOME/.credentials.yaml > $DSH_HOME/.env」。所以正确结论是反过来的：**复制 .credentials.yaml 就够，不需要另设环境变量**。顺带确认该文件可移植：全仓库 grep dpapi/DPAPI/safeStorage/createCipheriv 均无命中，测试里也是明文 `refs:\n  KEY: value` 写法，没有机器绑定加密。误判来源：把「apiKeyEnv 这个名字看起来像环境变量」当成了「必须由 OS 环境变量提供」，没去读解析链——这与本仓库既有的教训同类（凭据是 credential-ref，配置里永不出现密钥值）。
