---
date: "2026-08-18T10:16:24.076Z"
symptom: "新机部署时 validate-plugins.mjs 指向开发机用户目录（C:/Users/37868），用户名不同则闸门检查错误 profile"
component: "deploy-toolchain"
severity: "major"
status: "fixed"
root_cause: "两个工具脚本把 profile 目录硬编码为开发机用户名 C:/Users/37868/.dsh，新机用户名不同即失效；部署文档未覆盖 settings.yaml 模板复制，旧 setup.ps1 用 npm 撞名风险的 plugin add 注册方式。"
fix: "validate-plugins.mjs / disable-plugin.mjs 的 profile 路径改为 DSH_HOME ?? os.homedir()/.dsh 动态解析；DEPLOY.md 明确 D:\\GongJu 固定路径约定 + settings.yaml 复制步骤；淘汰旧部署脚本。"
related_files:
  - "D:/GongJu/DSH-ops/validate-plugins.mjs"
  - "D:/GongJu/DSH-ops/disable-plugin.mjs"
  - "D:/GongJu/DSH-ops/DEPLOY.md"
---

模拟新机部署（E:\DSH）验证 DEPLOY.md 时发现：validate-plugins.mjs 与 disable-plugin.mjs 把 profile 目录硬编码为 C:/Users/37868/.dsh/profiles/web——新机用户名不同时，闸门会检查错误的 profile（找不到插件→误报或漏报），disable-plugin 会操作错误路径。修复：两处改为动态解析（优先 DSH_HOME 环境变量，回退 os.homedir()/.dsh）。同时发现 D:\GongJu 路径约定已统一（脚本按约定硬编码，属设计而非缺陷），已在 DEPLOY.md 明确为新机部署前提。另：旧部署脚本（setup.ps1/安装DSH.bat/DEPLOY.txt/README.txt）已淘汰，其中 setup.ps1 的 plugin add 注册方式有 npm 撞名风险且只注册 locale-language，DEPLOY.md 的 link 方式为唯一权威流程。
