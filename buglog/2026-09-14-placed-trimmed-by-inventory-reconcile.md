---
date: "2026-09-14T09:06:31.714Z"
symptom: "摆放装饰后拉档丢失（库存已扣但地图上无该装饰）"
component: "banmu-server/game_actions.js"
severity: "critical"
status: "fixed"
root_cause: "裁剪规则假设\"placed 中的装饰必须仍在仓库\"，与摆放消耗式语义（库存-1/地图+1 互补守恒）冲突，导致刚摆放的装饰被误删。"
fix: "reconcilePlacedWithZichanbeibao 移除按仓库数量裁剪，仅清洗无法解析键/非法结构的脏条目。"
related_files:
  - "banmu-server/game_actions.js"
---

开发 200×200 网格摆放装饰功能自测时发现：摆放「石子路1」后 DB 中 placed 有 2 件，但 admin view 只返回 1 件——刚摆放的装饰从 wang_ge_bai_fang.placed 消失，且库存已扣（装饰凭空消失：库存-1 且地图无）。根因：reconcilePlacedWithZichanbeibao 以仓库数量为权威裁剪 placed（surplus = placed 数量 − 仓库数量 > 0 即删），但摆放语义是消耗式（摆放时库存-1、placed+1；回收反向，二者互补守恒）——刚摆放的装饰仓库里已无，被判定"多余"删除。客户端摆放（wangge_zichan_consume）同样受影响（历史缺陷）。修复：裁剪改为仅清洗脏条目（非法结构/无法解析装饰键），不再按仓库数量裁剪；注释说明消耗式语义；补偿被误删的测试数据。验证：重新摆放石子路1（2×2 锚点 10,10）后连续两次 admin view 均返回 2 件装饰（鸡窝 3×2 六格 + 石子路1 2×2 四格），不再被裁剪。
