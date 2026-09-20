---
date: "2026-09-20T10:36:25.440Z"
symptom: "仓库里的全局指令模板仍写着「队友一律用强档，默认模型无法配置」，与已被补丁推翻的现实相反；按它部署的新机会拿到错误的分派规则，且缺少「派活粒度按档位切」的实测纪律。"
component: "config/AGENTS-global-template.md"
severity: "minor"
status: "fixed"
root_cause: "模板是手工维护的第二份副本，规则在开发机文件里演进（团队模式补丁、粒度经验）后没有回灌；两份副本漂移后，模板反而携带了已被推翻的旧规则，而它正是「没有旧机时」的唯一来源。"
fix: "按开发机 ~/.dsh/AGENTS.md 重新导出 config/AGENTS-global-template.md（46 行）：机器路径全部占位符化、pwsh 行改通用措辞、补上「派活粒度按档位切」与当前的团队模式规则；DEPLOY.md 第 3 步第 2 项改为「首选直接复制旧机的 AGENTS.md，模板作为无旧机时的替代」，并写明模板由开发机文件导出、只需替换 <盘符>。"
related_files:
  - "config/AGENTS-global-template.md"
  - "DEPLOY.md"
dsh_commit: "826d08281c"
---

用户指出「另外还需要全局指令」。核对仓库模板 config/AGENTS-global-template.md 与开发机实际 ~/.dsh/AGENTS.md 后发现模板已过时且自相矛盾：模板里仍写着「**队友（spawn_teammate）一律用强档**：它的默认模型无法用配置固定，只能每次显式指定」——这条在 2026-09-19 就被本地补丁推翻了（spawn_teammate 已支持 provider/model，且团队模式读实时 settings、不受会话固化限制），开发机实际文件里写的是「团队模式也支持指定模型」。模板还缺了开发机文件里的「派活粒度按档位切」那条实测经验。后果：没有旧机可复制时，按模板部署的新机会拿到一条**错误的**分派规则（永远只用强档、白白浪费弱档吞吐），并且不知道粒度纪律。做法：以开发机实际文件为准重建模板——机器特定字面量换成占位符（E:\DSH → <盘符>:\DSH、C:\Users\Administrator\.dsh → %USERPROFILE%\.dsh、health-check/validate-plugins 路径同理），pwsh 那行换成与机器无关的通用措辞（原文写死「本机 pwsh 位于 E:\GongJu\7\pwsh.exe」，对新机是错的），保留表头与「本机环境事实（按新机实际情况修改本节）」标题。验证：模板里 E:\GongJu / E:\DSH / Administrator / C:\Users 各 0 命中；与开发机实际文件逐行 diff 只剩表头、占位符与那句通用措辞（共 24 行差异，均为预期）。
