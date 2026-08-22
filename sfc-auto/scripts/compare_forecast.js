#!/usr/bin/env node
// ============================================================
// 评估 vs 真实赛果比对脚本
// 功能: 对已开奖的期次，将「评估时的风险/安全场次预测」与「真实赛果」比对，
//       计算风险场次爆冷命中率、安全场次稳定命中率，
//       结果写入 comparison.json 并注入 dashboard_data.json，
//       同时生成 comparison_report.md 往期对比台账文档。
//
// 判定标准（基于位置热度 maxKey = 该位置历史最热结果）:
//   - 风险场次: 评估认为"结果分散、易爆冷"。
//       若真实赛果 ≠ 该位置历史最热结果 → 命中（确实爆冷）
//       若真实赛果 = 该位置历史最热结果 → 误报（未爆冷）
//   - 安全场次: 评估认为"结果稳定、主胜概率高"。
//       若真实赛果 = 该位置历史最热结果 → 命中（确实稳定）
//       若真实赛果 ≠ 该位置历史最热结果 → 误判（意外爆冷）
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DRAWS_PATH = path.join(DATA_DIR, 'draws.json');
const PREDICTIONS_PATH = path.join(DATA_DIR, 'predictions.json');
const DASHBOARD_DATA_PATH = path.join(DATA_DIR, 'dashboard_data.json');
const COMPARISON_PATH = path.join(DATA_DIR, 'comparison.json');
const COMPARISON_REPORT_PATH = path.join(DATA_DIR, 'comparison_report.md');

function loadJSON(p, fallback) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.error('读取失败', p, e.message); }
    return fallback;
}

const draws = loadJSON(DRAWS_PATH, []);
const predictions = loadJSON(PREDICTIONS_PATH, []);
const dashboard = loadJSON(DASHBOARD_DATA_PATH, {});

// 从 positionHeat 取每个位置的历史最热结果 maxKey
const positionHeat = dashboard.positionHeat || [];
const posMaxKey = {};
for (const h of positionHeat) {
    posMaxKey[h.position] = h.maxKey; // 'win' | 'draw' | 'lose'
}

// 结果数值 -> key
function resultToKey(r) {
    if (r === 3 || r === '3') return 'win';
    if (r === 1 || r === '1') return 'draw';
    if (r === 0 || r === '0') return 'lose';
    return 'star';
}

// key -> 中文标签
function keyLabel(k) {
    return { win: '主胜', draw: '平局', lose: '客胜', star: '延期' }[k] || k;
}

// 期号 -> 完整开奖数据（含 results 与 matches）
const drawsByCode = {};
for (const d of draws) {
    drawsByCode[d.code] = d;
}

const comparisons = [];

for (const p of predictions) {
    const issue = p.forIssue;
    const draw = drawsByCode[issue];
    if (!draw || !draw.results || draw.results.length === 0) continue; // 未开奖或未采到赛果，跳过

    const realResults = draw.results;

    // 取对阵信息
    function matchInfo(pos) {
        const m = draw.matches && draw.matches[pos - 1];
        if (!m) return null;
        return { league: m.league, home: m.home, away: m.away, score: m.score || '' };
    }

    // 比对风险场次
    const riskCheck = [];
    for (const r of (p.riskyPositions || [])) {
        const pos = r.position;
        const realKey = resultToKey(realResults[pos - 1]);
        const maxKey = posMaxKey[pos] || 'win';
        const hit = (realKey !== maxKey); // 真实赛果偏离历史最热 = 爆冷 = 命中
        riskCheck.push({ position: pos, maxKey, realKey, realResult: realResults[pos - 1], hit, match: matchInfo(pos) });
    }

    // 比对安全场次
    const safeCheck = [];
    for (const s of (p.safePositions || [])) {
        const pos = s.position;
        const realKey = resultToKey(realResults[pos - 1]);
        const maxKey = posMaxKey[pos] || 'win';
        const hit = (realKey === maxKey); // 真实赛果 = 历史最热 = 稳定 = 命中
        safeCheck.push({ position: pos, maxKey, realKey, realResult: realResults[pos - 1], hit, match: matchInfo(pos) });
    }

    const riskHit = riskCheck.filter(x => x.hit).length;
    const riskTotal = riskCheck.length;
    const safeHit = safeCheck.filter(x => x.hit).length;
    const safeTotal = safeCheck.length;
    const overallTotal = riskTotal + safeTotal;
    const overallHit = riskHit + safeHit;

    const difficulty = p.difficulty
        ? { level: p.difficulty.level, levelLabel: p.difficulty.levelLabel, totalScore: p.difficulty.totalScore }
        : null;

    comparisons.push({
        issue,
        date: draw.date || '',
        difficulty,
        realResults,
        riskTotal,
        riskHit,
        riskHitRate: riskTotal > 0 ? +(riskHit / riskTotal * 100).toFixed(1) : null,
        safeTotal,
        safeHit,
        safeHitRate: safeTotal > 0 ? +(safeHit / safeTotal * 100).toFixed(1) : null,
        overallTotal,
        overallHit,
        overallHitRate: overallTotal > 0 ? +(overallHit / overallTotal * 100).toFixed(1) : null,
        riskCheck,
        safeCheck
    });
}

// 按期号倒序
comparisons.sort((a, b) => b.issue.localeCompare(a.issue));

// 汇总统计
const sumRiskTotal = comparisons.reduce((s, c) => s + c.riskTotal, 0);
const sumRiskHit = comparisons.reduce((s, c) => s + c.riskHit, 0);
const sumSafeTotal = comparisons.reduce((s, c) => s + c.safeTotal, 0);
const sumSafeHit = comparisons.reduce((s, c) => s + c.safeHit, 0);
const sumOverallTotal = sumRiskTotal + sumSafeTotal;
const sumOverallHit = sumRiskHit + sumSafeHit;

const summary = {
    totalPeriods: comparisons.length,
    riskTotal: sumRiskTotal,
    riskHit: sumRiskHit,
    riskHitRate: sumRiskTotal > 0 ? +(sumRiskHit / sumRiskTotal * 100).toFixed(1) : null,
    safeTotal: sumSafeTotal,
    safeHit: sumSafeHit,
    safeHitRate: sumSafeTotal > 0 ? +(sumSafeHit / sumSafeTotal * 100).toFixed(1) : null,
    overallTotal: sumOverallTotal,
    overallHit: sumOverallHit,
    overallHitRate: sumOverallTotal > 0 ? +(sumOverallHit / sumOverallTotal * 100).toFixed(1) : null
};

// 写入 comparison.json
const output = { generatedAt: new Date().toISOString(), summary, periods: comparisons };
fs.writeFileSync(COMPARISON_PATH, JSON.stringify(output, null, 2), 'utf8');

// 注入 dashboard_data.json
dashboard.comparison = output;
fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboard, null, 2), 'utf8');

// 打印结果
console.log('='.repeat(60));
console.log('  评估 vs 真实赛果比对结果');
console.log('='.repeat(60));
console.log(`  已比对期数: ${summary.totalPeriods}`);
console.log(`  风险场次: 共 ${summary.riskTotal} 场，命中爆冷 ${summary.riskHit} 场 (命中率 ${summary.riskHitRate}%)`);
console.log(`  安全场次: 共 ${summary.safeTotal} 场，命中稳定 ${summary.safeHit} 场 (命中率 ${summary.safeHitRate}%)`);
console.log(`  整体命中: 共 ${summary.overallTotal} 场，命中 ${summary.overallHit} 场 (命中率 ${summary.overallHitRate}%)`);
console.log('');
console.log('  逐期明细:');
for (const c of comparisons) {
    const riskStr = c.riskHitRate != null ? `风险 ${c.riskHit}/${c.riskTotal} (${c.riskHitRate}%)` : '风险 -';
    const safeStr = c.safeHitRate != null ? `安全 ${c.safeHit}/${c.safeTotal} (${c.safeHitRate}%)` : '安全 -';
    console.log(`    第 ${c.issue} 期: ${riskStr} | ${safeStr}`);
}
console.log('');
console.log(`💾 已写入 comparison.json 并注入 dashboard_data.json`);

// 生成往期对比台账文档 comparison_report.md
generateComparisonReport(output);
console.log(`💾 已生成 comparison_report.md（往期对比台账）`);

// 重建内嵌版仪表盘（作为编排流程最后一步，确保所有数据都已注入）
try {
    const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
    const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
    const DASHBOARD_STANDALONE_PATH = path.join(DASHBOARD_DIR, 'index_standalone.html');
    if (fs.existsSync(DASHBOARD_HTML_PATH)) {
        const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
        const dashboardFinal = JSON.parse(fs.readFileSync(DASHBOARD_DATA_PATH, 'utf8'));
        const placeholder = "window.INLINE_DATA = (typeof __DASHBOARD_DATA__ !== 'undefined') ? __DASHBOARD_DATA__ : null;";
        if (html.includes(placeholder)) {
            const replaced = html.split(placeholder).join('window.INLINE_DATA = ' + JSON.stringify(dashboardFinal) + ';');
            fs.writeFileSync(DASHBOARD_STANDALONE_PATH, replaced, 'utf8');
            console.log('💾 已重建 index_standalone.html（含全部数据）');
        }
    }
} catch (e) {
    console.log('⚠ 重建仪表盘失败:', e.message);
}

// ====== 生成往期对比台账 Markdown 文档 ======
function generateComparisonReport(comp) {
    const s = comp.summary;
    const lines = [];

    lines.push('# 📊 足彩14场 往期评估预测对比台账');
    lines.push('');
    lines.push(`> 📅 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    lines.push(`> 📆 已比对期数: ${s.totalPeriods} 期`);
    lines.push('');
    lines.push('## 一、总体命中率');
    lines.push('');
    lines.push('| 指标 | 命中 / 总数 | 命中率 |');
    lines.push('|------|------------|--------|');
    lines.push(`| 🔴 风险场次爆冷 | ${s.riskHit} / ${s.riskTotal} | ${s.riskHitRate != null ? s.riskHitRate + '%' : '-'} |`);
    lines.push(`| 🟢 安全场次稳定 | ${s.safeHit} / ${s.safeTotal} | ${s.safeHitRate != null ? s.safeHitRate + '%' : '-'} |`);
    lines.push(`| ⚖ 整体命中 | ${s.overallHit} / ${s.overallTotal} | ${s.overallHitRate != null ? s.overallHitRate + '%' : '-'} |`);
    lines.push('');
    lines.push('> 判定说明：风险场次命中 = 真实赛果偏离该位置历史最热结果（确实爆冷）；');
    lines.push('> 安全场次命中 = 真实赛果符合该位置历史最热结果（确实稳定）。');
    lines.push('');
    lines.push('## 二、逐期对比明细');
    lines.push('');

    for (const c of comp.periods) {
        const diffStr = c.difficulty ? `${c.difficulty.levelLabel} (${c.difficulty.totalScore.toFixed(1)}/10)` : '-';
        lines.push(`### 第 ${c.issue} 期（${c.date || '日期未知'}）`);
        lines.push('');
        lines.push(`- ⚖ 难度评级: ${diffStr}`);
        lines.push(`- 🔴 风险场次: ${c.riskHit}/${c.riskTotal} (${c.riskHitRate != null ? c.riskHitRate + '%' : '-'})  |  🟢 安全场次: ${c.safeHit}/${c.safeTotal} (${c.safeHitRate != null ? c.safeHitRate + '%' : '-'})`);
        lines.push(`- ⚖ 整体命中: ${c.overallHit}/${c.overallTotal} (${c.overallHitRate != null ? c.overallHitRate + '%' : '-'})`);
        lines.push('');

        // 真实赛果序列
        lines.push(`真实赛果: ${c.realResults.map(r => keyLabel(resultToKey(r))).join(' | ')}`);
        lines.push('');

        // 风险场次逐场
        if (c.riskCheck && c.riskCheck.length > 0) {
            lines.push('**风险场次逐场对比**');
            lines.push('');
            lines.push('| 场次 | 对阵 | 历史最热 | 真实赛果 | 判定 |');
            lines.push('|------|------|----------|----------|------|');
            for (const rc of c.riskCheck) {
                const match = rc.match ? `${rc.match.league} ${rc.match.home}vs${rc.match.away}` : '-';
                lines.push(`| 第${rc.position}场 | ${match} | ${keyLabel(rc.maxKey)} | ${keyLabel(rc.realKey)} | ${rc.hit ? '✅ 命中爆冷' : '❌ 未爆冷'} |`);
            }
            lines.push('');
        }

        // 安全场次逐场
        if (c.safeCheck && c.safeCheck.length > 0) {
            lines.push('**安全场次逐场对比**');
            lines.push('');
            lines.push('| 场次 | 对阵 | 历史最热 | 真实赛果 | 判定 |');
            lines.push('|------|------|----------|----------|------|');
            for (const sc of c.safeCheck) {
                const match = sc.match ? `${sc.match.league} ${sc.match.home}vs${sc.match.away}` : '-';
                lines.push(`| 第${sc.position}场 | ${match} | ${keyLabel(sc.maxKey)} | ${keyLabel(sc.realKey)} | ${sc.hit ? '✅ 命中稳定' : '❌ 意外爆冷'} |`);
            }
            lines.push('');
        }

        lines.push('---');
        lines.push('');
    }

    lines.push('> ⚠️ 以上为历史开奖数据统计推演，不构成任何投注建议。足球赛果为独立事件。请理性购彩，量力而行。');
    lines.push('');

    fs.writeFileSync(COMPARISON_REPORT_PATH, lines.join('\n'), 'utf8');
}
