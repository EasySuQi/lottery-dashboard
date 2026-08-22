#!/usr/bin/env node
// ============================================================
// 回溯评估结果深度分析脚本
// 功能: 基于 predictions.json（34期历史评估快照），
//       做多维度统计分析，输出分析报告并更新仪表盘数据。
// 分析维度:
//   1. 难度走势（时间序列）
//   2. 风险场次位置频次分布（哪些位置最常出风险）
//   3. 难度与奖金CV / 平均平局率的相关性
//   4. 联赛风险特征（风险场次集中哪些联赛）
//   5. 安全场次位置频次分布
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PREDICTIONS_PATH = path.join(DATA_DIR, 'predictions.json');
const MATCH_DETAILS_PATH = path.join(DATA_DIR, 'match_details.json');
const DASHBOARD_DATA_PATH = path.join(DATA_DIR, 'dashboard_data.json');
const ANALYSIS_REPORT_PATH = path.join(DATA_DIR, 'backfill_analysis_report.md');

function loadJSON(p, fallback) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.error('读取失败', p, e.message); }
    return fallback;
}

const predictions = loadJSON(PREDICTIONS_PATH, []);
const matchDetails = loadJSON(MATCH_DETAILS_PATH, {});
const dashboard = loadJSON(DASHBOARD_DATA_PATH, null);

if (predictions.length === 0) {
    console.log('⚠ 无评估快照，请先运行 backfill_history.js');
    process.exit(0);
}

// 倒序为时间正序（最早在前）
const asc = predictions.slice().reverse();

// ===== 1. 难度走势 =====
const difficultyTrend = asc.map(p => ({
    issue: p.forIssue,
    date: (matchDetails[p.forIssue] && matchDetails[p.forIssue].date) || '',
    totalScore: p.difficulty.totalScore,
    level: p.difficulty.level,
    levelLabel: p.difficulty.levelLabel,
    prizeCV: p.prizeTrend ? p.prizeTrend.prizeCV : null,
    avgDrawRate: p.difficulty.avgDrawRate
}));

// ===== 2. 风险场次位置频次 =====
const riskPosCount = new Array(14).fill(0);
const safePosCount = new Array(14).fill(0);
let totalRiskMentions = 0;
let totalSafeMentions = 0;

for (const p of predictions) {
    for (const r of p.riskyPositions || []) {
        if (r.position >= 1 && r.position <= 14) { riskPosCount[r.position - 1]++; totalRiskMentions++; }
    }
    for (const s of p.safePositions || []) {
        if (s.position >= 1 && s.position <= 14) { safePosCount[s.position - 1]++; totalSafeMentions++; }
    }
}

const riskPosRanking = riskPosCount.map((cnt, i) => ({ position: i + 1, count: cnt, rate: totalRiskMentions > 0 ? (cnt / predictions.length * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

const safePosRanking = safePosCount.map((cnt, i) => ({ position: i + 1, count: cnt, rate: totalSafeMentions > 0 ? (cnt / predictions.length * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

// ===== 3. 难度与奖金CV / 平局率相关性（皮尔逊相关系数） =====
function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx, dy = ys[i] - my;
        num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    if (dx2 === 0 || dy2 === 0) return null;
    return num / Math.sqrt(dx2 * dy2);
}

const scoreSeries = difficultyTrend.map(d => d.totalScore);
const cvSeries = difficultyTrend.map(d => d.prizeCV).filter(v => v != null);
const drawSeries = difficultyTrend.map(d => d.avgDrawRate);

const corrScoreCV = pearson(scoreSeries.slice(0, cvSeries.length), cvSeries);
const corrScoreDraw = pearson(scoreSeries, drawSeries);

// ===== 4. 联赛风险特征 =====
const leagueRisk = {};
for (const p of predictions) {
    for (const r of p.riskyPositions || []) {
        if (r.match && r.match.league) {
            const lg = r.match.league;
            if (!leagueRisk[lg]) leagueRisk[lg] = { count: 0 };
            leagueRisk[lg].count++;
        }
    }
}
const leagueRiskRanking = Object.entries(leagueRisk)
    .map(([league, v]) => ({ league, count: v.count }))
    .sort((a, b) => b.count - a.count);

// ===== 5. 难度等级时序统计 =====
const levelCount = {};
for (const d of difficultyTrend) {
    levelCount[d.levelLabel] = (levelCount[d.levelLabel] || 0) + 1;
}

// ===== 生成分析报告 =====
const lines = [];
lines.push('# 足彩14场 回溯评估深度分析报告');
lines.push('');
lines.push(`> 生成时间: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`);
lines.push(`> 数据范围: 第 ${asc[asc.length-1].forIssue} 期 ~ 第 ${asc[0].forIssue} 期（共 ${predictions.length} 期）`);
lines.push('');
lines.push('---');
lines.push('');
lines.push('## 一、难度走势概览');
lines.push('');
lines.push(`- 难度等级分布：${Object.entries(levelCount).map(([k, v]) => `${k} ${v} 期`).join(' | ')}`);
lines.push(`- 平均综合评分：${(scoreSeries.reduce((a,b)=>a+b,0)/scoreSeries.length).toFixed(2)}/10`);
lines.push(`- 最高难度：${Math.max(...scoreSeries).toFixed(1)}（第 ${asc[scoreSeries.indexOf(Math.max(...scoreSeries))].forIssue} 期）`);
lines.push(`- 最低难度：${Math.min(...scoreSeries).toFixed(1)}（第 ${asc[scoreSeries.indexOf(Math.min(...scoreSeries))].forIssue} 期）`);
lines.push('');
lines.push('## 二、风险场次位置热度（哪些位置最常出风险）');
lines.push('');
lines.push('| 排名 | 位置 | 出现次数 | 占评估期数比例 |');
lines.push('|------|------|---------|--------------|');
riskPosRanking.forEach((r, i) => {
    lines.push(`| ${i+1} | 第${r.position}场 | ${r.count} | ${r.rate.toFixed(0)}% |`);
});
lines.push('');
lines.push('## 三、安全场次位置热度（哪些位置最稳定）');
lines.push('');
lines.push('| 排名 | 位置 | 出现次数 | 占评估期数比例 |');
lines.push('|------|------|---------|--------------|');
safePosRanking.forEach((s, i) => {
    lines.push(`| ${i+1} | 第${s.position}场 | ${s.count} | ${s.rate.toFixed(0)}% |`);
});
lines.push('');
lines.push('## 四、难度与奖金/平局率的相关性');
lines.push('');
lines.push(`- 难度评分 与 奖金CV 的相关系数：${corrScoreCV != null ? corrScoreCV.toFixed(3) : 'N/A'}`);
lines.push(`- 难度评分 与 平均平局率 的相关系数：${corrScoreDraw != null ? corrScoreDraw.toFixed(3) : 'N/A'}`);
lines.push('');
if (corrScoreDraw != null && corrScoreDraw > 0.5) {
    lines.push('> 解读：平局率对难度评分的正向贡献显著，平局越多、结果越分散，难度越高。');
} else if (corrScoreDraw != null && corrScoreDraw < -0.5) {
    lines.push('> 解读：平局率与难度呈负相关，说明本期难度主要由其他因子（奖金波动/命中难度）驱动。');
} else {
    lines.push('> 解读：平局率与难度相关性中等，难度由多因子综合决定。');
}
lines.push('');
lines.push('## 五、风险场次集中的联赛');
lines.push('');
lines.push('| 排名 | 联赛 | 风险场次出现次数 |');
lines.push('|------|------|----------------|');
leagueRiskRanking.slice(0, 15).forEach((l, i) => {
    lines.push(`| ${i+1} | ${l.league} | ${l.count} |`);
});
lines.push('');
lines.push('---');
lines.push('');
lines.push('> ⚠️ 本报告为历史数据统计推演，不构成任何投注建议。请理性购彩。');

const report = lines.join('\n');
fs.writeFileSync(ANALYSIS_REPORT_PATH, report, 'utf8');
console.log(report);

// ===== 更新 dashboard_data.json（注入回溯分析摘要） =====
if (dashboard) {
    dashboard.backfillAnalysis = {
        generatedAt: new Date().toISOString(),
        totalEvaluations: predictions.length,
        levelCount,
        avgTotalScore: scoreSeries.reduce((a,b)=>a+b,0)/scoreSeries.length,
        riskPosRanking: riskPosRanking.slice(0, 14),
        safePosRanking: safePosRanking.slice(0, 14),
        leagueRiskRanking: leagueRiskRanking.slice(0, 15),
        corrScoreCV,
        corrScoreDraw,
        difficultyTrend
    };
    fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboard, null, 2), 'utf8');
    console.log(`\n💾 已更新 dashboard_data.json（backfillAnalysis）`);
}

console.log(`\n📝 分析报告已保存: ${ANALYSIS_REPORT_PATH}`);

// ===== 重建内嵌版仪表盘（保持与 dashboard_data.json 一致） =====
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
const DASHBOARD_STANDALONE_PATH = path.join(DASHBOARD_DIR, 'index_standalone.html');
if (fs.existsSync(DASHBOARD_HTML_PATH)) {
    const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
    const dataJson = JSON.stringify(dashboard);
    const placeholder = "window.INLINE_DATA = (typeof __DASHBOARD_DATA__ !== 'undefined') ? __DASHBOARD_DATA__ : null;";
    if (html.includes(placeholder)) {
        const replaced = html.split(placeholder).join('window.INLINE_DATA = ' + dataJson + ';');
        fs.writeFileSync(DASHBOARD_STANDALONE_PATH, replaced, 'utf8');
        console.log('💾 已重建 index_standalone.html（含回溯分析）');
    }
}
