---
date: "2026-08-18T06:43:43.021Z"
symptom: "pnpm run build 失败：数百个 TS6305 \"Output file has not been built\" 与 TS2339 声明合并错误，实际代码无任何改动问题"
component: "build-process"
severity: "minor"
status: "fixed"
root_cause: "pnpm run build 运行期间同仓库并发执行 pnpm run clean，删除了构建中途的 lib/types 输出，project references 解析失败产生数百个 TS6305/TS2339 连锁错误。"
fix: "确保无并发后干净重跑 pnpm run build 成功；更新流程固化为 update-dsh.ps1 串行步骤，构建期间禁止对仓库执行其他命令。"
related_files:
  - "D:/GongJu/DSH-ops/update-dsh.ps1"
  - "D:/GongJu/Deepseek_DSH/package.json"
dsh_commit: "99f6f02fec"
---

DSH 主仓库升级 rc.7 时，pnpm run build 以后台任务运行中，同一仓库并发执行了 pnpm run clean（本意清理旧产物），clean 删除了 build 正在生成的 233 个 lib/types 路径。后续编译的包通过 project references 引用这些缺失输出，产生大量 TS6305（Output file has not been built）与连锁 TS2339（声明合并失败，Context 缺少 goals/commands 等服务属性），build exit 1。排查要点：单独错误全是"输出缺失"形态而非真实类型错误；rc.7 是已发布 release 提交，CI 必过。修复：确认无并发进程后干净重跑 pnpm run build，全量成功。预防：准则 D3（主仓库更新只走 update-dsh.ps1，串行步骤）；update-dsh.ps1 构建段无并发窗口；教训写进脚本头注释。验证：第二次构建 exit 0，lib/types 与 apps/web/dist 产物齐全。
