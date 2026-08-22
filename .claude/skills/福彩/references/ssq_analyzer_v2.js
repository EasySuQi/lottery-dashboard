// ============================================================
// 双色球 分区冷热分析 & 选号生成引擎 v2.0 (动态生成版)
// 数据来源: 中国福利彩票发行管理中心 cwl.gov.cn
// ============================================================

// ====== 数据区 (从 API 自动填充) ======
// 读取数据：优先从环境变量 SSQ_DATA_FILE，否则从标准输入
const draws = (() => {
    let raw;
    const dataFile = process.env.SSQ_DATA_FILE;
    if (dataFile) {
        raw = JSON.parse(require('fs').readFileSync(dataFile, 'utf8'));
    } else {
        // 从标准输入读取
        const chunks = [];
        const fd = 0; // stdin
        const buf = Buffer.alloc(65536);
        let bytesRead;
        while ((bytesRead = require('fs').readSync(fd, buf, 0, buf.length, null)) > 0) {
            chunks.push(buf.toString('utf8', 0, bytesRead));
        }
        raw = JSON.parse(chunks.join(''));
    }
    return raw.result.slice(0, 20).map(d => ({
        code: d.code,
        reds: d.red.split(',').map(Number),
        blue: parseInt(d.blue, 10),
        date: d.date
    }));
})();

// ====== 配置常量 ======
const ZONES = {
    Z1: {name:'一区(小)', range:[1,10]},
    Z2: {name:'二区(中)', range:[11,20]},
    Z3: {name:'三区(大)', range:[21,33]},
};

const THRESHOLDS = {
    red:  { hot:5, warm:3, cold:1 },
    blue: { hot:3, warm:2, cold:1 },
};

const CONSTRAINTS = {
    blueSumMin: 9,
    blueSumMax: 16,
    maxPerZone: 3,
    minPerZone: 1,
    redCount: 7,
    blueCount: 2,
    hotRatioMin: 0.6,
};

// ====== 工具函数 ======
function getZone(n) {
    if (n >= 1 && n <= 10) return 'Z1';
    if (n >= 11 && n <= 20) return 'Z2';
    if (n >= 21 && n <= 33) return 'Z3';
    return null;
}

function redLabel(cnt) {
    if (cnt >= THRESHOLDS.red.hot) return '🔥HOT';
    if (cnt >= THRESHOLDS.red.warm) return '●WARM';
    if (cnt >= THRESHOLDS.red.cold) return '❄COLD';
    return '🧊ICE';
}

function blueLabel(cnt) {
    if (cnt >= THRESHOLDS.blue.hot) return '🔥HOT';
    if (cnt >= THRESHOLDS.blue.warm) return '●WARM';
    if (cnt >= THRESHOLDS.blue.cold) return '❄COLD';
    return '🧊ICE';
}

function redLabelShort(cnt) {
    if (cnt >= THRESHOLDS.red.hot) return 'HOT';
    if (cnt >= THRESHOLDS.red.warm) return 'WARM';
    if (cnt >= THRESHOLDS.red.cold) return 'COLD';
    return 'ICE';
}

function blueLabelShort(cnt) {
    if (cnt >= THRESHOLDS.blue.hot) return 'HOT';
    if (cnt >= THRESHOLDS.blue.warm) return 'WARM';
    if (cnt >= THRESHOLDS.blue.cold) return 'COLD';
    return 'ICE';
}

function pad(n, len=2) { return String(n).padStart(len,'0'); }

// ====== 分析引擎 ======

function buildStats() {
    const redCount = {}, redLast = {};
    const blueCount = {}, blueLast = {};

    for (let i = 0; i < draws.length; i++) {
        for (const r of draws[i].reds) {
            redCount[r] = (redCount[r] || 0) + 1;
            if (!(r in redLast)) redLast[r] = { code:draws[i].code, idx:i };
        }
        const b = draws[i].blue;
        blueCount[b] = (blueCount[b] || 0) + 1;
        if (!(b in blueLast)) blueLast[b] = { code:draws[i].code, idx:i };
    }

    return { redCount, redLast, blueCount, blueLast };
}

function zoneCheck() {
    const results = [];
    for (const d of draws) {
        const zones = { Z1:[], Z2:[], Z3:[] };
        for (const r of d.reds) {
            const z = getZone(r);
            if (z) zones[z].push(r);
        }
        const full = zones.Z1.length>0 && zones.Z2.length>0 && zones.Z3.length>0;
        results.push({ code:d.code, zones, full });
    }
    return results;
}

function findConsecutivePairs(reds) {
    const sorted = [...reds].sort((a,b)=>a-b);
    const pairs = [];
    for (let i = 0; i < sorted.length-1; i++) {
        if (sorted[i+1] - sorted[i] === 1) {
            pairs.push([sorted[i], sorted[i+1]]);
        }
    }
    return pairs;
}

function findValidBluePairs(blueCount) {
    const valid = [];
    for (let i = 1; i <= 16; i++) {
        for (let j = i+1; j <= 16; j++) {
            const s1 = i+j;
            if (s1>=CONSTRAINTS.blueSumMin && s1<=CONSTRAINTS.blueSumMax) {
                const types = new Set([
                    blueLabelShort(blueCount[i]||0),
                    blueLabelShort(blueCount[j]||0)
                ]);
                const allHot = [...types].every(t => t==='HOT');
                const allCold = [...types].every(t => t==='COLD'||t==='ICE');
                if (!allHot && !allCold) {
                    valid.push({ nums:[i,j], sum: s1, types:[...types].join('+') });
                }
            }
        }
    }
    return valid;
}

function validateRedSet(reds, redCount) {
    const errors = [];
    const zones = { Z1:[], Z2:[], Z3:[] };
    for (const r of reds) {
        const z = getZone(r);
        if (z) zones[z].push(r);
    }
    if (zones.Z1.length === 0) errors.push('缺一区');
    if (zones.Z2.length === 0) errors.push('缺二区');
    if (zones.Z3.length === 0) errors.push('缺三区');
    if (zones.Z1.length > CONSTRAINTS.maxPerZone) errors.push('一区超3码');
    if (zones.Z2.length > CONSTRAINTS.maxPerZone) errors.push('二区超3码');
    if (zones.Z3.length > CONSTRAINTS.maxPerZone) errors.push('三区超3码');

    const hotCount = reds.filter(r => redLabelShort(redCount[r]||0) === 'HOT').length;
    const warmCount = reds.filter(r => redLabelShort(redCount[r]||0) === 'WARM').length;
    const cons = findConsecutivePairs(reds);

    return { zones, hotCount, warmCount, coldCount:reds.length-hotCount-warmCount, cons, errors, valid:errors.length===0 };
}

function validateBluePair(blues, blueCount) {
    const errors = [];
    const s1 = blues[0] + blues[1];
    if (s1 < CONSTRAINTS.blueSumMin || s1 > CONSTRAINTS.blueSumMax) errors.push(`和值${s1}越界`);

    const types = blues.map(b => blueLabelShort(blueCount[b]||0));
    const allHot = types.every(t => t==='HOT');
    const allCold = types.every(t => t==='COLD'||t==='ICE');
    if (allHot) errors.push('全热禁止');
    if (allCold) errors.push('全冷禁止');

    return { sum: s1, types, errors, valid:errors.length===0 };
}

// ====== 动态选号生成 ======
function generateRedSets(redCount, redLast) {
    // 各区号池按频次排序
    const zonePools = {};
    for (const [zk, zv] of Object.entries(ZONES)) {
        const pool = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            pool.push({
                num: n,
                count: redCount[n] || 0,
                lastIdx: redLast[n] ? redLast[n].idx : 99,
                label: redLabelShort(redCount[n] || 0)
            });
        }
        // 按频次降序 + 最近出现优先
        pool.sort((a,b) => b.count - a.count || a.lastIdx - b.lastIdx);
        zonePools[zk] = pool;
    }

    function buildSet(dist) {
        // dist: [Z1count, Z2count, Z3count]
        const picked = [];
        // 每个区间取 top 热号
        for (const [zk, cnt] of [['Z1',dist[0]], ['Z2',dist[1]], ['Z3',dist[2]]]) {
            const pool = zonePools[zk];
            // 优先取热号+温号
            const hotWarm = pool.filter(p => p.label === 'HOT' || p.label === 'WARM');
            const cold = pool.filter(p => p.label === 'COLD' || p.label === 'ICE');

            let selected = [];
            let need = cnt;
            // 先从热温池取
            for (let i = 0; i < hotWarm.length && selected.length < need; i++) {
                if (!picked.includes(hotWarm[i].num)) {
                    selected.push(hotWarm[i].num);
                }
            }
            // 不够再补冷号
            for (let i = 0; i < cold.length && selected.length < need; i++) {
                if (!picked.includes(cold[i].num)) {
                    selected.push(cold[i].num);
                }
            }
            // 还是不够，从头取
            for (let i = 0; i < pool.length && selected.length < need; i++) {
                if (!picked.includes(pool[i].num) && !selected.includes(pool[i].num)) {
                    selected.push(pool[i].num);
                }
            }
            selected.sort((a,b)=>a-b);
            for (const n of selected) picked.push(n);
        }
        return picked.sort((a,b)=>a-b);
    }

    // 生成两组：分布不同
    const set1 = buildSet([2, 3, 2]); // 2-3-2 侧重二区
    const set2 = buildSet([3, 2, 2]); // 3-2-2 侧重一区

    return { set1, set2, zonePools };
}

function selectBluePairs(validPairs, blueCount) {
    // 优先选混合度最高的组合
    const scored = validPairs.map(t => {
        const typeSet = new Set(t.types.split('+'));
        const score = typeSet.size * 10 + t.nums.reduce((s, n) => s + (blueCount[n] || 0), 0);
        return { ...t, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // 取两个不同风格的
    const t1 = scored.find(t => t.types.includes('HOT') && t.types.includes('COLD')) || scored[0];
    const t2 = scored.find(t => t.types.includes('WARM') && t.types.includes('COLD') && t !== t1) || scored[Math.min(scored.length-1, 3)];

    return { t1, t2 };
}

// ====== 输出 ======
function printHeader(title) {
    console.log('\n' + '='.repeat(80));
    console.log(title);
    console.log('='.repeat(80));
}

// ====== 主程序 ======
function main() {
    if (draws.length === 0) {
        console.error('ERROR: 无数据');
        process.exit(1);
    }

    console.log(`\n📅 数据范围: 第 ${draws[draws.length-1].code} 期 ~ 第 ${draws[0].code} 期 (共 ${draws.length} 期)`);
    console.log(`📅 最新一期: 第 ${draws[0].code} 期 (${draws[0].date})`);

    const { redCount, redLast, blueCount, blueLast } = buildStats();

    // ---- 一、前区分区校验 ----
    printHeader('一、前区分区校验（近 20 期逐期分布）');

    const zoneResults = zoneCheck();
    let missingZoneCount = 0;
    for (const zr of zoneResults) {
        const z1s = zr.zones.Z1.map(n=>pad(n)).join(' ');
        const z2s = zr.zones.Z2.map(n=>pad(n)).join(' ');
        const z3s = zr.zones.Z3.map(n=>pad(n)).join(' ');
        const cnt = `${zr.zones.Z1.length}/${zr.zones.Z2.length}/${zr.zones.Z3.length}`;
        const flag = zr.full ? '✅ 全覆盖' : '⚠ 缺区!';
        if (!zr.full) missingZoneCount++;
        console.log(`  ${zr.code}  一[${z1s.padEnd(18)}] 二[${z2s.padEnd(18)}] 三[${z3s.padEnd(18)}] | ${cnt} ${flag}`);
    }
    console.log(`\n  📊 全覆盖率: ${zoneResults.length - missingZoneCount}/${zoneResults.length} (${((zoneResults.length-missingZoneCount)/zoneResults.length*100).toFixed(0)}%)`);

    // Zone stats
    console.log('\n📊 各区间号码频次统计:');
    for (const [zk, zv] of Object.entries(ZONES)) {
        const nums = [];
        const hots = [], warms = [], colds = [], ices = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            const cnt = redCount[n] || 0;
            nums.push(`${pad(n)}(${cnt})`);
            const lbl = redLabelShort(cnt);
            if (lbl === 'HOT') hots.push(pad(n));
            else if (lbl === 'WARM') warms.push(pad(n));
            else if (lbl === 'COLD') colds.push(pad(n));
            else ices.push(pad(n));
        }
        console.log(`  ${zv.name}: ${nums.join(' ')}`);
        console.log(`    🔥热号(≥5次): ${hots.length ? hots.join(' ') : '--'}`);
        console.log(`    ●温号(3-4次): ${warms.length ? warms.join(' ') : '--'}`);
        console.log(`    ❄冷号(1-2次): ${colds.length ? colds.join(' ') : '--'}`);
        console.log(`    🧊极冷(0次):  ${ices.length ? ices.join(' ') : '--'}`);
    }

    // ---- 二、后区冷热划分 ----
    printHeader('二、后区冷热划分 & 两码和值约束');

    console.log('蓝球 1-16 频次明细:');
    const blueLines = [];
    for (let n = 1; n <= 16; n++) {
        const cnt = blueCount[n] || 0;
        const lbl = blueLabel(cnt);
        blueLines.push(`${pad(n)}[${lbl}](${cnt}次)`);
        if (n % 8 === 0) {
            console.log('  ' + blueLines.splice(0, 8).join('  '));
        }
    }

    const hB=[], wB=[], cB=[], iB=[];
    for (let n=1; n<=16; n++) {
        const lbl = blueLabelShort(blueCount[n]||0);
        if (lbl==='HOT') hB.push(n);
        else if (lbl==='WARM') wB.push(n);
        else if (lbl==='COLD') cB.push(n);
        else iB.push(n);
    }

    console.log(`\n  热度分级:`);
    console.log(`  🔥 HOT(≥3次):  ${hB.length ? hB.map(n => pad(n)).join(' ') : '--'}`);
    console.log(`  ● WARM(2次):   ${wB.length ? wB.map(n => pad(n)).join(' ') : '--'}`);
    console.log(`  ❄ COLD(1次):   ${cB.length ? cB.map(n => pad(n)).join(' ') : '--'}`);
    console.log(`  🧊 ICE(0次):    ${iB.length ? iB.map(n => pad(n)).join(' ') : '--'}`);

    const validPairs = findValidBluePairs(blueCount);
    console.log(`\n  合法两码组合总数: ${validPairs.length} 组`);
    console.log('  代表性组合示例:');

    // 展示各种类型搭配
    const demoTypes = [
        'HOT+COLD',
        'HOT+ICE',
        'HOT+WARM',
        'WARM+COLD',
    ];
    for (const dt of demoTypes) {
        const found = validPairs.find(t => t.types === dt);
        if (found) {
            const lbls = found.nums.map(n => `${pad(n)}[${blueLabel(blueCount[n]||0)}]`).join(' ');
            console.log(`    ${found.nums.map(n => pad(n)).join(' ')}  ${lbls}  和值:${found.sum}  类型:${found.types}`);
        }
    }

    // ---- 三、约束条件 ----
    printHeader('三、选号约束条件汇总');

    console.log('【连号统计 - 近20期每期连号情况】');
    const allCons = [];
    let consDrawCount = 0;
    for (const d of draws) {
        const cons = findConsecutivePairs(d.reds);
        allCons.push({code:d.code, cons});
        if (cons.length > 0) {
            consDrawCount++;
            console.log(`  ${d.code}: ${cons.map(p=>pad(p[0])+'-'+pad(p[1])).join(', ')}`);
        } else {
            console.log(`  ${d.code}: (无连号)`);
        }
    }
    console.log(`\n  📊 连号出现率: ${consDrawCount}/${draws.length} (${(consDrawCount/draws.length*100).toFixed(0)}%)`);

    // 高频连号对统计
    const pairCount = {};
    for (const ac of allCons) {
        for (const p of ac.cons) {
            const key = pad(p[0]) + '-' + pad(p[1]);
            pairCount[key] = (pairCount[key] || 0) + 1;
        }
    }
    const topPairs = Object.entries(pairCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (topPairs.length > 0) {
        console.log(`  高频连号对: ${topPairs.map(([k,v])=>`${k}(${v}次)`).join(', ')}`);
    }

    console.log('\n【各区胆码候选】(按频次 + 活跃度排序 Top 3)');
    for (const [zk, zv] of Object.entries(ZONES)) {
        const candidates = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            const cnt = redCount[n]||0;
            if (cnt >= THRESHOLDS.red.warm) {
                const lastIdx = redLast[n] ? redLast[n].idx : 99;
                candidates.push({n, cnt, lastIdx});
            }
        }
        candidates.sort((a,b)=>b.cnt-a.cnt||a.lastIdx-b.lastIdx);
        console.log(`  ${zv.name}: ${candidates.slice(0,3).map(x=>`${pad(x.n)}(${x.cnt}次,距上期${x.lastIdx}期)`).join('  ')}`);
    }

    console.log(`\n【区间分布约束】`);
    console.log(`  • 单区限制: ${CONSTRAINTS.minPerZone}-${CONSTRAINTS.maxPerZone} 码/区`);
    console.log(`  • 红球共 ${CONSTRAINTS.redCount} 码，需三区全覆盖`);
    console.log(`  • 可行分布: 2-2-3, 3-2-2, 3-3-1, 2-3-2`);
    console.log(`  • 热号主导: 热号+温号 ≥ 5 个 (${CONSTRAINTS.redCount} 码中)`);

    // ---- 四、号码生成 ----
    printHeader('四、成品号码 (2 组 7+2)');

    const { set1, set2, zonePools } = generateRedSets(redCount, redLast);
    const { t1, t2 } = selectBluePairs(validPairs, blueCount);

    const groups = [
        { reds: set1, blues: t1.nums, name: '第一组 (2-3-2 分布 / 二区侧重)', pair: t1 },
        { reds: set2, blues: t2.nums, name: '第二组 (3-2-2 分布 / 一区侧重)', pair: t2 },
    ];

    for (const [idx, g] of groups.entries()) {
        const rv = validateRedSet(g.reds, redCount);
        const bv = validateBluePair(g.blues, blueCount);

        console.log(`\n${'─'.repeat(76)}`);
        console.log(`  🎯 ${g.name}`);
        console.log(`${'─'.repeat(76)}`);

        // 红球
        const redTags = g.reds.map(r => `${pad(r)}[${redLabel(redCount[r]||0)}]`);
        console.log(`  🔴 红球: ${g.reds.map(n => pad(n)).join('  ')}`);
        console.log(`     属性: ${redTags.join(' ')}`);

        const z1 = rv.zones.Z1.map(n => pad(n)).join(' ');
        const z2 = rv.zones.Z2.map(n => pad(n)).join(' ');
        const z3 = rv.zones.Z3.map(n => pad(n)).join(' ');
        console.log(`     分区: 一区[${z1.padEnd(18)}] 二区[${z2.padEnd(18)}] 三区[${z3.padEnd(18)}] (${rv.zones.Z1.length}-${rv.zones.Z2.length}-${rv.zones.Z3.length})`);
        console.log(`     连号: ${rv.cons.length ? rv.cons.map(p=>pad(p[0])+'-'+pad(p[1])).join(', ') : '(无 —— 不满足连号约束!)'}`);
        console.log(`     冷热: HOT=${rv.hotCount}  WARM=${rv.warmCount}  COLD/ICE=${rv.coldCount}`);

        // 蓝球
        const blueTags = g.blues.map(b => `${pad(b)}[${blueLabel(blueCount[b]||0)}]`);
        console.log(`  🔵 蓝球: ${g.blues.map(n => pad(n)).join('  ')}`);
        console.log(`     属性: ${blueTags.join(' ')}`);
        console.log(`     和值: ${g.blues[0]}+${g.blues[1]}=${bv.sum}`);
        const redStatus = rv.errors.length === 0 ? '✅' : `⚠ ${rv.errors.join(', ')}`;
        const blueStatus = bv.errors.length === 0 ? '✅' : `⚠ ${bv.errors.join(', ')}`;
        console.log(`     校验: 前区 ${redStatus}  |  后区 ${blueStatus}`);
    }

    // 汇总表
    console.log(`\n${'='.repeat(80)}`);
    console.log('                            📋 最 终 汇 总');
    console.log(`${'='.repeat(80)}`);
    console.log();
    console.log(`  组别      前区(7红)                                 后区(2蓝)         分区比    连号`);
    console.log(`  ──────    ──────────────────────────────────    ──────────────    ──────    ────────`);

    for (const [idx, g] of groups.entries()) {
        const rv = validateRedSet(g.reds, redCount);
        const ratio = `${rv.zones.Z1.length}-${rv.zones.Z2.length}-${rv.zones.Z3.length}`;
        const consStr = rv.cons.length ? rv.cons.map(p=>pad(p[0])+'-'+pad(p[1])).join(',') : '--';
        const name = idx === 0 ? '第一组' : '第二组';
        console.log(`  ${name}      ${g.reds.map(n => pad(n)).join(' ')}          ${g.blues.map(n => pad(n)).join(' ')}          ${ratio}      ${consStr}`);
    }

    console.log();
    console.log(`  📅 数据基础: 第 ${draws[draws.length-1].code} ~ ${draws[0].code} 期 (共 ${draws.length} 期)`);
    console.log(`  📅 最新开奖: 第 ${draws[0].code} 期 (${draws[0].date}) 红球 ${draws[0].reds.map(n => pad(n)).join(' ')}  蓝球 ${pad(draws[0].blue)}`);
    console.log(`  📡 数据来源: 中国福利彩票发行管理中心 cwl.gov.cn`);
    console.log();
    console.log('  ⚠️ 免责声明:');
    console.log('  ─────────────────────────────────────────────────');
    console.log('  以上为历史数据统计推演，不构成任何投注建议。');
    console.log('  彩票开奖为独立随机事件，历史频率不代表未来走势。');
    console.log('  请理性购彩，量力而行。');
    console.log('='.repeat(80));
}

main();
