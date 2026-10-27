# ☯️ 气功学堂 QIGONG ACADEMY

> 每天 12 分钟，三维师父带你把气练明白。

八段锦 / 易筋经 / 五禽戏 / 六字诀四大经典气功功法的**分门类 3D 在线学习 + 跟练 + 打卡**网站。
纯静态、零后端、免注册；打卡与学习进度只存在你自己的浏览器里。

**🎯 在线体验：https://shixingya.github.io/qigong/**

## ✨ 能做什么

| 模块 | 说明 |
| --- | --- |
| 🀄 功法学堂 | 四大功法 40 式动作库：动作分解、呼吸配合、功效说明，逐式学习并标记“学会了” |
| 🧘 3D 演武台 | Three.js 程序化“气感人形”（非录播视频），112 组关键姿势实时插值，可拖拽环绕观察身型 |
| ▶ 在线跟练 | 整套/单式两种模式：呼吸节奏圈（吸/呼/定）+ 倒计时 + Web Speech 中文语音口令引导 |
| 📅 打卡成就 | 跟练完成自动打卡：月历视图、连续天数、7 枚功夫徽章，全部由本地数据实时计算 |
| 🧭 气功知识 | 三调合一、腹式呼吸、松静自然、注意事项与四周入门计划等科普专栏 |
| 🏮 21 天入门挑战 | 报名后每天完成任意一次跟练自动点亮一朵，以真实打卡记录判定，不另设手动勾选 |
| 🖼 成绩卡分享 | 收功后生成水墨风成绩卡 PNG / 一键复制分享文案 |
| 💾 数据备份 | 导出/导入全部本地记录（JSON），换设备换浏览器可无缝继续 |
| 📱 PWA 离线 | 可安装为独立应用，Service Worker 预缓存，断网二次访问照常跟练 |

## 🔒 隐私

- 无账号体系，无任何数据上传；`localStorage` 键 `qigong_v1` 保存打卡记录与学习进度。
- 清除浏览器站点数据即彻底清空，浏览器"无痕模式"下也可练（不落盘）。

## 🗺 目录结构

```
index.html            页面骨架（单页多视图切换）
css/style.css         水墨禅意暗色主题
js/data.js            内容层：四大功法 × 动作 × 关键姿势（关节角度表）+ 知识专栏
js/scene.js           Three.js ESM：程序化人形、姿势插值、丹田呼吸光效
js/store.js           本地数据层：打卡/连续天数/成就（localStorage）
js/app.js             路由、功法浏览、跟练状态机、语音口令
vendor/               Three.js r160 随仓分发（无外部 CDN，断网可用）
sw.js                 Service Worker：预缓存 + stale-while-revalidate
manifest.webmanifest  PWA 应用清单（图标在 assets/）
```

姿势系统约定（`js/data.js` 头部有完整注释）：每个动作拆成若干关键帧，
每帧用 `tp/ty/tz`（躯干俯仰/扭转/侧倾）、`la/lfl/lb`（肩外展/前举/肘屈）等
度数字段描述，Three.js 端做指数缓动插值，即得连贯的"练功"动画。

## 🚀 本地运行

```bash
git clone https://github.com/shixingya/qigong.git
cd qigong
npx serve .        # 或任意静态服务器，如 python -m http.server
```

Three.js r160 已 vendored 进仓库（`vendor/`），无任何外部 CDN 依赖，部署后断网也能完整练。
极端情况下引擎初始化失败时，自动降级为纯图文跟练，不阻塞使用。

## 📦 版本发布

采用 `vX.Y.Z` 语义化 tag，经 GitHub Actions（`deploy-pages`）自动发布到 GitHub Pages。
详见 [CHANGELOG.md](CHANGELOG.md)。

> ⚠️ 免责声明：本站内容整理自国家体育总局健身气功主流功法与公开文献，仅作养生科普，
> 不构成医疗建议；孕妇及心脑血管、腰椎急性损伤者请先咨询医生。
