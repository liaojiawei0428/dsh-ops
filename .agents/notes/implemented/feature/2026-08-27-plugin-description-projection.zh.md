# Agent Note: Manifest descriptions as the plugin explanation surface

Status: implemented

[English](2026-08-27-plugin-description-projection.md) | 中文

## 问题

设置页的**插件列表**只显示每个条目的模块名与启停状态，没有任何说明这个插件是做什么的信息。信息其实早已存在——每个 workspace 包都声明了 npm manifest 的 `description`，244 个包里有 241 个带了值——但没有任何东西把它投影到浏览器，也没有任何东西强制新包写一条可用的说明。下一个插件完全可以带着 `"description": ""` 或干脆省略字段上线，而不会有任何门禁察觉。

## 决策

一个字段、一行文本，从它唯一的书写处流向所有读取处。

Host 清单负责投影。`PluginInventoryEntry` 增加 `description: string | null`；每次 `pluginInventory/list` 调用时，Gateway 通过已修复的 `$DSH_HOME/profiles/node_modules` 锚点解析每个条目的模块，先探测 `<module>/package.json` 再探测所属包根，返回 trim 后的 manifest 文本。无法解析的名称（`cordis:` 内置）、包未安装的行以及没有可用文本的清单投影为 `null`；快照绝不因描述缺失而失败。

Client 在折叠卡片的三个位置呈现它：卡片标题下的一行摘要（无法解析时省略），展开详情中本地化 Description 标签下的完整文本（null 时显示占位），以及与模块名、条目 id 一同组成的搜索语料；卡片的可访问名称同样包含它。

标准是机械化的。`pnpm run verify-package-descriptions` 遍历根 workspaces，筛选名为 `@deepseek-ai/dsh-*` 的 manifest，并按双轨执行：带 `dsh` 块的 manifest 是 Loader 可见的插件、其说明会被 GUI 原样展示，因此必须是一句至少 10 个字符且含有汉字的简体中文；其余每个包则声明一句至少 24 个字符、以字母或 `@` 开头的英文。它导出供 vitest 使用的 inspect 函数，直接运行时以逐文件诊断失败得很响亮，接入 `run-gates.ts` 的静态 hygiene 叶子，并在[添加包实操手册](../../../../docs/cookbook/adding-a-package.zh.md)中向作者陈述规则。vendored 及其他外部家族由名称规则天然跳过，而不是维护排除表；根 manifest 补上了真实描述而不是获得豁免。

## 已考虑的替代方案

**用单独的注册表文件把插件映射到说明。** 否决：manifest 字段是 npm 原生的单一事实源，就躺在它所描述的代码旁边；第二个存放处会在第一次改名时漂移。

**启动时预读描述进缓存。** 否决：清单的设计约定就是只表示调用当下——Loader 仍是唯一生命周期权威，Gateway 不拥有缓存；每次 `list()` 读 N 个本地 manifest 文件成本很低，还保住了这个形态。

**门禁只检查非空字符串。** 否决：`"x"` 能通过但仍然什么也没解释。每一轨的下限都是从它所治理的代码树归纳的（现存最短的库描述恰好 24 字符），今天零成本，却抬高了明天描述必须说清的下限。

**给根 manifest 豁免。** 基于 fail-loud 原则否决；为了不给 workspace 自己写一句真话而维护排除表，是把经济账算反了。

**由插件作者提供多语言描述。** 否决：manifest 字段面向开发者，GUI 只需要每插件一行权威文本，再建 locale 层会让摘要卡的权威一分为二。要求字段内使用简体中文遵循的是产品文案约定：这一行在发行 GUI 中原生可读，不需要任何 locale 机制。

## 测试

Host 测试覆盖 `readModuleDescription` 对磁盘上 canned manifest 的行为、注入 reader 的 Gateway 投影、Loader 顺序保持，以及真实 profiles 臂对 `cordis:` 内置返回 `null`。Client 组件测试钉住摘要 span、展开描述行及其缺失臂占位、组装出的可访问名称与描述文本过滤。门禁自身 spec 在双轨上逐条钉住每种违规类别，对本仓库直跑报告检查了 230 个包、零失败。

## 后果

未来每个 dsh 包都欠 manifest 里一句如实的话——插件用简体中文——忘写会在 review 之前就把 CI 变红，这正是目的。每次 `list()` 多几次本地文件读取，上界是已安装插件数。DTO 增加一个可空字段，按当前 pre-release 立场无线上兼容问题。第三方或 vendored 插件的描述保持上游所写，原样呈现或省略。
