---
date: "2026-09-18T01:11:49.404Z"
symptom: "注释掉 cordis.patch.yml 里的插件 entry 并重启后，插件仍然生效（最终组合仍含 `- id: opencode-session-id`），导致\"停用插件后验证\"的结论完全无效。"
component: "dsh-profile / disable-plugin"
severity: "minor"
status: "fixed"
root_cause: "profile 的 `dsh.profile.bundles` 列表会为每个 bundle 自动提供默认 entry；`cordis.patch.yml` 只是其上的覆盖/追加层。把 patch 里的 entry 注释掉并不会移除 bundle 提供的同名 entry，插件照常加载。dump-config 是唯一可靠的最终组合事实来源。"
fix: "停用 linked 插件一律用 `node E:\\DSH\\DSH-ops\\disable-plugin.mjs <name>`（移除 dsh.profile.bundles 条目），并用 `node apps/cli/lib/bin.js --profile web --dump-config` 确认最终组合中该 id 消失后再做验证；恢复时把名字加回 bundles 数组。本机已按此摘除 dsh-opencode-session-id。"
related_files:
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\package.json"
  - "E:\\DSH\\DSH-ops\\disable-plugin.mjs"
---

发现过程：为独立验证 llm-pi-ai 的原生会话头修复，需要真正停用 dsh-opencode-session-id 插件（否则无法区分是谁发的会话头）。第一次只在 C:\Users\Administrator\.dsh\profiles\web\cordis.patch.yml 里把该插件 entry 注释掉并重启，重启后模型调用正常、会话日志无 400——看似验证通过。

误判被 `node apps/cli/lib/bin.js --profile web --dump-config` 推翻：输出仍含 `- id: opencode-session-id`（且分节标题为 `# == dsh-opencode-session-id`），说明它来自 bundle 层而非 patch 层。检查 ~/.dsh/profiles/web/package.json 确认 `dsh.profile.bundles` 数组里仍有 `dsh-opencode-session-id`，而 cordis.patch.yml 只是覆盖/追加层，注释掉 patch entry 不会移除 bundle 提供的默认 entry。

正确做法：用仓库自带工具 `node E:\DSH\DSH-ops\disable-plugin.mjs dsh-opencode-session-id`，它只从 `dsh.profile.bundles` 移除条目，保留 `dependencies` 的 link: 与插件文件，恢复只需把名字加回数组。执行后 dump-config 中该 entry 消失（168 entries），此时的重启验证才有效。

教训：**验证"移除某插件后行为是否仍正确"之前，必须用 dump-config 确认该插件真的不在最终组合里**，不能只看 patch 文件。对插件做过任何"停用"操作后都应以 dump-config 为准。
