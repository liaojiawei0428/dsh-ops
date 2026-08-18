---
date: "2026-08-18T06:43:52.800Z"
symptom: "新装 dsh-tool-python 插件后 DSH 无法启动：13:05 重启日志显示 assertSupportedJsonSchema 抛 UNSUPPORTED_SCHEMA 共 15 条违规"
component: "dsh-tool-python"
severity: "critical"
status: "fixed"
root_cause: "output schema 把 required:true 写进属性定义内部并与 oneOf 并列，违反核心 assertSupportedJsonSchema 支持的 JSON Schema 方言（required 只能是父对象字符串数组），注册即抛错，插件树加载失败。"
fix: "required 全部改为父对象字符串数组写法（required: ['kind','exitCode',...]），语义不变；PLUGIN-STANDARD P4 + validate-plugins.mjs 闸门预防同类事故。"
related_files:
  - "D:/GongJu/DSH-ops/plugins/dsh-tool-python/index.js"
  - "D:/GongJu/DSH-ops/validate-plugins.mjs"
  - "D:/GongJu/DSH-ops/PLUGIN-STANDARD.md"
dsh_commit: "99f6f02fec"
---

自研 dsh-tool-python 插件首版把工具 output schema 的 required:true 写在各属性定义内部（如 kind: { type:'string', required:true }），exitCode/signal 还与 oneOf 并列。DSH 核心 assertSupportedJsonSchema 只支持 JSON Schema 子集：required 必须是父对象上的字符串数组、string/boolean/number 属性内不允许 required、oneOf 旁不允许。注册时校验器抛 UNSUPPORTED_SCHEMA（15 条违规），插件树加载失败，进程在监听端口前崩溃——13:05 重启日志即此。注意 parameters 部分写法不需改（注册表会提升属性级 required 为必填列表），仅 output schema 受限。修复：STREAM_SCHEMA/OUTPUT_SCHEMA 全部 required 改为父对象数组写法，语义不变。预防：此事故直接催生 PLUGIN-STANDARD P4 + validate-plugins.mjs 预检闸门（用真实核心校验器在重启前执行注册路径）+ 三脚本接闸。验证：闸门对修好插件 PASS；用同款坏 schema 反证闸门拦截，违规信息与生产日志逐字一致。
