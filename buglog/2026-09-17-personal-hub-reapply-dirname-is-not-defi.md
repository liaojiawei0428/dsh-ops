---
date: "2026-09-17T02:26:15.408Z"
symptom: "personal_hub_reapply 立即失败并返回「重新适配失败：dirname is not defined」，「已执行步骤」为空（连 profile 备份都没做）。"
component: "dsh-personal-hub"
severity: "major"
status: "fixed"
root_cause: "backupProfile（index.js:567）调用裸 `dirname()`，但模块只 `import path from 'node:path'`、没有 `import { dirname } from 'node:path'`（或使用 path.dirname），触发 ReferenceError: dirname is not defined，使 personal_hub_reapply 在备份阶段即崩溃、整个工具完全不可用。该行系 2026-09-09 修「备份根未跟随 DSH_HOME」时引入，因期间从未执行过 reapply 而未被发现（备份目录时间戳停在 09-09 即为佐证）。"
fix: "index.js:567 的裸 `dirname(dirname(profileDir))` 改为 `path.dirname(path.dirname(profileDir))`；用真源码抽取函数 + 隔离临时目录做执行覆盖演练，随后真跑 reapply 端到端验收通过。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
  - "C:\\Users\\Administrator\\.dsh\\backups\\2026-09-17T02-25-39-019Z-personal-hub"
---

发现过程：作为「清单数组 config」修复的验收步骤真跑 personal_hub_reapply，工具立刻返回「重新适配失败：dirname is not defined」，且「已执行步骤」为空 —— 说明异常发生在 backupProfile（actions.push 之前），连备份都没建立。

定位：grep dirname 得到 index.js:567 `const dshRoot = dirname(dirname(profileDir))`，而模块 import 段（19-23 行）只有 `import path from 'node:path'`，从未 import dirname → ReferenceError。全文扫描裸 path 方法（dirname/join/resolve/basename/extname/relative/normalize/isAbsolute）仅此一处（602 行的 resolve(value) 是 Promise 的执行器参数，正常）。

潜伏原因：该行是 2026-09-09 隔离演练后为修「backupProfile 仍写 homedir()/.dsh、未跟随 DSH_HOME」这条 minor 遗留而改的，改完未执行覆盖 —— ~/.dsh/backups 里的 personal-hub 备份目录停在 2026-09-09T08-15-14，证明此后 8 天内没有任何 reapply 运行过，缺陷一直潜伏。这也解释了为什么 2026-08-28/09-09 两条记录里的 reapply 验证是成功的：那时它还是 `homedir()` 版本。

修复：改为 `path.dirname(path.dirname(profileDir))`，与文件其它 path 调用（第 35、215、240 行）风格一致。

验证：用真源码抽取的 backupProfile 在隔离临时目录演练（构造 <tmp>/profiles/web 假 profile，放 package.json + cordis.patch.yml）：返回备份目录、备份根正确落在 <模拟 DSH_HOME>/backups、复制了存在的文件、原文件未动、演练目录清理干净。随后重启加载修复，真跑 personal_hub_reapply 全流程成功：已备份 profile 文件 → package.json 重写 → cordis.patch.yml 重生成 → pnpm install 完成 → 复检无漂移；reapply 后两个文件的 sha256 与改前逐字节一致（666da5dc3c390450 / 5cd587377bb7cbf8）。

这条与同日另一条 personal-hub 修复（数组 config + 注释累积）共同构成 reapply 链路自 2026-09-09 以来第一次完整跑通的验收。
