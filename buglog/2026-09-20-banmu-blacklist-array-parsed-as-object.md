---
date: "2026-09-20T04:07:41.813Z"
symptom: "玩家拉黑后文字版黑名单始终显示\"黑名单为空\"（DB 与游戏服均已写入 hei_ming_dan）"
component: "banmu-admin/logic.service"
severity: "major"
status: "fixed"
root_cause: "logic.service.ts 的 dictKeysOf 只接受 JSON 对象（用 Object.keys 取 openid 集合），而 players.hei_ming_dan 实际是 JSON 数组；数组被 `!Array.isArray(o)` 判断挡掉后返回空数组，导致黑名单永远显示为空。hao_you 存的是对象、hei_ming_dan 存的是数组，同一函数按单形态写死。"
fix: "logic.service.ts 的 dictKeysOf 改为同时支持数组（元素=openid）与对象（键=openid）：新增 `if (Array.isArray(o)) return o.map(x=>String(x||'').trim()).filter(x=>x!=='')` 分支。已随 admin server dist 部署（tsc 编译 + 端口定位重启，新 PID 49817）。"
related_files:
  - "F:\\QiTa\\banmu\\banmufanghua\\banmu-admin\\server\\src\\modules\\logic\\logic.service.ts"
  - "F:\\QiTa\\banmu\\banmufanghua\\BUGS.md"
---

排查路径：回归"文字版黑名单显示昵称"时，先用 admin API 让 test_user_888 拉黑 test_user_999，游戏服返回 hei_ming_dan:["test_user_999"]，数据库 players.hei_ming_dan 也确认写入 ["test_user_999"]，但 GET /api/admin/logic/view?openid=test_user_888 的 blacklist 仍是 []。

排除项：①游戏服写入失败——否，DB 已落库；②load_data 没返回该字段——否，logic/view 响应里 player.hei_ming_dan 就是字符串 '["test_user_999"]'；③昵称解析失败——否，同一请求里 friends 昵称解析完全正常。

定位：logic.service.ts 的 dictKeysOf 只处理对象分支（`if (o && typeof o === 'object' && !Array.isArray(o)) return Object.keys(o)`），数组落到 `return []`。而 hao_you 是对象（键=openid），hei_ming_dan 是 JSON 数组（元素=openid）——两个语义相邻的字段存储形态不同。注意不能简单用 Object.keys 处理数组（数字串 openid 会得到下标 "0","1"）。

修复：dictKeysOf 增加数组分支（元素即 openid，trim 后过滤空值），对象分支不变。

验证：重新 tsc 编译 → 上传 dist → 按端口定位重启 admin（旧 PID 41955 先 kill 并确认 PORT_FREE，新 PID 49817）→ 线上实测 blacklist=[{"openid":"test_user_999","nickname":"测试花友","level":1}]，移出黑名单后回到 []，player_view 的 relation.i_blocked=true 同步正确。数据已恢复（888/999 互为好友、黑名单为空）。

教训：静默空集合比抛错更危险——界面看起来"正常"，玩家会以为操作没生效。
