#!/usr/bin/env node
// ============================================================
// 足彩14场胜负彩 自动化分析编排脚本 v1.0
// 功能: 数据拉取 → 增量合并 → 比赛详情表 → 联赛球队统计
//       → 引擎分析 → 报告生成 → 仪表盘数据更新
// 数据来源: 国家体育总局体育彩票管理中心 sporttery.cn (gameNo=90)
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const common = require(path.join(__dirname, '..', '..', 'scripts', 'lottery-common.js'));

// ====== 路径常量 ======
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DRAWS_PATH = path.join(DATA_DIR, 'draws.json');
const MATCH_DETAILS_PATH = path.join(DATA_DIR, 'match_details.json');
const LEAGUE_TEAM_STATS_PATH = path.join(DATA_DIR, 'league_team_stats.json');
const PREDICTIONS_PATH = path.join(DATA_DIR, 'predictions.json');
const ANALYSIS_HISTORY_PATH = path.join(DATA_DIR, 'analysis_history.json');
const DASHBOARD_DATA_PATH = path.join(DATA_DIR, 'dashboard_data.json');
const REPORT_PATH = path.join(DATA_DIR, 'latest_report.md');
const ERROR_LOG_PATH = path.join(DATA_DIR, 'error.log');
const LAST_RUN_PATH = path.join(DATA_DIR, 'last_run.json');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
const DASHBOARD_STANDALONE_PATH = path.join(DASHBOARD_DIR, 'index_standalone.html');

// ====== 常量 ======
const MATCH_COUNT = 14;

const THRESHOLDS = {
    hotpot: { minPrize1Count: 100, maxPrize1Amount: 100000 },
    coldDraw: { maxPrize1Count: 5 },
    position: { hot: 0.60, cold: 0.15, dispersed: 0.25 },
    risk: { low: 12, medium: 8, highDisperse: 5 },
    normalRange: {
        win:  { min: 5, max: 8 },
        draw: { min: 2, max: 5 },
        lose: { min: 3, max: 6 },
    },
};

// ====== 工具函数 ======
function pad(n, len) { return String(n).padStart(len || 2, ' '); }
function fmtMoney(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(0) + '万';
    return n.toLocaleString();
}

function resultLabel(r) {
    if (r === 3 || r === '3') return '主胜';
    if (r === 1 || r === '1') return '平局';
    if (r === 0 || r === '0') return '客胜';
    if (r === '*' || r === '*') return '延期';
    return String(r);
}

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${ts}] ${msg}`);
}

function logError(msg, err) {
    const ts = new Date().toISOString();
    const errMsg = `[${ts}] ERROR: ${msg}\n${err ? err.stack || err.message || err : ''}\n`;
    console.error(errMsg);
    try { fs.appendFileSync(ERROR_LOG_PATH, errMsg, 'utf8'); } catch (_) {}
}

function cv(values) {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

function entropy(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    return counts.filter(c => c > 0).reduce((sum, c) => {
        const p = c / total;
        return sum - p * Math.log(p) / Math.log(3);
    }, 0);
}

// ====== 配置加载 ======
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        logError('无法加载 config.json，使用默认配置', e);
        return {
            analysis: {
                issueCount: 30, windowSize: 20,
                apiUrl: 'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=90&provinceId=0&pageSize=30&isDetails=1&pageNo=1',
                retryCount: 3, retryDelayMs: 30000
            },
            paths: { dataDir: DATA_DIR }
        };
    }
}

// ====== 数据拉取 ======
async function fetchData(apiUrl, retryCount, retryDelayMs) {
    log('📡 正在从 sporttery.cn 拉取最新胜负彩开奖数据...');

    const data = await common.fetchJson(apiUrl, { retries: retryCount, retryDelayMs });

    if (!data || !data.value || !data.value.list) {
        throw new Error('API 返回数据格式异常');
    }

    const draws = data.value.list.map(d => {
                // 解析开奖结果 (14个空格分隔的结果)
                const results = (d.lotteryDrawResult || '').trim().split(/\s+/).map(r => {
                    const n = parseInt(r, 10);
                    return (n === 3 || n === 1 || n === 0) ? n : r; // 保留 * 号表示延期
                });

                // 解析销售金额 (去除千分位逗号)
                const totalSale = parseInt((d.totalSaleAmount || '0').replace(/,/g, ''), 10) || 0;

                // 解析奖项
                let prize1Count = 0, prize1Amount = 0;
                let prize2Count = 0, prize2Amount = 0;
                if (d.prizeLevelList && Array.isArray(d.prizeLevelList)) {
                    const p1 = d.prizeLevelList.find(p => p.prizeLevel === '一等奖');
                    if (p1) {
                        prize1Count = parseInt(p1.stakeCount || '0', 10);
                        prize1Amount = parseFloat((p1.stakeAmount || '0').replace(/,/g, ''));
                    }
                    const p2 = d.prizeLevelList.find(p => p.prizeLevel === '二等奖');
                    if (p2) {
                        prize2Count = parseInt(p2.stakeCount || '0', 10);
                        prize2Amount = parseFloat((p2.stakeAmount || '0').replace(/,/g, ''));
                    }
                }

                // 解析对阵详情
                const matches = (d.matchList || []).map(m => ({
                    matchNum: m.matchNum || 0,
                    league: m.matchName || '未知联赛',
                    home: m.masterTeamName || '未知',
                    away: m.guestTeamName || '未知',
                    result: m.result || '',
                    score: m.czScore || '',
                    startTime: m.startTime || ''
                }));

                return {
                    code: d.lotteryDrawNum || '',
                    results,
                    date: d.lotteryDrawTime || '',
                    totalSale,
                    prize1Count,
                    prize1Amount,
                    prize2Count,
                    prize2Amount,
                    matches
                };
            });

    log(`✅ 成功拉取 ${draws.length} 期数据`);
    return draws;
}

// ====== 增量合并 ======
function mergeDraws(existingDraws, newDraws) {
    const existingCodes = new Set(existingDraws.map(d => d.code));
    const freshEntries = newDraws.filter(d => !existingCodes.has(d.code));

    if (freshEntries.length === 0) {
        log('📭 无新期号数据，跳过合并');
        return { draws: existingDraws, newCount: 0, latestCode: existingDraws[0]?.code || null };
    }

    log(`📥 发现 ${freshEntries.length} 个新期号: ${freshEntries.map(d => d.code).join(', ')}`);
    const merged = [...freshEntries, ...existingDraws];
    // 按开奖时间倒序排列（日期相同按期号数字倒序）
    merged.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return common.toCodeNum(b.code) - common.toCodeNum(a.code);
    });

    return { draws: merged, newCount: freshEntries.length, latestCode: freshEntries[0].code };
}

// ====== 数据持久化 ======
function loadDraws() {
    try { if (fs.existsSync(DRAWS_PATH)) return JSON.parse(fs.readFileSync(DRAWS_PATH, 'utf8')); }
    catch (e) { logError('读取 draws.json 失败', e); }
    return [];
}

function saveDraws(draws) {
    fs.writeFileSync(DRAWS_PATH, JSON.stringify(draws, null, 2), 'utf8');
    log(`💾 已保存 ${draws.length} 期数据至 draws.json`);
}

function loadMatchDetails() {
    try { if (fs.existsSync(MATCH_DETAILS_PATH)) return JSON.parse(fs.readFileSync(MATCH_DETAILS_PATH, 'utf8')); }
    catch (_) {}
    return {};
}

function saveMatchDetails(details) {
    fs.writeFileSync(MATCH_DETAILS_PATH, JSON.stringify(details, null, 2), 'utf8');
    log(`💾 已更新比赛详情表 (${Object.keys(details).length} 期)`);
}

function loadLeagueTeamStats() {
    try { if (fs.existsSync(LEAGUE_TEAM_STATS_PATH)) return JSON.parse(fs.readFileSync(LEAGUE_TEAM_STATS_PATH, 'utf8')); }
    catch (_) {}
    return { leagues: {}, teams: {} };
}

function saveLeagueTeamStats(stats) {
    fs.writeFileSync(LEAGUE_TEAM_STATS_PATH, JSON.stringify(stats, null, 2), 'utf8');
    const leagueCount = Object.keys(stats.leagues).length;
    const teamCount = Object.keys(stats.teams).length;
    log(`💾 已更新联赛球队统计 (${leagueCount} 个联赛, ${teamCount} 支球队)`);
}

function loadPredictions() {
    try { if (fs.existsSync(PREDICTIONS_PATH)) return JSON.parse(fs.readFileSync(PREDICTIONS_PATH, 'utf8')); }
    catch (_) {}
    return [];
}

function savePredictions(predictions) {
    fs.writeFileSync(PREDICTIONS_PATH, JSON.stringify(predictions, null, 2), 'utf8');
}

function loadAnalysisHistory() {
    try { if (fs.existsSync(ANALYSIS_HISTORY_PATH)) return JSON.parse(fs.readFileSync(ANALYSIS_HISTORY_PATH, 'utf8')); }
    catch (_) {}
    return [];
}

function saveAnalysisHistory(history) {
    fs.writeFileSync(ANALYSIS_HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// ====== 比赛详情表 & 联赛球队统计 ======
function updateMatchDetailsAndStats(existingDetails, existingStats, newDraws) {
    const details = { ...existingDetails };
    const stats = {
        leagues: { ...existingStats.leagues },
        teams: { ...existingStats.teams }
    };

    for (const draw of newDraws) {
        if (!draw.matches || draw.matches.length === 0) continue;

        // 比赛详情表：按期号存储
        details[draw.code] = {
            date: draw.date,
            totalSale: draw.totalSale,
            prize1Count: draw.prize1Count,
            prize1Amount: draw.prize1Amount,
            prize2Count: draw.prize2Count,
            prize2Amount: draw.prize2Amount,
            matches: draw.matches.map((m, idx) => ({
                matchNum: m.matchNum || (idx + 1),
                league: m.league,
                home: m.home,
                away: m.away,
                result: draw.results[idx] !== undefined ? draw.results[idx] : m.result,
                resultLabel: resultLabel(draw.results[idx]),
                score: m.score,
                startTime: m.startTime
            }))
        };

        // 联赛&球队统计
        for (let i = 0; i < draw.matches.length; i++) {
            const m = draw.matches[i];
            const r = draw.results[i];
            if (!m.league || m.league === '未知联赛') continue;

            // 联赛统计
            if (!stats.leagues[m.league]) {
                stats.leagues[m.league] = { totalMatches: 0, homeWins: 0, draws: 0, awayWins: 0, appearances: 0 };
            }
            const leagueStat = stats.leagues[m.league];
            leagueStat.totalMatches++;
            leagueStat.appearances++;
            if (r === 3 || r === '3') leagueStat.homeWins++;
            else if (r === 1 || r === '1') leagueStat.draws++;
            else if (r === 0 || r === '0') leagueStat.awayWins++;

            // 主队统计
            if (m.home && m.home !== '未知') {
                if (!stats.teams[m.home]) {
                    stats.teams[m.home] = { totalMatches: 0, wins: 0, draws: 0, losses: 0, asHome: 0, asAway: 0, leagues: {} };
                }
                const homeTeam = stats.teams[m.home];
                homeTeam.totalMatches++;
                homeTeam.asHome++;
                if (!homeTeam.leagues[m.league]) homeTeam.leagues[m.league] = { appearances: 0, wins: 0, draws: 0, losses: 0 };
                homeTeam.leagues[m.league].appearances++;
                if (r === 3 || r === '3') { homeTeam.wins++; homeTeam.leagues[m.league].wins++; }
                else if (r === 1 || r === '1') { homeTeam.draws++; homeTeam.leagues[m.league].draws++; }
                else if (r === 0 || r === '0') { homeTeam.losses++; homeTeam.leagues[m.league].losses++; }
            }

            // 客队统计
            if (m.away && m.away !== '未知') {
                if (!stats.teams[m.away]) {
                    stats.teams[m.away] = { totalMatches: 0, wins: 0, draws: 0, losses: 0, asHome: 0, asAway: 0, leagues: {} };
                }
                const awayTeam = stats.teams[m.away];
                awayTeam.totalMatches++;
                awayTeam.asAway++;
                if (!awayTeam.leagues[m.league]) awayTeam.leagues[m.league] = { appearances: 0, wins: 0, draws: 0, losses: 0 };
                awayTeam.leagues[m.league].appearances++;
                if (r === 0 || r === '0') { awayTeam.wins++; awayTeam.leagues[m.league].wins++; }
                else if (r === 1 || r === '1') { awayTeam.draws++; awayTeam.leagues[m.league].draws++; }
                else if (r === 3 || r === '3') { awayTeam.losses++; awayTeam.leagues[m.league].losses++; }
            }
        }
    }

    return { details, stats };
}

// ============================================================
// 分析引擎（内嵌 sfc_analyzer.js 核心逻辑）
// ============================================================

// 1. 胜平负分布统计
function analyzeDistribution(draws) {
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
function analyzePositionHeat(draws) {
    const heat = [];
    for (let pos = 0; pos < MATCH_COUNT; pos++) {
        const counts = { win: 0, draw: 0, lose: 0, star: 0 };
        for (const d of draws) {
            const r = d.results[pos];
            if (r === undefined || r === null) { counts.star++; continue; }
            if (r === 3 || r === '3') counts.win++;
            else if (r === 1 || r === '1') counts.draw++;
            else if (r === 0 || r === '0') counts.lose++;
            else counts.star++;
        }
        const total = counts.win + counts.draw + counts.lose;
        const ent = entropy([counts.win, counts.draw, counts.lose]);

        let maxKey = 'win', maxVal = counts.win;
        if (counts.draw > maxVal) { maxKey = 'draw'; maxVal = counts.draw; }
        if (counts.lose > maxVal) { maxKey = 'lose'; maxVal = counts.lose; }
        let minKey = 'win', minVal = counts.win;
        if (counts.draw < minVal) { minKey = 'draw'; minVal = counts.draw; }
        if (counts.lose < minVal) { minKey = 'lose'; minVal = counts.lose; }

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
            counts, total, ent,
            maxKey, maxVal, minKey, minVal,
            risk, riskLabel,
            // 附加：最新一期的该位置对阵信息
            latestMatch: draws[0].matches && draws[0].matches[pos]
                ? { league: draws[0].matches[pos].league, home: draws[0].matches[pos].home, away: draws[0].matches[pos].away }
                : null
        });
    }
    return heat;
}

// 3. 奖金走势分析
function analyzePrizeTrend(draws) {
    const trend = [];
    const amounts = [];
    for (const d of draws) {
        const type = d.prize1Count === 0 ? '🥶无人中'
            : (d.prize1Count >= THRESHOLDS.hotpot.minPrize1Count && d.prize1Amount <= THRESHOLDS.hotpot.maxPrize1Amount) ? '🍲火锅奖'
            : d.prize1Count <= THRESHOLDS.coldDraw.maxPrize1Count ? '🧊冷门期'
            : '●正常';

        if (d.prize1Count > 0) amounts.push(d.prize1Amount);

        trend.push({
            code: d.code, date: d.date,
            prize1Count: d.prize1Count, prize1Amount: d.prize1Amount,
            prize2Count: d.prize2Count, prize2Amount: d.prize2Amount,
            totalSale: d.totalSale, type
        });
    }

    const prizeCV = amounts.length > 1 ? cv(amounts) : 0;
    const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;

    return { trend, prizeCV, avgAmount, validCount: amounts.length };
}

// 4. 难度综合评分
function calculateDifficulty(dist, heat, prizeTrend) {
    const MATCH_COUNT = 14;
    const avgDrawRate = dist.reduce((s, d) => s + d.counts.draw / MATCH_COUNT, 0) / dist.length;
    const drawScore = Math.min(1, avgDrawRate / 0.4) * 10;

    const cvScore = Math.min(1, prizeTrend.prizeCV / 2.0) * 10;

    const avgPrize1Count = prizeTrend.trend.reduce((s, t) => s + t.prize1Count, 0) / prizeTrend.trend.length;
    const hitScore = avgPrize1Count === 0 ? 10
        : Math.max(0, (1 - Math.log10(avgPrize1Count + 1) / Math.log10(1001))) * 10;

    const avgEnt = heat.reduce((s, h) => s + h.ent, 0) / heat.length;
    const entScore = avgEnt * 10;

    const totalScore = drawScore * 0.30 + cvScore * 0.25 + hitScore * 0.25 + entScore * 0.20;

    let level, levelLabel;
    if (totalScore <= 2.5) { level = 1; levelLabel = '🟢 低'; }
    else if (totalScore <= 4.5) { level = 2; levelLabel = '🟡 中低'; }
    else if (totalScore <= 6.0) { level = 3; levelLabel = '🟠 中等'; }
    else if (totalScore <= 7.5) { level = 4; levelLabel = '🔴 中高'; }
    else { level = 5; levelLabel = '💀 高难'; }

    return {
        drawScore, cvScore, hitScore, entScore,
        totalScore, level, levelLabel, avgDrawRate, avgEnt,
    };
}

// ====== 生成引擎文本输出（用于报告） ======
function generateEngineOutput(draws, dist, heat, prizeTrend, difficulty) {
    const lines = [];
    const WIDTH = 80;

    function hdr(title) { lines.push('\n' + '='.repeat(WIDTH)); lines.push(title); lines.push('='.repeat(WIDTH)); }
    function sub(title) { lines.push('\n' + '-'.repeat(WIDTH)); lines.push(title); lines.push('-'.repeat(WIDTH)); }

    // 一、开奖结果总览
    hdr('一、开奖结果总览（近' + draws.length + '期）');
    lines.push('');
    lines.push('  期号     日期         销售额         3/1/0分布                                      主胜  平局  客胜  特征');
    lines.push('  ' + '-'.repeat(77));

    for (const d of dist) {
        const idx = draws.findIndex(dd => dd.code === d.code);
        const sale = draws[idx].totalSale;
        const saleStr = sale > 0 ? (sale / 10000).toFixed(0) + '万' : 'N/A';
        const bar = '🟢'.repeat(d.counts.win) + '🟡'.repeat(d.counts.draw) + '🔴'.repeat(d.counts.lose);
        const features = d.anomalies.length > 0 ? d.anomalies.join(',') : '正常';
        lines.push(`  ${d.code}   ${d.date}   ${saleStr.padEnd(14)} ${bar.padEnd(50)} ${String(d.counts.win).padStart(4)} ${String(d.counts.draw).padStart(4)} ${String(d.counts.lose).padStart(4)}  ${features}`);
    }

    const avgWin = dist.reduce((s, d) => s + d.counts.win, 0) / dist.length;
    const avgDraw = dist.reduce((s, d) => s + d.counts.draw, 0) / dist.length;
    const avgLose = dist.reduce((s, d) => s + d.counts.lose, 0) / dist.length;
    lines.push(`\n  近${draws.length}期均值: 主胜 ${avgWin.toFixed(1)} | 平局 ${avgDraw.toFixed(1)} | 客胜 ${avgLose.toFixed(1)}`);

    // 二、位置热度
    hdr('二、胜平负分布 & 位置热度分析');
    lines.push('\n【整体胜平负趋势】');
    for (const d of dist) {
        const pct3 = (d.counts.win / 14 * 100).toFixed(0) + '%';
        const pct1 = (d.counts.draw / 14 * 100).toFixed(0) + '%';
        const pct0 = (d.counts.lose / 14 * 100).toFixed(0) + '%';
        const bar3 = '█'.repeat(Math.round(d.counts.win / 14 * 30));
        const bar1 = '█'.repeat(Math.round(d.counts.draw / 14 * 30));
        const bar0 = '█'.repeat(Math.round(d.counts.lose / 14 * 30));
        lines.push(`  ${d.code} 主胜${pct3.padStart(4)} ${bar3}`);
        lines.push(`        平局${pct1.padStart(4)} ${bar1}`);
        lines.push(`        客胜${pct0.padStart(4)} ${bar0}`);
        lines.push('');
    }

    lines.push('\n【14位置热度矩阵】（近' + draws.length + '期累计）');
    lines.push('');
    lines.push('  位置  主胜(3)    平局(1)    客胜(0)    最热     最冷    热度熵  风险  最新对阵');
    lines.push('  ' + '-'.repeat(80));

    for (const h of heat) {
        const pctW = h.total > 0 ? (h.counts.win / h.total * 100).toFixed(0) + '%' : 'N/A';
        const pctD = h.total > 0 ? (h.counts.draw / h.total * 100).toFixed(0) + '%' : 'N/A';
        const pctL = h.total > 0 ? (h.counts.lose / h.total * 100).toFixed(0) + '%' : 'N/A';
        const maxLabel = { win: '主胜', draw: '平局', lose: '客胜' }[h.maxKey];
        const minLabel = { win: '主胜', draw: '平局', lose: '客胜' }[h.minKey];
        const latestInfo = h.latestMatch ? ` ${h.latestMatch.home}vs${h.latestMatch.away}` : '';

        lines.push(`  第${String(h.position).padStart(2)}场  ${String(h.counts.win).padStart(3)}(${pctW.padStart(4)})  ${String(h.counts.draw).padStart(3)}(${pctD.padStart(4)})  ${String(h.counts.lose).padStart(3)}(${pctL.padStart(4)})  ${maxLabel.padEnd(7)} ${minLabel.padEnd(7)} ${h.ent.toFixed(2).padStart(6)}  ${h.riskLabel}${latestInfo}`);
    }

    const riskyPositions = heat.filter(h => h.risk === 'high' || h.risk === 'medium_draw');
    if (riskyPositions.length > 0) {
        lines.push(`\n  ⚠ 高风险位置 (共${riskyPositions.length}个):`);
        for (const h of riskyPositions) {
            lines.push(`     第${h.position}场: 主胜${h.counts.win}次/平局${h.counts.draw}次/客胜${h.counts.lose}次 (${h.riskLabel})`);
        }
    }

    // 三、奖金冷热度
    hdr('三、奖金冷热度分析');
    lines.push('');
    lines.push('  期号     日期         销售额        一等奖(注/元)         二等奖(注/元)         类型');
    lines.push('  ' + '-'.repeat(77));

    for (const t of prizeTrend.trend) {
        const saleStr = t.totalSale > 0 ? (t.totalSale / 10000).toFixed(0) + '万' : 'N/A';
        const p1Str = t.prize1Count + '注/' + fmtMoney(t.prize1Amount);
        const p2Str = t.prize2Count + '注/' + fmtMoney(t.prize2Amount);
        lines.push(`  ${t.code}   ${t.date}   ${saleStr.padEnd(12)} ${p1Str.padEnd(21)} ${p2Str.padEnd(21)} ${t.type}`);
    }

    const hotpotCount = prizeTrend.trend.filter(t => t.type === '🍲火锅奖').length;
    const coldCount = prizeTrend.trend.filter(t => t.type === '🧊冷门期' || t.type === '🥶无人中').length;
    const zeroCount = prizeTrend.trend.filter(t => t.type === '🥶无人中').length;

    lines.push(`\n  奖金波动指数(CV): ${prizeTrend.prizeCV.toFixed(2)}`);
    lines.push(`  火锅奖期数: ${hotpotCount}/${draws.length}  |  冷门期数: ${coldCount}/${draws.length}  |  无人中期数: ${zeroCount}/${draws.length}`);

    // 四、难度评估
    hdr('四、难度综合评估');
    lines.push('\n  评估维度          权重    得分(满分10)  说明');
    lines.push('  ' + '-'.repeat(60));
    lines.push(`  平局因子          30%     ${difficulty.drawScore.toFixed(1).padStart(4)}       近20期平均平局率: ${(difficulty.avgDrawRate * 100).toFixed(1)}%`);
    lines.push(`  奖金波动          25%     ${difficulty.cvScore.toFixed(1).padStart(4)}       一等奖奖金CV: ${prizeTrend.prizeCV.toFixed(2)}`);
    lines.push(`  命中难度          25%     ${difficulty.hitScore.toFixed(1).padStart(4)}       参考历史一等奖分布`);
    lines.push(`  结果分散度        20%     ${difficulty.entScore.toFixed(1).padStart(4)}       14位置平均信息熵: ${difficulty.avgEnt.toFixed(2)}`);
    lines.push('  ' + '-'.repeat(60));
    lines.push(`  综合难度评分              ${difficulty.totalScore.toFixed(1).padStart(4)}       ${difficulty.levelLabel}`);

    // 走势研判
    const recentTypes = prizeTrend.trend.slice(0, 5).map(t => t.type);
    const recentPattern = recentTypes.filter(t => t === '🧊冷门期' || t === '🥶无人中').length;
    lines.push('\n  近期走势:');
    lines.push(`    近5期类型: ${recentTypes.join(' → ')}`);
    if (recentPattern >= 3) {
        lines.push('    ⚠ 近期冷门频发，难度偏高，注意防冷');
    } else if (recentPattern === 0) {
        lines.push('    📊 近期以正路为主，难度偏低');
    } else {
        lines.push('    📊 冷热交替，属正常波动');
    }

    // 五、评估结论
    hdr('五、评估结论 & 参考建议');
    lines.push('\n【趋势特征】');
    lines.push(`  整体难度: ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10)`);
    lines.push(`  平均平局率: ${(difficulty.avgDrawRate * 100).toFixed(1)}% (正常范围 14-36%)`);
    lines.push(`  奖金稳定度: ${prizeTrend.prizeCV < 0.5 ? '较稳定' : prizeTrend.prizeCV < 1.0 ? '中等波动' : '波动较大'}`);

    lines.push('\n【高风险场次位置】');
    if (riskyPositions.length > 0) {
        for (const h of riskyPositions) {
            const matchInfo = h.latestMatch
                ? ` (最新: ${h.latestMatch.home} vs ${h.latestMatch.away})`
                : '';
            lines.push(`  第${h.position}场: 主胜${h.counts.win}/平局${h.counts.draw}/客胜${h.counts.lose}${matchInfo} → ${h.riskLabel}`);
            if (h.risk === 'medium_draw') {
                lines.push(`    ↳ 平局概率偏高，建议重点关注防平`);
            } else {
                lines.push(`    ↳ 三种结果分布均匀，建议复选覆盖`);
            }
        }
    } else {
        lines.push('  当前无显著高风险位置，各位置结果倾向性较明显');
    }

    // 低风险位置
    const safePositions = heat.filter(h => h.maxVal >= THRESHOLDS.risk.low);
    lines.push('\n【高确定性场次位置】(倾向明确)');
    if (safePositions.length > 0) {
        for (const h of safePositions) {
            const maxLabel = { win: '主胜', draw: '平局', lose: '客胜' }[h.maxKey];
            const matchInfo = h.latestMatch
                ? ` (最新: ${h.latestMatch.home} vs ${h.latestMatch.away})`
                : '';
            lines.push(`  第${h.position}场: ${maxLabel}占${(h.maxVal / h.total * 100).toFixed(0)}% (${h.maxVal}/${h.total})${matchInfo}`);
        }
    } else {
        lines.push('  当前无超高确定性位置');
    }

    // 汇总
    lines.push(`\n${'='.repeat(WIDTH)}`);
    lines.push('                          评估汇总报告');
    lines.push(`${'='.repeat(WIDTH)}`);
    lines.push('');
    lines.push(`  数据基础:    近 ${draws.length} 期 (${draws[draws.length - 1].code} ~ ${draws[0].code})`);
    lines.push(`  数据来源:    国家体育总局体育彩票管理中心 sporttery.cn`);
    lines.push(`  难度等级:    ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10)`);
    lines.push(`  高风险位置:  ${riskyPositions.length} 个 | 低风险位置: ${safePositions.length} 个`);
    lines.push(`  奖金波动:    CV=${prizeTrend.prizeCV.toFixed(2)} | 火锅奖${hotpotCount}期 | 冷门${coldCount}期`);
    lines.push(`  平局率:      ${(difficulty.avgDrawRate * 100).toFixed(1)}% (近${draws.length}期均值)`);
    lines.push('');
    lines.push('  注意事项:');
    lines.push('    1. 以上分析仅为历史开奖数据统计，不代表未来趋势');
    lines.push('    2. 各场次对阵球队每期不同，位置热度仅反映统计规律');
    lines.push('    3. 足球比赛结果受球队状态、伤病、天气等多因素影响');
    lines.push('    4. 本报告用于数据参考，不作为投注依据');
    lines.push('');
    lines.push('  ⚠ 历史统计推演，不构成投注建议。足球赛果为独立事件。');
    lines.push('     统计规律不代表预测能力。请理性购彩，量力而行。');
    lines.push('='.repeat(WIDTH));

    return lines.join('\n');
}

// ====== 联赛球队统计报告 ======
function generateLeagueTeamReport(stats, draws) {
    const lines = [];
    const WIDTH = 80;

    lines.push('\n' + '='.repeat(WIDTH));
    lines.push('六、联赛 & 球队统计');
    lines.push('='.repeat(WIDTH));

    // 联赛统计
    lines.push('\n【各联赛历史表现】（按出赛场次排序）');
    lines.push('');
    lines.push('  联赛               场次    主胜        平局        客胜        主胜率');
    lines.push('  ' + '-'.repeat(70));

    const leagueEntries = Object.entries(stats.leagues)
        .sort((a, b) => b[1].appearances - a[1].appearances);

    for (const [name, s] of leagueEntries) {
        const homeRate = s.totalMatches > 0 ? (s.homeWins / s.totalMatches * 100).toFixed(1) + '%' : 'N/A';
        lines.push(`  ${name.padEnd(20)} ${String(s.totalMatches).padStart(4)}   ${String(s.homeWins).padStart(4)}       ${String(s.draws).padStart(4)}       ${String(s.awayWins).padStart(4)}       ${homeRate}`);
    }

    // 球队统计 - 按出赛次数排序的前30支
    lines.push('\n【各球队历史表现】（按出赛场次排序，前30支）');
    lines.push('');
    lines.push('  球队               场次    胜        平        负        胜率      主/客');
    lines.push('  ' + '-'.repeat(75));

    const teamEntries = Object.entries(stats.teams)
        .sort((a, b) => b[1].totalMatches - a[1].totalMatches)
        .slice(0, 30);

    for (const [name, t] of teamEntries) {
        const winRate = t.totalMatches > 0 ? (t.wins / t.totalMatches * 100).toFixed(1) + '%' : 'N/A';
        const homeAway = `${t.asHome}主/${t.asAway}客`;
        lines.push(`  ${name.padEnd(20)} ${String(t.totalMatches).padStart(4)}   ${String(t.wins).padStart(4)}      ${String(t.draws).padStart(4)}      ${String(t.losses).padStart(4)}      ${(winRate + '').padStart(6)}     ${homeAway}`);
    }

    return lines.join('\n');
}

// ====== 生成 Markdown 报告 ======
function generateMarkdownReport(draws, dist, heat, prizeTrend, difficulty, engineOutput, leagueTeamStats) {
    const latest = draws[0];
    const lines = [];

    lines.push('# ⚽ 足彩14场胜负彩分析报告');
    lines.push('');
    lines.push(`> 📅 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    lines.push(`> 📊 数据范围: 第 ${draws[draws.length - 1].code} 期 ~ 第 ${draws[0].code} 期 (共 ${draws.length} 期)`);
    lines.push(`> 🏟 最新开奖: 第 ${latest.code} 期 (${latest.date})`);
    lines.push(`> 🏆 一等奖: ${latest.prize1Count}注 / ${fmtMoney(latest.prize1Amount)}元`);
    lines.push(`> 💰 销售总额: ${fmtMoney(latest.totalSale)}元`);
    lines.push('');

    // 最新一期14场赛果矩阵
    lines.push('## 📋 最新一期14场赛果矩阵');
    lines.push('');
    lines.push('| 场次 | 联赛 | 主队 | vs | 客队 | 赛果 | 比分 |');
    lines.push('|------|------|------|----|------|------|------|');
    if (latest.matches && latest.matches.length > 0) {
        for (let i = 0; i < Math.min(latest.matches.length, 14); i++) {
            const m = latest.matches[i];
            const r = latest.results[i] !== undefined ? latest.results[i] : '';
            const rIcon = r === 3 ? '🏠胜' : r === 1 ? '🤝平' : r === 0 ? '✈️负' : r;
            lines.push(`| ${i + 1} | ${m.league} | ${m.home} | vs | ${m.away} | ${rIcon} | ${m.score} |`);
        }
    } else {
        // 无matchList时只展示赛果
        lines.push(`| 赛果序列 | ${latest.results.map(r => resultLabel(r)).join(' | ')} |`);
    }
    lines.push('');

    // 快速指标
    const latestDist = dist[0];
    if (latestDist) {
        lines.push(`**本期 3/1/0 分布**: 主胜 ${latestDist.counts.win} | 平局 ${latestDist.counts.draw} | 客胜 ${latestDist.counts.lose}`);

        const prizeType = prizeTrend.trend[0] ? prizeTrend.trend[0].type : '';
        lines.push(`**难度标签**: ${difficulty.levelLabel} | ${prizeType}`);
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // 联赛球队统计
    lines.push('## 📊 联赛 & 球队统计概览');
    lines.push('');

    const leagueEntries = Object.entries(leagueTeamStats.leagues)
        .sort((a, b) => b[1].appearances - a[1].appearances)
        .slice(0, 10);

    lines.push('### 主要联赛表现（前10）');
    lines.push('');
    lines.push('| 联赛 | 场次 | 主胜 | 平局 | 客胜 | 主胜率 |');
    lines.push('|------|------|------|------|------|--------|');
    for (const [name, s] of leagueEntries) {
        const homeRate = s.totalMatches > 0 ? (s.homeWins / s.totalMatches * 100).toFixed(1) + '%' : 'N/A';
        lines.push(`| ${name} | ${s.totalMatches} | ${s.homeWins} | ${s.draws} | ${s.awayWins} | ${homeRate} |`);
    }
    lines.push('');

    const teamEntries = Object.entries(leagueTeamStats.teams)
        .sort((a, b) => b[1].totalMatches - a[1].totalMatches)
        .slice(0, 15);

    lines.push('### 高频球队（前15）');
    lines.push('');
    lines.push('| 球队 | 场次 | 胜 | 平 | 负 | 胜率 | 主/客 |');
    lines.push('|------|------|----|----|----|------|-------|');
    for (const [name, t] of teamEntries) {
        const winRate = t.totalMatches > 0 ? (t.wins / t.totalMatches * 100).toFixed(1) + '%' : 'N/A';
        lines.push(`| ${name} | ${t.totalMatches} | ${t.wins} | ${t.draws} | ${t.losses} | ${winRate} | ${t.asHome}主/${t.asAway}客 |`);
    }
    lines.push('');

    lines.push('---');
    lines.push('');

    // 完整引擎输出
    lines.push('## 📈 完整分析引擎输出');
    lines.push('');
    lines.push('```');
    lines.push(engineOutput.slice(-15000)); // 最多 15000 字符
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('> ⚠️ **免责声明**: 以上为历史开奖数据统计推演，不构成任何投注建议。');
    lines.push('> 足球比赛结果为独立事件，历史统计规律不代表未来走势。请理性购彩，量力而行。');

    return lines.join('\n');
}

// ====== 生成仪表盘数据 ======
function generateDashboardData(draws, windowSize, dist, heat, prizeTrend, difficulty, matchDetails, leagueTeamStats) {
    const analysisWindow = draws.slice(0, windowSize);

    // 计算平均分布
    const avgWin = dist.length > 0 ? dist.reduce((s, d) => s + d.counts.win, 0) / dist.length : 0;
    const avgDraw = dist.length > 0 ? dist.reduce((s, d) => s + d.counts.draw, 0) / dist.length : 0;
    const avgLose = dist.length > 0 ? dist.reduce((s, d) => s + d.counts.lose, 0) / dist.length : 0;

    // 胜平负分布 (用于图表)
    const distributionTrend = dist.map(d => ({
        code: d.code,
        date: d.date,
        win: d.counts.win,
        draw: d.counts.draw,
        lose: d.counts.lose,
        winPct: (d.counts.win / 14 * 100),
        drawPct: (d.counts.draw / 14 * 100),
        losePct: (d.counts.lose / 14 * 100),
        anomalies: d.anomalies
    }));

    // 奖金走势 (用于图表)
    const prizeTrendArray = prizeTrend.trend.map(t => ({
        code: t.code,
        date: t.date,
        prize1Count: t.prize1Count,
        prize1Amount: t.prize1Amount,
        prize2Amount: t.prize2Amount,
        totalSale: t.totalSale,
        type: t.type
    }));

    // 位置热度 (用于热力图)
    const positionHeat = heat.map(h => ({
        position: h.position,
        winPct: h.total > 0 ? (h.counts.win / h.total * 100) : 0,
        drawPct: h.total > 0 ? (h.counts.draw / h.total * 100) : 0,
        losePct: h.total > 0 ? (h.counts.lose / h.total * 100) : 0,
        maxKey: h.maxKey,
        maxVal: h.maxVal,
        ent: h.ent,
        risk: h.risk,
        riskLabel: h.riskLabel,
        latestMatch: h.latestMatch
    }));

    // 难度历史 (按分析历史记录)
    const difficultyHistory = [{
        date: new Date().toISOString(),
        totalScore: difficulty.totalScore,
        level: difficulty.level,
        levelLabel: difficulty.levelLabel,
        avgDrawRate: difficulty.avgDrawRate,
        prizeCV: prizeTrend.prizeCV
    }];

    // 火锅/冷门计数
    const hotpotCount = prizeTrend.trend.filter(t => t.type === '🍲火锅奖').length;
    const coldCount = prizeTrend.trend.filter(t => t.type === '🧊冷门期' || t.type === '🥶无人中').length;
    const zeroCount = prizeTrend.trend.filter(t => t.type === '🥶无人中').length;

    // 比赛详情 (最近5期)
    const recentMatches = {};
    draws.slice(0, 5).forEach(d => {
        recentMatches[d.code] = matchDetails[d.code] || {
            date: d.date,
            matches: d.matches.map((m, idx) => ({
                matchNum: m.matchNum || (idx + 1),
                league: m.league,
                home: m.home,
                away: m.away,
                result: d.results[idx],
                resultLabel: resultLabel(d.results[idx]),
                score: m.score
            }))
        };
    });

    // 联赛汇总 (用于饼图/柱状图)
    const leagueSummary = Object.entries(leagueTeamStats.leagues)
        .sort((a, b) => b[1].appearances - a[1].appearances)
        .map(([name, s]) => ({
            name,
            appearances: s.appearances,
            totalMatches: s.totalMatches,
            homeWins: s.homeWins,
            draws: s.draws,
            awayWins: s.awayWins,
            homeWinRate: s.totalMatches > 0 ? (s.homeWins / s.totalMatches * 100) : 0
        }));

    // 球队汇总
    const teamSummary = Object.entries(leagueTeamStats.teams)
        .sort((a, b) => b[1].totalMatches - a[1].totalMatches)
        .slice(0, 50)
        .map(([name, t]) => ({
            name,
            totalMatches: t.totalMatches,
            wins: t.wins,
            draws: t.draws,
            losses: t.losses,
            winRate: t.totalMatches > 0 ? (t.wins / t.totalMatches * 100) : 0,
            asHome: t.asHome,
            asAway: t.asAway,
            leagues: Object.entries(t.leagues).sort((a, b) => b[1].appearances - a[1].appearances)
        }));

    // 往期评估记录（供前端切换查看各期评估）
    // 结构：当前期（最新）置于最前，其后按时间倒序排列往期
    const curRisky = heat.filter(h => h.risk === 'high' || h.risk === 'medium_draw')
        .map(h => ({ position: h.position, risk: h.risk, riskLabel: h.riskLabel, match: h.latestMatch }));
    const curSafe = heat.filter(h => h.maxVal >= THRESHOLDS.risk.low)
        .map(h => ({ position: h.position, maxKey: h.maxKey, maxVal: h.maxVal, match: h.latestMatch }));

    const pastPredictions = loadPredictions();
    const historyEvaluations = [
        // 当前期（最新）
        {
            issue: draws[0].code,
            date: draws[0].date,
            generatedAt: new Date().toISOString(),
            difficulty: {
                totalScore: difficulty.totalScore,
                level: difficulty.level,
                levelLabel: difficulty.levelLabel,
                drawScore: difficulty.drawScore,
                cvScore: difficulty.cvScore,
                hitScore: difficulty.hitScore,
                entScore: difficulty.entScore,
                avgDrawRate: difficulty.avgDrawRate,
                avgEnt: difficulty.avgEnt
            },
            prizeCV: prizeTrend.prizeCV,
            recent5Types: prizeTrend.trend.slice(0, 5).map(t => t.type),
            riskyPositions: curRisky,
            safePositions: curSafe
        },
        // 往期（倒序，排除与当前期重复的记录）
        ...pastPredictions.slice().reverse()
            .filter(p => p.forIssue !== draws[0].code)
            .map(p => ({
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
        }))
    ];

    return {
        generatedAt: new Date().toISOString(),
        gameType: '足彩14场胜负彩',
        dataRange: {
            totalDraws: draws.length,
            windowSize,
            earliestIssue: draws[draws.length - 1]?.code || '',
            latestIssue: draws[0]?.code || '',
            latestDate: draws[0]?.date || ''
        },
        latestDraw: draws[0] || null,
        distributionTrend,
        prizeTrend: prizeTrendArray,
        positionHeat,
        difficulty: {
            ...difficulty,
            history: difficultyHistory
        },
        summary: {
            hotpotCount, coldCount, zeroCount,
            totalPeriods: draws.length,
            avgWin, avgDraw, avgLose,
            prizeCV: prizeTrend.prizeCV,
            avgPrize1Amount: prizeTrend.avgAmount
        },
        recentMatches,
        leagueSummary,
        teamSummary,
        historyEvaluations,
        riskyPositions: heat.filter(h => h.risk === 'high' || h.risk === 'medium_draw'),
        safePositions: heat.filter(h => h.maxVal >= THRESHOLDS.risk.low)
    };
}

// ====== 生成内嵌数据版仪表盘 ======
// 原 index.html 通过 fetch('../data/dashboard_data.json') 加载数据，
// 但在 file:// 协议下双击打开会被浏览器 CORS 策略拦截导致空白。
// 此函数将 dashboard_data.json 内容内嵌进 HTML，生成可直接双击打开的单文件版。
function generateStandaloneDashboard(dashboardData) {
    if (!fs.existsSync(DASHBOARD_HTML_PATH)) {
        log('⚠ 未找到仪表盘模板 index.html，跳过内嵌版生成');
        return;
    }
    const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
    const dataJson = JSON.stringify(dashboardData);

    // 替换 INLINE_DATA 占位符为内嵌数据（file:// 双击打开无需 fetch）
    const placeholder = "window.INLINE_DATA = (typeof __DASHBOARD_DATA__ !== 'undefined') ? __DASHBOARD_DATA__ : null;";

    if (!html.includes(placeholder)) {
        log('⚠ 仪表盘模板中未找到 INLINE_DATA 占位符，跳过内嵌版生成');
        return;
    }

    const replaced = html.split(placeholder).join('window.INLINE_DATA = ' + dataJson + ';');
    fs.writeFileSync(DASHBOARD_STANDALONE_PATH, replaced, 'utf8');
    log('💾 已生成内嵌数据版仪表盘 index_standalone.html');
}

// ====== 运行状态 ======
function saveLastRun(extra) {
    const lastRun = { ranAt: new Date().toISOString(), ...extra };
    fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(lastRun, null, 2), 'utf8');
    log('💾 已写入 last_run.json (updated=' + lastRun.updated + ')');
}

// ====== 主流程 ======
async function main() {
    const config = loadConfig();
    const { analysis } = config;

    console.log('='.repeat(70));
    console.log('  足彩14场胜负彩 自动化分析引擎 v1.0');
    console.log('='.repeat(70));

    // Step 1: 拉取数据
    log('🔍 Step 1/6: 拉取原始数据...');
    const newDraws = await fetchData(analysis.apiUrl, analysis.retryCount, analysis.retryDelayMs);

    // Step 2: 增量合并
    log('📦 Step 2/6: 增量合并数据...');
    const existingDraws = loadDraws();
    const { draws, newCount } = mergeDraws(existingDraws, newDraws);

    // --force 参数：无新数据时也强制重新生成（用于结构升级/字段补充）
    const force = process.argv.includes('--force');
    if (newCount === 0 && !force) {
        log('✅ 数据已是最新，无需更新分析');
        saveLastRun({ latestCode: draws[0]?.code || null, latestDate: draws[0]?.date || null, newCount: 0, updated: false });
        console.log('='.repeat(70));
        return;
    }
    if (newCount === 0) {
        log('ℹ 无新数据，但已指定 --force，强制重新生成');
    }

    saveDraws(draws);

    // Step 3: 更新比赛详情表 & 联赛球队统计
    log('📊 Step 3/6: 更新比赛详情表 & 联赛球队统计...');
    const existingDetails = loadMatchDetails();
    const existingStats = loadLeagueTeamStats();
    const { details, stats } = updateMatchDetailsAndStats(existingDetails, existingStats, newDraws);
    saveMatchDetails(details);
    saveLeagueTeamStats(stats);

    // Step 4: 运行分析引擎
    log('⚙ Step 4/6: 运行分析引擎...');
    const analysisWindow = draws.slice(0, analysis.windowSize);
    const dist = analyzeDistribution(analysisWindow);
    const heat = analyzePositionHeat(analysisWindow);
    const prizeTrend = analyzePrizeTrend(analysisWindow);
    const difficulty = calculateDifficulty(dist, heat, prizeTrend);

    // 打印分析摘要
    console.log('\n' + '-'.repeat(60));
    console.log('  📊 分析摘要');
    console.log('-'.repeat(60));
    console.log(`  📅 最新开奖: 第 ${draws[0].code} 期 (${draws[0].date})`);
    console.log(`  🏆 一等奖: ${draws[0].prize1Count}注 / ${fmtMoney(draws[0].prize1Amount)}元`);
    console.log(`  💰 二等奖: ${draws[0].prize2Count}注 / ${fmtMoney(draws[0].prize2Amount)}元`);
    console.log(`  📊 销售额: ${fmtMoney(draws[0].totalSale)}元`);
    console.log(`  ⚖ 难度评级: ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10)`);
    console.log(`  📈 奖金CV: ${prizeTrend.prizeCV.toFixed(2)}`);
    console.log(`  ⚽ 平均平局率: ${(difficulty.avgDrawRate * 100).toFixed(1)}%`);
    console.log();

    // 高风险位置
    const riskyPositions = heat.filter(h => h.risk === 'high' || h.risk === 'medium_draw');
    if (riskyPositions.length > 0) {
        console.log('  ⚠ 高风险场次位置:');
        for (const h of riskyPositions) {
            console.log(`     第${h.position}场: ${h.riskLabel} (主胜${h.counts.win}/平${h.counts.draw}/客胜${h.counts.lose})`);
        }
    }
    console.log('-'.repeat(60) + '\n');

    // Step 5: 生成报告
    log('📝 Step 5/6: 生成分析报告...');
    const engineOutput = generateEngineOutput(analysisWindow, dist, heat, prizeTrend, difficulty);
    const leagueTeamReport = generateLeagueTeamReport(stats, analysisWindow);
    const fullEngineOutput = engineOutput + '\n' + leagueTeamReport;

    const markdownReport = generateMarkdownReport(draws, dist, heat, prizeTrend, difficulty, fullEngineOutput, stats);
    fs.writeFileSync(REPORT_PATH, markdownReport, 'utf8');
    log('💾 已生成 latest_report.md');

    // Step 6: 生成仪表盘数据
    log('📈 Step 6/6: 生成仪表盘数据...');
    const dashboardData = generateDashboardData(draws, analysis.windowSize, dist, heat, prizeTrend, difficulty, details, stats);
    fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2), 'utf8');
    log('💾 已生成 dashboard_data.json');

    // 生成内嵌数据版仪表盘（双击可开，无需服务器）
    generateStandaloneDashboard(dashboardData);

    // 保存分析历史
    const analysisHistory = loadAnalysisHistory();
    analysisHistory.push({
        timestamp: new Date().toISOString(),
        latestIssue: draws[0].code,
        latestDate: draws[0].date,
        totalDraws: draws.length,
        newDrawsCount: newCount,
        difficulty: difficulty.totalScore,
        difficultyLevel: difficulty.levelLabel,
        avgDrawRate: difficulty.avgDrawRate,
        prizeCV: prizeTrend.prizeCV,
        hotpotPeriods: prizeTrend.trend.filter(t => t.type === '🍲火锅奖').length,
        coldPeriods: prizeTrend.trend.filter(t => t.type === '🧊冷门期' || t.type === '🥶无人中').length,
        leagueCount: Object.keys(stats.leagues).length,
        teamCount: Object.keys(stats.teams).length
    });
    if (analysisHistory.length > 200) analysisHistory.splice(0, analysisHistory.length - 200);
    saveAnalysisHistory(analysisHistory);

    // 保存评估快照 (predictions)
    const predictions = loadPredictions();
    predictions.push({
        generatedAt: new Date().toISOString(),
        forIssue: draws[0].code,
        difficulty,
        riskyPositions: riskyPositions.map(h => ({
            position: h.position,
            risk: h.risk,
            riskLabel: h.riskLabel,
            match: h.latestMatch
        })),
        safePositions: heat.filter(h => h.maxVal >= THRESHOLDS.risk.low).map(h => ({
            position: h.position,
            maxKey: h.maxKey,
            maxVal: h.maxVal,
            match: h.latestMatch
        })),
        prizeTrend: {
            prizeCV: prizeTrend.prizeCV,
            recent5Types: prizeTrend.trend.slice(0, 5).map(t => t.type)
        }
    });
    if (predictions.length > 50) predictions.splice(0, predictions.length - 50);
    savePredictions(predictions);

    // 写入本次运行状态（供通知脚本判断是否推送）
    saveLastRun({ latestCode: draws[0].code, latestDate: draws[0].date, newCount, updated: true });

    // 终值摘要
    console.log('\n' + '='.repeat(70));
    console.log('  ✅ 足彩14场分析完成！');
    console.log('='.repeat(70));
    console.log(`  📅 最新开奖: 第 ${draws[0].code} 期 (${draws[0].date})`);
    console.log(`  🏆 一等奖: ${draws[0].prize1Count}注 / ${fmtMoney(draws[0].prize1Amount)}元`);
    console.log(`  ⚖ 难度评级: ${difficulty.levelLabel} (${difficulty.totalScore.toFixed(1)}/10)`);
    console.log(`  📊 数据总量: ${draws.length} 期 (新增 ${newCount} 期)`);
    console.log(`  ⚽ 联赛数: ${Object.keys(stats.leagues).length} | 球队数: ${Object.keys(stats.teams).length}`);
    console.log(`  📁 开奖数据: ${DRAWS_PATH}`);
    console.log(`  📋 比赛详情: ${MATCH_DETAILS_PATH}`);
    console.log(`  📊 联赛统计: ${LEAGUE_TEAM_STATS_PATH}`);
    console.log(`  📝 分析报告: ${REPORT_PATH}`);
    console.log(`  📈 仪表盘:   ${DASHBOARD_STANDALONE_PATH}（双击直接打开）`);
    console.log('='.repeat(70));
}

main().catch(e => {
    logError('脚本执行异常退出', e);
    process.exit(1);
});
