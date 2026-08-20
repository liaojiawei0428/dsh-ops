# dsh-tool-python

DSH 系统组件：给模型提供原生 `python` 工具，让大模型用 Python 3 执行任务，而不是拼 PowerShell 管道。

## 工作方式

- 主机半端（`index.js`）在 `ctx.tools` 注册 `python` 工具：
  - 模型提交 Python 源码（`code`）与可选 argv（`args`）
  - 源码写入每次调用独立的临时脚本，经挂载的 `ctx.shell` 执行器运行
    （`& <pythonPath> <script> <args...>`），因此完整继承 shell 缝的契约：
    每会话沙箱策略、超时、输出截断与溢出文件、`[exit code: N]` 标记体系
  - 强制 `PYTHONUTF8=1` / `PYTHONIOENCODING=utf-8` / `PYTHONUNBUFFERED=1`，
    避免 Windows 上重定向流按 OEM 代码页（GBK）输出乱码
- 同时注册 `tool:python` 系统提示段（order 104）：引导模型
  **计算、数据处理、文本变换、多步逻辑一律优先用 python 工具**，
  shell 只用于 Python 标准库覆盖不了的进程编排（git、pnpm、node）
- 无任何 workspace 包依赖：所有注册契约都经注入服务获得，
  link 安装无需自己的 node_modules

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `pythonPath` | 自动发现 | 钉死解释器路径时设置；缺省时按序自动发现（见下），新部署零配置 |

**自动发现顺序**（仅 `pythonPath` 未配置时触发，进程内缓存一次）：
1. `DSH_PYTHON_PATH` 环境变量
2. Windows `py -3` 启动器（装任何 CPython 即有）→ 取其真实 exe
3. PATH 上的 `python`（**探测验证**，WindowsApps Store 存根被排除）
4. 标准安装位下 `Python3*` 目录（每用户目录优先）

探测用 `-c "import sys; ..."` 实测版本主号，确认真能执行且为 Python 3 才采用；
全部失败时工具返回明确错误并给出修复指引（装 Python 3 / 设 DSH_PYTHON_PATH / 配置 pythonPath）。

仅当需要强制某台机器使用多个 Python 版本中的特定一个时，才在 profile 覆盖：

```yaml
- id: tool-python
  name: dsh-tool-python
  config:
    pythonPath: 'C:\Python313\python.exe'
```

## 安装（与其他 DSH-ops 插件同模式）

1. profile `package.json` 的 `dependencies` 加
   `"dsh-tool-python": "link:<DSH-ops 所在盘符>:/DSH/DSH-ops/plugins/dsh-tool-python"`
2. `dsh.profile.bundles` 数组追加 `"dsh-tool-python"`
3. profile 目录 `pnpm install`，重启 web 服务

> link 路径随机器盘符不同（部署布局允许盘符自由），安装时按本机实际路径写。

## 验证

- `dsh --profile web --dump-config` 组合树出现 `tool-python` 行
- 新会话中模型工具列表出现 `python`；让模型算一个数即可看到终端卡片

## 已知边界

- 仅前台执行（无 `run_in_background`）；长任务由 `timeoutMs` 约束，
  需要后台时模型应改用 shell 工具
- 无 `sandbox_permissions` 升级面；沙箱拒绝时按标记提示改走 shell 工具的升级路径
- 临时脚本目录在运行结束后尽力清理，被占用的目录留给系统临时清理
