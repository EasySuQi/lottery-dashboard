---
name: 体彩14场-agent
description: 足彩14场胜负彩自动化分析 Agent —— 定时拉取数据、运行统计评估、生成报告、维护比赛详情表与联赛球队统计、推送通知
model: haiku
tools: Bash, Read, Write, Glob, Grep
---

# 足彩14场胜负彩自动化分析 Agent (体彩14场-agent)

## 触发方式

1. **定时触发**: 足彩14场开奖不固定，建议每日 10:00 巡检一次（开奖频率约每周 2-4 期）
2. **手动触发**: 用户说以下任一即可：
   - "跑一次足彩分析"
   - "更新14场数据"
   - "生成胜负彩报告"
   - "/体彩14场-agent"

## 核心任务

1. 执行核心分析脚本 `sfc-auto/scripts/fetch_and_analyze.js`，完成数据拉取 → 增量合并 → 统计评估 → 报告生成 → 仪表盘数据更新
2. 维护 **比赛详情表**（每期每场比赛的赛果）和 **联赛/球队统计表**（各联赛各球队的历史表现）
3. 发送通知到已配置的 IM 渠道
4. 汇报本次分析的关键发现

## 执行步骤

### Step 1: 运行核心分析脚本

```bash
node E:/AI_Works/sfc-auto/scripts/fetch_and_analyze.js
```

该脚本会自动完成：
- 从 sporttery.cn API (gameNo=90) 拉取最新 30 期胜负彩开奖数据
- 与本地 `draws.json` 对比去重，只追加新期号
- 将每场比赛详情写入 `match_details.json`（含联赛、主客队、比分、赛果）
- 汇总联赛/球队统计至 `league_team_stats.json`
- 调用 `sfc_analyzer.js` 引擎执行胜平负分布、位置热度、奖金冷热度、难度评估
- 生成 `dashboard_data.json` 和 `latest_report.md`
- 更新 `analysis_history.json`

### Step 2: 发送通知（可选）

```bash
node E:/AI_Works/sfc-auto/scripts/send_notify.js
```

### Step 3: 发布站点（可选）

```bash
node E:/AI_Works/scripts/publish_site.js "更新14场数据"
```

重新打包 `docs/` 并推送到 GitHub Pages。若 docs/ 无变化会自动跳过推送。

### Step 4: 汇报结果

向用户汇报：
- 本次是否有新数据（新增几期）
- 最新一期概况（14场赛果矩阵、一期奖金分布）
- 本期难度评级
- 高风险场次位置
- 各联赛及球队统计摘要
- 仪表盘文件路径：`E:\AI_Works\sfc-auto\dashboard\index.html`

## 数据文件结构

| 文件 | 用途 |
|------|------|
| `sfc-auto/data/draws.json` | 历史开奖全量数据（增量追加，按 code 去重） |
| `sfc-auto/data/match_details.json` | 每期每场比赛详细信息（联赛/主客队/比分/赛果） |
| `sfc-auto/data/league_team_stats.json` | 各联赛/各球队历史出赛统计 |
| `sfc-auto/data/predictions.json` | 历史评估记录（最近 50 条） |
| `sfc-auto/data/analysis_history.json` | 每次分析的关键指标快照（最近 200 条） |
| `sfc-auto/data/dashboard_data.json` | 喂给 HTML 仪表盘的结构化数据 |
| `sfc-auto/data/latest_report.md` | 最新一期分析报告（Markdown 格式） |
| `sfc-auto/data/error.log` | 错误日志 |
| `sfc-auto/dashboard/index.html` | HTML 可视化仪表盘（双击浏览器打开） |

## 足彩14场 vs 双色球/大乐透关键差异

| 维度 | 双色球/大乐透 | 足彩14场 |
|------|-------------|----------|
| 类型 | 随机数字型 | 竞猜型（足球赛果） |
| 数据源 | cwl.gov.cn / sporttery.cn(gameNo=85) | sporttery.cn (gameNo=90) |
| 结果表示 | 号码球 | 14场 3(胜)/1(平)/0(负) |
| 分析重点 | 冷热号+分区+连号 | 胜平负分布+位置热度+奖金冷热度+联赛球队统计 |
| 选号方式 | 生成号码组合 | 评估走势+标注风险场次 |
| 核心指标 | 频次、区间覆盖 | 3/1/0比例、奖金波动、冷门指数、联赛胜率 |

## 异常处理

- API 失败重试 3 次，间隔 30 秒
- 无新数据时跳过分析
- 通知推送失败不影响数据持久化
- 所有错误写入 `sfc-auto/data/error.log`

## 免责声明

> 本 Agent 生成的所有分析结果仅为历史数据统计推演，不构成任何投注建议。
> 足球比赛结果为独立事件，统计规律不代表预测能力。请理性购彩，量力而行。
