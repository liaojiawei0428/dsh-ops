---
date: "2026-09-20T02:11:58.515Z"
symptom: "按 DEPLOY.md 在新机部署：第 1 步手工 git clone 直连 GitHub 直接失败（curl 28 / Connection reset，exit 128，41 秒），文档未给代理设置方式；同机隔离演练时照第 4 步跑 start-dsh-web.ps1 会静默打开正式实例页面并报成功（隔离实例根本没起），健康检查则按 3080 判存活且可能反向拉起正式启动链。"
component: "DEPLOY.md"
severity: "major"
status: "fixed"
root_cause: "文档是在\"开发机视角\"下写的，缺少新机与同机演练两条路径的边界说明：① 网络通道（只有升级链带 lib-proxy.ps1 自动诊断，手工 clone 与 bootstrap 都没有代理指引）；② 端口语义（start-dsh-web / watchdog / update-dsh / health-check 四处都以 3080 为目标，文档只警告\"要换端口得改这几处\"，没给演练可用的替代命令）；③ 验收细节（token 的两步跳转、环境变量通道的凭据、骨架文件的行数硬编码随骨架生长而腐坏）。"
fix: "DEPLOY.md 本轮修改：① 第 1 步补代理两种写法（git -c http.proxy= 与 HTTPS_PROXY/HTTP_PROXY，后者对 bootstrap 两处克隆同样生效）+ ls-remote 判据；② 第 4 步新增「隔离演练怎么启动」小节（不要跑 start-dsh-web.ps1 的原因 + 直起 CLI --port 3081 --no-open + 按监听 pid 停掉）；③ 验证清单第 1 项加「隔离演练跳过」警告并点名 watchdog-dsh/update-dsh 同样以 3080 为目标；④ 补带 token 地址的 303→cookie→200 完整流程与 curl -L -c jar -b jar 提示；⑤ 新增第 6 项 test-standard 闸门；⑥ settings.yaml 行数改为「7 段约 165 行」；⑦ 第 3 步新增第 6 项「环境变量」（OPENCODE_GO_API_KEY 等，提示只复制 .credentials.yaml 不够）+ 段数核对命令；⑧「始终保持 shallow」限定为新机 --depth 1 克隆并注明 is-shallow 不是一致性判据。代码侧另修两处（见 bootstrap 的两条记录）。"
related_files:
  - "DEPLOY.md"
  - "research/deploy-sim/doc-defects.md"
  - "research/deploy-sim/doc-conformance.md"
  - "research/deploy-sim/lead-verdict.md"
dsh_commit: "3664f90d81"
---

测法：一位队友只拿 DEPLOY.md 当唯一依据，在 F:\ceshi_1（空目录 + 换盘符 E:→F: + 隔离 DSH_HOME）从 GitHub 真实克隆后走完全流程；另一位队友只凭文档做独立审读；第三位独立重采产物与开发机基线比对。结果：部署**成功**（bootstrap 一次跑通 exit 0 / 14 分 10 秒；12/12 指纹一致；3081 端口真实起服务 401→303+cookie→200）。7 条缺陷里 D1 是实测复现的硬阻断（第 1 步 clone 直连 41 秒 exit 128，加代理 16.9 秒成功），D2/D3 是"照文档做会得到错误结果或反向干扰正式环境"的陷阱（同机演练场景），D4-D6 是提示不清，D7 是漏列闸门。另由文档审读者补出三条经复测属实的问题：L138 声称 settings.yaml 139 行实测 165 行；正文从未提及 OPENCODE_GO_API_KEY（而 personal.json 的 web-search-deepseek extraPatch 与 cordis.patch.yml 的 apiKeyEnv 都要求它，缺了 web_search 是硬报错不是降级）；"仓库始终保持 shallow"与开发机平级 checkout 实测 is-shallow=false 冲突。全部 7+3 条已在本轮修完并写入 DEPLOY.md。
