# dsh-deepseek-balance

DSH 系统组件：在会话头部工具条（Session log 导出按钮旁）常驻显示 DeepSeek
账户余额胶囊，点击立即刷新，**每 5 分钟自动静默刷新**（不闪加载态），
余额 ≤ ¥10 橙色警示，悬停显示明细。

- **Host 半端**（`index.js`）：注册 `/api/dsh/deepseek-balance` 路由，
  用 `credentials` 服务解析 `DEEPSEEK_API_KEY`，原生 `fetch` 调用官方
  `https://api.deepseek.com/user/balance`，60 秒缓存。
- **浏览器半端**（`client.js`）：手写 client bundle，注册
  `conversation.session.header.utilities` 胶囊，`fetch` 本地路由取数；
  自动刷新间隔 `REFRESH_INTERVAL_MS = 5 * 60 * 1000`（5 分钟）。

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
