---
name: lottery-auto-projects
description: "AI Works 下三个彩票自动化分析系统（ssq-auto, dlt-auto, sfc-auto）的汇总对比"
metadata: 
  node_type: memory
  type: project
  originSessionId: f218f745-f8e0-47ea-bf63-13fd475283ff
  modified: 2026-08-08T15:19:11.572Z
---

## 三大自动化系统汇总

| 维度 | 双色球 (ssq-auto) | 大乐透 (dlt-auto) | 足彩14场 (sfc-auto) |
|------|-------------------|-------------------|---------------------|
| 类型 | 随机数字型 | 随机数字型 | 竞猜型（足球赛果） |
| 数据源 | cwl.gov.cn | sporttery.cn (gameNo=85) | sporttery.cn (gameNo=90) |
| 结果表示 | 6红+1蓝 | 5前+2后 | 14场3/1/0 |
| 分析引擎 | ssq_analyzer_v2.js | dlt_analyzer.js | 内嵌在fetch_and_analyze.js中 |
| Agent定义 | `.claude/agents/福彩-agent.md` | `.claude/agents/体彩-agent.md` | `.claude/agents/体彩14场-agent.md` |
| 引擎路径 | `.claude/skills/福彩/references/` | `.claude/skills/体彩/references/` | `.claude/skills/体彩14场/references/` |
| 独有功能 | — | — | 比赛详情表 + 联赛/球队统计表 |
| 最新数据 | 持续运行中 | 2026-08-08 更新至26089期 | 2026-08-08 首次30期 |

## 通知配置

三个项目共用飞书webhook：`https://open.feishu.cn/open-apis/bot/v2/hook/<webhook-placeholder>`
（大乐透有独立webhook：`<webhook-placeholder>`）

**Why:** 汇总记录，方便跨项目参考和统一维护。
**How to apply:** 每个项目独立运行 `node E:/AI_Works/<project>/scripts/fetch_and_analyze.js`
