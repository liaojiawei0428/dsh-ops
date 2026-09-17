---
date: "2026-09-10T02:00:34.459Z"
symptom: "官方升级到 0.1.5-alpha.2 后，个人运行副本残留 40 个官方已删除/重命名的文件（含整包 packages/client/ui-sidebar-textpreview），副本 pnpm-lock.yaml 与官方 lockfile 分叉（25397 vs 25330 行）"
component: "sync-official.ps1"
severity: "minor"
status: "fixed"
root_cause: "sync-official.ps1 用 robocopy /E 做增量复制，只增不删——官方在本轮更新中把 ui-sidebar-textpreview 重命名为 ui-sidebar-documentpreview（commit dcfd8c299d），旧包源码与其它被删文件在副本中永久残留；残留目录仍被 pnpm-workspace.yaml 的 packages/*/* glob 匹配，pnpm 把它当 workspace 包写进 lockfile，导致 lock 与官方分叉"
fix: "已修：新增 official-patches/prune-copy.mjs（判定规则=路径不在官方 git ls-files -z HEAD 清单 且 不被官方 .gitignore check-ignore 忽略，双条件交集；附加孤儿目录回收、prune-keep.txt 保留清单、--dry-run；路径一律走 -z NUL 模式规避 core.quotepath 中文转义）；sync-official.ps1 增 -NoPrune 开关，并在 robocopy /E 成功后自动执行该清理步骤（不使用 /MIR，副本独立 node_modules 与个人补丁保留）"
related_files:
  - "E:\\DSH\\DSH-ops\\sync-official.ps1"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\client\\ui-sidebar-textpreview"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\pnpm-lock.yaml"
  - "E:\\DSH\\DSH-ops\\ARCHITECTURE.md"
dsh_commit: "b2e3b2a012"
---

发现路径：用户升级到 0.1.5-alpha.2 后要求检查影响。逐项核对官方 checkout 与个人副本（E:\DSH\DSH-ops\Deepseek_DSH）时，用文件清单 diff（排除 node_modules/lib/dist/.dsh-build 等构建产物）发现副本比官方多 40 个文件、少 0 个（漏同步为 0，复制方向正确）。

排查与排除：① 确认官方 git 历史 commit dcfd8c299d "refactor(client): rename document preview package"（2026-09-09）把 @deepseek-ai/dsh-client-ui-sidebar-textpreview 改名为 @deepseek-ai/dsh-client-ui-sidebar-documentpreview；② 验证残留包当前是否被使用——官方与副本 tsconfig.client.json 的 sidebar references 均已指向 ui-sidebar-documentpreview，不含旧包；副本 packages/bundle/web-app/package.json 依赖新包；副本 node_modules/@deepseek-ai 下无任何 preview/sidebar 链接；profile package.json 中 preview 引用数为 0 → 判定为孤儿，运行时无影响；③ 但 pnpm-workspace.yaml 的 packages/*/* 仍匹配残留目录，pnpm-lock.yaml L3998 存在 packages/client/ui-sidebar-textpreview: importer 条目，官方 lock 中为 0 处 → lock 已分叉，pnpm install --frozen-lockfile 存在未来失败隐患。

验证：改用绝对路径 python 跑 health-check.py 全绿 exit 0——端口 3080 就绪、pid 40012 存活、看门狗常驻、12 bundles、10 插件闸门 PASS、回归 4 项通过；升级链日志显示 2026-09-10 09:53:44 副本同步+构建完成、09:54:03 健康检查 OK。本次残留未阻断构建，属累积性隐患。

修复验证（2026-09-10）：prune-copy.mjs 实跑删除 40/40 残留文件并回收孤儿目录 packages\client\ui-sidebar-textpreview（76 项构建产物/包级 node_modules，官方 HEAD 已完全无此目录）；副本 pnpm install 后 lockfile 与官方逐行一致（均 25330 行、旧名 0 次、SequenceMatcher 差异块 0）；副本 pnpm run build 成功（3.29s, exit 0）；prune 复跑 dry-run 报「副本无残留」。
