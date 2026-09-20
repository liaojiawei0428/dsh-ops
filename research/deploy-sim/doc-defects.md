# DEPLOY.md 文档缺陷清单（T1 部署模拟）

**测试方法**：以「新机视角」在 `F:\ceshi_1` 从零执行 DEPLOY.md 全流程，隔离 `DSH_HOME=F:\ceshi_1\.dsh-home`。
凡**不得不动用文档之外的知识**才能继续的地方，逐条记录于此。
**测试日期**：2026-09-20　**执行员**：T1
**总体结果**：部署**成功**（第 1–5 步全部完成，3081 验证通过）。缺陷集中在"网络/端口/验证细节"三处，**无流程性阻断**（D1 在本机网络条件下阻断，但文档已提示需代理，属措辞不足）。

**分级口径**：
- **阻断**：照文档做会直接失败且文档未给出解决方式
- **需手工干预**：照文档做会得到错误结果/误导性结论，必须靠文档外知识纠正
- **仅提示不清**：能走通，但提示词或说明会让人困惑/误判

---

## 一、阻断部署（1 条）

### D1. 第 1 步手工 `git clone` 未说明如何走代理

| 项 | 内容 |
|---|---|
| **文档位置** | DEPLOY.md:66-72（第 1 步：拉取个人仓库） |
| **文档原文** | `git clone https://github.com/liaojiawei0428/dsh-ops.git DSH-ops` |
| **现象（实测）** | 照做即失败，耗时 41 秒：<br>`Cloning into 'DSH-ops'...`<br>`error: RPC failed; curl 28 Recv failure: Connection was reset`<br>`fatal: expected flush after ref listing`<br>退出码 **128** |
| **为何是文档缺陷** | DEPLOY.md:52 只说「bootstrap 不做诊断，克隆失败请先确认代理」——但**第 1 步是手工 clone，不是 bootstrap**，且全文未给出设置代理的具体命令。新机用户在此处只能自行猜出 `git -c http.proxy=...` 或 `HTTPS_PROXY` |
| **本次如何继续** | 使用了**文档外知识**（任务环境事实：系统代理 `http://127.0.0.1:7688`），改用 `git -c http.proxy=http://127.0.0.1:7688 clone ...`，16.9 秒成功 |
| **建议措辞** | 在第 1 步代码块内补一段：<br>`# 若直连 GitHub 不通（curl 28 / Connection reset），加代理：`<br>`$p = '<系统代理，如 http://127.0.0.1:7688>'`<br>`git -c http.proxy=$p clone https://github.com/liaojiawei0428/dsh-ops.git DSH-ops`<br>`# 或给当前会话设 HTTPS_PROXY/HTTP_PROXY（bootstrap 的两处 clone 也读这两个变量）` |

---

## 二、需要手工干预（2 条）

### D2. 隔离演练时，第 4 步的 `start-dsh-web.ps1` 会静默指向**正式服务**，且文档未给替代做法

| 项 | 内容 |
|---|---|
| **文档位置** | DEPLOY.md:149-153（第 4 步启动）、DEPLOY.md:166-168（端口冲突说明） |
| **文档原文** | `pwsh -File .\start-dsh-web.ps1` |
| **现象（读源码确认，未实跑）** | `start-dsh-web.ps1:180-192`：脚本先查 3080 是否有监听；**若有**则打印「DSH 服务已在运行 (pid …)」→ 写 pid 文件 → `Ensure-Watchdog` → 打开该服务的 URL → **`exit 0`**。<br>隔离演练机上 3080 已被正式服务占用时，照第 4 步执行的结果是：**没有启动隔离实例**，却报成功并打开**正式服务的页面**。 |
| **文档覆盖程度** | DEPLOY.md:166-168 确实警告了「要换端口必须同步改这几处」和「演练时最省事的做法是先停本机正在运行的那个实例，或直接换一台机器练」——**方向对，但没给出可操作的替代命令**（即"直接起 CLI 指定其它端口"）。本次所用 `--port 3081` 属**文档外知识** |
| **本次如何继续** | 按任务契约改用 `node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --port 3081 --no-open`，并**全程未运行** `start-dsh-web.ps1` |
| **建议措辞** | 在端口冲突说明后补一段「**隔离演练的推荐做法**」：<br>`# 不要跑 start-dsh-web.ps1（它按 3080 判存活，会误判为"已在运行"）`<br>`$env:DSH_HOME = '<隔离目录>'`<br>`node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --port 3081 --no-open`<br>`# 从输出/日志取带 token 的地址验证，验证完按 3081 的监听 pid 停掉` |

### D3. 第 4 步验证 1「健康检查」在隔离演练下不可用，且**可能反向干扰正式环境**

| 项 | 内容 |
|---|---|
| **文档位置** | DEPLOY.md:159（验证清单第 1 条） |
| **文档原文** | `.\health-check.cmd`（或 `pwsh -NoProfile -File .\health-check.ps1`）→ 全绿；其中「看门狗 G5」段应显示在岗 pid（不在岗会自动复活） |
| **现象** | ① 健康检查以 **3080** 为服务判据（`health-check.py:35 PORT = 3080`），隔离实例在 3081 时**必然报红**，无法作为验收依据；<br>② 更麻烦的是它带「看门狗不在岗**自动复活**」逻辑，而看门狗（`watchdog-dsh.ps1`）按 3080 判存活、并会拉起 `start-dsh-web.ps1` —— 在**演练机**上跑健康检查，可能把看门狗和正式服务链路拉起来 |
| **本次如何继续** | 按任务契约**跳过**了该验证（契约禁止运行 start-dsh-web/watchdog），改用 `validate-plugins` / `check-plugin-copy` / `test-standard` / `--dump-config` / `--version` / 3081 HTTP 六项替代 |
| **影响范围说明** | 对**新机正式部署**（不设 DSH_HOME、无 3080 冲突）此项正常可用；问题只出在**同机隔离演练**场景 |
| **建议措辞** | 在验证清单第 1 条加注：「隔离演练（同机、换端口）时**跳过本项**——它按 3080 判存活且会复活看门狗，可能干扰本机正式服务；改用下面的 2–5 项 + 直连 CLI 端口做验收。」 |

---

## 三、仅提示不清（3 条）

### D4. 带 token 的地址是「303 → 换 cookie → 200」两步，文档未说明

| 项 | 内容 |
|---|---|
| **文档位置** | DEPLOY.md:164（验证清单第 6 条） |
| **文档原文** | 「浏览器打开 `http://127.0.0.1:3080`（用 `dsh-web.log` 里带 token 的地址；裸地址 401）」 |
| **现象（实测，3081）** | 裸地址 → **401**（符合文档）；<br>带 token 地址 → **303 See Other**，`Location: /`，`Set-Cookie: dsh-auth-…`（token 被换成会话 cookie，authority 段为 `127.0.0.1:3081`）；<br>带该 cookie 再请求 `/` → **200 OK**，返回真实 HTML |
| **为何是缺陷** | 文档只说"带 token 的地址能用"，未说首次访问会 **303**。用 `curl`/`wget` 验证的人会看到 303 而误判为失败（浏览器会自动跟随并保存 cookie，所以浏览器路径确实"能用"） |
| **建议措辞** | 补一句：「带 token 的地址首次访问返回 **303** 并把 token 换成会话 cookie，浏览器会自动跟随；命令行验证需 `curl -L -c jar -b jar` 两步，直接看 303 不代表失败。」 |

### D5. bootstrap 收尾提示未适配 `DSH_HOME`

| 项 | 内容 |
|---|---|
| **文档位置** | bootstrap-personal.ps1:282-284 的实际输出（DEPLOY.md:132 本身写对了） |
| **现象（实测）** | 隔离演练（`DSH_HOME=F:\ceshi_1\.dsh-home`）时，bootstrap 结束打印：<br>`1. 恢复用户数据: ~/.dsh/settings.yaml 与 .credentials.yaml（备份或手工配置）`<br>但本次 profile 实际装配在 `F:\ceshi_1\.dsh-home`，提示词指错了目录 |
| **对照** | DEPLOY.md:132 标题已正确写 `%DSH_HOME% 或 ~/.dsh`；第 5 步脚本自身也正确打印了 `DSH_HOME = F:\ceshi_1\.dsh-home（个人 profile 装配到这里）`。**只是收尾提示没跟上** |
| **影响** | 仅提示不清（用户可能把用户数据放错目录） |
| **建议措辞** | 脚本收尾提示改为动态值：`恢复用户数据: $dshHome\settings.yaml 与 .credentials.yaml` |

### D6. 前置检查把 Microsoft Store 的 python 桩报为「前置 OK」，与第 0 步警告相矛盾

| 项 | 内容 |
|---|---|
| **文档位置** | bootstrap-personal.ps1:112-119（新版前置检查）；对照 DEPLOY.md:50 |
| **文档原文（第 0 步）** | 「Python 3 … **勿用 Microsoft Store 版**」 |
| **现象（实测）** | bootstrap 前置检查输出：<br>`前置 OK : python（C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\python.exe）`<br>——这正是第 0 步警告的那个 Store 桩 |
| **实际危害** | **无害**（已核实）：第 5 步生成覆盖层时会排除 `WindowsApps`（bootstrap-personal.ps1:215），最终写入 `personal.local.json` 的是真实解释器路径 `…\pythoncore-3.14-64\python.exe`。所以只是**措辞误导** |
| **建议措辞** | 前置检查同样排除 `WindowsApps`，命中时改为：<br>`前置警告: python 解析到 Microsoft Store 桩（…\WindowsApps\python.exe），将不被采用；请安装 python.org 版本（winget install Python.Python.3.12）` |

---

## 四、文档未说明但可用（1 条）

### D7. `test-standard.mjs` 未列入第 4 步验收清单

| 项 | 内容 |
|---|---|
| **文档位置** | DEPLOY.md:155-164（验证清单 6 项） |
| **现象** | `test-standard.mjs` 是部署链自检（准则工具链回归），实测在隔离环境 **exit 0 / `test-standard: all 5 checks hold`**，其中 T5 专门校验「10 个 .ps1 保留 BOM、3 个 .cmd/.bat 纯 ASCII」——正是 DEPLOY.md:271 强调的约束 |
| **判定** | 不是缺陷（清单未承诺包含它），但**建议纳入**：它是唯一能自动验证"部署链自身未被改坏"的闸门 |
| **建议措辞** | 在验证清单加第 7 条：「部署链自检 | `node .\test-standard.mjs` → `all 5 checks hold`（含 .ps1 BOM / .bat 纯 ASCII 校验）」 |

---

## 五、本次**未**发现问题的部分（正面核实，供对照）

以下文档声明经实测**完全一致**，不构成缺陷：

| 文档声明 | 位置 | 实测 |
|---|---|---|
| 补丁 24 条 + 恢复 7 项 | DEPLOY.md:100 | ✅ 24 + 7 |
| 8 个 append 型补丁不幂等 | DEPLOY.md:178 | ✅ 8 条（逐条比对 `new ⊇ old`） |
| `config/settings.yaml` 缺 3 个命名空间 | DEPLOY.md:138 | ✅ 缺 `shell` / `subagent-model-selection` / `llm-deepseek` |
| bundles 15 条 | DEPLOY.md:105 | ✅ 15 |
| dependencies 13 条 link | DEPLOY.md:104 | ✅ 13，且全部自动派生为 `F:/ceshi_1/...`（**盘符自由得到实证**） |
| 版本 `0.1.6-alpha.2` | DEPLOY.md:163 | ✅ 一致 |
| 裸地址 401 | DEPLOY.md:164 | ✅ 401 |
| 版本锚定 `official-ref.txt` 新机无需设置 | DEPLOY.md:192-199 | ✅ 自动取 `dsh-v0.1.6-alpha.2`，与开发机同一提交 |
| pin tag 导致游离 HEAD + refspec 已修正 | DEPLOY.md:226-237 | ✅ `HEAD`(detached) + `+refs/heads/*:refs/remotes/origin/*` |
| 交付前检查两项应为空 | DEPLOY.md:287-304 | ✅ 新机 clone 到的仓库 `git status` 与 `origin/main..HEAD` **均为空** |
| 前置条件检查会逐条列出缺项 | DEPLOY.md:91-94 | ✅ 实测通过（git 2.47.1 / node v24.16.0 / pnpm 11.22.0） |
| DSH_HOME 被部署链尊重 | DEPLOY.md:56-62 | ✅ 隔离生效（profile 落在 `F:\ceshi_1\.dsh-home`，`check-plugin-copy` 输出的 profile 路径即为隔离路径） |

---

## 六、缺陷统计

| 级别 | 条数 | 编号 |
|---|---|---|
| 阻断部署 | **1** | D1 |
| 需要手工干预 | **2** | D2, D3 |
| 仅提示不清 | **3** | D4, D5, D6 |
| 文档未说明但可用（建议纳入） | **1** | D7 |
| **合计** | **7** | |

**总结**：DEPLOY.md 的**流程主干是可靠的**——在「全新目录 + 换盘符（E:→F:）+ 隔离 DSH_HOME」条件下，从 clone 到 profile 装配一次跑通（bootstrap 14 分 10 秒，exit 0），15 条 bundle、13 条 link 全部正确派生，三个闸门全绿。缺陷集中在**边界场景**：本机网络需代理（D1）、同机隔离演练的端口/健康检查语义（D2/D3）、以及两处提示词未适配隔离模式（D5/D6）。
