---
date: "2026-09-14T10:17:00.033Z"
symptom: "网格第 2 页起看不到任何格子（只有含内容的格子可见）"
component: "banmu-admin/web/src/views/logic/index.vue"
severity: "major"
status: "fixed"
root_cause: "网格空单元格未定义高度，display:grid 行高由内容决定导致空白格高度为 0 而不可见。"
fix: ".wg-cell 显式 width:100% + aspect-ratio:1/1 占位并增强网格线可见性；默认格子尺寸 15px。"
related_files:
  - "banmu-admin/web/src/views/logic/index.vue"
---

用户反馈：世界网格第一页能看到一些格子，第 2、3 页及之后所有页都没有格子。根因：网格改分页时删除了格子上的内联尺寸（原窗口式版本有 :style="{width,height}"），而 CSS .wg-cell 也未定义宽高——display:grid 只提供列宽，行高由内容决定，空格子无内容导致高度塌陷为 0（宽度有高度无，视觉上几乎不可见）；只有带内容的格子（土地"地"字、装饰序号）被文字撑开才可见，而测试数据都在第 1 页，故表现为"仅第 1 页有格子"。修复：.wg-cell 增加 width:100%; aspect-ratio:1/1; box-sizing:border-box; overflow:hidden（高度=列宽，随缩放档位自动），并加 box-shadow: inset 0 0 0 1px rgba(203,213,225,.45) 增强网格线，字号固定 9px，默认每格 15px（档位 11/15/20）。验证：npm run build exit 0；线上产物 CSS 确认含 .wg-cell[data-v-*]{width:100%;aspect-ratio:1 / 1;...} 与内描边；分页覆盖 40000 格逻辑已验证。
