---
date: "2026-09-20T10:04:06.573Z"
symptom: "新写的 functional-parity.mjs 一执行就 SyntaxError: Unexpected identifier '找不到运行副本的依赖目录'，报错指向一个语法完全正常的模板字面量行。"
component: "functional-parity.mjs"
severity: "minor"
status: "fixed"
root_cause: "块注释内容里出现了 `*/` 字面量（写 pnpm 的 glob 路径 `.pnpm/yaml@*/` 时），JS 解析器据此提前结束注释，后续文本被当作代码解析；报错位置与真实原因相隔数行，且错误信息（Unexpected identifier + 中文串）指向的是一段本该是模板字面量内容的文本。"
fix: "functional-parity.mjs 头部注释里把 `<copy>/node_modules/.pnpm/yaml@*/` 改写为 `node_modules/.pnpm/yaml@<version>/node_modules/yaml`，消除 `*/` 序列；改完 `node --check` 通过、--export 与 --check 均正常。"
related_files:
  - "functional-parity.mjs"
dsh_commit: "230a96b406"
---

写 functional-parity.mjs 时，JSDoc 注释里描述 pnpm store 路径写成「`<copy>/node_modules/.pnpm/yaml@*/`」——其中 `@` 后面的 `*/` 被 JS 解析器当成**块注释结束符**，注释在第 52 行提前闭合；行内剩下的反引号于是成了代码，开启一个模板字面量并一路吞到第 58 行的反引号，导致真正的模板字面量内容被当作代码。Node 报的是 `SyntaxError: Unexpected identifier '找不到运行副本的依赖目录'`，指向第 58 行（真正的出错位置在第 52 行的注释里，相隔 6 行），单看报错行完全看不出问题。定位方法：打印全文所有 `*/` 出现处，一眼看到第 52 行不是真正的注释结束符。修法：改写那句注释，避免出现 `*/` 序列（改成 `yaml@<version>`）。教训：在块注释里写 glob（`*/`、`**/*`）或路径时，必须避开 `*/` 字面量；`.mjs` 写完先跑一次 `node --check` 再执行，能把这类错误定位到解析阶段。
