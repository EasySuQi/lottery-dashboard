#!/usr/bin/env node
// ============================================================
// 足彩14场 未来期次提前评估脚本
// 功能: 读取中国足彩网 zcplayvs 接口的未来期次对阵 + 欧赔，
//       用欧赔隐含概率推算胜平负倾向，结合历史位置热度/联赛球队统计
//       给出每场预测（主胜/平局/客胜 + 信心度），并标注风险场次。
// 数据源: cp.zgzcw.com /lottery/zcplayvs.action?lotteryId=13&issue=XXXX
// ============================================================

const fs = require('fs');
const path = require('path');
const common = require(path.join(__dirname, '..', '..', 'scripts', 'lottery-common.js'));

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const FORECAST_PATH = path.join(DATA_DIR, 'forecast.json');

// 待评估期次
const ISSUES = process.argv[2] ? process.argv[2].split(',') : ['26106', '26107'];

async function fetchMatches(issue) {
    const url = `https://cp.zgzcw.com/lottery/zcplayvs.action?lotteryId=13&issue=${issue}&v=${Date.now()}`;
    const data = await common.fetchJson(url, { retries: 2, retryDelayMs: 10000, timeoutMs: 25000 });
    return data.matchInfo || [];
}

// 欧赔转隐含概率（去除水头后归一化）
function europeToProb(europeSp) {
    if (!europeSp) return null;
    const parts = europeSp.trim().split(/\s+/).map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [h, d, a] = parts;
    const invH = 1 / h, invD = 1 / d, invA = 1 / a;
    const sum = invH + invD + invA; // 含水头
    return {
        home: invH / sum,
        draw: invD / sum,
        away: invA / sum,
        homeOdds: h, drawOdds: d, awayOdds: a
    };
}

// 根据隐含概率预测赛果 + 信心度
// ctx: { lgHomeWinRate: 联赛历史主胜率(0~1), histMaxKey: 该位置历史最热结果, histRisk }
function predictResult(prob, ctx) {
    if (!prob) return { pred: null, conf: 0, prob };
    let { home, draw, away } = prob;
    ctx = ctx || {};

    // 融合联赛历史主胜率（作为先验做加权平均）
    const lgRate = ctx.lgHomeWinRate;
    if (lgRate != null && isFinite(lgRate)) {
        const alpha = 0.25; // 历史先验权重
        home = home * (1 - alpha) + lgRate * alpha;
        away = away * (1 - alpha) + (1 - lgRate) * alpha;
        // 平局不做先验调整，归一化保持概率总和为 1
        const s = home + draw + away;
        home /= s; draw /= s; away /= s;
    }

    const max = Math.max(home, draw, away);
    const sorted = [home, draw, away].sort((a, b) => b - a);
    let conf = sorted[0] - sorted[1]; // 最大值与次大值之差作为信心度

    // 历史位置热度一致性加成：与历史最热一致 +3%，偏离 -2%
    const predKey = max === home ? 'win' : max === draw ? 'draw' : 'lose';
    if (ctx.histMaxKey) {
        if (predKey === ctx.histMaxKey) conf += 0.03;
        else conf -= 0.02;
    }
    conf = Math.max(0, Math.min(0.99, conf));

    let pred;
    if (max === home) pred = 3;
    else if (max === draw) pred = 1;
    else pred = 0;
    return { pred, conf, prob: { home, draw, away, homeOdds: prob.homeOdds, drawOdds: prob.drawOdds, awayOdds: prob.awayOdds } };
}

// 加载历史位置热度（从 dashboard_data.json）
function loadPositionHeat() {
    try {
        const dashboard = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dashboard_data.json'), 'utf8'));
        return dashboard.positionHeat || [];
    } catch (_) { return []; }
}

// 加载联赛球队统计
function loadLeagueTeamStats() {
    try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'league_team_stats.json'), 'utf8'));
    } catch (_) { return { leagues: {}, teams: {} }; }
}

async function main() {
    const positionHeat = loadPositionHeat();
    const stats = loadLeagueTeamStats();
    const forecasts = [];

    console.log('='.repeat(70));
    console.log('  足彩14场 未来期次提前评估');
    console.log('='.repeat(70));

    for (const issue of ISSUES) {
        console.log(`\n📥 抓取第 ${issue} 期对阵...`);
        const matches = await fetchMatches(issue);
        if (matches.length === 0) {
            console.log(`  ⚠ 第 ${issue} 期暂无对阵数据`);
            continue;
        }
        console.log(`  ✅ 获取 ${matches.length} 场比赛对阵`);

        const rows = matches.map((m, idx) => {
            const pos = idx + 1;
            const prob = europeToProb(m.europeSp);

            // 历史位置热度（该位置的风险倾向）
            const heatInfo = positionHeat.find(h => h.position === pos);
            const histRisk = heatInfo ? heatInfo.riskLabel : '';

            // 联赛历史主胜率（0~1）
            const lgStats = stats.leagues && stats.leagues[m.leageName];
            const lgRate = lgStats && lgStats.totalMatches > 0
                ? lgStats.homeWins / lgStats.totalMatches
                : null;
            const lgHomeWinRate = lgRate != null ? (lgRate * 100).toFixed(1) + '%' : '-';

            // 预测：欧赔隐含概率 + 联赛历史主胜率先验 + 位置热度一致性
            const { pred, conf, prob: p } = predictResult(prob, {
                lgHomeWinRate: lgRate,
                histMaxKey: heatInfo ? heatInfo.maxKey : null,
                histRisk
            });

            return {
                position: pos,
                league: m.leageName,
                home: m.hostName,
                away: m.guestName,
                europeSp: m.europeSp,
                gameTime: m.gameStartDate,
                pred,          // 3=主胜 1=平 0=客胜
                predLabel: { 3: '主胜', 1: '平局', 0: '客胜' }[pred],
                confidence: conf != null ? +(conf * 100).toFixed(1) : null,
                homeProb: p ? +(p.home * 100).toFixed(1) : null,
                drawProb: p ? +(p.draw * 100).toFixed(1) : null,
                awayProb: p ? +(p.away * 100).toFixed(1) : null,
                histRisk,
                leagueHomeWinRate: lgHomeWinRate
            };
        });

        // 判定风险场次：信心度低（<10%）或历史位置高风险
        const riskMatches = rows.filter(r => {
            if (r.confidence == null) return false;
            const lowConf = r.confidence < 10;
            const histHigh = r.histRisk === '🔴高' || r.histRisk === '⚠平局陷阱';
            return lowConf || histHigh;
        }).map(r => {
            // 风险分级：<5 极高 / <10 高 / <15 中
            let riskLevel = '中';
            if (r.confidence < 5) riskLevel = '极高';
            else if (r.confidence < 10) riskLevel = '高';
            return {
                position: r.position, league: r.league, home: r.home, away: r.away,
                confidence: r.confidence, predLabel: r.predLabel, riskLevel
            };
        });

        // 汇总胜平负分布
        const dist = { win: 0, draw: 0, lose: 0 };
        rows.forEach(r => { if (r.pred === 3) dist.win++; else if (r.pred === 1) dist.draw++; else if (r.pred === 0) dist.lose++; });

        const forecast = {
            issue,
            generatedAt: new Date().toISOString(),
            saleEndTime: matches[0].lotteryEndDate || '',
            matches: rows,
            distribution: dist,
            riskMatches: riskMatches.map(r => ({ position: r.position, league: r.league, home: r.home, away: r.away, confidence: r.confidence, predLabel: r.predLabel, riskLevel: r.riskLevel })),
            riskCount: riskMatches.length
        };
        forecasts.push(forecast);

        // 打印结果
        console.log(`\n  第 ${issue} 期预测评估`);
        console.log(`  胜平负分布: 主胜${dist.win} 平局${dist.draw} 客胜${dist.lose}`);
        console.log(`  风险场次 ${riskMatches.length} 场:`);
        for (const r of riskMatches) {
            console.log(`    第${r.position}场 ${r.league} ${r.home}vs${r.away} [信心${r.confidence}%] ${r.predLabel}`);
        }
        console.log(`\n  完整预测:`);
        for (const r of rows) {
            const probStr = `主${r.homeProb}%/平${r.drawProb}%/客${r.awayProb}%`;
            console.log(`    第${String(r.position).padStart(2)}场 ${r.league.padEnd(6)} ${r.home} vs ${r.away} → ${r.predLabel} (信心${r.confidence}%) [${probStr}]`);
        }
    }

    // 保存预测结果（合并到已有 forecast.json）
    let existing = [];
    try { existing = JSON.parse(fs.readFileSync(FORECAST_PATH, 'utf8')); } catch (_) {}
    const existingIssues = new Set(existing.map(f => f.issue));
    for (const f of forecasts) {
        if (existingIssues.has(f.issue)) {
            existing = existing.map(x => x.issue === f.issue ? f : x);
        } else {
            existing.push(f);
        }
    }
    existing.sort((a, b) => b.issue.localeCompare(a.issue));
    fs.writeFileSync(FORECAST_PATH, JSON.stringify(existing, null, 2), 'utf8');
    console.log(`\n💾 已保存预测到 forecast.json（共 ${existing.length} 期）`);

    // 注入 dashboard_data.json
    try {
        const DASHBOARD_DATA_PATH = path.join(DATA_DIR, 'dashboard_data.json');
        const dashboard = JSON.parse(fs.readFileSync(DASHBOARD_DATA_PATH, 'utf8'));
        dashboard.forecastList = existing;
        fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboard, null, 2), 'utf8');
        console.log('💾 已注入 forecastList 到 dashboard_data.json');
    } catch (e) {
        console.log('⚠ 注入 dashboard 失败:', e.message);
    }

    // 重建内嵌版仪表盘
    try {
        const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
        const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
        const DASHBOARD_STANDALONE_PATH = path.join(DASHBOARD_DIR, 'index_standalone.html');
        if (fs.existsSync(DASHBOARD_HTML_PATH)) {
            const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
            const dashboard = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dashboard_data.json'), 'utf8'));
            const placeholder = "window.INLINE_DATA = (typeof __DASHBOARD_DATA__ !== 'undefined') ? __DASHBOARD_DATA__ : null;";
            if (html.includes(placeholder)) {
                const replaced = html.split(placeholder).join('window.INLINE_DATA = ' + JSON.stringify(dashboard) + ';');
                fs.writeFileSync(DASHBOARD_STANDALONE_PATH, replaced, 'utf8');
                console.log('💾 已重建 index_standalone.html');
            }
        }
    } catch (e) {
        console.log('⚠ 重建仪表盘失败:', e.message);
    }
}

main().catch(e => {
    console.error('❌ forecast_match.js 执行异常: ' + e.message);
    process.exit(1);
});
