---
date: "2026-09-14T09:16:25.599Z"
symptom: "编辑替换后函数签名丢失致代码结构破损（部署前发现）"
component: "banmu-admin/web/src/views/logic/index.vue"
severity: "minor"
status: "fixed"
root_cause: "edit 的 old_string 替换范围超出目标函数（连带下一个函数签名），造成结构破损。"
fix: "补回 gridPagePrev 函数签名、删除误插入行；构建验证（vue-tsc exit 0）。"
related_files:
  - "banmu-admin/web/src/views/logic/index.vue"
---

将世界网格从 40×40 自由平移窗口改为 50×50 分页时，清理不再使用的 gridClampX/gridClampY 的 edit 把相邻 gridPagePrev 的函数签名一并删除——替换后变成 `function gridCellTitle(...)` 直接接 gridPagePrev 的函数体，代码结构破损（编译必失败），未部署。根因：edit 的 old_string 覆盖范围超出目标（含下一个函数签名），new_string 未带回该签名。修复：读回现场确认破损位置，补回 `function gridPagePrev(): void {` 并删除误插入的 gridCellTitle 行；随后 npm run build（vue-tsc）exit 0 验证结构完整，并 grep 确认 gridCellTitle 唯一、gridPagePrev/Next 完整。教训：删除函数时 old_string 只覆盖目标函数本身；替换后立即 grep 关键符号唯一性并以构建兜底。
