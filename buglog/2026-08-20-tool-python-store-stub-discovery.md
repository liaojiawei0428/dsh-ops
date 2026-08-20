---
date: "2026-08-20T05:48:41.012Z"
symptom: "新电脑按模板部署且未配置 pythonPath 时，python 工具可能因 PATH 上的 WindowsApps 存根 python.exe 而无法执行任何任务。"
component: "dsh-tool-python"
severity: "major"
status: "fixed"
root_cause: "dsh-tool-python 的 pythonPath 缺省值为 'python'（直接经 shell PATH 解析）。Windows 机器上 PATH 的前缀项常是 WindowsApps Store 存根 python.exe（不可执行 -c 探测、弹商店或静默失败），导致未配置 pythonPath 的部署上 python 工具失效，profile 模板因此写成每机必改的绝对路径——部署健壮性差。"
fix: "index.js 增加 discoverPython()：pythonPath 未配置时按 DSH_PYTHON_PATH → py -3 启动器（取其真实 exe）→ PATH python（探测验证，WindowsApps Store 存根被排除）→ 标准安装位 Python3* 目录（按版本号升序取最高）自动解析，进程内缓存一次、并发共享一次探测。原始探测逻辑与插件相同，实测四场景：本机(存根 PATH)→经 py launcher 命中 3.14.6（与 profile pin 路径一致）；py -3 直测；override 生效；WindowsApps 存根探测返回 None（正确拒绝）。配置了 pythonPath 时保持 pin 语义不变。README 同步：配置表改\"自动发现\"、安装示例改相对布局说明；DEPLOY.md cordis.patch.yml 模板 pythonPath 改可选并注释发现链。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-tool-python\\index.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-tool-python\\README.md"
  - "E:\\DSH\\DSH-ops\\DEPLOY.md"
---

(No additional details recorded.)
