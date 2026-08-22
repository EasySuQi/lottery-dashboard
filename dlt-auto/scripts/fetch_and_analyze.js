#!/usr/bin/env node
// ============================================================
// 超级大乐透自动化分析编排脚本 v1.0
// 功能: 数据拉取 → 增量合并 → 引擎分析 → 报告生成 → 复盘对比
// 数据来源: 国家体育总局体育彩票管理中心 sporttery.cn
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
const PREDICTIONS_PATH = path.join(DATA_DIR, 'predictions.json');
const ANALYSIS_HISTORY_PATH = path.join(DATA_DIR, 'analysis_history.json');
const DASHBOARD_DATA_PATH = path.join(DATA_DIR, 'dashboard_data.json');
const REPORT_PATH = path.join(DATA_DIR, 'latest_report.md');
const ERROR_LOG_PATH = path.join(DATA_DIR, 'error.log');
const LAST_RUN_PATH = path.join(DATA_DIR, 'last_run.json');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
const DASHBOARD_STANDALONE_PATH = path.join(DASHBOARD_DIR, 'index_standalone.html');
const TEMP_INPUT_PATH = path.join(DATA_DIR, '_temp_dlt_input.json');

// ====== 加载配置 ======
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        logError('无法加载 config.json，使用默认配置', e);
        return {
            analysis: {
                issueCount: 30, windowSize: 20,
                apiUrl: 'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=30&isDetails=1&pageNo=1',
                retryCount: 3, retryDelayMs: 30000
            },
            paths: { dataDir: DATA_DIR }
        };
    }
}

// ====== 工具函数 ======
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

function pad(n, len) { return String(n).padStart(len || 2, '0'); }

// ====== 大乐透专用常量 ======
const ZONES_DEF = {
    Z1: { range: [1, 12], name: '一区(小)' },
    Z2: { range: [13, 24], name: '二区(中)' },
    Z3: { range: [25, 35], name: '三区(大)' }
};

// 大乐透冷热阈值 (20 期)
function frontLabel(cnt) {
    if (cnt >= 4) return 'HOT';
    if (cnt >= 2) return 'WARM';
    if (cnt >= 1) return 'COLD';
    return 'ICE';
}

function backLabel(cnt) {
    if (cnt >= 4) return 'HOT';
    if (cnt >= 2) return 'WARM';
    if (cnt >= 1) return 'COLD';
    return 'ICE';
}

function getZone(n) {
    if (n >= 1 && n <= 12) return 'Z1';
    if (n >= 13 && n <= 24) return 'Z2';
    if (n >= 25 && n <= 35) return 'Z3';
    return null;
}

function findConsecutivePairs(nums) {
    const sorted = [...nums].sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) pairs.push([sorted[i], sorted[i + 1]]);
    }
    return pairs;
}

// ====== 数据拉取 ======
async function fetchData(apiUrl, retryCount, retryDelayMs) {
    log('📡 正在从 sporttery.cn 拉取最新大乐透开奖数据...');

    const data = await common.fetchJson(apiUrl, { retries: retryCount, retryDelayMs });

    if (!data || !data.value || !data.value.list) {
        throw new Error('API 返回数据格式异常');
    }

    // 大乐透 API 返回格式: lotteryDrawResult = "前5 后2" (空格分隔)
    const draws = data.value.list.map(d => {
        const parts = d.lotteryDrawResult.split(' ').map(Number);
        return {
            code: d.lotteryDrawNum,
            front: parts.slice(0, 5),
            back: parts.slice(5, 7),
            date: d.lotteryDrawTime
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
    const merged = common.sortByCodeDesc([...freshEntries, ...existingDraws]);
    return { draws: merged, newCount: freshEntries.length, latestCode: freshEntries[0].code };
}

// ====== 加载/保存数据 ======
function loadDraws() {
    try { if (fs.existsSync(DRAWS_PATH)) return JSON.parse(fs.readFileSync(DRAWS_PATH, 'utf8')); }
    catch (e) { logError('读取 draws.json 失败', e); }
    return [];
}

function saveDraws(draws) {
    fs.writeFileSync(DRAWS_PATH, JSON.stringify(draws, null, 2), 'utf8');
    log(`💾 已保存 ${draws.length} 期数据至 draws.json`);
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

// ====== 统计分析 ======
function buildStats(draws, windowSize) {
    const window = draws.slice(0, windowSize);
    const frontCount = {}, backCount = {};
    for (const d of window) {
        for (const r of d.front) frontCount[r] = (frontCount[r] || 0) + 1;
        for (const b of d.back) backCount[b] = (backCount[b] || 0) + 1;
    }
    return { frontCount, backCount };
}

// ====== 复盘对比 ======
function reviewPreviousPredictions(predictions, latestDraw) {
    if (!predictions.length || !latestDraw) return null;
    const lastPred = predictions[predictions.length - 1];
    const actualFrontSet = new Set(latestDraw.front);
    const actualBackSet = new Set(latestDraw.back);

    const frontHitsPerGroup = lastPred.groups.map(g => {
        const hits = g.front.filter(r => actualFrontSet.has(r));
        return { name: g.name, hitCount: hits.length, hits };
    });

    const backHitsPerGroup = lastPred.groups.map(g => {
        const hits = g.back.filter(b => actualBackSet.has(b));
        return { name: g.name, hitCount: hits.length, hits };
    });

    return {
        predictionDate: lastPred.generatedAt,
        predictedForIssue: lastPred.forIssue,
        actualIssue: latestDraw.code,
        actualFront: latestDraw.front,
        actualBack: latestDraw.back,
        frontHits: frontHitsPerGroup,
        backHits: backHitsPerGroup,
        bestFrontHits: Math.max(...frontHitsPerGroup.map(g => g.hitCount)),
        bestBackHits: Math.max(...backHitsPerGroup.map(g => g.hitCount))
    };
}

// ====== 选号生成（复用 dlt_analyzer.js 核心算法） ======
function generatePredictions(draws, windowSize) {
    const window = draws.slice(0, windowSize);
    const { frontCount, backCount } = buildStats(draws, windowSize);

    // ===== 增强：遗漏期数 + 近期热度（综合评分） =====
    const frontLastIdx = {}, backLastIdx = {};
    for (let i = 0; i < window.length; i++) {
        for (const r of window[i].front) if (!(r in frontLastIdx)) frontLastIdx[r] = i;
        for (const b of window[i].back) if (!(b in backLastIdx)) backLastIdx[b] = i;
    }
    const frontOverdue = {}, backOverdue = {};
    for (let n = 1; n <= 35; n++) frontOverdue[n] = (n in frontLastIdx) ? frontLastIdx[n] : window.length;
    for (let n = 1; n <= 12; n++) backOverdue[n] = (n in backLastIdx) ? backLastIdx[n] : window.length;
    const frontRecent = {}, backRecent = {};
    for (const d of window.slice(0, 10)) {
        for (const r of d.front) frontRecent[r] = (frontRecent[r] || 0) + 1;
        for (const b of d.back) backRecent[b] = (backRecent[b] || 0) + 1;
    }

    // 各区号池按综合评分排序（频次×2 + 中段遗漏回补加成 + 近期热度）
    const zonePools = {};
    for (const [zk, zv] of Object.entries(ZONES_DEF)) {
        const pool = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            const count = frontCount[n] || 0;
            const od = frontOverdue[n];
            const recent = frontRecent[n] || 0;
            // 综合评分：频次主导；遗漏 3~8 期处于"回补窗口"加分；近期出现加分；从未出分扣分
            const score = count * 2
                + (od >= 3 && od <= 8 ? 2.5 : 0)
                + (od <= 2 ? 0.5 : 0)
                + recent * 0.8
                + (count === 0 ? -2 : 0);
            pool.push({ num: n, count, label: frontLabel(count), overdue: od, score });
        }
        pool.sort((a, b) => b.score - a.score || b.count - a.count);
        zonePools[zk] = pool;
    }

    function buildFrontSet(dist, targetOdd) {
        const picked = [];
        for (const [zk, cnt] of [['Z1', dist[0]], ['Z2', dist[1]], ['Z3', dist[2]]]) {
            const pool = zonePools[zk];
            const selected = [];
            for (const p of pool) {
                if (selected.length >= cnt) break;
                if (picked.includes(p.num) || selected.includes(p.num)) continue;
                selected.push(p.num);
            }
            selected.sort((a, b) => a - b);
            for (const n of selected) picked.push(n);
        }
        // 奇偶平衡：把奇数个数调整到 targetOdd（7 码常见 4:3 / 3:4），同区替换保持分区
        if (targetOdd != null && picked.length === 7) {
            let odds = picked.filter(x => x % 2 === 1);
            let evens = picked.filter(x => x % 2 === 0);
            let diff = targetOdd - odds.length;
            // 号码所属分区映射
            const numZone = {};
            for (const [zk, zv] of Object.entries(ZONES_DEF)) {
                for (let n = zv.range[0]; n <= zv.range[1]; n++) numZone[n] = zk;
            }
            let guard = 0;
            while (diff !== 0 && guard < 12) {
                guard++;
                const wantOdd = diff > 0;
                const replaceNum = wantOdd ? evens[evens.length - 1] : odds[odds.length - 1];
                if (replaceNum === undefined) break;
                const zk = numZone[replaceNum];
                // 从同区找同奇偶性、未选、分数最高的候选替换
                const cand = zonePools[zk]
                    .filter(p => (p.num % 2 === 1) === wantOdd && !picked.includes(p.num))
                    .sort((a, b) => b.score - a.score);
                if (cand.length === 0) break;
                const idx = picked.indexOf(replaceNum);
                if (idx < 0) break;
                picked[idx] = cand[0].num;
                if (wantOdd) {
                    evens.splice(evens.indexOf(replaceNum), 1);
                    odds.push(cand[0].num);
                    diff--;
                } else {
                    odds.splice(odds.indexOf(replaceNum), 1);
                    evens.push(cand[0].num);
                    diff++;
                }
            }
            picked.sort((a, b) => a - b);
        }
        return picked;
    }

    // 后区两码组合筛选 (和值 9-17)
    function findValidBackPairs() {
        const valid = [];
        for (let i = 1; i <= 12; i++) {
            for (let j = i + 1; j <= 12; j++) {
                const s1 = i + j;
                if (s1 >= 9 && s1 <= 17) {
                    const types = new Set([
                        backLabel(backCount[i] || 0),
                        backLabel(backCount[j] || 0)
                    ]);
                    const typesArr = [...types];
                    if (!typesArr.every(t => t === 'HOT') && !typesArr.every(t => t === 'COLD' || t === 'ICE')) {
                        const odI = backOverdue[i], odJ = backOverdue[j];
                        const bonusI = (odI >= 2 && odI <= 5 ? 2 : 0) + (backRecent[i] || 0) * 0.5;
                        const bonusJ = (odJ >= 2 && odJ <= 5 ? 2 : 0) + (backRecent[j] || 0) * 0.5;
                        valid.push({
                            nums: [i, j], sum: s1,
                            types: typesArr.join('+'),
                            score: typesArr.length * 10 + (backCount[i] || 0) + (backCount[j] || 0) + bonusI + bonusJ
                        });
                    }
                }
            }
        }
        valid.sort((a, b) => b.score - a.score);
        return valid;
    }

    const validPairs = findValidBackPairs();
    const t1 = validPairs.find(t => t.types.includes('HOT') && t.types.includes('COLD'))
            || validPairs.find(t => t.types.includes('HOT') && t.types.includes('ICE'))
            || validPairs[0];
    const t2 = validPairs.find(t => t.types.includes('WARM') && t.types.includes('COLD') && t !== t1)
            || validPairs[Math.min(validPairs.length - 1, 3)];

    const set1 = buildFrontSet([3, 2, 2], 4); // 3-2-2 侧重一区，奇偶 4:3
    const set2 = buildFrontSet([2, 2, 3], 3); // 2-2-3 侧重三区，奇偶 3:4

    function validateBuiltSet(frontNums) {
        const zones = { Z1: [], Z2: [], Z3: [] };
        for (const r of frontNums) {
            const z = getZone(r);
            if (z) zones[z].push(r);
        }
        const hotCount = frontNums.filter(r => frontLabel(frontCount[r] || 0) === 'HOT').length;
        const warmCount = frontNums.filter(r => frontLabel(frontCount[r] || 0) === 'WARM').length;
        const cons = findConsecutivePairs(frontNums);
        return {
            zones, hotCount, warmCount, coldCount: frontNums.length - hotCount - warmCount,
            cons, distribution: `${zones.Z1.length}-${zones.Z2.length}-${zones.Z3.length}`,
            oddCount: frontNums.filter(x => x % 2 === 1).length
        };
    }

    const groups = [];
    for (const [front, back, name] of [
        [set1, t1.nums, '第一组 (3-2-2 分布 / 一区侧重)'],
        [set2, t2.nums, '第二组 (2-2-3 分布 / 三区侧重)']
    ]) {
        const fv = validateBuiltSet(front);
        groups.push({
            name, front, back,
            distribution: fv.distribution,
            hotCount: fv.hotCount, warmCount: fv.warmCount, coldCount: fv.coldCount,
            consecutivePairs: fv.cons,
            oddEven: fv.oddCount + ':' + (front.length - fv.oddCount)
        });
    }

    return {
        generatedAt: new Date().toISOString(),
        forIssue: draws[0].code,
        groups
    };
}

// ====== 仪表盘数据生成 ======
function generateDashboardData(draws, windowSize, predictions, review) {
    const stats = buildStats(draws, windowSize);

    // 前区频次
    const frontFrequency = {};
    for (let n = 1; n <= 35; n++) frontFrequency[String(n)] = stats.frontCount[n] || 0;

    // 后区频次
    const backFrequency = {};
    for (let n = 1; n <= 12; n++) backFrequency[String(n)] = stats.backCount[n] || 0;

    // 逐期三区分布
    const zoneDistribution = draws.slice(0, 30).map(d => {
        const zones = { Z1: 0, Z2: 0, Z3: 0 };
        for (const r of d.front) { const z = getZone(r); if (z) zones[z]++; }
        return {
            code: d.code, date: d.date,
            front: d.front, back: d.back,
            Z1: zones.Z1, Z2: zones.Z2, Z3: zones.Z3,
            full: zones.Z1 > 0 && zones.Z2 > 0 && zones.Z3 > 0
        };
    }).reverse();

    // 各区冷热详情
    const zoneStats = {};
    for (const [zk, [low, high, name]] of Object.entries({
        Z1: [1, 12, '一区(小) 01-12'],
        Z2: [13, 24, '二区(中) 13-24'],
        Z3: [25, 35, '三区(大) 25-35']
    })) {
        const hot = [], warm = [], cold = [], ice = [];
        for (let n = low; n <= high; n++) {
            const cnt = stats.frontCount[n] || 0;
            const lbl = frontLabel(cnt);
            if (lbl === 'HOT') hot.push(pad(n));
            else if (lbl === 'WARM') warm.push(pad(n));
            else if (lbl === 'COLD') cold.push(pad(n));
            else ice.push(pad(n));
        }
        zoneStats[zk] = { name, hot, warm, cold, ice };
    }

    // 后区分级
    const backZones = { hot: [], warm: [], cold: [], ice: [] };
    for (let n = 1; n <= 12; n++) {
        const cnt = stats.backCount[n] || 0;
        backZones[backLabel(cnt).toLowerCase()].push(pad(n));
    }

    // 连号趋势
    const consecutiveTrend = draws.slice(0, 30).map(d => {
        const pairs = findConsecutivePairs(d.front);
        return { code: d.code, date: d.date, count: pairs.length, pairs: pairs.map(p => pad(p[0]) + '-' + pad(p[1])) };
    }).reverse();

    const consecutiveRate = consecutiveTrend.filter(d => d.count > 0).length / consecutiveTrend.length;
    const fullCoverageRate = zoneDistribution.filter(d => d.full).length / zoneDistribution.length;

    // 热号排行
    const frontRanking = Object.entries(stats.frontCount)
        .sort((a, b) => b[1] - a[1] || parseInt(a[0]) - parseInt(b[0]))
        .slice(0, 10)
        .map(([n, cnt]) => ({ num: pad(parseInt(n)), count: cnt, label: frontLabel(cnt) }));

    const backRanking = Object.entries(stats.backCount)
        .sort((a, b) => b[1] - a[1] || parseInt(a[0]) - parseInt(b[0]))
        .slice(0, 8)
        .map(([n, cnt]) => ({ num: pad(parseInt(n)), count: cnt, label: backLabel(cnt) }));

    const latestPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;

    return {
        generatedAt: new Date().toISOString(),
        gameType: '超级大乐透',
        dataRange: {
            totalDraws: draws.length, windowSize,
            earliestIssue: draws[draws.length - 1]?.code || '',
            latestIssue: draws[0]?.code || '',
            latestDate: draws[0]?.date || ''
        },
        latestDraw: draws[0] || null,
        frontFrequency, backFrequency,
        zoneDistribution, zoneStats, backZones,
        frontRanking, backRanking,
        consecutiveTrend, consecutiveRate, fullCoverageRate,
        latestPrediction, review
    };
}

// ====== 生成 Markdown 报告 ======
function generateMarkdownReport(draws, windowSize, stats, predictions, review, engineOutput) {
    const latest = draws[0];
    const lines = [];
    lines.push('# 🟠🔵 超级大乐透分区冷热分析报告');
    lines.push('');
    lines.push(`> 📅 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    lines.push(`> 📊 数据范围: 第 ${draws[draws.length - 1].code} 期 ~ 第 ${draws[0].code} 期 (共 ${draws.length} 期)`);
    lines.push(`> 🎱 最新开奖: 第 ${latest.code} 期 (${latest.date})`);
    lines.push(`> 🟠 前区: ${latest.front.map(n => pad(n)).join(' ')}  🔵 后区: ${latest.back.map(n => pad(n)).join(' ')}`);
    lines.push('');
    lines.push('---\n');

    // 前区
    lines.push('## 一、前区冷热分布\n');
    const zoneNames = { Z1: ['一区(01-12)', 1, 12], Z2: ['二区(13-24)', 13, 24], Z3: ['三区(25-35)', 25, 35] };
    for (const [zk, [zname, low, high]] of Object.entries(zoneNames)) {
        lines.push(`### ${zname}`);
        const items = [];
        for (let n = low; n <= high; n++) {
            const cnt = stats.frontCount[n] || 0;
            const icon = cnt >= 4 ? '🔥' : cnt >= 2 ? '●' : cnt >= 1 ? '❄' : '🧊';
            items.push(`${icon}${pad(n)}(${cnt})`);
        }
        lines.push(items.join('  '));
        lines.push('');
    }

    // 后区
    lines.push('## 二、后区冷热\n');
    for (let n = 1; n <= 12; n++) {
        const cnt = stats.backCount[n] || 0;
        const icon = cnt >= 4 ? '🔥' : cnt >= 2 ? '●' : cnt >= 1 ? '❄' : '🧊';
        lines.push(`${icon}${pad(n)}(${cnt})  `);
    }
    lines.push('');

    // 推荐
    if (predictions.length > 0) {
        const lastPred = predictions[predictions.length - 1];
        lines.push('## 三、本期选号推荐\n');
        for (const g of lastPred.groups) {
            lines.push(`### ${g.name}`);
            lines.push(`- 🟠 前区: ${g.front.map(n => pad(n)).join(' ')}`);
            lines.push(`- 🔵 后区: ${g.back.map(n => pad(n)).join(' ')}`);
            lines.push(`- 分区比: ${g.distribution}  |  连号: ${(g.consecutivePairs || []).map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') || '--'}`);
            lines.push(`- 冷热: HOT=${g.hotCount}  WARM=${g.warmCount}  COLD/ICE=${g.coldCount}`);
            lines.push('');
        }
    }

    // 复盘
    if (review) {
        lines.push('## 四、上期推荐复盘\n');
        lines.push(`- 预测日期: ${review.predictionDate}`);
        lines.push(`- 开奖期号: ${review.actualIssue}`);
        lines.push(`- 实际前区: ${review.actualFront.map(n => pad(n)).join(' ')}  实际后区: ${review.actualBack.map(n => pad(n)).join(' ')}`);
        lines.push(`- 最佳前区命中: **${review.bestFrontHits}** / 7 个`);
        lines.push(`- 最佳后区命中: **${review.bestBackHits}** / 2 个`);
        lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('> ⚠️ **免责声明**: 以上为历史数据统计推演，不构成任何投注建议。');
    lines.push('> 彩票开奖为独立随机事件，历史频率不代表未来走势。请理性购彩，量力而行。');

    return lines.join('\n');
}

// ====== 生成内嵌数据版仪表盘 ======
// 将 dashboard_data.json 内嵌进 index.html，生成可直接双击打开的单文件版
function generateStandaloneDashboard(dashboardData) {
    if (!fs.existsSync(DASHBOARD_HTML_PATH)) {
        log('⚠ 未找到仪表盘模板 index.html，跳过内嵌版生成');
        return;
    }
    const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
    const dataJson = JSON.stringify(dashboardData);
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
    console.log('  超级大乐透自动化分析引擎 v1.0');
    console.log('='.repeat(70));

    // Step 1
    log('🔍 Step 1/5: 拉取原始数据...');
    const newDraws = await fetchData(analysis.apiUrl, analysis.retryCount, analysis.retryDelayMs);

    // Step 2
    log('📦 Step 2/5: 增量合并数据...');
    const existingDraws = loadDraws();
    const { draws, newCount } = mergeDraws(existingDraws, newDraws);

    // --force 参数：无新数据时也强制重新生成仪表盘（用于结构升级/字段补充）
    const force = process.argv.includes('--force');
    if (newCount === 0 && !force) {
        log('✅ 数据已是最新，无需更新分析');
        saveLastRun({ latestCode: draws[0]?.code || null, latestDate: draws[0]?.date || null, newCount: 0, updated: false });
        console.log('='.repeat(70));
        return;
    }
    if (newCount === 0) {
        log('ℹ 无新数据，但已指定 --force，强制重新生成仪表盘');
    }

    saveDraws(draws);

    // Step 3: 统计 + 复盘 + 选号
    log('📊 Step 3/5: 统计分析 + 复盘历史推荐...');
    const stats = buildStats(draws, analysis.windowSize);
    const predictions = loadPredictions();
    const review = reviewPreviousPredictions(predictions, draws[0]);

    if (review) {
        log(`📋 复盘: 前区最佳 ${review.bestFrontHits}/7，后区最佳 ${review.bestBackHits}/3`);
    } else {
        log('📋 暂无历史推荐可复盘');
    }

    // Step 4: 生成推荐
    log('🎯 Step 4/5: 生成选号推荐...');
    const newPrediction = generatePredictions(draws, analysis.windowSize);
    predictions.push(newPrediction);
    if (predictions.length > 50) predictions.splice(0, predictions.length - 50);
    savePredictions(predictions);

    // 展示推荐
    console.log('\n' + '-'.repeat(60));
    console.log('  🎯 本期大乐透选号推荐');
    console.log('-'.repeat(60));
    for (const g of newPrediction.groups) {
        console.log(`\n  ${g.name}`);
        console.log(`  🟠 前区: ${g.front.map(n => pad(n)).join('  ')}`);
        console.log(`  🔵 后区: ${g.back.map(n => pad(n)).join('  ')}`);
        console.log(`  📐 分区比: ${g.distribution}  连号: ${g.consecutivePairs.map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') || '--'}`);
        console.log(`  🌡 冷热: HOT=${g.hotCount}  WARM=${g.warmCount}  COLD/ICE=${g.coldCount}`);
    }
    console.log();

    // Step 5: 生成报告和仪表盘
    log('📝 Step 5/5: 生成报告和仪表盘数据...');

    const dashboardData = generateDashboardData(draws, analysis.windowSize, predictions, review);
    fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2), 'utf8');
    log('💾 已生成 dashboard_data.json');
    generateStandaloneDashboard(dashboardData);

    const markdownReport = generateMarkdownReport(draws, analysis.windowSize, stats, predictions, review, '');
    fs.writeFileSync(REPORT_PATH, markdownReport, 'utf8');
    log('💾 已生成 latest_report.md');

    // 分析历史
    const analysisHistory = loadAnalysisHistory();
    analysisHistory.push({
        timestamp: new Date().toISOString(),
        latestIssue: draws[0].code,
        latestDate: draws[0].date,
        totalDraws: draws.length,
        newDrawsCount: newCount,
        frontHotCount: Object.values(stats.frontCount).filter(c => c >= 4).length,
        backHotCount: Object.values(stats.backCount).filter(c => c >= 4).length,
        review: review ? { bestFrontHits: review.bestFrontHits, bestBackHits: review.bestBackHits } : null
    });
    if (analysisHistory.length > 200) analysisHistory.splice(0, analysisHistory.length - 200);
    saveAnalysisHistory(analysisHistory);

    // 写入本次运行状态（供通知脚本判断是否推送）
    saveLastRun({ latestCode: draws[0].code, latestDate: draws[0].date, newCount, updated: true });

    // 终值摘要
    console.log('\n' + '='.repeat(70));
    console.log('  ✅ 大乐透分析完成！');
    console.log('='.repeat(70));
    console.log(`  📅 最新开奖: 第 ${draws[0].code} 期 (${draws[0].date})`);
    console.log(`  🟠 前区: ${draws[0].front.map(n => pad(n)).join(' ')}  🔵 后区: ${draws[0].back.map(n => pad(n)).join(' ')}`);
    console.log(`  📊 数据总量: ${draws.length} 期 (新增 ${newCount} 期)`);
    console.log(`  📁 数据文件: ${DRAWS_PATH}`);
    console.log(`  📝 分析报告: ${REPORT_PATH}`);
    if (review) {
        console.log(`  🎯 上期复盘: 前区 ${review.bestFrontHits}/7, 后区 ${review.bestBackHits}/2`);
    }
    console.log('='.repeat(70));
}

main().catch(e => {
    logError('脚本执行异常退出', e);
    process.exit(1);
});
