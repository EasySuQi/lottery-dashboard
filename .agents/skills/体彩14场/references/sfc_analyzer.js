// ============================================================
// 足彩14场胜负彩 统计评估引擎 v1.0
// 数据来源: 国家体育总局体育彩票管理中心 webapi.sporttery.cn
// 存放路径: .claude/skills/体彩14场/references/sfc_analyzer.js
// ============================================================
// 用法:
//   1. 从 sporttery API 获取近 20 期开奖数据
//      (gameNo=90, pageSize=30, isDetails=1)
//   2. 将数据填入下方 draws 数组
//   3. 执行: node sfc_analyzer.js
// ============================================================

// ====== 数据区 (每次运行前更新为最新20期) ======
const draws = [
    // 格式: {
    //   code:'期号',
    //   results:[14个结果 3/1/0],
    //   date:'日期',
    //   prize1Count: 一等奖注数(数字),
    //   prize1Amount: 一等奖单注奖金(数字/元),
    //   prize2Count: 二等奖注数(数字),
    //   prize2Amount: 二等奖单注奖金(数字/元),
    //   totalSale: 销售总额(数字/元),
    //   matches: [{league, home, away, result, score}]
    // }
];

// ====== 配置常量 ======
const MATCH_COUNT = 14;
const WINDOW = 20; // 分析窗口期数

const THRESHOLDS = {
    // 火锅奖判定
    hotpot: { minPrize1Count: 100, maxPrize1Amount: 100000 },
    // 冷门期判定
    coldDraw: { maxPrize1Count: 5 },
    // 位置热度
    position: { hot: 0.60, cold: 0.15, dispersed: 0.25 },
    // 风险等级
    risk: { low: 12, medium: 8, highDisperse: 5 },
    // 正常分布范围
    normalRange: {
        win:  { min: 5, max: 8 },
        draw: { min: 2, max: 5 },
        lose: { min: 3, max: 6 },
    },
};

// ====== 工具函数 ======
function pad(n, len) { return String(n).padStart(len || 2, ' '); }
function fmtMoney(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return n.toLocaleString();
}

// 结果代码转中文
function resultLabel(r) {
    if (r === 3 || r === '3') return '主胜';
    if (r === 1 || r === '1') return '平局';
    if (r === 0 || r === '0') return '客胜';
    if (r === '*' || r === '*') return '延期';
    return String(r);
}

// 变异系数 (CV)
function cv(values) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    return mean > 0 ? std / mean : 0;
}

// 信息熵 (以3为底, 3种结果最大熵=1.0)
function entropy(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    return counts
        .filter(c => c > 0)
        .reduce((sum, c) => {
            const p = c / total;
            return sum - p * Math.log(p) / Math.log(3);
        }, 0);
}

// ====== 分析引擎 ======

// 1. 胜平负分布统计
function analyzeDistribution() {
    const dist = [];
    for (const d of draws) {
        const counts = { win: 0, draw: 0, lose: 0, star: 0 };
        for (const r of d.results) {
            if (r === 3 || r === '3') counts.win++;
            else if (r === 1 || r === '1') counts.draw++;
            else if (r === 0 || r === '0') counts.lose++;
            else if (r === '*') counts.star++;
        }
        const anomalies = [];
        if (counts.win > THRESHOLDS.normalRange.win.max) anomalies.push('主胜偏多');
        if (counts.win < THRESHOLDS.normalRange.win.min) anomalies.push('主胜偏少');
        if (counts.draw > THRESHOLDS.normalRange.draw.max) anomalies.push('平局偏多');
        if (counts.draw < THRESHOLDS.normalRange.draw.min) anomalies.push('平局偏少');
        if (counts.lose > THRESHOLDS.normalRange.lose.max) anomalies.push('客胜偏多');
        if (counts.lose < THRESHOLDS.normalRange.lose.min) anomalies.push('客胜偏少');
        if (counts.star > 0) anomalies.push(`延期${counts.star}场`);

        dist.push({ code: d.code, counts, anomalies, date: d.date });
    }
    return dist;
}

// 2. 位置热度矩阵
function analyzePositionHeat() {
    const heat = [];
    for (let pos = 0; pos < MATCH_COUNT; pos++) {
        const counts = { win: 0, draw: 0, lose: 0, star: 0 };
        for (const d of draws) {
            const r = d.results[pos];
            if (r === 3 || r === '3') counts.win++;
            else if (r === 1 || r === '1') counts.draw++;
            else if (r === 0 || r === '0') counts.lose++;
            else counts.star++;
        }
        const total = counts.win + counts.draw + counts.lose;
        const ent = entropy([counts.win, counts.draw, counts.lose]);

        // 找出最热结果
        let maxKey = 'win', maxVal = counts.win;
        if (counts.draw > maxVal) { maxKey = 'draw'; maxVal = counts.draw; }
        if (counts.lose > maxVal) { maxKey = 'lose'; maxVal = counts.lose; }
        let minKey = 'win', minVal = counts.win;
        if (counts.draw < minVal) { minKey = 'draw'; minVal = counts.draw; }
        if (counts.lose < minVal) { minKey = 'lose'; minVal = counts.lose; }

        // 风险判断
        let risk = 'low', riskLabel = '🟢低';
        if (counts.draw >= 5 && counts.win >= 5 && counts.lose >= 5) {
            risk = 'high'; riskLabel = '🔴高';
        } else if (counts.draw >= 5) {
            risk = 'medium_draw'; riskLabel = '⚠平局陷阱';
        } else if (maxVal < 12) {
            risk = 'medium'; riskLabel = '🟡中';
        }

        heat.push({
            position: pos + 1,
            counts,
            total,
            ent,
            maxKey,
            maxVal,
            minKey,
            minVal,
            risk,
            riskLabel,
        });
    }
    return heat;
}

// 3. 奖金走势分析
function analyzePrizeTrend() {
    const trend = [];
    const amounts = [];
    for (const d of draws) {
        const type = d.prize1Count === 0 ? '🥶无人中'
            : (d.prize1Count >= THRESHOLDS.hotpot.minPrize1Count && d.prize1Amount <= THRESHOLDS.hotpot.maxPrize1Amount) ? '🍲火锅奖'
            : d.prize1Count <= THRESHOLDS.coldDraw.maxPrize1Count ? '🧊冷门期'
            : '●正常';

        if (d.prize1Count > 0) amounts.push(d.prize1Amount);

        trend.push({
            code: d.code,
            date: d.date,
            prize1Count: d.prize1Count,
            prize1Amount: d.prize1Amount,
            prize2Count: d.prize2Count,
            prize2Amount: d.prize2Amount,
            totalSale: d.totalSale,
            type,
        });
    }

    const prizeCV = amounts.length > 1 ? cv(amounts) : 0;
    const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;

    return { trend, prizeCV, avgAmount, validCount: amounts.length };
}

// 4. 难度综合评分
function calculateDifficulty(dist, heat, prizeTrend) {
    // 4.1 平局因子 (30%)
    const avgDrawRate = dist.reduce((s, d) => s + d.counts.draw / MATCH_COUNT, 0) / dist.length;
    const drawScore = Math.min(1, avgDrawRate / 0.4) * 10; // 40%平局率 = 满分

    // 4.2 奖金波动 (25%)
    const cvScore = Math.min(1, prizeTrend.prizeCV / 2.0) * 10; // CV≥2.0 = 满分

    // 4.3 命中难度 (25%)
    const avgPrize1Count = prizeTrend.trend.reduce((s, t) => s + t.prize1Count, 0) / prizeTrend.trend.length;
    const hitScore = avgPrize1Count === 0 ? 10
        : Math.max(0, (1 - Math.log10(avgPrize1Count + 1) / Math.log10(1001))) * 10;

    // 4.4 结果熵值 (20%)
    const avgEnt = heat.reduce((s, h) => s + h.ent, 0) / heat.length;
    const entScore = avgEnt * 10; // 熵值=1.0 → 满分

    const totalScore = drawScore * 0.30 + cvScore * 0.25 + hitScore * 0.25 + entScore * 0.20;

    let level, levelLabel;
    if (totalScore <= 2.5) { level = 1; levelLabel = '🟢 低'; }
    else if (totalScore <= 4.5) { level = 2; levelLabel = '🟡 中低'; }
    else if (totalScore <= 6.0) { level = 3; levelLabel = '🟠 中等'; }
    else if (totalScore <= 7.5) { level = 4; levelLabel = '🔴 中高'; }
    else { level = 5; levelLabel = '💀 高难'; }

    return {
        drawScore, cvScore, hitScore, entScore,
        totalScore, level, levelLabel,
        avgDrawRate, avgEnt,
    };
}

// ====== 输出函数 ======
function printHeader(title) {
    console.log('\n' + '='.repeat(80));
    console.log(title);
    console.log('='.repeat(80));
}

function printSubHeader(title) {
    console.log('\n' + '-'.repeat(80));
    console.log(title);
    console.log('-'.repeat(80));
}

// ====== 主程序 ======
function main() {
    if (draws.length === 0) {
        console.error('ERROR: draws 数组为空。请先填入最新20期数据。');
        process.exit(1);
    }

    // ---- 一、开奖结果总览 ----
    printHeader('一、开奖结果总览（近' + draws.length + '期）');

    const dist = analyzeDistribution();

    console.log();
    console.log('  期号     日期         销售额         3/1/0分布        主胜  平局  客胜  特征');
    console.log('  ──────── ────────── ────────────── ────────────────  ────  ────  ────  ────────────');

    for (const d of dist) {
        const idx = draws.findIndex(dd => dd.code === d.code);
        const sale = draws[idx].totalSale;
        const saleStr = sale > 0 ? (sale / 10000).toFixed(0) + '万' : 'N/A';

        // 构建 3/1/0 可视化条
        const bar = '🟢'.repeat(d.counts.win) + '🟡'.repeat(d.counts.draw) + '🔴'.repeat(d.counts.lose);

        const features = d.anomalies.length > 0 ? d.anomalies.join(',') : '正常';
        const starNote = d.counts.star > 0 ? ' *含延期' : '';

        console.log(`  ${d.code}   ${d.date}   ${saleStr.padEnd(14)} ${bar.padEnd(30)} ${String(d.counts.win).padStart(4)} ${String(d.counts.draw).padStart(4)} ${String(d.counts.lose).padStart(4)}  ${features}${starNote}`);
    }

    // 汇总统计
    const avgWin = dist.reduce((s, d) => s + d.counts.win, 0) / dist.length;
    const avgDraw = dist.reduce((s, d) => s + d.counts.draw, 0) / dist.length;
    const avgLose = dist.reduce((s, d) => s + d.counts.lose, 0) / dist.length;
    console.log(`\n  近${draws.length}期均值: 主胜 ${avgWin.toFixed(1)} | 平局 ${avgDraw.toFixed(1)} | 客胜 ${avgLose.toFixed(1)}`);

    // ---- 二、位置热度分析 ----
    printHeader('二、胜平负分布 & 位置热度分析');

    const heat = analyzePositionHeat();

    // 2.1 整体分布趋势
    console.log('\n【整体胜平负趋势】');
    for (const d of dist) {
        const pct3 = (d.counts.win / MATCH_COUNT * 100).toFixed(0) + '%';
        const pct1 = (d.counts.draw / MATCH_COUNT * 100).toFixed(0) + '%';
        const pct0 = (d.counts.lose / MATCH_COUNT * 100).toFixed(0) + '%';
        const bar3 = '█'.repeat(Math.round(d.counts.win / MATCH_COUNT * 30));
        const bar1 = '█'.repeat(Math.round(d.counts.draw / MATCH_COUNT * 30));
        const bar0 = '█'.repeat(Math.round(d.counts.lose / MATCH_COUNT * 30));
        console.log(`  ${d.code} 主胜${pct3.padStart(4)} ${bar3}`);
        console.log(`        平局${pct1.padStart(4)} ${bar1}`);
        console.log(`        客胜${pct0.padStart(4)} ${bar0}`);
        console.log();
    }

    // 2.2 位置热度矩阵
    console.log('【14位置热度矩阵】（近' + draws.length + '期累计）');
    console.log();
    console.log('  位置  主胜(3)    平局(1)    客胜(0)    最热     最冷    热度熵  风险');
    console.log('  ────  ─────────  ─────────  ─────────  ───────  ───────  ──────  ────────');

    for (const h of heat) {
        const pctW = (h.counts.win / h.total * 100).toFixed(0) + '%';
        const pctD = (h.counts.draw / h.total * 100).toFixed(0) + '%';
        const pctL = (h.counts.lose / h.total * 100).toFixed(0) + '%';
        const maxLabel = { win: '主胜', draw: '平局', lose: '客胜' }[h.maxKey];
        const minLabel = { win: '主胜', draw: '平局', lose: '客胜' }[h.minKey];

        console.log(`  第${String(h.position).padStart(2)}场  ${String(h.counts.win).padStart(3)}(${pctW.padStart(4)})  ${String(h.counts.draw).padStart(3)}(${pctD.padStart(4)})  ${String(h.counts.lose).padStart(3)}(${pctL.padStart(4)})  ${maxLabel.padEnd(7)} ${minLabel.padEnd(7)} ${h.ent.toFixed(2).padStart(6)}  ${h.riskLabel}`);
    }

    // 标注高风险位置
    const riskyPositions = heat.filter(h => h.risk === 'high' || h.risk === 'medium_draw');
    if (riskyPositions.length > 0) {
        console.log(`\n  ⚠ 高风险位置 (共${riskyPositions.length}个):`);
        for (const h of riskyPositions) {
            console.log(`     第${h.position}场: 主胜${h.counts.win}次/平局${h.counts.draw}次/客胜${h.counts.lose}次 (${h.riskLabel})`);
        }
    }

    // ---- 三、奖金冷热度分析 ----
    printHeader('三、奖金冷热度分析');

    const prizeTrend = analyzePrizeTrend();

    console.log();
    console.log('  期号     日期         销售额        一等奖(注/元)        二等奖(注/元)        类型');
    console.log('  ──────── ────────── ──────────── ──────────────────── ──────────────────── ────────');

    for (const t of prizeTrend.trend) {
        const saleStr = t.totalSale > 0 ? (t.totalSale / 10000).toFixed(0) + '万' : 'N/A';
        const p1Str = t.prize1Count + '注/' + fmtMoney(t.prize1Amount);
        const p2Str = t.prize2Count + '注/' + fmtMoney(t.prize2Amount);
        console.log(`  ${t.code}   ${t.date}   ${saleStr.padEnd(12)} ${p1Str.padEnd(21)} ${p2Str.padEnd(21)} ${t.type}`);
    }

    // 奖金统计
    const hotpotCount = prizeTrend.trend.filter(t => t.type === '🍲火锅奖').length;
    const coldCount = prizeTrend.trend.filter(t => t.type === '🧊冷门期' || t.type === '🥶无人中').length;
    const zeroCount = prizeTrend.trend.filter(t => t.type === '🥶无人中').length;

    console.log(`\n  奖金波动指数(CV): ${prizeTrend.prizeCV.toFixed(2)}`);
    console.log(`  火锅奖期数: ${hotpotCount}/${draws.length}  |  冷门期数: ${coldCount}/${draws.length}  |  无人中期数: ${zeroCount}/${draws.length}`);

    // ---- 四、难度综合评估 ----
    printHeader('四、难度综合评估');

    const difficulty = calculateDifficulty(dist, heat, prizeTrend);

    console.log('\n  评估维度          权重    得分(满分10)  说明');
    console.log('  ────────────────  ──────  ────────────  ──────────────────────────────');
    console.log(`  平局因子          30%     ${difficulty.drawScore.toFixed(1).padStart(4)}       近20期平均平局率: ${(difficulty.avgDrawRate * 100).toFixed(1)}%`);
    console.log(`  奖金波动          25%     ${difficulty.cvScore.toFixed(1).padStart(4)}       一等奖奖金CV: ${prizeTrend.prizeCV.toFixed(2)}`);
    console.log(`  命中难度          25%     ${difficulty.hitScore.toFixed(1).padStart(4)}       参考历史一等奖分布`);
    console.log(`  结果分散度        20%     ${difficulty.entScore.toFixed(1).padStart(4)}       14位置平均信息熵: ${difficulty.avgEnt.toFixed(2)}`);
    console.log('  ────────────────  ──────  ────────────');
    console.log(`  综合难度评分              ${difficulty.totalScore.toFixed(1).padStart(4)}       ${difficulty.levelLabel}`);

    // 走势研判
    const recentTypes = prizeTrend.trend.slice(0, 5).map(t => t.type);
    const recentPattern = recentTypes.filter(t => t === '🧊冷门期' || t === '🥶无人中').length;

    console.log('\n  近期走势:');
    console.log(`    近5期类型: ${recentTypes.join(' → ')}`);

    if (recentPattern >= 3) {
        console.log('    ⚠ 近期冷门频发，难度偏高，注意防冷');
    } else if (recentPattern === 0) {
        console.log('    📊 近期以正路为主，难度偏低');
    } else {
        console.log('    📊 冷热交替，属正常波动');
    }

    // ---- 五、评估结论 ----
    printHeader('五、评估结论 & 参考建议');

    console.log('\n【趋势特征】');
    console.log(`  整体难度: ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10)`);
    console.log(`  平均平局率: ${(difficulty.avgDrawRate * 100).toFixed(1)}% (正常范围 14-36%)`);
    console.log(`  奖金稳定度: ${prizeTrend.prizeCV < 0.5 ? '较稳定' : prizeTrend.prizeCV < 1.0 ? '中等波动' : '波动较大'}`);

    console.log('\n【高风险场次位置】');
    if (riskyPositions.length > 0) {
        for (const h of riskyPositions) {
            const draw = draws[0];
            let matchInfo = '';
            if (draw.matches && draw.matches[h.position - 1]) {
                const m = draw.matches[h.position - 1];
                matchInfo = ` (最新: ${m.home || '?'} vs ${m.away || '?'})`;
            }
            console.log(`  第${h.position}场: 主胜${h.counts.win}/平局${h.counts.draw}/客胜${h.counts.lose}${matchInfo} → ${h.riskLabel}`);
            if (h.risk === 'medium_draw') {
                console.log(`    ↳ 平局概率偏高，建议重点关注防平`);
            } else {
                console.log(`    ↳ 三种结果分布均匀，建议复选覆盖`);
            }
        }
    } else {
        console.log('  当前无显著高风险位置，各位置结果倾向性较明显');
    }

    // 标注低风险位置
    const safePositions = heat.filter(h => h.maxVal >= THRESHOLDS.risk.low);
    console.log('\n【高确定性场次位置】(倾向明确)');
    if (safePositions.length > 0) {
        for (const h of safePositions) {
            const maxLabel = { win: '主胜', draw: '平局', lose: '客胜' }[h.maxKey];
            const draw = draws[0];
            let matchInfo = '';
            if (draw.matches && draw.matches[h.position - 1]) {
                const m = draw.matches[h.position - 1];
                matchInfo = ` (最新: ${m.home || '?'} vs ${m.away || '?'})`;
            }
            console.log(`  第${h.position}场: ${maxLabel}占${(h.maxVal / h.total * 100).toFixed(0)}% (${h.maxVal}/${h.total})${matchInfo}`);
        }
    } else {
        console.log('  当前无超高确定性位置');
    }

    // 汇总报告
    console.log(`\n${'='.repeat(80)}`);
    console.log('                          评估汇总报告');
    console.log(`${'='.repeat(80)}`);
    console.log();
    console.log(`  数据基础:    近 ${draws.length} 期 (${draws[draws.length - 1].code} ~ ${draws[0].code})`);
    console.log(`  数据来源:    国家体育总局体育彩票管理中心 sporttery.cn`);
    console.log(`  难度等级:    ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10)`);
    console.log(`  高风险位置:  ${riskyPositions.length} 个 | 低风险位置: ${safePositions.length} 个`);
    console.log(`  奖金波动:    CV=${prizeTrend.prizeCV.toFixed(2)} | 火锅奖${hotpotCount}期 | 冷门${coldCount}期`);
    console.log(`  平局率:      ${(difficulty.avgDrawRate * 100).toFixed(1)}% (近${draws.length}期均值)`);
    console.log();
    console.log('  注意事项:');
    console.log('    1. 以上分析仅为历史开奖数据统计，不代表未来趋势');
    console.log('    2. 各场次对阵球队每期不同，位置热度仅反映统计规律');
    console.log('    3. 足球比赛结果受球队状态、伤病、天气等多因素影响');
    console.log('    4. 本报告用于数据参考，不作为投注依据');
    console.log();
    console.log('  ⚠ 历史统计推演，不构成投注建议。足球赛果为独立事件。');
    console.log('     统计规律不代表预测能力。请理性购彩，量力而行。');
    console.log('='.repeat(80));
}

// 执行
main();
