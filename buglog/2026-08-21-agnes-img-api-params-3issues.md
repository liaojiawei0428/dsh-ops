---
date: "2026-08-21T03:06:40.550Z"
symptom: "生图脚本报 400 UnsupportedParams(response_format)/422(size)/503 Service busy"
component: "tools/ai_img（AGNES 生图插件）"
severity: "minor"
status: "fixed"
root_cause: "Agnes API 网关基于 litellm 转发 OpenAI 兼容端点：不支持 response_format 参数（缺失时返回 url）；要求 size 为 1024x1024 全格式；.com 主网关高峰期上游 503。"
fix: "agnes_gen.py 删除 response_format、size 规范化 WxH、.env 指向 https://apihub.agnes-ai.cn/v1；catchup.py 同步。重试策略：偶发 520/503 重试 3 次。"
related_files:
  - "tools/ai_img/agnes_gen.py"
  - "tools/ai_img/catchup.py"
  - "tools/ai_img/batch_gen.py"
  - "tools/ai_img/koutu.py"
  - "tools/ai_img/.env"
---

收编 agnes-ai-models Skill 为项目生图工具时：第一版带 response_format=b64_json → 网关(litellm) UnsupportedParamsError；size 传 "1024" → 422 Invalid request（OpenAI 要求 1024x1024）；.com 主网关连续 503 Service busy。逐一修：删 response_format 改取 url 下载；size 无 x 自动补 WxH；按用户提供切换国内镜像 https://apihub.agnes-ai.cn/v1。修后 agnes-image-2.1-flash 稳定生成 10 张 1024 白底 UI 占位图，koutu.py 抠白+缩放输出到 changjing_zichan/UI_JuQing/。key 仅存 tools/ai_img/.env（gitignore 覆盖）。
