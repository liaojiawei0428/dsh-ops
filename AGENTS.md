# AGENTS.md — DSH-ops 工作区指令

本仓库维护 DSH 的运维脚本、自研插件（`plugins/`）与插件行为准则。

## 强制准则（不可绕过）

开发或修改任何 DSH 插件、profile、启动链脚本之前，必须先读
[PLUGIN-STANDARD.md](PLUGIN-STANDARD.md) 并完整遵守它。要点：

1. **新插件一律从脚手架开始**：`node new-plugin.mjs dsh-<role>`，不手写骨架。
2. **零 workspace import**（不得 import 任何 `@deepseek-ai/*`），注入最小化，注册全包 `ctx.effect`。
3. **schema 方言**：`required` 只能是父对象上的字符串数组，属性内部、`oneOf` 旁禁止出现（13:05 事故）。
4. **安装前闸门必须全绿**：`node validate-plugins.mjs`；红了就修，不许带病安装。
5. **改动 .ps1 后**：语法检查 + 补回 UTF-8 BOM + 确认无 `powershell.exe`（恒用 pwsh 7）。
6. **用户数据文件**（`~/.dsh` 下）：改前备份到 `backups/`，整体原子重写，禁止行级拼接。
7. **坏插件应急**：`node disable-plugin.mjs dsh-<role>` 一键摘除（文件与 link 保留），修复后加回 bundles。
8. **主仓库更新**只走 `update-dsh.ps1`，不手工跳步。

改动完成后运行 `node test-standard.mjs` 确认工具链保障未回归。

## BUG 记录（强制，P11）

修复任何 BUG 后必须立即调用 `bug_report` 记录（症状/根因/修复/组件/严重度/状态）；排查异常前先 `bug_search`。记录落 `buglog/`，详见 [PLUGIN-STANDARD.md](PLUGIN-STANDARD.md) P11。未记录的修复视为任务未完成。

## 目录

- `plugins/` — 自研插件（link 安装进 `~/.dsh/profiles/web`）
- `PLUGIN-STANDARD.md` — 行为准则（唯一权威版本）
- `new-plugin.mjs` / `validate-plugins.mjs` / `disable-plugin.mjs` / `test-standard.mjs` — 准则工具链
- `update-dsh.ps1` / `start-dsh-web.ps1` / `check-update.ps1` — 启动与更新链
- `启动DSH.bat` / `更新DSH.bat` — 用户入口

## 注意

- `~/.dsh/backups/` 含密钥，永不提交。
- 本仓库改动由用户审阅后自行提交（dual-track 流程）。
