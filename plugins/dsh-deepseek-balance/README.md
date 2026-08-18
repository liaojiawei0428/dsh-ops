# dsh-deepseek-balance

DSH 系统组件：在会话头部工具条（Session log 导出按钮旁）显示两个胶囊：

1. **余额胶囊**：DeepSeek 账户余额，点击立即刷新，**每 5 分钟自动静默刷新**，
   余额 ≤ ¥10 橙色警示，悬停显示明细。
2. **版本胶囊**：`DSH版本号：xxx`，悬停显示本地 commit 与检查状态；
   **每 1 小时自动检查官方仓库更新**（host 定时器），发现更新后胶囊变为
   高亮脉动的 **「有新版本」**，点击立即启动自动更新（分离进程运行
   `update-dsh.ps1`，完成后服务自动重启，刷新页面即见新版）。

- **Host 半端**（`index.js`）：
  - `/api/dsh/deepseek-balance`：余额路由，`credentials` 服务解析
    `DEEPSEEK_API_KEY`，官方 `https://api.deepseek.com/user/balance`，60 秒缓存。
  - `/api/dsh/repo-status`：版本检查路由，读本地 `package.json` 版本号，
    经系统代理 `git fetch origin` 对比 `HEAD` 与 `origin/master`，
    结果缓存 1 小时（`?force=1` 立即重查），并发请求复用同一次 fetch。
  - `/api/dsh/update-now`：POST 启动分离的自动更新进程
    （`pwsh.exe -File update-dsh.ps1`，detached + unref，更新脚本自带全套
    守卫：干净检查/备份/构建/组合预检/插件闸门/健康检查）。
- **浏览器半端**（`client.js`）：手写 client bundle，注册
  `conversation.session.header.utilities` 两个胶囊（余额 order 100、
  版本 order 101），余额 5 分钟轮询、版本 5 分钟轮询（host 控制真实检查节奏）。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `repoDir` | 自动推导（DSH-ops 同级 `Deepseek_DSH`） | DSH 主仓库路径（版本检查目标） |
| `opsDir` | 自动推导（本插件所在 DSH-ops） | 运维脚本目录（`update-dsh.ps1` 所在） |
| `checkIntervalMs` | `3600000` | 官方仓库检查间隔（1 小时） |

默认值按"两仓库同父目录"结构从插件自身位置推导（盘符任意）；仅当布局偏离约定时在 profile `cordis.patch.yml` 覆盖。

## 在新电脑上部署（同步 DSH 插件）

前置：本仓库已 clone，DSH 已安装并能启动 web 服务。

1. **挂载到 web profile**：编辑 `%DSH_HOME%\profiles\web\package.json`
   （默认 `C:\Users\<你>\.dsh\profiles\web\package.json`）：

   - `dependencies` 加入（注意把 `<本仓库盘符>` 换成本机实际路径）：

     ```json
     "dsh-deepseek-balance": "link:<本仓库路径>/plugins/dsh-deepseek-balance"
     ```

   - `dsh.profile.bundles` 数组加入 `"dsh-deepseek-balance"`。

2. **建立链接**：在 profile 目录执行 `pnpm install`。

3. **重启 web 服务**：插件行在启动时加载；启动后刷新页面即可看到余额胶囊。

## 验证

- `curl http://127.0.0.1:3080/api/dsh/deepseek-balance` 返回余额 JSON。
- 设置 → 插件列表出现 `dsh-deepseek-balance` 条目。
