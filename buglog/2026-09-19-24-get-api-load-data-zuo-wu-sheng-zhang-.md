---
date: "2026-09-19T02:44:13.843Z"
symptom: "灾害已触发 24 秒后，GET /api/load_data 返回的 zuo_wu_sheng_zhang[slot] elapsed 仍等于 now - plantTime（59=59，差 0 秒），未扣除灾难暂停时长"
component: "banmu-server/fuwuqi.js（/load_data elapsed 换算）"
severity: "major"
status: "open"
root_cause: "fuwuqi.js 的 /load_data 在把 zuo_wu_sheng_zhang 的时间戳转 elapsed 时，只做 `Math.max(0, nowSecLoad - val)`，没有读取同行的 tu_di_zhong_zhi 灾害管道段（\"种子|dry:at\"/\"种子|pest:at\"），因此无法把灾害挂起时段从 elapsed 中扣除；暂停补偿只在 farm_disaster_recovery 执行时以 plantTime += hang 的形式补写。"
fix: "尚未修复（只实测取证）。建议 /load_data 换算 elapsed 时读取 tu_di_zhong_zhi[sk] 的灾害段：当存在已触发灾害（nowSec >= at）时，elapsed 取到 min(now, at) 为止（即挂起期间冻结），或显式扣除 (now - at)。"
related_files:
  - "/www/wwwroot/sparrow-logic/banmu-server/fuwuqi.js"
  - "/www/wwwroot/sparrow-logic/banmu-server/game_actions.js"
  - ".workbuddy/qa/probe/evidence.md"
  - ".workbuddy/qa/probe/raw/e6_full.txt"
---

实测（临时号 qa_probe_785484，E6，同一远端命令内顺序取数）：DB zuo_wu_sheng_zhang[30]=1789785625（plantTime）；DB tu_di_zhong_zhi[30]="5000|dry:1789785660"（灾害 at）；服务器 date +%s = 1789785684（NOW 与 NOW2 同秒）。计算：now-plantTime=59；at-plantTime=35；now-at=24（灾害确已触发 24 秒）；GET /api/load_data 返回的 zuo_wu_sheng_zhang[30]=59。即 elapsed 完全等于纯墙钟差，未扣除已触发的灾难挂起时长。二次复核：E7a 恢复动作把 plantTime 改写为 1789785672（= 原 plantTime + (now-at)），说明暂停时长只在"执行恢复动作"那一刻被一次性补偿；对照无灾害的 slot 0（plantTime=1789785604，now=1789785753，返回 elapsed=149）同样等于墙钟差。只读代码对照：fuwuqi.js /load_data 内 `if (val > 1000000) zwObj[sk] = Math.max(0, nowSecLoad - val)`，只做时间戳→elapsed 换算，完全不读取 tu_di_zhong_zhi 的灾害段。影响：灾害未恢复期间客户端读到持续增长的生长进度，与"灾难暂停生长"的设计意图相悖（客户端若自行按灾害段扣减，会与服务端数值不一致）。原始输出：raw/e6_full.txt、raw/e6_load_data.json、raw/e7c_full.txt。
