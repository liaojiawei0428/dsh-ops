---
date: "2026-09-09T07:05:49.494Z"
symptom: "官方 checkout 源码带个人补丁（rpc-host/payload-validation），更新拉取受扰且官方目录非纯净，无法实现\"官方一致 + 个人独立部署\"分离"
component: "DSH-ops 部署架构 + official-patches"
severity: "major"
status: "fixed"
root_cause: "个人补丁直接打在官方 checkout 源码上，官方目录永远 dirty，更新拉取需 stash；用户要求官方目录纯净、个人部署独立成私人仓库全量推送。"
fix: "官方/副本分离：官方目录纯净只拉取；副本承载补丁与运行；apply-patches.mjs 精确替换 + sync-official.ps1 + bootstrap-personal.ps1；启动/更新链切到副本。"
related_files:
  - "E:\\DSH\\DSH-ops\\ARCHITECTURE.md"
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\sync-official.ps1"
  - "E:\\DSH\\DSH-ops\\bootstrap-personal.ps1"
  - "E:\\DSH\\DSH-ops\\start-dsh-web.ps1"
  - "E:\\DSH\\DSH-ops\\update-dsh.ps1"
---

用户要求彻底分离官方仓库与个人部署：此前个人修复补丁（rpc-host.ts connection 回归、payload-validation.ts descriptor v2 兼容）直接打在官方 checkout 源码上，导致 update-dsh 拉官方时需 stash/恢复、官方目录永远 dirty。新架构（ARCHITECTURE.md）：E:\DSH\Deepseek_DSH = 纯净官方 checkout（git status 恒干净，只 fetch/pull/build 作拉取源）；E:\DSH\DSH-ops\Deepseek_DSH = 个人运行副本（.gitignore 排除不入个人 git，独立 pnpm install 2.3GB + 补丁源码，服务运行源）。补丁管理：official-patches/apply-patches.mjs 用精确文本替换（目标串必须唯一出现，fail-loud 防漏补）对新副本源码应用，副本内 pnpm run build 使产物带补丁；官方升级后由 sync-official.ps1（官方源码增量同步+补丁+重build）自动重打。新电脑部署：bootstrap-personal.ps1（clone 官方 → install → 打补丁 → build）。启动链：start-dsh-web.ps1 的 $repo 改为副本；update-dsh.ps1 构建官方后调用 sync-official.ps1 再以副本为运行源做版本确认/预检/重启。验证：官方目录 git status 空（纯净）；副本 pnpm install + build 成功（234 client artifacts）；副本 bin.js --version 0.1.5-alpha.1；副本 dump-config 组合解析正常；服务从副本启动后 health 全绿、validate-plugins 10/10、三个 RPC 通道 200（personal-hub/server-ssh/github-push）；副本 lib 读 51/51 会话成功（含 descriptor v2 补丁）。遗留：DSH-ops 仓库待提交（新架构文件 + 本次修复），github-push 绑定已修正 dsh-ops（DSH_RuanJian 废弃），本地 DSH-ops 与远端 dsh-ops.git 分叉待合并（ahead 3/behind 26）。
