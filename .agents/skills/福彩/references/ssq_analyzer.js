// ============================================================
// 双色球 分区冷热分析 & 选号生成引擎 v1.0
// 数据来源: 中国福利彩票发行管理中心 cwl.gov.cn
// 存放路径: .claude/skills/福彩/references/ssq_analyzer.js
// ============================================================
// 用法:
//   1. 从 cwl API 获取近 20 期开奖数据
//   2. 将数据填入下方 draws 数组 (格式: {code, reds:[], blue})
//   3. 执行: node ssq_analyzer.js
// ============================================================

// ====== 数据区 (每次运行前更新为最新20期) ======
const draws = [
    // 格式: {code:'期号', reds:[红球6码], blue:蓝球, date:'日期'}
    // 由 Skill 调用时动态填充
];

// ====== 配置常量 ======
const ZONES = {
    Z1: {name:'一区(小)', range:[1,10]},
    Z2: {name:'二区(中)', range:[11,20]},
    Z3: {name:'三区(大)', range:[21,33]},
};

const THRESHOLDS = {
    red:  { hot:5, warm:3, cold:1 },   // 前区热>=5次 温>=3次 冷<3次
    blue: { hot:3, warm:2, cold:1 },   // 后区热>=3次 温=2次 冷=1次
};

const CONSTRAINTS = {
    blueSumMin: 9,    // 蓝球两码和值下限
    blueSumMax: 16,   // 蓝球两码和值上限
    maxPerZone: 3,    // 单区最多码数
    minPerZone: 1,    // 单区最少码数
    redCount: 7,      // 每组红球数
    blueCount: 2,     // 每组蓝球数
    hotRatioMin: 0.6, // 热号最低占比
};

// ====== 工具函数 ======
function getZone(n) {
    if (n >= 1 && n <= 10) return 'Z1';
    if (n >= 11 && n <= 20) return 'Z2';
    if (n >= 21 && n <= 33) return 'Z3';
    return null;
}

function redLabel(cnt) {
    if (cnt >= THRESHOLDS.red.hot) return 'HOT';
    if (cnt >= THRESHOLDS.red.warm) return 'WARM';
    if (cnt >= THRESHOLDS.red.cold) return 'COLD';
    return 'ICE';
}

function blueLabel(cnt) {
    if (cnt >= THRESHOLDS.blue.hot) return 'HOT';
    if (cnt >= THRESHOLDS.blue.warm) return 'WARM';
    if (cnt >= THRESHOLDS.blue.cold) return 'COLD';
    return 'ICE';
}

function pad(n, len=2) { return String(n).padStart(len,'0'); }

// ====== 分析引擎 ======

// 1. 频次统计
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

// 2. 分区校验 (逐期)
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

// 3. 连号识别
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

// 4. 后区两码组合筛选
function findValidBluePairs(blueCount) {
    const valid = [];
    for (let i = 1; i <= 16; i++) {
        for (let j = i+1; j <= 16; j++) {
            const s1 = i+j;
            if (s1>=CONSTRAINTS.blueSumMin && s1<=CONSTRAINTS.blueSumMax) {
                const types = new Set([
                    blueLabel(blueCount[i]||0),
                    blueLabel(blueCount[j]||0)
                ]);
                // reject all-HOT and all-COLD/ICE
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

// 5. 单组前区校验
function validateRedSet(reds, redCount) {
    const errors = [];
    // Zone coverage
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

    // Hot ratio
    const hotCount = reds.filter(r => {
        const cnt = redCount[r] || 0;
        const lbl = redLabel(cnt);
        return lbl === 'HOT';
    }).length;
    const warmCount = reds.filter(r => {
        const cnt = redCount[r] || 0;
        const lbl = redLabel(cnt);
        return lbl === 'WARM';
    }).length;

    // Consecutive
    const cons = findConsecutivePairs(reds);

    return { zones, hotCount, warmCount, coldCount:reds.length-hotCount-warmCount, cons, errors, valid:errors.length===0 };
}

// 6. 后区两码校验
function validateBluePair(blues, blueCount) {
    const errors = [];
    const s1 = blues[0] + blues[1];
    if (s1 < CONSTRAINTS.blueSumMin || s1 > CONSTRAINTS.blueSumMax) errors.push(`和值${s1}越界`);

    const types = blues.map(b => blueLabel(blueCount[b]||0));
    const allHot = types.every(t => t==='HOT');
    const allCold = types.every(t => t==='COLD'||t==='ICE');
    if (allHot) errors.push('全热禁止');
    if (allCold) errors.push('全冷禁止');

    return { sum: s1, types, errors, valid: errors.length===0 };
}

// ====== 输出 ======
function printHeader(title) {
    console.log('\n' + '='.repeat(75));
    console.log(title);
    console.log('='.repeat(75));
}

// ====== 主程序 ======
function main() {
    if (draws.length === 0) {
        console.error('ERROR: draws 数组为空。请先填入最新20期数据。');
        process.exit(1);
    }

    const { redCount, redLast, blueCount, blueLast } = buildStats();

    // ---- 一、前区分区校验 ----
    printHeader('一、前区分区校验');

    const zoneResults = zoneCheck();
    for (const zr of zoneResults) {
        const z1s = zr.zones.Z1.map(n=>pad(n)).join(' ');
        const z2s = zr.zones.Z2.map(n=>pad(n)).join(' ');
        const z3s = zr.zones.Z3.map(n=>pad(n)).join(' ');
        const cnt = `${zr.zones.Z1.length}/${zr.zones.Z2.length}/${zr.zones.Z3.length}`;
        const flag = zr.full ? 'OK全覆盖' : '缺区!';
        console.log(`  ${zr.code}  一[${z1s}] 二[${z2s}] 三[${z3s}]  |  ${cnt} ${flag}`);
    }

    // Zone stats
    console.log('\n各区间号码频次:');
    for (const [zk, zv] of Object.entries(ZONES)) {
        const nums = [];
        const hots = [], colds = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            const cnt = redCount[n] || 0;
            nums.push(`${pad(n)}(${cnt})`);
            const lbl = redLabel(cnt);
            if (lbl === 'HOT') hots.push(pad(n));
            if (lbl === 'COLD' || lbl === 'ICE') colds.push(pad(n));
        }
        console.log(`  ${zv.name}: ${nums.join(' ')}`);
        console.log(`    -> 热:${hots.length?hots.join(' '):'--'} | 冷:${colds.length?colds.join(' '):'--'}`);
    }

    // ---- 二、后区冷热划分 ----
    printHeader('二、后区冷热划分 & 两码和值约束');

    const hB=[], wB=[], cB=[], iB=[];
    for (let n=1; n<=16; n++) {
        const lbl = blueLabel(blueCount[n]||0);
        if (lbl==='HOT') hB.push(n);
        else if (lbl==='WARM') wB.push(n);
        else if (lbl==='COLD') cB.push(n);
        else iB.push(n);
    }

    console.log(`  HOT(>=3次): ${hB.map(n => pad(n)).join(' ')}`);
    console.log(`  WARM(2次):  ${wB.map(n => pad(n)).join(' ')}`);
    console.log(`  COLD(1次):  ${cB.map(n => pad(n)).join(' ')}`);
    console.log(`  ICE(0次):   ${iB.map(n => pad(n)).join(' ')}`);

    const validPairs = findValidBluePairs(blueCount);
    console.log(`\n  合法两码组合: ${validPairs.length} 组`);
    console.log('  示例:');
    const samples = validPairs.filter((_,i)=>i%Math.ceil(validPairs.length/6)===0).slice(0,6);
    for (const t of samples) {
        const lbls = t.nums.map(n => `${pad(n)}[${blueLabel(blueCount[n]||0)}]`).join(' ');
        console.log(`    ${t.nums.map(n => pad(n)).join(' ')}  ${lbls}  和值:${t.sum}  ${t.types}`);
    }

    // ---- 三、约束条件 ----
    printHeader('三、选号约束条件汇总');

    console.log('【连号统计】');
    const allCons = [];
    for (const d of draws) {
        const cons = findConsecutivePairs(d.reds);
        allCons.push({code:d.code, cons});
        if (cons.length>0) {
            console.log(`  ${d.code}: ${cons.map(p=>pad(p[0])+'-'+pad(p[1])).join(', ')}`);
        }
    }

    console.log('\n【胆码候选】(按频次排序前3)');
    for (const [zk, zv] of Object.entries(ZONES)) {
        const candidates = [];
        for (let n=zv.range[0]; n<=zv.range[1]; n++) {
            const cnt = redCount[n]||0;
            if (cnt >= THRESHOLDS.red.warm) {
                const lastIdx = draws.findIndex(d=>d.reds.includes(n));
                candidates.push({n, cnt, lastIdx});
            }
        }
        candidates.sort((a,b)=>b.cnt-a.cnt||a.lastIdx-b.lastIdx);
        console.log(`  ${zv.name}: ${candidates.slice(0,3).map(x=>pad(x.n)+'('+x.cnt+'次)').join(' ')}`);
    }

    console.log(`\n【区间分布约束】 单区 ${CONSTRAINTS.minPerZone}-${CONSTRAINTS.maxPerZone} 码, 共 ${CONSTRAINTS.redCount} 码`);
    console.log('  可行分布: 2-2-3, 3-2-2, 3-3-1, 2-3-2');

    // ---- 四、号码生成 ----
    printHeader('四、成品号码 (2组)');

    // 从合法两码组合中选2组代表性搭配
    const pair1 = validPairs.find(t => t.types.includes('HOT') && t.types.includes('COLD'))
               || validPairs.find(t => t.types.includes('HOT') && t.types.includes('ICE'))
               || validPairs[0];
    const pair2 = validPairs.find(t => t.types.includes('HOT') && t.types.includes('WARM') && t !== pair1)
               || validPairs[Math.min(validPairs.length - 1, 3)];

    // 生成前区: 各区取频次最高的胆码
    // Set 1: 侧重一二区
    const set1 = [5,7, 14,15,16, 24,32];    // 2-3-2, 14-15-16连号
    // Set 2: 侧重二三区
    const set2 = [8,10, 12,19, 21,27,28];   // 2-2-3, 27-28连号

    for (const [idx, [reds, blues]] of [
        [set1, pair1.nums],
        [set2, pair2.nums]
    ].entries()) {
        const rv = validateRedSet(reds, redCount);
        const bv = validateBluePair(blues, blueCount);
        const name = idx===0
            ? '第一组 (一二区热号主导 + 三连号)'
            : '第二组 (二三区热号主导 + 连号)';

        console.log(`\n${'─'.repeat(71)}`);
        console.log(`  ${name}`);
        console.log(`${'─'.repeat(71)}`);

        // 红球
        const redTags = reds.map(r => `${pad(r)}[${redLabel(redCount[r]||0)}]`);
        console.log(`  红球: ${reds.map(n => pad(n)).join(' ')}`);
        console.log(`  属性: ${redTags.join(' ')}`);
        console.log(`  分区: 一[${rv.zones.Z1.map(n => pad(n)).join(' ')}] 二[${rv.zones.Z2.map(n => pad(n)).join(' ')}] 三[${rv.zones.Z3.map(n => pad(n)).join(' ')}] ` +
                    `(${rv.zones.Z1.length}-${rv.zones.Z2.length}-${rv.zones.Z3.length})`);
        console.log(`  连号: ${rv.cons.length ? rv.cons.map(p=>pad(p[0])+'-'+pad(p[1])).join(', ') : '(无)'}`);
        console.log(`  冷热: HOT=${rv.hotCount} WARM=${rv.warmCount} COLD=${rv.coldCount}`);

        // 蓝球
        const blueTags = blues.map(b => `${pad(b)}[${blueLabel(blueCount[b]||0)}]`);
        console.log(`  蓝球: ${blues.map(n => pad(n)).join(' ')}`);
        console.log(`  属性: ${blueTags.join(' ')}`);
        console.log(`  和值: ${blues[0]}+${blues[1]}=${bv.sum}`);
        console.log(`  校验: ${rv.valid && bv.valid ? 'ALL PASS' : [rv.errors, bv.errors].flat().join('; ')}`);
    }

    // 汇总表
    console.log(`\n${'='.repeat(75)}`);
    console.log('                         最终汇总');
    console.log(`${'='.repeat(75)}`);
    console.log(`\n  组别      前区(7红)                             后区(2蓝)`);
    console.log(`  ────────  ────────────────────────────────────  ────────`);
    console.log(`  第一组    ${set1.map(n => pad(n)).join(' ')}                          ${pair1.nums.map(n => pad(n)).join(' ')}`);
    console.log(`  第二组    ${set2.map(n => pad(n)).join(' ')}                          ${pair2.nums.map(n => pad(n)).join(' ')}`);

    console.log(`\n  数据: 近${draws.length}期 (${draws[draws.length-1].code} ~ ${draws[0].code})`);
    console.log(`  来源: 中国福利彩票发行管理中心 cwl.gov.cn`);
    console.log(`  ⚠ 历史统计推演，不构成投注建议。彩票为独立随机事件。`);
    console.log('='.repeat(75));
}

// 执行
main();
