#!/usr/bin/env node
// ============================================================
// 双色球自动化分析编排脚本 v1.0
// 功能: 数据拉取 → 增量合并 → 引擎分析 → 报告生成 → 复盘对比
// 数据来源: 中国福利彩票发行管理中心 cwl.gov.cn
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
const TEMP_INPUT_PATH = path.join(DATA_DIR, '_temp_ssq_input.json');

// ====== 加载配置 ======
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        logError('无法加载 config.json，使用默认配置', e);
        return {
            analysis: {
                issueCount: 30, windowSize: 20,
                apiUrl: 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=30&pageNo=1&pageSize=30',
                retryCount: 3, retryDelayMs: 30000
            },
            paths: {
                dataDir: DATA_DIR,
                enginePath: path.join(ROOT, '..', '.claude', 'skills', '福彩', 'references', 'ssq_analyzer_v2.js')
            }
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
    try {
        fs.appendFileSync(ERROR_LOG_PATH, errMsg, 'utf8');
    } catch (_) {}
}

function pad(n, len = 2) { return String(n).padStart(len, '0'); }

// ====== 数据拉取 ======
async function fetchData(apiUrl, retryCount, retryDelayMs) {
    log('📡 正在从 cwl.gov.cn 拉取最新开奖数据...');

    const data = await common.fetchJson(apiUrl, {
        retries: retryCount,
        retryDelayMs,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.cwl.gov.cn/ygkj/wqkjgg/ssq/'
        }
    });

    if (!data || !data.result || !Array.isArray(data.result)) {
        throw new Error('API 返回数据格式异常');
    }

    log(`✅ 成功拉取 ${data.result.length} 期数据`);
    return data.result.map(d => ({
        code: d.code,
        reds: d.red.split(',').map(Number),
        blue: parseInt(d.blue, 10),
        date: d.date
    }));
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

    return {
        draws: merged,
        newCount: freshEntries.length,
        latestCode: freshEntries[0].code
    };
}

// ====== 加载/保存数据 ======
function loadDraws() {
    try {
        if (fs.existsSync(DRAWS_PATH)) {
            return JSON.parse(fs.readFileSync(DRAWS_PATH, 'utf8'));
        }
    } catch (e) {
        logError('读取 draws.json 失败，将创建新文件', e);
    }
    return [];
}

function saveDraws(draws) {
    fs.writeFileSync(DRAWS_PATH, JSON.stringify(draws, null, 2), 'utf8');
    log(`💾 已保存 ${draws.length} 期数据至 draws.json`);
}

function loadPredictions() {
    try {
        if (fs.existsSync(PREDICTIONS_PATH)) {
            return JSON.parse(fs.readFileSync(PREDICTIONS_PATH, 'utf8'));
        }
    } catch (_) {}
    return [];
}

function savePredictions(predictions) {
    fs.writeFileSync(PREDICTIONS_PATH, JSON.stringify(predictions, null, 2), 'utf8');
    log('💾 已保存推荐记录至 predictions.json');
}

function loadAnalysisHistory() {
    try {
        if (fs.existsSync(ANALYSIS_HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(ANALYSIS_HISTORY_PATH, 'utf8'));
        }
    } catch (_) {}
    return [];
}

function saveAnalysisHistory(history) {
    fs.writeFileSync(ANALYSIS_HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

// ====== 统计计算（不依赖 v2 引擎的部分） ======
function buildStats(draws, windowSize) {
    const window = draws.slice(0, windowSize);
    const redCount = {}, blueCount = {};

    for (const d of window) {
        for (const r of d.reds) {
            redCount[r] = (redCount[r] || 0) + 1;
        }
        const b = d.blue;
        blueCount[b] = (blueCount[b] || 0) + 1;
    }

    return { redCount, blueCount };
}

function redLabel(cnt, thresholds = { hot: 5, warm: 3, cold: 1 }) {
    if (cnt >= thresholds.hot) return 'HOT';
    if (cnt >= thresholds.warm) return 'WARM';
    if (cnt >= thresholds.cold) return 'COLD';
    return 'ICE';
}

function blueLabel(cnt, thresholds = { hot: 3, warm: 2, cold: 1 }) {
    if (cnt >= thresholds.hot) return 'HOT';
    if (cnt >= thresholds.warm) return 'WARM';
    if (cnt >= thresholds.cold) return 'COLD';
    return 'ICE';
}

function getZone(n) {
    if (n >= 1 && n <= 10) return 'Z1';
    if (n >= 11 && n <= 20) return 'Z2';
    if (n >= 21 && n <= 33) return 'Z3';
    return null;
}

function findConsecutivePairs(reds) {
    const sorted = [...reds].sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) {
            pairs.push([sorted[i], sorted[i + 1]]);
        }
    }
    return pairs;
}

// ====== 复盘对比 ======
function reviewPreviousPredictions(predictions, latestDraw) {
    if (!predictions.length || !latestDraw) {
        return null;
    }

    // 找最近的推荐记录（预测的是上一期之后的开奖）
    const lastPred = predictions[predictions.length - 1];

    // 计算红球命中数
    const actualRedSet = new Set(latestDraw.reds);
    const redHitsPerGroup = lastPred.groups.map(g => {
        const hits = g.reds.filter(r => actualRedSet.has(r));
        return { name: g.name, hitCount: hits.length, hits };
    });

    // 计算蓝球命中数
    const blueHitsPerGroup = lastPred.groups.map(g => {
        const hit = g.blues.includes(latestDraw.blue);
        return { name: g.name, hit: hit ? 1 : 0 };
    });

    return {
        predictionDate: lastPred.generatedAt,
        predictedForIssue: lastPred.forIssue,
        actualIssue: latestDraw.code,
        actualReds: latestDraw.reds,
        actualBlue: latestDraw.blue,
        redHits: redHitsPerGroup,
        blueHits: blueHitsPerGroup,
        bestRedHits: Math.max(...redHitsPerGroup.map(g => g.hitCount)),
        bestBlueHit: Math.max(...blueHitsPerGroup.map(g => g.hit))
    };
}

// ====== 仪表盘数据生成 ======
function generateDashboardData(draws, windowSize, predictions, review) {
    const stats = buildStats(draws, windowSize);

    // 红球频次 (1-33)
    const redFrequency = {};
    for (let n = 1; n <= 33; n++) {
        redFrequency[String(n)] = stats.redCount[n] || 0;
    }

    // 蓝球频次 (1-16)
    const blueFrequency = {};
    for (let n = 1; n <= 16; n++) {
        blueFrequency[String(n)] = stats.blueCount[n] || 0;
    }

    // 逐期三区分布 (最近30期)
    const zoneDistribution = draws.slice(0, 30).map(d => {
        const zones = { Z1: 0, Z2: 0, Z3: 0 };
        for (const r of d.reds) {
            const z = getZone(r);
            if (z) zones[z]++;
        }
        return {
            code: d.code,
            date: d.date,
            reds: d.reds,
            blue: d.blue,
            Z1: zones.Z1,
            Z2: zones.Z2,
            Z3: zones.Z3,
            full: zones.Z1 > 0 && zones.Z2 > 0 && zones.Z3 > 0
        };
    }).reverse();

    // 各区热温冷冰分布
    const zoneStats = {};
    const zoneNames = { Z1: [1, 10, '一区(小)'], Z2: [11, 20, '二区(中)'], Z3: [21, 33, '三区(大)'] };
    for (const [zk, [low, high, name]] of Object.entries(zoneNames)) {
        const hot = [], warm = [], cold = [], ice = [];
        for (let n = low; n <= high; n++) {
            const cnt = stats.redCount[n] || 0;
            const lbl = redLabel(cnt);
            if (lbl === 'HOT') hot.push(pad(n));
            else if (lbl === 'WARM') warm.push(pad(n));
            else if (lbl === 'COLD') cold.push(pad(n));
            else ice.push(pad(n));
        }
        zoneStats[zk] = { name, hot, warm, cold, ice };
    }

    // 蓝球分级
    const blueZones = { hot: [], warm: [], cold: [], ice: [] };
    for (let n = 1; n <= 16; n++) {
        const cnt = stats.blueCount[n] || 0;
        const lbl = blueLabel(cnt).toLowerCase();
        blueZones[lbl].push(pad(n));
    }

    // 连号趋势 (最近30期)
    const consecutiveTrend = draws.slice(0, 30).map(d => {
        const pairs = findConsecutivePairs(d.reds);
        return { code: d.code, date: d.date, count: pairs.length, pairs: pairs.map(p => pad(p[0]) + '-' + pad(p[1])) };
    }).reverse();

    // 连号出现率
    const consecutiveRate = consecutiveTrend.filter(d => d.count > 0).length / consecutiveTrend.length;

    // 全覆盖率
    const fullCoverageRate = zoneDistribution.filter(d => d.full).length / zoneDistribution.length;

    // 最新一期预测
    const latestPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;

    // 热号排行
    const redRanking = Object.entries(stats.redCount)
        .sort((a, b) => b[1] - a[1] || parseInt(a[0]) - parseInt(b[0]))
        .slice(0, 10)
        .map(([n, cnt]) => ({ num: pad(parseInt(n)), count: cnt, label: redLabel(cnt) }));

    const blueRanking = Object.entries(stats.blueCount)
        .sort((a, b) => b[1] - a[1] || parseInt(a[0]) - parseInt(b[0]))
        .slice(0, 8)
        .map(([n, cnt]) => ({ num: pad(parseInt(n)), count: cnt, label: blueLabel(cnt) }));

    // 热号频次趋势 (最近10期各热号累积出现)
    const topRedNums = redRanking.slice(0, 6).map(r => parseInt(r.num));
    const redTrend = [];
    const recent10 = draws.slice(0, Math.min(10, draws.length)).reverse();
    for (const d of recent10) {
        const entry = { code: d.code };
        for (const n of topRedNums) {
            entry[String(n)] = d.reds.includes(n) ? 1 : 0;
        }
        redTrend.push(entry);
    }

    return {
        generatedAt: new Date().toISOString(),
        dataRange: {
            totalDraws: draws.length,
            windowSize: windowSize,
            earliestIssue: draws[draws.length - 1]?.code || '',
            latestIssue: draws[0]?.code || '',
            latestDate: draws[0]?.date || ''
        },
        latestDraw: draws[0] || null,
        redFrequency,
        blueFrequency,
        zoneDistribution,
        zoneStats,
        blueZones,
        redRanking,
        blueRanking,
        redTrend,
        topRedNums: topRedNums.map(n => pad(n)),
        consecutiveTrend,
        consecutiveRate,
        fullCoverageRate,
        latestPrediction,
        review
    };
}

// ====== 生成 Markdown 报告 ======
function generateMarkdownReport(draws, windowSize, stats, predictions, review, engineOutput) {
    const latest = draws[0];
    const lines = [];

    lines.push('# 🔴🔵 双色球分区冷热分析报告');
    lines.push('');
    lines.push(`> 📅 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    lines.push(`> 📊 数据范围: 第 ${draws[draws.length - 1].code} 期 ~ 第 ${draws[0].code} 期 (共 ${draws.length} 期)`);
    lines.push(`> 🎱 最新开奖: 第 ${latest.code} 期 (${latest.date})`);
    lines.push(`> 🔴 红球: ${latest.reds.map(n => pad(n)).join(' ')}  🔵 蓝球: ${pad(latest.blue)}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 前区冷热
    lines.push('## 一、前区冷热分布');
    lines.push('');
    const zoneNames = { Z1: ['一区(01-10)', 1, 10], Z2: ['二区(11-20)', 11, 20], Z3: ['三区(21-33)', 21, 33] };
    for (const [zk, [zname, low, high]] of Object.entries(zoneNames)) {
        lines.push(`### ${zname}`);
        const items = [];
        for (let n = low; n <= high; n++) {
            const cnt = stats.redCount[n] || 0;
            const icon = cnt >= 5 ? '🔥' : cnt >= 3 ? '●' : cnt >= 1 ? '❄' : '🧊';
            items.push(`${icon}${pad(n)}(${cnt})`);
        }
        lines.push(items.join('  '));
        lines.push('');
    }

    // 后区冷热
    lines.push('## 二、后区蓝球冷热');
    lines.push('');
    const blueLine1 = [], blueLine2 = [];
    for (let n = 1; n <= 16; n++) {
        const cnt = stats.blueCount[n] || 0;
        const icon = cnt >= 3 ? '🔥' : cnt >= 2 ? '●' : cnt >= 1 ? '❄' : '🧊';
        (n <= 8 ? blueLine1 : blueLine2).push(`${icon}${pad(n)}(${cnt})`);
    }
    lines.push(blueLine1.join('  '));
    lines.push(blueLine2.join('  '));
    lines.push('');

    // 选号推荐
    if (predictions.length > 0) {
        const lastPred = predictions[predictions.length - 1];
        lines.push('## 三、本期选号推荐');
        lines.push('');
        for (const g of lastPred.groups) {
            lines.push(`### ${g.name}`);
            lines.push(`- 🔴 红球: ${g.reds.map(n => pad(n)).join(' ')}`);
            lines.push(`- 🔵 蓝球: ${g.blues.map(n => pad(n)).join(' ')}`);
            lines.push(`- 分区比: ${g.distribution}  |  连号: ${(g.consecutivePairs || []).map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') || '--'}`);
            lines.push(`- 冷热: HOT=${g.hotCount}  WARM=${g.warmCount}  COLD/ICE=${g.coldCount}`);
            lines.push('');
        }
    }

    // 复盘对比
    if (review) {
        lines.push('## 四、上期推荐复盘');
        lines.push('');
        lines.push(`- 预测日期: ${review.predictionDate}`);
        lines.push(`- 开奖期号: ${review.actualIssue}`);
        lines.push(`- 实际红球: ${review.actualReds.map(n => pad(n)).join(' ')}  实际蓝球: ${pad(review.actualBlue)}`);
        lines.push(`- 最佳红球命中: **${review.bestRedHits}** / 7 个`);
        lines.push(`- 蓝球命中: **${review.bestBlueHit ? '✅ 命中' : '❌ 未中'}**`);
        lines.push('');
        for (let i = 0; i < review.redHits.length; i++) {
            const g = review.redHits[i];
            lines.push(`  - ${g.name}: 红球命中 ${g.hitCount} 个${g.hits.length ? ' (' + g.hits.map(n => pad(n)).join(', ') + ')' : ''}，蓝球${review.blueHits[i].hit ? '命中 ✅' : '未中 ❌'}`);
        }
        lines.push('');
    }

    // 分析引擎原始输出
    lines.push('## 五、完整终端输出');
    lines.push('');
    lines.push('```');
    lines.push(engineOutput.slice(-10000)); // 最多保留 10000 字符
    lines.push('```');
    lines.push('');
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
    const enginePath = config.paths?.enginePath || path.join(ROOT, '..', '.claude', 'skills', '福彩', 'references', 'ssq_analyzer_v2.js');

    console.log('='.repeat(70));
    console.log('  双色球自动化分析引擎 v1.0');
    console.log('='.repeat(70));

    // Step 1: 拉取数据
    log('🔍 Step 1/6: 拉取原始数据...');
    const newDraws = await fetchData(analysis.apiUrl, analysis.retryCount, analysis.retryDelayMs);

    // Step 2: 增量合并
    log('📦 Step 2/6: 增量合并数据...');
    const existingDraws = loadDraws();
    const { draws, newCount, latestCode } = mergeDraws(existingDraws, newDraws);

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

    // Step 3: 统计分析
    log('📊 Step 3/6: 计算统计指标...');
    const stats = buildStats(draws, analysis.windowSize);

    // Step 4: 复盘历史推荐
    log('🎯 Step 4/6: 复盘历史推荐...');
    const predictions = loadPredictions();
    const review = reviewPreviousPredictions(predictions, draws[0]);

    if (review) {
        log(`📋 复盘结果: 上期推荐最佳红球命中 ${review.bestRedHits}/7，蓝球${review.bestBlueHit ? '命中' : '未中'}`);
    } else {
        log('📋 暂无历史推荐可复盘 (第一次运行或缺少对比数据)');
    }

    // Step 5: 运行 v2 分析引擎
    log('⚙ Step 5/6: 运行分析引擎 + 生成推荐号码...');
    let engineOutput = '';
    let newPrediction = null;

    try {
        // 准备引擎输入数据
        const engineInput = { result: draws.slice(0, analysis.windowSize).map(d => ({
            code: d.code,
            red: d.reds.join(','),
            blue: String(d.blue),
            date: d.date
        })) };
        fs.writeFileSync(TEMP_INPUT_PATH, JSON.stringify(engineInput), 'utf8');

        // 执行引擎（捕获终端输出用于报告）
        engineOutput = execSync(`node "${enginePath}"`, {
            env: { ...process.env, SSQ_DATA_FILE: TEMP_INPUT_PATH },
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
        });

        // ====== 独立生成推荐号码（不依赖引擎输出解析） ======
        // 直接复用 v2 引擎的核心选号逻辑，确保可靠性

        const windowDraws = draws.slice(0, analysis.windowSize);

        // 计算频次
        const localRedCount = {}, localRedLast = {};
        const localBlueCount = {}, localBlueLast = {};
        for (let i = 0; i < windowDraws.length; i++) {
            for (const r of windowDraws[i].reds) {
                localRedCount[r] = (localRedCount[r] || 0) + 1;
                if (!(r in localRedLast)) localRedLast[r] = { code: windowDraws[i].code, idx: i };
            }
            const b = windowDraws[i].blue;
            localBlueCount[b] = (localBlueCount[b] || 0) + 1;
            if (!(b in localBlueLast)) localBlueLast[b] = { code: windowDraws[i].code, idx: i };
        }

        // 近 10 期出现次数（近期热度）
        const localRedRecent = {}, localBlueRecent = {};
        for (let i = 0; i < Math.min(10, windowDraws.length); i++) {
            for (const r of windowDraws[i].reds) localRedRecent[r] = (localRedRecent[r] || 0) + 1;
            const b = windowDraws[i].blue;
            localBlueRecent[b] = (localBlueRecent[b] || 0) + 1;
        }

        // 红球选号：各区按频次排序，优先选热号+温号
        const ZONES_DEF = {
            Z1: { range: [1, 10] },
            Z2: { range: [11, 20] },
            Z3: { range: [21, 33] }
        };

        function localRedLabel(cnt) {
            if (cnt >= 5) return 'HOT';
            if (cnt >= 3) return 'WARM';
            if (cnt >= 1) return 'COLD';
            return 'ICE';
        }

        // 构建各区号池（综合评分：频次×2 + 中段遗漏回补 + 近期热度）
        const zonePools = {};
        for (const [zk, zv] of Object.entries(ZONES_DEF)) {
            const pool = [];
            for (let n = zv.range[0]; n <= zv.range[1]; n++) {
                const count = localRedCount[n] || 0;
                const od = localRedLast[n] ? localRedLast[n].idx : windowDraws.length;
                const recent = localRedRecent[n] || 0;
                const score = count * 2
                    + (od >= 3 && od <= 8 ? 2.5 : 0)
                    + (od <= 2 ? 0.5 : 0)
                    + recent * 0.8
                    + (count === 0 ? -2 : 0);
                pool.push({
                    num: n, count,
                    lastIdx: localRedLast[n] ? localRedLast[n].idx : 99,
                    label: localRedLabel(count), overdue: od, score
                });
            }
            pool.sort((a, b) => b.score - a.score || b.count - a.count || a.lastIdx - b.lastIdx);
            zonePools[zk] = pool;
        }

        function buildRedSet(dist, targetOdd) {
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
            // 奇偶平衡：7 码红球目标奇偶（4:3 / 3:4），同区替换保持分区
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

        // 蓝球选号：两码组合筛选
        function findValidBluePairs() {
            const valid = [];
            for (let i = 1; i <= 16; i++) {
                for (let j = i + 1; j <= 16; j++) {
                    const s1 = i + j;
                    if (s1 >= 9 && s1 <= 16) {
                        const types = new Set([
                            blueLabel(localBlueCount[i] || 0),
                            blueLabel(localBlueCount[j] || 0)
                        ]);
                        const typesArr = [...types];
                        const allHot = typesArr.every(t => t === 'HOT');
                        const allCold = typesArr.every(t => t === 'COLD' || t === 'ICE');
                        if (!allHot && !allCold) {
                            const odI = localBlueLast[i] ? localBlueLast[i].idx : windowDraws.length;
                            const odJ = localBlueLast[j] ? localBlueLast[j].idx : windowDraws.length;
                            const bonusI = (odI >= 2 && odI <= 5 ? 2 : 0) + (localBlueRecent[i] || 0) * 0.5;
                            const bonusJ = (odJ >= 2 && odJ <= 5 ? 2 : 0) + (localBlueRecent[j] || 0) * 0.5;
                            valid.push({
                                nums: [i, j], sum: s1,
                                types: typesArr.join('+'),
                                score: typesArr.length * 10 + (localBlueCount[i] || 0) + (localBlueCount[j] || 0) + bonusI + bonusJ
                            });
                        }
                    }
                }
            }
            valid.sort((a, b) => b.score - a.score);
            return valid;
        }

        const validPairs = findValidBluePairs();
        const t1 = validPairs.find(t => t.types.includes('HOT') && t.types.includes('COLD'))
                || validPairs.find(t => t.types.includes('HOT') && t.types.includes('ICE'))
                || validPairs[0];
        const t2 = validPairs.find(t => t.types.includes('WARM') && t.types.includes('COLD') && t !== t1)
                || validPairs[Math.min(validPairs.length - 1, 3)];

        const set1 = buildRedSet([2, 3, 2], 4); // 2-3-2 侧重二区，奇偶 4:3
        const set2 = buildRedSet([3, 2, 2], 3); // 3-2-2 侧重一区，奇偶 3:4

        // 校验红球
        function validateBuiltSet(reds) {
            const zones = { Z1: [], Z2: [], Z3: [] };
            for (const r of reds) {
                const z = getZone(r);
                if (z) zones[z].push(r);
            }
            const hotCount = reds.filter(r => localRedLabel(localRedCount[r] || 0) === 'HOT').length;
            const warmCount = reds.filter(r => localRedLabel(localRedCount[r] || 0) === 'WARM').length;
            const cons = findConsecutivePairs(reds);
            return {
                zones,
                hotCount,
                warmCount,
                coldCount: reds.length - hotCount - warmCount,
                cons,
                distribution: `${zones.Z1.length}-${zones.Z2.length}-${zones.Z3.length}`,
                oddCount: reds.filter(x => x % 2 === 1).length
            };
        }

        const groups = [];
        for (const [reds, blues, name] of [
            [set1, t1.nums, '第一组 (2-3-2 分布 / 二区侧重)'],
            [set2, t2.nums, '第二组 (3-2-2 分布 / 一区侧重)']
        ]) {
            const rv = validateBuiltSet(reds);
            groups.push({
                name,
                reds,
                blues,
                distribution: rv.distribution,
                hotCount: rv.hotCount,
                warmCount: rv.warmCount,
                coldCount: rv.coldCount,
                consecutivePairs: rv.cons,
                oddEven: rv.oddCount + ':' + (reds.length - rv.oddCount)
            });
        }

        newPrediction = {
            generatedAt: new Date().toISOString(),
            forIssue: draws[0].code,
            groups
        };

        predictions.push(newPrediction);
        // 只保留最近 50 条推荐记录
        if (predictions.length > 50) predictions.splice(0, predictions.length - 50);
        savePredictions(predictions);

        // 展示推荐结果
        console.log('\n' + '-'.repeat(60));
        console.log('  🎯 本期选号推荐');
        console.log('-'.repeat(60));
        for (const g of newPrediction.groups) {
            console.log(`\n  ${g.name}`);
            console.log(`  🔴 红球: ${g.reds.map(n => pad(n)).join('  ')}`);
            console.log(`  🔵 蓝球: ${g.blues.map(n => pad(n)).join('  ')}`);
            console.log(`  📐 分区比: ${g.distribution}  连号: ${g.consecutivePairs.map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') || '--'}`);
            console.log(`  🌡 冷热: HOT=${g.hotCount}  WARM=${g.warmCount}  COLD/ICE=${g.coldCount}`);
        }
        console.log();

        // 清理临时文件
        try { fs.unlinkSync(TEMP_INPUT_PATH); } catch (_) {}

    } catch (e) {
        logError('分析引擎执行失败', e);
        log('⚠ 引擎执行失败，但数据已成功拉取和合并');
    }

    // Step 6: 生成仪表盘数据和报告
    log('📝 Step 6/6: 生成报告和仪表盘数据...');

    const dashboardData = generateDashboardData(draws, analysis.windowSize, predictions, review);
    fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2), 'utf8');
    log('💾 已生成 dashboard_data.json');
    generateStandaloneDashboard(dashboardData);

    const markdownReport = generateMarkdownReport(draws, analysis.windowSize, stats, predictions, review, engineOutput);
    fs.writeFileSync(REPORT_PATH, markdownReport, 'utf8');
    log('💾 已生成 latest_report.md');

    // 保存分析历史
    const analysisHistory = loadAnalysisHistory();
    analysisHistory.push({
        timestamp: new Date().toISOString(),
        latestIssue: draws[0].code,
        latestDate: draws[0].date,
        totalDraws: draws.length,
        newDrawsCount: newCount,
        redHotCount: Object.values(stats.redCount).filter(c => c >= 5).length,
        blueHotCount: Object.values(stats.blueCount).filter(c => c >= 3).length,
        review: review ? { bestRedHits: review.bestRedHits, bestBlueHit: review.bestBlueHit } : null
    });
    if (analysisHistory.length > 200) analysisHistory.splice(0, analysisHistory.length - 200);
    saveAnalysisHistory(analysisHistory);

    // 写入本次运行状态（供通知脚本判断是否推送）
    saveLastRun({ latestCode: draws[0].code, latestDate: draws[0].date, newCount, updated: true });

    // 终值摘要
    console.log('\n' + '='.repeat(70));
    console.log('  ✅ 分析完成！');
    console.log('='.repeat(70));
    console.log(`  📅 最新开奖: 第 ${draws[0].code} 期 (${draws[0].date})`);
    console.log(`  🔴 红球: ${draws[0].reds.map(n => pad(n)).join(' ')}  🔵 蓝球: ${pad(draws[0].blue)}`);
    console.log(`  📊 数据总量: ${draws.length} 期 (本次新增 ${newCount} 期)`);
    console.log(`  📁 数据文件: ${DRAWS_PATH}`);
    console.log(`  📝 分析报告: ${REPORT_PATH}`);
    console.log(`  📊 仪表盘:   ${path.join(ROOT, 'dashboard', 'index.html')}`);
    console.log(`  📈 仪表数据: ${DASHBOARD_DATA_PATH}`);
    if (review) {
        console.log(`  🎯 上期复盘: 红球 ${review.bestRedHits}/7, 蓝球 ${review.bestBlueHit ? '命中 ✅' : '未中 ❌'}`);
    }
    console.log('='.repeat(70));
}

// 执行
main().catch(e => {
    logError('脚本执行异常退出', e);
    process.exit(1);
});
