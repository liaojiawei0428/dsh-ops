---
date: "2026-08-18T06:43:03.671Z"
symptom: "安装 dsh-deepseek-balance 后 Web GUI 右上角出现固定悬浮胶囊并遮挡 Session log 按钮，而非预期的会话头部并列胶囊"
component: "plugin-management"
severity: "major"
status: "fixed"
root_cause: "npm 公开注册表存在同名包 dsh-deepseek-balance@0.1.0（v2 时代的悬浮胶囊旧代码），dsh plugin add 按名字从 npm 解析装到了它，而正式版实际只在私有 DSH-ops 仓库维护。"
fix: "卸载 npm 版，DSH-ops 仓库 pull 到 8dc84ce 后改用 link:D:/GongJu/DSH-ops/plugins/dsh-deepseek-balance 安装；插件准则 P1 规定自研插件 private:true 永不发布 npm。"
related_files:
  - "C:/Users/37868/.dsh/profiles/web/package.json"
  - "D:/GongJu/DSH-ops/plugins/dsh-deepseek-balance"
dsh_commit: "99f6f02fec"
---

在 web profile 安装 dsh-deepseek-balance 时，dsh plugin add 从 npm 注册表解析到同名包 dsh-deepseek-balance@0.1.0（Hamerbyh/dsh-deepseek-balance，2026-08-14 发布）——它是 v2 时代的 shell.overlay 悬浮胶囊代码（position:fixed; top:12; right:12），与自研正式版（DSH-ops 仓库 8dc84ce，conversation.session.header.utilities 槽位、/api/dsh/deepseek-balance 路由）完全不同。判定依据：用户检查清单中的路由路径与 npm 版不符；GitHub main 分支源码与 npm tarball 逐字一致，排除版本滞后。修复：DSH-ops git pull 后改用 link: 协议安装（profile package.json dependencies + dsh.profile.bundles），卸载 npm 版。预防：PLUGIN-STANDARD P1 —— 自研插件 private:true 永不发布 npm，一律 link 安装。验证：--dump-config 显示 deepseek-balance 行指向本地 link；刷新页面后悬浮胶囊消失，头部工具行出现余额胶囊。
