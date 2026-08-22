#!/usr/bin/env node
// ============================================================
// 历史回溯评估脚本
// 功能: 对已有全部开奖数据逐期做"当时视角"评估，
//       即每期只用"该期及之前最多 windowSize 期"作为窗口重算，
//       生成完整的 predictions.json 历史评估快照，
//       并重建 dashboard_data.json 与 index_standalone.html。
// ============================================================

const fs = require('fs');
const path = require('path');

// —— 复用 fetch_and_analyze.js 中的分析函数 ——
let src = fs.readFileSync(path.join(__dirname, 'fetch_and_analyze.js'), 'utf8');
src = src.replace(/^#!.*\n/, '');                                   // 去掉 shebang
src = src.replace(/\nmain\(\)\.catch\(e => \{[\s\S]*?\}\);\s*$/, '\n'); // 去掉 main 调用
eval(src); // 将 analyzeDistribution / analyzePositionHeat / analyzePrizeTrend / calculateDifficulty 等注入当前作用域

// —— 常量（const 不会从 eval 泄漏，需在此重新声明） ——
const THRESHOLDS = {
    risk: { low: 12 }
};
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DASHBOARD_DATA_PATH = path.join(DATA_DIR, 'dashboard_data.json');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
const DASHBOARD_STANDALONE_PATH = path.join(DASHBOARD_DIR, 'index_standalone.html');

// —— 加载数据 ——
const draws = loadDraws();           // 倒序，最新在前（index 0 = 最新期）
const matchDetails = loadMatchDetails();
const windowSize = 20;               // 与 config 的 analysis.windowSize 一致

console.log(`📦 共 ${draws.length} 期开奖数据，开始逐期回溯评估（窗口=${windowSize}期）...\n`);

// —— 逐期回溯 ——
const backfilled = [];
for (let i = 0; i < draws.length; i++) {
    // 以第 i 期为"当期"，窗口 = 该期及之前 windowSize 期
    const window = draws.slice(i, i + windowSize);

    const dist = analyzeDistribution(window);
    const heat = analyzePositionHeat(window);
    const prizeTrend = analyzePrizeTrend(window);
    const difficulty = calculateDifficulty(dist, heat, prizeTrend);

    const issue = window[0].code;
    const riskyPositions = heat
        .filter(h => h.risk === 'high' || h.risk === 'medium_draw')
        .map(h => ({ position: h.position, risk: h.risk, riskLabel: h.riskLabel, match: h.latestMatch }));
    const safePositions = heat
        .filter(h => h.maxVal >= THRESHOLDS.risk.low)
        .map(h => ({ position: h.position, maxKey: h.maxKey, maxVal: h.maxVal, match: h.latestMatch }));

    backfilled.push({
        generatedAt: `${window[0].date || 'unknown'}T00:00:00.000Z`,
        forIssue: issue,
        difficulty,
        riskyPositions,
        safePositions,
        prizeTrend: {
            prizeCV: prizeTrend.prizeCV,
            recent5Types: prizeTrend.trend.slice(0, 5).map(t => t.type)
        }
    });

    console.log(`  ✔ 第 ${issue} 期 | ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10) | 风险 ${riskyPositions.length} 场 | 安全 ${safePositions.length} 场`);
}

// —— 写回 predictions.json ——
savePredictions(backfilled);
console.log(`\n💾 已写入 predictions.json，共 ${backfilled.length} 期评估快照`);

// —— 重建 dashboard_data.json 的 historyEvaluations ——
const dashboard = JSON.parse(fs.readFileSync(DASHBOARD_DATA_PATH, 'utf8'));
dashboard.historyEvaluations = backfilled.map(p => ({
    issue: p.forIssue,
    date: (matchDetails[p.forIssue] && matchDetails[p.forIssue].date) || '',
    generatedAt: p.generatedAt,
    difficulty: {
        totalScore: p.difficulty.totalScore,
        level: p.difficulty.level,
        levelLabel: p.difficulty.levelLabel,
        drawScore: p.difficulty.drawScore,
        cvScore: p.difficulty.cvScore,
        hitScore: p.difficulty.hitScore,
        entScore: p.difficulty.entScore,
        avgDrawRate: p.difficulty.avgDrawRate,
        avgEnt: p.difficulty.avgEnt
    },
    prizeCV: p.prizeTrend ? p.prizeTrend.prizeCV : null,
    recent5Types: p.prizeTrend ? p.prizeTrend.recent5Types : [],
    riskyPositions: p.riskyPositions || [],
    safePositions: p.safePositions || []
}));
fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboard, null, 2), 'utf8');
console.log(`💾 已重建 dashboard_data.json（historyEvaluations ${dashboard.historyEvaluations.length} 期）`);

// —— 重建 index_standalone.html ——
if (fs.existsSync(DASHBOARD_HTML_PATH)) {
    const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
    const dataJson = JSON.stringify(dashboard);
    const placeholder = "window.INLINE_DATA = (typeof __DASHBOARD_DATA__ !== 'undefined') ? __DASHBOARD_DATA__ : null;";
    if (html.includes(placeholder)) {
        const replaced = html.split(placeholder).join('window.INLINE_DATA = ' + dataJson + ';');
        fs.writeFileSync(DASHBOARD_STANDALONE_PATH, replaced, 'utf8');
        console.log('💾 已重建 index_standalone.html');
    }
}

console.log('\n✅ 历史回溯评估全部完成');
