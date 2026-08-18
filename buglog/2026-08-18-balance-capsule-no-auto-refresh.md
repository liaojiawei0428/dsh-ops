---
date: "2026-08-18T08:27:45.042Z"
symptom: "余额胶囊不自动刷新：页面加载后余额一直不变，只有手动点击才更新"
component: "dsh-deepseek-balance"
severity: "minor"
status: "fixed"
root_cause: "BalanceHeader 的 React.useEffect 只在组件挂载时调用一次 load(false)，没有任何定时器——余额只在页面加载和手动点击时刷新，不会随时间更新。"
fix: "client.js 的 BalanceHeader 增加 useEffect 定时器：setInterval(load(true), REFRESH_INTERVAL_MS)，REFRESH_INTERVAL_MS = 5 分钟；load(true) 静默刷新不闪 loading；cleanup 时 clearInterval；README 同步更新。"
related_files:
  - "D:/GongJu/DSH-ops/plugins/dsh-deepseek-balance/client.js"
  - "D:/GongJu/DSH-ops/plugins/dsh-deepseek-balance/README.md"
---

(No additional details recorded.)
