---
date: "2026-09-19T09:10:32.326Z"
symptom: ".ps1 的 UTF-8 BOM 在每次编辑重写后被静默抹掉、.cmd/.bat 被写入中文注释后 cmd.exe 把乱码当命令执行（实测打印 `'��链…' is not recognized`）——两类编码事故都在同一次整改中真实发生，而准则工具链没有任何检查能拦住它们。"
component: "test-standard.mjs"
severity: "minor"
status: "fixed"
root_cause: "编码不变量此前只写在文档里（PLUGIN-STANDARD.md 要求 .ps1 带 BOM、.cmd/.bat 保持 ASCII），但没有任何自动检查：BOM 是被\"读-改-写\"式编辑抹掉的（写入方不保留 BOM），非 ASCII 是被\"顺手加中文注释\"引入的，两者都不产生任何报错，直到用户双击入口或脚本落到 PowerShell 5.1 才以乱码/解析错误暴露。"
fix: "test-standard.mjs 新增 T5「deploy-chain hygiene」检查（含 readdir 递归遍历、.ps1 BOM 断言、.cmd/.bat 纯 ASCII 断言、失败时列出文件与字节偏移），头注释同步登记 T5；修复时先手工补回三个 .ps1 的 BOM（用字节级写入，不用会再次抹掉它的编辑路径），并删除 research/deploy-audit/_sandbox 队友残留。现有记录 2026-09-19-dsh-home-not-respected-and-bom.md 覆盖同一天\"5 个核心 .ps1 缺 BOM\"的初始修复，本记录补的是\"为什么它会反复回归\"以及现在的自动闸门。"
related_files:
  - "test-standard.mjs"
  - "health-check.cmd"
  - "启动DSH.bat"
  - "更新DSH.bat"
  - "bootstrap-personal.ps1"
  - "sync-official.ps1"
  - "update-dsh.ps1"
  - "PLUGIN-STANDARD.md"
dsh_commit: "407839f062"
---

两类事故都在 2026-09-19 这次部署兼容性整改中真实发生过，且都是"静默"的：① 我用 edit 工具改 bootstrap-personal.ps1 / sync-official.ps1 / update-dsh.ps1 后，三者的 UTF-8 BOM 被写入方悄悄抹掉（`git show HEAD:<file>` 有 BOM、工作区没有；同批未改动的 lib-proxy.ps1 / start-dsh-web.ps1 / watchdog-dsh.ps1 / check-update.ps1 都还有 BOM，说明是编辑动作引入的）；这些文件含中文注释，落到 Windows PowerShell 5.1 会按 OEM 代码页误解码。② 同一批改动里我给 health-check.cmd / 启动DSH.bat / 更新DSH.bat 加中文注释，cmd 实际打印出 `'��链，不执行任何服务动作。' is not recognized...`（三条），因为 cmd.exe 也按 OEM 代码页解码 .cmd/.bat，中文注释直接当命令执行。当时是逐个手工修的，没有闸门——同类回归还会再发生。这次把不变量写成 T5：递归扫描仓库（跳过 node_modules/.git/Deepseek_DSH/__pycache__），所有 .ps1 必须前三字节是 EF BB BF，所有 .cmd/.bat 必须全字节 ≤ 127，违反即逐条列出文件名与偏移并 exit 1。T5 上线后立刻抓到队友留在 research/deploy-audit/_sandbox 的两个无 BOM 的 .ps1 测试副本（已清理该沙箱目录）；之后 `node test-standard.mjs` 五项全绿。注意：这是"检出回归"的闸门，不阻止写入方抹 BOM——编辑 .ps1 后仍应确认 BOM 并跑一次 test-standard.mjs。
