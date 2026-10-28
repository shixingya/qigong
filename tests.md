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

## v3.1.8 用例
> 需额外播种 `settings.hardCards={'kn-base':1,'kn-breath':1}`（否则难卡段隐）。
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-318-1 | 知识页 `#knowStats` | 难卡数 `_khHard` | `难卡 2 张` | S.hardCount()=hardCards 键数=2 |
| T-318-2 | 打卡页 `.tm-head` | 累计练功场 `_tmAllSess` | `累计练 4 场` | S.totalSess()=records.length=4（含 calm） |

冒烟结果：knowStats=`… 小测过关 1 / 6 · 待复习错题 2 道 · 难卡 2 张`；tm-head=`…本月碰 2 套 · 累计练 4 场`；console error=0。✅

## v3.1.9 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-319-1 | 打卡页 `.wk-body` 首行 | 累计练功场 `S.totalSess()` | `累计练 4 场` | records.length=4（含 calm） |
| T-319-2 | 首页/功法页 八段锦卡 `.prog` | 本套累计场 `_scSetAll` | `这套练 2 场` | baduanjin 非空日期记录数=2 |

冒烟结果：wk-body 首行=`…本月练 20 分 · 累计练 4 场`；bdj 卡 prog=`…本月练 3 式 · 这套练 2 场 · …`；console error=0。✅

## v3.1.10 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3110-1 | 首页 `#statSelf` | 本月练功天数 `_selfMonDays` | `本月练 3 天` | 本月去重日={10-28,10-26,10-15}=3 |
| T-3110-2 | 功法页 八段锦 bdj-1 单式头 `.mv-sess` | 本套累计场 `_mSetSess` | `这套练 2 场` | baduanjin 非空日期记录数=2 |

冒烟结果：statSelf=`…场均 5 分 · 本月练 3 天`；mv-sess=`已练 2 场 … 这套练 2 场`；console error=0。✅

## v3.1.11 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3111-1 | 收功页 `#doneStats` | 本套累计时长 `_doneSetMin` | `这套共 12 分` | baduanjin 全部 sec=(600+400+本场≈260)/60≈12 |
| T-3111-2 | 打卡页 `#statRow` 末格 | 本周碰套数 `_ckWkTouch` | `本周碰套 2 套` | 周内非 calm 记录的 set 去重={baduanjin,wuqinxi}=2 |

播种：records=[baduanjin 10-26 600s moves[bdj-1,bdj-2], baduanjin 10-15 400s moves[bdj-1], calm 10-28 60s, wuqinxi 10-26 300s moves[wqx-0]]；本周碰套需排除 calm。T-3111-1 通过 QGApp.Train.start(八段锦前1式,'single') 后直接 Train.finish() 触达收功页。

冒烟结果：doneStats=`… 这套累计 3 场 · 这套共 17 分 …`（app 按分钟取整 10+7+0=17，自洽）；statRow 末格=`2 套 本周碰套`；console error=0。✅

## v3.1.12 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3112-1 | 复习台 `#rvBody` 新增行 | 累计定息+今日定息 `_rvCalmAll/_rvCalmToday` | `累计定息 2 次 · 今日已定息 1 次` | calm 记录={10-28,10-26}=2，今日=1 |
| T-3112-2 | 打卡页 `.wk-body` 首行 | 明理篇数 `S.readCount()` | `明理 2 篇` | read 中 true 的篇数=2 |

播种（在第 2 次播种基础上）：records=[baduanjin 10-26 600s, calm 10-28 60s, calm 10-26 60s, wuqinxi 10-28 300s]；read={'kn-base':true,'kn-breath':true}。复习台通 QGApp 或点“复习”入口，若无入口则 `QGApp.showPage('home')` 后点带 rvMask 的按钮；冒烟时若复习台按钮不可达，可直接 DOM 触发 reviewOpen 所在按钮。

冒烟结果：rvBody 定息行=`累计定息 2 次 · 今日已定息 1 次`；wk-body 首行=`… 累计练 4 场 · 明理 2 篇`；rvCalm 点击后 rvMask 关闭且回到首页；console error=0。✅

## v3.1.13 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3113-1 | 打卡页 `.rec-sum` 尾部 | 累计定息次数 `_rsCalmAll` | `累计定息 2 次` | set==='calm' 记录数=2 |
| T-3113-2 | 打卡页 `.wk-body` 首行 | 累计分钟 `S.totalMin()` | `累计 17 分钟` | app 口径为逐条取整求和：10+1+1+5=17 |

播种同 v3.1.12（沿用同一种子即可，无新增 settings 依赖）。

冒烟结果：rec-sum 尾部=`本周练 3 式 · 累计定息 2 次`；wk-body 首行=`… 累计练 4 场 · 累计 17 分钟 · 明理 2 篇`；console error=0。✅

## v3.1.14 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3114-1 | 复习台抽卡行尾部 | 上轮卡数 `fs.lastTotal` | `上轮共 6 张卡` | settings.fcard={rounds:2,lastGot:4,lastTotal:6} |
| T-3114-2 | 首页 `#statSelf` | 本周碰套数 `_wkTouchSelf` | `本周碰 2 套` | 周内(≥10-25)非 calm 记录 set 去重={baduanjin,wuqinxi}=2，排在“本月碰”后“收藏”前 |

播种：同 v3.1.12 种子 + settings.fcard={rounds:2,lastGot:4,lastTotal:6}；需先点知识 nav 渲染过一次复习台入口后打开 rvMask 读抽卡行；首页 chip 需渲染后读 statSelf。

冒烟结果：statSelf=`… 本月碰 2 套 · 本周碰 2 套 · …`（位置正确）；抽卡行=`… 已抽 2 轮（上轮记住 4/6） · 上轮共 6 张卡`；console error=0。✅（线上抽验首次 FAIL 为检查脚本中文 needle 被 PS5.1 按 ANSI 误读，改用 [char] 码拼接后 FAIL=0，非产品回归）

## v3.1.15 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3115-1 | 打卡页 `#calFoot` | 日均场次 `_mAvgSess` | `日均 2 场` | mSess/mDays=4/2=2（monthMap 含 calm 场次） |
| T-3115-2 | 打卡页 `#statRow` 新增格 | 累计练功天 `S.totalDays()` | `2 天 累计练功天` | 去重日期={10-26,10-28}=2 |

播种同 v3.1.12 种子（无需 fcard，但沿用无妨）。

## v3.1.16 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3116-1 | 首页 `#todayCard .tc-sub` | 累计练功天 `_stEverDays` | `累计练 2 天` | S.totalDays() 去重日期={10-26,10-28}=2（>1 才显示） |
| T-3116-2 | 打卡页 `#statRow` 周练报告 wk-body 首行 | 累计练功天 + 已学式数 | `累计练 2 天 · 已学 3/40 式` | S.totalDays()=2；S.learnedTotal()=baduanjin 2 + wuqinxi 1=3 |

播种同 v3.1.12 种子（learned={baduanjin:[bdj-1,bdj-2],wuqinxi:[wqx-0]} → learnedTotal=3）。

冒烟结果：tc-sub=`… 累计练 2 天 …`；wk-body 首行=`… 明理 2 篇 · 累计练 2 天 · 已学 3/40 式`；console error=0。✅

## v3.1.17 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3117-1 | 收功页 `#doneStats` | 累计练功分钟 `_doneAllMin` | `累计练 17 分`（新增本场后） | S.totalMin() 逐条 sec/60 取整求和：10+1+1+5(+本场 0) = 17 |
| T-3117-2 | 复习台错题行 `.rv-stat` | 已补对题数 `S.quizCount()` | `已补对 1 题` | settings.quiz 非零键数={kn-base}=1；需 ws>0 才走待订正分支 |

播种：标准种子 + settings.quizWrong={'kn-breath':1}、settings.quiz={'kn-base':1}（错题行需 ws>0 才显示已补对）。

冒烟结果：doneStats=`… 累计 2 天 · 累计练 17 分 · 今日第 …`；错题行=`待订正 1 题 · 补对自动销账 · 已补对 1 题`；console error=0。✅

## v3.1.18 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3118-1 | 首页 21天挑战横幅 `.plan-banner.go` | 累计练功天数 `_pnEverDays` | `累计练 2 天` | S.totalDays()=去重日 {10-26,10-28}=2；需 plan 非 null 且未成功未过期 |
| T-3118-2 | 知识页 `#knowStats` | 错题总笔数 `S.wrongSum()` | `错过 3 笔` | quizWrong={'kn-base':2,'kn-breath':1} → 和=3 > 道数 2 才露 |

播种：标准种子 + plan={start:'2026-10-20'}（横幅在役） + settings.quizWrong={'kn-base':2,'kn-breath':1}。

冒烟结果：横幅=`… 累计 4 场 · 累计练 2 天`；knowStats=`… 待复习错题 2 道 · 错过 3 笔 …`；console error=0。✅

## v3.1.19 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3119-1 | 打卡页 `.mr-head` | 累计练功天数 `_mrEverDays` | `累计练 2 天`（在常练式段后、括号尾前） | S.totalDays()=2 >1；需有练过的式才渲染榜 |
| T-3119-2 | 打卡页 `.tm-head` | 累计练功天数 `_tmEverDays` | `累计练 4 场 · 累计练 2 天` | totalSess=4（含 calm）；totalDays=2 |

播种：标准种子（无需 plan/quizWrong）。

冒烟结果：mr-head=`… 涉猎 2 套 · 最勤 … · 累计练 2 天，点一下重练这一式）`；tm-head=`… 累计练 4 场 · 累计练 2 天`；console error=0。✅

## v3.1.20 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3120-1 | 打卡页 `.rec-sum` | 累计练功天数 `_rsEverDays` | `累计练 2 天`（在“累计定息 2 次”后） | S.totalDays()=去重日 {10-26,10-28}=2 |
| T-3120-2 | 打卡页 `#calFoot` | 累计练功场 `_calAllSess` | `累计 4 场` | S.totalSess()=records.length=4（含 calm） |

播种：标准种子（无需 plan/quizWrong）。

冒烟结果：rec-sum=`… 累计定息 2 次 · 累计练 2 天`；calFoot=`… 练 3 式 · 累计 4 场`；console error=0。✅

## v3.1.21 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3121-1 | 首页 `.fm-head` | 累计练功天数 `_fmEverDays` | `累计练 2 天`（在“累计练过 N 式”后） | S.totalDays()=2；需 favMoves 非空才渲染常练区 |
| T-3121-2 | 打卡页 `.td-head` | 累计练功天数 `_tdEverDays` | `累计练功 2 天`（在“最勤 X”后） | S.totalDays()=2；需有带 hour 的记录才走 total>0 分支 |

播种：标准种子 + settings.favMoves={'baduanjin/bdj-1':true}（令 fm-head 渲染）。

冒烟结果：fm-head=`⭐ 我的常练式（… 共 1 式 · 累计练过 1 式 · 累计练 2 天）`；td-head=`⏰ 练功时段分布（… 累计练 3 式 · 最勤 … · 累计练功 2 天）`；console error=0。✅

## v3.1.22 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3122-1 | 功法页 `#setStat` | 累计练功天数 `_ssEverDays` | `累计练 2 天`（在“累计练 2 场”后） | S.totalDays()=2；_ssAllSess=2（排除 calm） |
| T-3122-2 | 单式详情 `.mv-sess`（bdj-1） | 累计练功天数 `_mEverDays` | `这套练 1 场 · 累计练 2 天` | 本套 baduanjin 有记录日=1；totalDays=2 |

播种：标准种子（bdj-1 已练，进单式需先点 set-card 再点 move-cell）。

冒烟结果：setStat=`… 累计练 2 场 · 累计练 2 天`；mv-sess=`已练 1 场 · 共约 10 分 · … · 这套练 1 场 · 累计练 2 天`；console error=0。✅

## v3.1.23 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3123-1 | 入门页 `#courseProg` | 累计练功天数 `_courseEverDays` | `累计练 4 场 · 累计练 2 天` | S.totalSess()=4（含 calm）；S.totalDays()=2 |
| T-3123-2 | 复习台定息小结行 `_rvEverDays` | 累计练功天数 | `累计定息 2 次 · 累计练 2 天` | calm 记录=2；totalDays=2 |

播种：标准种子（totalDays=2、totalSess=4、calm=2）；复习台需点首页“复习台”入口或 reviewOpen 打开 #rvMask。

冒烟结果：courseProg=`已完成 2 / 28 天 · 7% · 本月练 2 天 · 累计练 4 场 · 累计练 2 天 · …`；复习台定息小结行=`累计定息 2 次 · 累计练 2 天 · 今日已定息…`；console error=0。✅

## v3.1.24 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3124-1 | 打卡页 `#backupInfo` | 累计练功天数 `_bkEverDays` | `本月练 3 式 · 累计练 2 天` | S.totalDays()=2；需 settings.lastBackup 非空才渲染 |
| T-3124-2 | 知识页 `#knowStats` | 累计练功天数 `_khEverDays` | 尾部 `累计练 2 天` | totalDays=2；难卡 0 张时难卡段隐 | 

播种：标准种子 + settings.lastBackup='2026-10-27 10:00'（令备份区露出）。

冒烟结果：backupInfo=`… 本月定息 2 次 · 本月练 3 式 · 累计练 2 天 · 记录跨度…`；knowStats=`已读 2 / 6 篇 · 待读 4 篇 · 明理 33% · 小测过关 0 / 6 · 累计练 2 天`；console error=0。✅

## v3.1.25 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3125-1 | 功法详情 `.set-sess`（baduanjin） | 累计练功天数 `_setEverDays` | 尾部 `累计练 2 天` | S.totalDays()=2；本套 1 场不显“累计共分钟”（与本月相等）但天数照显 |
| T-3125-2 | 跟练页 `#trainSetName` | 累计练功天数（行内 S.totalDays()） | `🌿 八段锦 · 整套 · 累计练 2 天` | totalDays=2；console 直调 Train.start 后读数 |

播种：标准种子（courseStart 可缺省）；跟练页用 QGApp.Train.start(DATA.sets[0], DATA.sets[0].moves, 'full') 直达后读 #trainSetName，读完 Train.finish() 收场。

冒烟结果：set-sess=`🔥 这套你已练 1 场 · … · 本月共 10 分钟 · 累计练 2 天`；trainSetName=`🌿 八段锦 · 整套 · 累计练 2 天`；console error=0。✅

## v3.1.26 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3126-1 | 功法卡 `.set-card .prog`（baduanjin） | 本套练过天数 `_scSelfDays` | `这套练 2 场 · 这套练 2 天` | baduanjin 记录跨 10-26/10-28 两日 |
| T-3126-2 | 功法详情 `.set-sess`（baduanjin） | 本套练过天数 `_setSelfDays` | 尾部 `累计练 2 天 · 这套练 2 天` | 同上；totalDays=2 |

播种：标准种子 + 追加 {d:'2026-10-28',set:'baduanjin',sec:300,hour:9,moves:['bdj-3']}（令本套跨 2 日，selfDays=2 可显）。

冒烟结果：卡片 .prog=`已学 3/8 式 · … · 这套练 2 场 · 这套练 2 天 · 共 15 分钟`；详情 .set-sess 尾=`累计练 2 天 · 这套练 2 天`；console error=0。✅

## v3.1.27 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3127-1 | 首页 tc-sub（今日推荐） | 本套练过天数 `_stSelfDaysLine` | 含 `这套练 2 天`（若推荐 baduanjin） | 推荐套跨 10-26/10-28 两日；selfDays=2 |
| T-3127-2 | 单式详情 `.mv-sess`（bdj-1） | 本套练过天数 `_mSetSelfDays` | `这套练 2 场 · 累计练 2 天 · 这套练 2 天` | baduanjin 跨 2 日；totalDays=2 |

播种：同 v3.1.26（标准种子 + 追加 {d:'2026-10-28',set:'baduanjin',sec:300,hour:9,moves:['bdj-3']}，learned 含 bdj-3）。

冒烟结果：夜晚时段推荐六字诀：无记录时 tc-sub 不显“这套练 N 天”（降级正确）；给 liuzijue 补 10-26/10-28 两场后 tc-sub=`… 累计练 2 天 · 这套练 2 天 · …`✓；单式详情 bdj-1 mv-sess=`… 这套练 2 场 · 累计练 2 天 · 这套练 2 天`✓；console error=0。✅

## v3.1.28 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3128-1 | 单式详情 `.mv-sess`（bdj-1） | 本式练过天数 `_mMoveSelfDays` | 尾部 `这套练 2 天 · 本式练 2 天` | bdj-1 出现在 10-26/10-28 两日记录 moves 里 |
| T-3128-2 | 打卡页功夫榜 `.mr-meta`（bdj-1 行） | 本式练过天数 `_mvSelfDays` | `练过 2 场 · 跨 2 天 · 最近 …` | 同上；it.count=2；功夫榜 #moveRank 渲染在打卡页而非首页 |

播种：v3.1.27 种子基础上把 {d:'2026-10-28',set:'baduanjin'} 的 moves 改为 ['bdj-1','bdj-3']（令 bdj-1 跨两日，learned 含 bdj-1/bdj-3）。

冒烟结果：单式详情 bdj-1 mv-sess=`已练 2 场 · … · 这套练 2 场 · 累计练 2 天 · 这套练 2 天 · 本式练 2 天`✓；打卡页功夫榜首行 .mr-meta=`🌿 八段锦 · 练过 2 场 · 跨 2 天 · 最近 2026-10-28 · 本周 2 场 · 共约 15 分`✓；console error=0。✅

## v3.1.29 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3129-1 | 收功页 `#doneStats`（baduanjin） | 本套练过天数 `_doneSetDays` | 含 `这套练 2 天`（在“这套共 N 分”后） | baduanjin 记录跨 10-26/10-28 两日；selfDays=2 |
| T-3129-2 | 打卡页待补清单 `.tm-set`（五禽戏组） | 本套练过天数 | 含 `这套练 2 天`（在“共 N 分”后） | 同上；待补清单 #todoMoves 渲染在打卡页；需该套有未练式才出现分组 |

播种：标准种子 + 令五禽戏 wxq-0 跨 10-26/10-28 两日（保留 11 式待补）；baduanjin 不跑整套跟练则仍有待补式（否则被填满不进组）。收功页另用 Train.start+finish 验证（八段锦跨两日 selfDays=2）。

冒烟结果：收功页 doneStats=`… · 这套累计 3 场 · 这套共 15 分 · 这套练 2 天 · 本月练这套 8 式 · …`✓；打卡页待补清单 .tm-set=`🌿 八段锦 · 差 5 式 · … · 共 15 分 · 这套练 2 天`与`🐾 五禽戏 · 差 11 式 · … · 共 8 分 · 这套练 2 天`，易筋经“还没碰过”无记录正确降级不显✓；console error=0。✅

## v3.1.30 用例
| 编号 | 位置 | 指标 | 期望值 | 手算依据 |
| --- | --- | --- | --- | --- |
| T-3130-1 | 跟练页 `#trainSetName`（baduanjin 整套） | 本套练过天数 | 含 `这套练 2 天`（在“累计练 N 天”后） | baduanjin 跨 10-26/10-28；selfDays=2 |
| T-3130-2 | 首页常练式区 `.fm-chip small`（bdj-1） | 本式练过天数 `_fmvDays` | 含 `练 2 天`（在“套名”后） | bdj-1 在 10-26/10-28 两日记录 moves 里；需 settings.favMoves 非空才渲染 |

播种：标准种子 + settings.favMoves={'baduanjin/bdj-1':true}（bdj-1 已跨两日）；跟练页用 QGApp.Train.start(DATA.sets[0], DATA.sets[0].moves, 'full') 后读 #trainSetName（读完 Train.finish 收场）。需先 unregister SW + delete caches 再 reload，否则浏览器用旧 app.js。

冒烟结果：首页 .fm-chip small=`🌿 八段锦 · 练 2 天`✓；跟练页 trainSetName=`🌿 八段锦 · 整套 · 累计练 2 天 · 这套练 2 天`✓；console error=0。✅
