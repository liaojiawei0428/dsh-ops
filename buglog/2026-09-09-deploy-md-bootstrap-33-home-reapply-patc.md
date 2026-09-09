---
date: "2026-09-09T08:31:33.554Z"
symptom: "新电脑按 DEPLOY.md 部署：bootstrap 第 33 行 $home 赋值失败退出；reapply 报 patch 缺失/首块漂移；validate-plugins 找不到核心校验器"
component: "DSH-ops 部署脚本（bootstrap/validate-plugins/personal-hub）"
severity: "major"
status: "fixed"
root_cause: "部署流程在真实新机路径（无个人 local.json、无文件头注释的干净 patch、副本非同级）下逐一暴露：只读变量冲突、表头解析吞首块、核心校验器路径假设过期。"
fix: "bootstrap：$home→$userProfile + 建 profile 骨架；personal-hub：parsePatchBlocks 表头定位到 - id 行 + patch 缺失兜底；validate-plugins：TOOLS_LIB 指向副本。"
related_files:
  - "E:\\DSH\\DSH-ops\\bootstrap-personal.ps1"
  - "E:\\DSH\\DSH-ops\\validate-plugins.mjs"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
---

按 DEPLOY.md 在 F:\QiTa\ceshi 隔离演练（DSH_HOME 隔离）逐一暴露三处真实缺陷，已修复并复验：1) bootstrap-personal.ps1 用 `$home = $env:USERPROFILE` —— PowerShell 的 $HOME 是只读自动变量，赋值抛 'Cannot overwrite variable HOME' 直接 exit 1。修复：改用 $userProfile。2) personal-hub 的 parsePatchBlocks 把"第一个空行前所有行"当 header ——reapply 生成的干净 patch（第一块前无文件头注释）会把第一个块（deepseek-balance）整块吞进 header，导致 blocks 缺第一条、statusReport 复检报漂移。主仓此前未触发是因为主仓 patch 文件开头有多行说明注释（headEnd 停在空行恰好放过首块）。修复：header 停在第一个 `- id:` 行而非第一个空行。3) validate-plugins.mjs 的 TOOLS_LIB 定位用 `join(dirname(OPS_DIR), 'Deepseek_DSH/...')`（旧架构官方在 DSH-ops 同级）——新架构核心校验器在个人副本（OPS_DIR/Deepseek_DSH），导致新机闸门报 ERR_MODULE_NOT_FOUND。修复：改 OPS_DIR 内副本路径，DSH_TOOLS_LIB 仍可覆盖。另两处同演练适配：reapply 读 cordis.patch.yml 无存在性保护（新机 patch 文件缺失 ENOENT）——加 existsSync 兜底空文本；bootstrap 第 5 步需先建 profile 骨架 package.json（validateManifest 要求存在）。演练验证全链通过：bootstrap 5 步全绿、profile 装配 drift 0、闸门 10/10、组合树 12 bundle、服务 --port 3090 启动成功、cookie 登录 + /dsh-personal-hub/status 200（drift []/plugins 10, DSH_HOME 完全隔离）。备份目录 backupProfile 仍写 homedir()/.dsh（未 DSH_HOME 隔离，minor 遗留）。
