# T4 交叉验证报告（verification.md）

- 验证员：T4（deploy-steps）
- 日期：2026-09-20
- 方法：不信任 T1 的 `artifacts.json`，独立重跑全部命令取数；`artifacts.json` 仅作交叉核对对象。
- 隔离环境：`DSH_HOME=F:\ceshi_1\.dsh-home`，cwd=`F:\ceshi_1\DSH-ops`。全程只读，未修改 `F:\ceshi_1` 与 `C:\Users\Administrator\.dsh`，未碰 3080 正式服务（pid 44804 未受影响），未运行 start-dsh-web / watchdog / update-dsh。

## 逐项对照表（隔离 F:\ceshi_1 vs 开发机基线 baseline.json）

| 项 | 基线（开发机） | 隔离（独立重采） | 判定 |
|---|---|---|---|
| dsh_version | 0.1.6-alpha.2 | `node F:\ceshi_1\DSH-ops\Deepseek_DSH\apps\cli\lib\bin.js --version` → `0.1.6-alpha.2` | ✅ 一致 |
| bundles（15） | 15 条，含 2 官方基座 + 11 自研 + 2 Agent Teams | `F:\ceshi_1\.dsh-home\profiles\web\package.json` → 15 条，逐条与基线数组相等（True） | ✅ 一致 |
| link_dependencies（13） | 13 条全部指向 `E:/DSH/...` | 13 条全部派生为 `F:/ceshi_1/...`；将基线 13 条 `E:/DSH` 映射到 `F:/ceshi_1` 后与隔离完全相等（True） | ✅ 一致（机器特定值正确派生） |
| 补丁条数 | patches 24 + restore 7 | 隔离 `apply-patches.mjs` 实测 24 条 patch（`file:` 计数）+ 7 条 restore（`from:` 计数） | ✅ 一致 |
| settings 顶层键 | 10 段 | 隔离 10 段（ui-onboarding/agent-default-model/agent-presets/permission/ui-theme/llm-pi-ai/ui-conversation/shell/subagent-model-selection/llm-deepseek），且与开发机 `C:\Users\Administrator\.dsh\settings.yaml` 键名同序逐段相等（True） | ✅ 一致 |
| 插件目录（盘上） | 12 个 | 隔离 `plugins/` 12 个目录，与基线 `plugins_on_disk` 集合相等 | ✅ 一致 |
| BUNDLE_COPY 键集 | 17 keys | 隔离 `plugins/dsh-plugin-guide/client.js` 17 keys，与基线相等；与开发机 `E:\DSH\DSH-ops\plugins\dsh-plugin-guide\client.js` 键集亦相等 | ✅ 一致 |
| 闸门 validate-plugins（隔离实跑） | exit 0，「all 11 active linked plugin(s) safe to load」 | 隔离实跑 exit 0，末行同上（11 PASS，2 官方 computer-use 包 SKIP-disabled 属正常） | ✅ 一致 |
| 闸门 check-plugin-copy（隔离实跑） | exit 0，missing 0 | 隔离实跑 exit 0：`profile bundles: 15 · table entries: 17 · covered 13 · exempt 2 · missing 0` | ✅ 一致 |
| 闸门 test-standard（隔离实跑） | exit 0，all 5 checks hold | 隔离实跑 exit 0，T1–T5 全 PASS（T2/T3 的「FAIL」行是测试对坏样本的预期断言，末行 all 5 checks hold） | ✅ 一致 |
| dump-config 组合树（隔离实跑） | 15 条 bundle 全现 | 隔离实跑 exit 0，输出 630 行；15 基线 bundle 0 缺失；7 个点名 id（dsh-server-ssh/dsh-github-push/dsh-personal-hub/dsh-deepseek-balance/dsh-tool-python/dsh-computer-use/dsh-personal-bar）全部出现 | ✅ 一致 |
| 官方 checkout 锚定 | dsh-v0.1.6-alpha.2 / ddefc45fbc | 平级 `F:\ceshi_1\Deepseek_DSH` 与运行副本 `F:\ceshi_1\DSH-ops\Deepseek_DSH` 均 detached @ ddefc45（tag dsh-v0.1.6-alpha.2） | ✅ 一致 |

**不一致项：0。无法比对项：0。**

## 对抗性检查结果

| 检查 | 结果 |
|---|---|
| 活跃 profile 是否混入 `E:\DSH`（开发机串入） | `.dsh-home\profiles\web\package.json` / `cordis.patch.yml` / `personal.local.json` 中 0 条 E 盘路径；13 条 link 全部 `F:/ceshi_1` |
| profile dependencies 是否真 link 到 `F:\ceshi_1` 插件目录 | 13/13 `realpath` 命中目标目录（非半安装） |
| node_modules 符号链接是否真实落地 | 13/13 存在且 realpath 解到目标 |
| settings.yaml 是否与开发机同段同键 | 10/10 段、键名与顺序逐段相等（含 `llm-pi-ai`/`llm-deepseek` 等全部段） |
| cordis.patch.yml 托管条目是否生成 | 31 行；`tool-python` 的 `pythonPath` 与 `pwsh-sandbox` 的 `pwshPath` 均存在（值取自本机探测位，同机演练预期） |
| `personal.local.json` 机器覆盖层 | 已生成；extraDependencies 2 条指向 `F:\ceshi_1\DSH-ops\Deepseek_DSH\packages\...`（非 E:）；pwshPath/pythonPath 为开发机安装位（E:\GongJu\7\pwsh.exe、pythoncore-3.14）——同机演练预期值 |
| 全量 E: 盘串入扫描（.dsh-home 全部文本文件） | 379 条命中全部位于 `backups/`（历史备份快照，含 `link:E:/DSH` 属预期）与 `AGENTS.md`（从旧机复制的文档，指针仍指 `E:\DSH\DSH-ops`，不影响运行）；**活跃配置 0 处** |
| 双官方 checkout 并存 | 平级 + 运行副本两份均 @ ddefc45，升级链拉取源齐备 |

## T1 artifacts.json 交叉核对

逐字段复核（版本、bundles、13 条依赖映射、闸门结论、dump-config 630 行、官方锚点 ddefc45、3081 验证状态）——**未发现与独立实测不符之处**。artifacts 中 `machine_specific_overlay_generated` 的 `pythonPath`（C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe）与隔离实测 cordis.patch.yml / personal.local.json 值一致。

## 总判定

**能**——按 DEPLOY.md 从零可部署出与开发机等价的同一套 DSH。

理由（关键证据）：12/12 项指纹（版本、15 bundles、13 link、24+7 补丁、settings 10 段、插件 12 目录、17 键中文表、三闸门实跑、dump-config 630 行、官方锚点 ddefc45）全部与基线一致；13 条依赖正确派生到 `F:\ceshi_1` 且符号链接真实落地；对抗检查未发现任何活跃配置指向开发机 `E:\DSH`。

**置信度：高（约 95%）**。

- 支撑：两份官方 checkout 同 commit、15 bundles 逐条相等、13 link 全部解到 F:、三闸门在隔离环境实跑 exit 0、组合树 630 行且 15 条 bundle 全现。
- 未完全覆盖（残余 5%）：3081 HTTP 验证由 T1 执行（T4 边界为只读不碰服务，未重跑）；`AGENTS.md` 的文档指针仍指开发机（不影响运行）；`backups/` 中的 E: 盘 link 快照是历史产物（不影响运行）。
