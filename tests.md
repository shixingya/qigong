# 测试用例（tests.md）

> 本文档为「气功学堂」纯静态模块的活测试清单。每新增功能须追加用例并冒烟验证。
> 冒烟方式：本地静态服务器（`_qgserve.js`，端口 8788）+ 浏览器（clear SW/caches → 播种 `localStorage.qigong_v1` → reload ignoreCache → 关 `.tour-mask` → 点导航/读 DOM）。

## 环境与约定
- 浏览器时钟今日：`2026-10-28`（周三），本周起点（周日）`2026-10-25`，本月前缀 `2026-10`。
- 数据口径：累计=全量；本月=`d.slice(0,7)==='2026-10'`；本周=`d>='2026-10-25'`；今日=`d==='2026-10-28'`；练式/碰套排除 `set==='calm'`，时长/定息次专判 `calm`。
- 断言：目标 DOM 文本与播种手算值完全一致；`list_console_messages(types=[error])` 为空。

## 播种样本（近期版本复用）
```json
{
  "records": [
    {"d":"2026-10-28","set":"baduanjin","sec":480,"hour":7,"moves":["bdj-1","bdj-2","bdj-3"]},
    {"d":"2026-10-26","set":"liuzijue","sec":360,"hour":20,"moves":["lzj-0","lzj-1"]},
    {"d":"2026-10-15","set":"baduanjin","sec":300,"hour":6,"moves":["bdj-1"]},
    {"d":"2026-10-28","set":"calm","sec":60,"hour":8,"moves":[]}
  ],
  "learned": {"baduanjin":["bdj-1","bdj-2","bdj-3"]},
  "read": {"kn-base":true,"kn-breath":true},
  "settings": {"favMoves":{"baduanjin/bdj-1":true,"baduanjin/bdj-2":true,"liuzijue/lzj-5":true},"favs":{},"weekGoal":3},
  "plan": {"start":"2026-10-20"}
}
```

## v3.1.4 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-314-1 | 首页 `#favSection .fm-head` | 累计练过式数 `_fmEverTouch` | `累计练过 2 式` | 常练式 {bdj-1,bdj-2,lzj-5} 中出现在任意历史记录者=bdj-1,bdj-2 |
| T-314-2 | 打卡页 `.rec-sum` | 本周练式数 `_rsWkMoveN` | `本周练 5 式` | 本周(≥10-25)非 calm 记录去重式={bdj-1,2,3,lzj-0,1} |

冒烟结果：fm-head=`…本周练过 2 式 · 本月练过 2 式 · 累计练过 2 式`；rec-sum=`本月共 4 场 · 约 20 分钟 · 本周 3 场 · 本月碰 2 套 · 本周练 5 式`；console error=0。✅

## v3.1.5 用例
> 需额外播种 `settings.lastBackup='2026-10-27'`（否则备份区隐藏）。
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-315-1 | 打卡页 `#backupInfo` | 本月练式数 `_bkMonMove` | `本月练 5 式` | 本月非 calm 去重式={bdj-1,2,3,lzj-0,1} |
| T-315-2 | 打卡页 `.td-head` | 累计练式数 `_tdEverMove` | `累计练 5 式` | 全量非 calm 去重式=同上 5 |

冒烟结果：backupInfo=`… 本月定息 1 次 · 本月练 5 式 · 记录跨度 …`；td-head=`…本月 20 分 · 累计练 5 式 · 最勤 …`；console error=0。✅

## v3.1.6 用例
> 需额外播种 `settings.quizWrong={'kn-base':1,'kn-breath':1}` 与 `settings.quiz={'kn-state':true}`（否则错题本隐藏）。
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-316-1 | 入门页 `#courseProg .cp-txt` | 累计练功场 `_courseAllSess` | `累计练 4 场` | S.totalSess()=records.length=4 |
| T-316-2 | 知识页 `.qw-txt` | 已通小测关数 `_qwPass` | `已通 1 关` | S.quizCount()=quiz 中 true 的篇数=1 |

冒烟结果：cp-txt=`已完成 … · 本月练 3 天 · 累计练 4 场 …`；qw-txt=`📕 待订正的错题 2 题——错一处，长一智 · 已通 1 关`；console error=0。✅

## v3.1.7 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-317-1 | 打卡页 `.mr-head` | 涉猎套数 `_mrTouchSetN` | `涉猎 2 套` | 非 calm 记录 distinct set={baduanjin,liuzijue} |
| T-317-2 | 功法页 `#setStat` | 累计练功场 `_ssAllSess` | `累计练 3 场` | 非 calm 记录数=3（排除 calm） |

冒烟结果：mr-head=`…本月 20 分 · 涉猎 2 套 · 最勤 …`；setStat=`…本月定息 1 次 · 累计练 3 场`；console error=0。✅
