---
date: "2026-08-22T01:23:55.824Z"
symptom: "新电脑按 DEPLOY.md 部署会得到 0.1.0-rc.7 旧版 DSH，凭据写入旧扁平格式，与开发机 0.1.1-rc.2 环境不一致。"
component: "dsh-ops-deploy"
severity: "major"
status: "fixed"
root_cause: "开发机升级到 0.1.1-rc.2（凭据体系改版 + 新增提供商）后，部署文档与模板未同步更新，仍按 rc.7 时代内容指导新电脑部署，导致新机偏离统一标准（旧版 DSH + 旧凭据格式 + 错误版本期望）。"
fix: "DEPLOY.md 五处版本/凭据/残留段落更新至 0.1.1-rc.2 标准（checkout tag 台账驱动、新凭据格式教学、删旧脚本说明）；config/settings.yaml 覆盖为开发机实际配置。"
related_files:
  - "E:\\DSH\\DSH-ops\\DEPLOY.md"
  - "E:\\DSH\\DSH-ops\\config\\settings.yaml"
---

现象：复核"其他电脑能否部署到统一标准"时发现 DEPLOY.md 仍停留在 0.1.0-rc.7 时代：第 1 步 checkout 到 99f6f02fec（rc.7 旧提交）、第 2 步期望 --version 输出 0.1.0-rc.7、第 4 步凭据文件按旧扁平 KEY: value 教学、第 5 步验证期望 0.1.0-rc.7；另残留 restart-dsh-web.ps1 / DSH_OPS_DIR（默认 D:\GongJu）的旧脚本说明（仓库内并不存在该脚本）。新电脑严格照做会部署到旧版 DSH，与开发机（0.1.1-rc.2）不一致，且旧版 DSH 无法读取新版 version/refs 嵌套凭据格式（fail-loud）。

排查：确认仓库文件清单无 restart-dsh-web.ps1；version-history.md 台账最新为 0.1.1-rc.2 @ b150a551b8d4（2026-08-21 21:11 自动更新）；主仓库 tag dsh-v0.1.1-rc.2；config/settings.yaml 模板仍为旧版（缺 opencode-go/opencode 提供商、默认模型 zai/glm-5.3 与开发机 opencode-go/deepseek-v4-flash 不符）。

修复：① DEPLOY.md 第 1 步 checkout 改为台账驱动的 tag（dsh-v0.1.1-rc.2，注明升级时同步推进）；② 第 2/5 步版本期望改 0.1.1-rc.2，版本胶囊说明补充"官方可能已更新，用更新DSH.bat 对齐"；③ 第 4 步凭据教学改新版嵌套格式（version: 1 + refs: 两空格缩进），注明守卫兼容两代；④ 删除 restart-dsh-web.ps1/DSH_OPS_DIR 残留段落，改为"无外部环境变量约定"；⑤ config/settings.yaml 用开发机实际配置覆盖（脱敏确认无密钥，全 apiKeyEnv 引用）。

验证：全仓库扫描无 0.1.0-rc.7 / 99f6f02fec / rc.8 残留；settings 模板含三家提供商完整模型目录且无密钥；DEPLOY.md 关键段抽查正确。
