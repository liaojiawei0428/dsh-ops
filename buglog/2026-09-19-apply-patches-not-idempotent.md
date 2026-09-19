---
date: "2026-09-19T07:23:11.235Z"
symptom: "在已打过补丁的个人副本上重跑 official-patches/apply-patches.mjs，17 条补丁中有 6 条锚点仍 count==1，会被重复插入（presentation.ts 出现两份 deploymentCopy()、adapter.ts 出现第二个 const sessionId、README 多一段、spec 多两组测试），脚本仍报「全部补丁应用成功 OK」不报错。"
component: "official-patches/apply-patches.mjs"
severity: "major"
status: "open"
root_cause: "补丁定义采用了「保留原文并追加」的形态（new = old + 追加内容），使 old 在应用后依然作为 new 的连续子串存在，锚点计数守卫（期望恰好 1 次）在二次运行时依然成立，于是脚本把同一段内容再插入一次。脚本只校验「锚点出现次数」而不校验「补丁是否已应用」（无哨兵标记、无幂等检测）。"
fix: "未修复（审核任务只读，未修改被审文件）。建议最小修法：把 apply-patches.mjs:173-187 的「边扫描边写入」改成两遍——第一遍只读统计每条 old 的 count 并收集 failures，全部通过后第二遍才统一 writeFileSync；这样同时消除非幂等重复插入与半打补丁的非原子状态。若要保留单遍，则必须在每条 append 型补丁的 new 里加入哨兵注释（如 `// dsh-patch:harnessSessionHeader`），并在应用前先检查哨兵是否已存在，存在则跳过。"
related_files:
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\DEPLOY.md"
---

发现过程：对 DSH-ops 部署链做对抗性审核（task-4）时，用 python 解析工作区 official-patches/apply-patches.mjs 的 patches 数组（17 条补丁），提取每条 old 字符串，分别在两棵真实源码树中统计出现次数：
- 纯净官方克隆 E:\DSH\Deepseek_DSH\packages（HEAD ddefc45f，0.1.6-alpha.2）→ OK=17 ZERO=0 AMBIG=0（补丁集与开发机所用官方版本完全对得上）
- 个人副本 E:\DSH\DSH-ops\Deepseek_DSH\packages（已打过补丁）→ OK=6 ZERO=11 AMBIG=0

关键异常：副本已打补丁，却有 6 个锚点仍然 count==1。逐个核对 new 字段确认这 6 条都是 append 型（new = old + 追加内容，old 在 new 中保持连续），因此第一次应用后 old 仍恰好出现 1 次，apply-patches.mjs:181 的 `if (count !== 1)` 守卫无法拦截第二次应用。另外 11 条为替换型（old 被吃掉，二次应用 count==0 → 正确 fail-loud）。

受影响的 6 条（行号为工作区 apply-patches.mjs）：
1. llm/llm-pi-ai/src/adapter.ts（:70-75，插 const sessionId 计算）
2. llm/llm-pi-ai/tests/adapter.spec.ts（:82-87，追加两个 it 块）
3. llm/llm-pi-ai/tests/adapter.spec.ts（:88-93，前插一个 it 块）
4. llm/llm-pi-ai/README.md（:100-105，段落追加）
5. llm/llm-pi-ai/README.zh.md（:112-117，段落追加）
6. client/ui-plugin-manager/src/client/presentation.ts（:148-169，追加 deploymentCopy() 函数）

放大因素：DEPLOY.md:134「日常维护」表格明确给出「重新应用补丁：node .\official-patches\apply-patches.mjs .\Deepseek_DSH\packages」，用户照做即中招；且脚本不会报警（count==1，输出仍是 ✓ 与「全部补丁应用成功 OK」）。

未做的部分（诚实标注）：任务禁止修改被审文件，因此未实际执行二次打补丁；本记录是静态判定 + 锚点计数实证，证明「6 个锚点在已打补丁副本上仍 count==1」，未跑出实际破坏现场。TS2393 重复函数实现 / 重复 const 声明导致 pnpm run build 失败属 TS 语义必然推论。

相关背景：该脚本同时存在非原子写入问题（:185 逐个 writeFileSync，:245 才汇总 failures），新机若在第 N 个补丁失败，副本处于半打补丁状态。两条缺陷建议一并修。

发现者：teammate crosscheck（D-对抗验证，只读取证，未修改任何文件）。
