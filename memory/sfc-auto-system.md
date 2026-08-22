---
name: sfc-auto-system
description: 足彩14场胜负彩自动化分析系统（体彩14场-agent）项目结构和关键信息
metadata: 
  node_type: memory
  type: project
  originSessionId: f218f745-f8e0-47ea-bf63-13fd475283ff
  modified: 2026-08-08T15:19:01.183Z
---

## 项目位置

`E:\AI_Works\sfc-auto\` — 足彩14场胜负彩全自动分析系统

## 项目结构

```
sfc-auto/
├── config.json                          # 配置文件（API、飞书通知、路径）
├── scripts/
│   ├── fetch_and_analyze.js             # 核心编排：拉取→合并→分析→报告→仪表盘数据
│   └── send_notify.js                   # 飞书/钉钉/企微通知推送
├── dashboard/
│   └── index.html                       # Chart.js 可视化仪表盘
└── data/
    ├── draws.json                       # 历史开奖全量（按code去重，倒序）
    ├── match_details.json               # 每期14场详细比赛表（联赛/主客队/比分/赛果）
    ├── league_team_stats.json           # 23联赛 + 302球队统计（胜/平/负/主客）
    ├── predictions.json                 # 评估快照（最近50条）
    ├── analysis_history.json            # 分析指标历史（最近200条）
    ├── dashboard_data.json              # 仪表盘结构化数据
    └── latest_report.md                 # Markdown分析报告
```

## Agent 定义

`E:\AI_Works\.claude\agents\体彩14场-agent.md`

- 触发方式：手动（"跑一次足彩分析"）或定时（建议每日10:00巡检）
- 数据源：sporttery.cn API (gameNo=90)
- 首次运行成功拉取30期数据（26071~26100期）

## 核心分析维度

- 胜平负分布统计（3/1/0）
- 14位置热度矩阵（含最新对阵信息）
- 奖金冷热度分析（火锅奖/冷门期/无人中判定）
- 难度综合评估（平局因子30% + 奖金波动25% + 命中难度25% + 结果熵值20%）
- 联赛 & 球队历史统计表

## 与双色球/大乐透自动化系统的对比

- 数据源同样是sporttery.cn，但 gameNo=90（vs 大乐透gameNo=85）
- 分析引擎内嵌在 fetch_and_analyze.js 中（不依赖外部引擎文件）
- 独有功能：比赛详情表 + 联赛/球队统计表（match_details.json + league_team_stats.json）
- 不做选号推荐，只做评估和风险标注

**Why:** 用户要求建立体彩14场agent，并建立表格记录每期每场比赛详细赛果和赛区球队情况。
**How to apply:** 运行 `node E:/AI_Works/sfc-auto/scripts/fetch_and_analyze.js` 即可；通过 `/体彩14场-agent` 或说"跑一次足彩分析"触发 Agent。
