---
date: "2026-09-19T02:58:22.972Z"
symptom: "半亩芳华：1 点水即可把从未开垦的地块\"解锁\"为已开垦并直接播种（绕过 10 铜钱开垦费），且可作用于等级上限之外的槽位；虫灾可用任意非 bug 的 mode 字符串免费解除并白拿 6 点经验。"
component: "banmu-server/game_actions.js"
severity: "major"
status: "fixed"
root_cause: "三个农场动作只校验\"格子是否有作物/背包是否有道具\"，把\"地块是否已开垦\"这一前置状态校验全部留给 farm_land_expand；farm_disaster_recovery 用 if(mode==='bug') 单分支扣道具而无 else/白名单/灾种一致性校验；farm_plant_seed 把客户端传入的地块状态当权威写入。"
fix: "game_actions.js：farm_water/farm_plant_seed 扣费前增加\"已开垦(td&gt;0||tk&gt;0)\"校验并返回 not_expanded、补 bad_slot；farm_disaster_recovery 增加 mode 白名单与灾种一致性校验（bad_mode/wrong_mode）；farm_plant_seed 的 td 写入固定为 3。刻意不加 land_cap 校验以避免存量越界地块报废。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-server/fuwuqi.js"
---

调查过程：对抗审核员把"浇水可把荒地变已开垦"从 P1 升格——指出 farm_water / farm_plant_seed / farm_harvest 都没有 land_cap 校验，cap 只存在于 farm_land_expand，故危害不止"省 10 铜钱"而是"绕过等级上限"。线上实测确认：1 级新号（cap=9）对 cap 外且从未开垦的 slot 30 调 farm_water → ok:true，水 100→99、tk[30]/td[30] 置 2；随后 farm_plant_seed → ok:true，tz[30]="5000"，完整绕过开垦成本与等级限制。同时实测 mode 漏洞：对已触发虫灾传 mode="x" 得到 ok:true（灾害段清除、杀虫剂 2002 未扣、经验 +6），对照 mode="bug" 返回 insufficient_item，证明只有 'bug' 走扣道具分支。方案评审另指出 farm_plant_seed 用 payload.tu_di_zhuang_tai 覆盖权威状态。修复时确认 /api/game/action 无鉴权（只校验 yong_hu_id+type），故这些校验是唯一防线。修复：①water/plant 在扣水扣种子之前校验 td&gt;0||tk&gt;0，否则 not_expanded，并补 bad_slot；②disaster_recovery 加 mode 白名单 {water,bug} 且校验与真实灾种一致（pest→bug、dry→water）；③plant_seed 状态写入固定为 3。关键约束：刻意不给 water/plant 加 land_cap 校验——老存档 test_user_888 有 32 块已开垦地而当前 6 级上限仅 21，加 cap 会让 21..31 号地块报废。验证：未开垦地块浇水/种植均 not_expanded，非法 slot 为 bad_slot，mode="x" 为 bad_mode，已开垦地种植/浇水正常 ok，重复开垦仍 already_expanded 且不扣费。
