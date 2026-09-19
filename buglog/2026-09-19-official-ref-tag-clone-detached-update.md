---
date: "2026-09-19T09:10:23.524Z"
symptom: "按官方源码版本锚点克隆（DSH_OFFICIAL_REF / official-ref.txt → git clone --depth 1 --branch <tag>）后，新机上的升级链失效：update-dsh.ps1 报 `fatal: Needed a single revision`（origin/master 解析失败），随后 `git pull --ff-only` 在游离 HEAD 上退出 0 却什么都不做——升级静默变成空操作，用户以为升级成功但版本从未前进。"
component: "update-dsh.ps1"
severity: "major"
status: "fixed"
root_cause: "git clone --branch <tag> 有两个副作用叠加：① 工作区 checkout 到 tag，即 detached HEAD，`git pull` 没有分支可合并；② --single-branch 隐含的 remote.origin.fetch 只映射那一个 tag（实测 `+refs/tags/<tag>:refs/tags/<tag>`），因此 `origin/master` 这个远程跟踪引用根本不存在，update-dsh.ps1 的 `git rev-parse origin/master` 直接失败。曾尝试把游离 HEAD 转成本地分支来复用原 pull 路径，但实测更糟：浅克隆的边界让 git 无法证明 tag 提交与远端尖端之间的祖先关系，`git status` 报 \"ahead 1, behind 1\"、`git pull --ff-only` 报 \"Not possible to fast-forward\"（exit 128），升级从\"静默空操作\"变成\"永久死锁\"。解除浅克隆（--unshallow）虽能修好，但要下载 287 MB / 18059 个提交的全量历史。"
fix: "两处修改（均带回归实测）：① 新增 lib-official-ref.ps1 的 Initialize-PinnedClone：克隆后把 remote.origin.fetch 恢复成标准分支映射 `+refs/heads/*:refs/remotes/origin/*`（幂等，未钉锚点的普通克隆调用无副作用），使后续 git fetch 能创建 origin/master；bootstrap-personal.ps1 两处克隆、sync-official.ps1 与 update-dsh.ps1 的自动克隆共 4 个点位全部接入。② update-dsh.ps1 的更新步骤改为分支感知：`git symbolic-ref -q HEAD` 有输出走原 `git pull --ff-only`；游离 HEAD 则走 `git checkout --detach origin/master`（语义=工作树整体切到远端尖端，不需要祖先关系，也不需要全量历史）；另加 origin/master 解析失败时的兜底——就地修正 refspec + 重新 fetch 后再继续，覆盖\"锚点上线前就已克隆过的老副本\"。用 update-dsh.ps1 的真实更新段（按行切出、原样执行）跑三种克隆形态：游离 HEAD+已修正 refspec、游离 HEAD+旧 refspec（走兜底）、普通分支克隆（走原路径），三种全部 PASS——HEAD 与上游尖端一致、工作树内容正确（含上游已删除的文件被真正清掉）、无残留脏文件、仓库保持 shallow。"
related_files:
  - "lib-official-ref.ps1"
  - "update-dsh.ps1"
  - "bootstrap-personal.ps1"
  - "sync-official.ps1"
  - "official-patches/official-ref.txt"
  - "DEPLOY.md"
dsh_commit: "407839f062"
---

发现路径：为满足"其他电脑能部署出完整一样的 DSH"，给官方源码加了版本锚点（B2）。机制本身验证通过（环境变量 > 入库声明文件 > 默认分支三种取值、真实仓库 tag 浅克隆确实取到 tag 指向的提交而非更新提交），但随后意识到一个被锚点**引入**的新失败面：钉 tag 的克隆是游离 HEAD，而升级链要 pull。逐步实测把范围钉死：(1) `git clone --depth 1 --branch <tag>` 后 remote.origin.fetch = `+refs/tags/<tag>:refs/tags/<tag>`、`branch -a` 只有 "(no branch)"、`rev-parse origin/master` 失败；(2) 补一个本地分支 + tracking 后，pull 变成 "Not possible to fast-forward"（浅边界导致 git 认为已分叉）；(3) 只改 refspec、保持游离 HEAD、升级改用 checkout --detach，连续两次升级都正确，且仓库始终 shallow。取舍依据：全量历史 286.9 MB / 18059 提交，不值得为升级下载。反例证据（都能复现）：把 Initialize-PinnedClone 的调用去掉 → update-dsh.ps1 报 "无法解析 origin/master"；把 checkout --detach 换回 pull --ff-only → exit 128 "Not possible to fast-forward"。相关：DEPLOY.md 新增「版本锚定」整节，含游离 HEAD 的成因、三处处理与实测结论。
