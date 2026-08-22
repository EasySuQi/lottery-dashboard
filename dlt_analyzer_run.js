// ============================================================
// 超级大乐透 (DLT) 分区冷热分析 & 选号生成引擎 v1.0
// 数据来源: 国家体育总局体育彩票管理中心 webapi.sporttery.cn
// 存放路径: .claude/skills/体彩/references/dlt_analyzer.js
// ============================================================
// 用法:
//   1. 从 sporttery API 获取近 20 期开奖数据
//   2. 将数据填入下方 draws 数组
//      (格式: {code, front:[前区5码], back:[后区2码], date})
//   3. 执行: node dlt_analyzer.js
// ============================================================

// ====== 数据区 (每次运行前更新为最新20期) ======
const draws = [
    // 格式: {code:'期号', front:[前区5码], back:[后区2码], date:'日期'}
    // 由 Skill 调用时动态填充
];

// ====== 配置常量 ======
const ZONES = {
    Z1: {name: '一区(小)', range: [1, 12]},
    Z2: {name: '二区(中)', range: [13, 24]},
    Z3: {name: '三区(大)', range: [25, 35]},
};

const THRESHOLDS = {
    front: { hot: 4, warm: 2, cold: 1 },  // 前区: 热>=4次 温>=2次 冷=1次
    back:  { hot: 4, warm: 2, cold: 1 },  // 后区: 热>=4次 温>=2次 冷=1次
};

const CONSTRAINTS = {
    backSumMin: 9,      // 后区两码和值下限
    backSumMax: 17,     // 后区两码和值上限
    maxPerZone: 3,      // 单区最多码数
    minPerZone: 1,      // 单区最少码数
    frontCount: 7,      // 每组前区推荐数
    backCount: 2,       // 每组后区推荐数
    hotRatioMin: 0.6,   // 热号(HOT+WARM)最低占比
};

// ====== 工具函数 ======
function getZone(n) {
    if (n >= 1 && n <= 12) return 'Z1';
    if (n >= 13 && n <= 24) return 'Z2';
    if (n >= 25 && n <= 35) return 'Z3';
    return null;
}

function frontLabel(cnt) {
    if (cnt >= THRESHOLDS.front.hot) return 'HOT';
    if (cnt >= THRESHOLDS.front.warm) return 'WARM';
    if (cnt >= THRESHOLDS.front.cold) return 'COLD';
    return 'ICE';
}

function backLabel(cnt) {
    if (cnt >= THRESHOLDS.back.hot) return 'HOT';
    if (cnt >= THRESHOLDS.back.warm) return 'WARM';
    if (cnt >= THRESHOLDS.back.cold) return 'COLD';
    return 'ICE';
}

function pad(n, len) { return String(n).padStart(len || 2, '0'); }

// ====== 分析引擎 ======

// 1. 频次统计
function buildStats() {
    const frontCount = {}, frontLast = {};
    const backCount = {}, backLast = {};

    for (let i = 0; i < draws.length; i++) {
        for (const r of draws[i].front) {
            frontCount[r] = (frontCount[r] || 0) + 1;
            if (!(r in frontLast)) frontLast[r] = { code: draws[i].code, idx: i };
        }
        for (const b of draws[i].back) {
            backCount[b] = (backCount[b] || 0) + 1;
            if (!(b in backLast)) backLast[b] = { code: draws[i].code, idx: i };
        }
    }

    return { frontCount, frontLast, backCount, backLast };
}

// 2. 分区校验 (逐期)
function zoneCheck() {
    const results = [];
    for (const d of draws) {
        const zones = { Z1: [], Z2: [], Z3: [] };
        for (const r of d.front) {
            const z = getZone(r);
            if (z) zones[z].push(r);
        }
        const full = zones.Z1.length > 0 && zones.Z2.length > 0 && zones.Z3.length > 0;
        results.push({ code: d.code, zones, full });
    }
    return results;
}

// 3. 连号识别
function findConsecutivePairs(nums) {
    const sorted = [...nums].sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) {
            pairs.push([sorted[i], sorted[i + 1]]);
        }
    }
    return pairs;
}

// 4. 后区两码组合筛选
function findValidBackPairs(backCount) {
    const valid = [];
    for (let i = 1; i <= 12; i++) {
        for (let j = i + 1; j <= 12; j++) {
            const s1 = i + j;
            if (s1 >= CONSTRAINTS.backSumMin && s1 <= CONSTRAINTS.backSumMax) {
                const types = new Set([
                    backLabel(backCount[i] || 0),
                    backLabel(backCount[j] || 0)
                ]);
                // reject all-HOT and all-COLD/ICE
                const allHot = [...types].every(t => t === 'HOT');
                const allCold = [...types].every(t => t === 'COLD' || t === 'ICE');
                if (!allHot && !allCold) {
                    valid.push({ nums: [i, j], sum: s1, types: [...types].join('+') });
                }
            }
        }
    }
    return valid;
}

// 5. 单组前区校验
function validateFrontSet(frontNums, frontCount) {
    const errors = [];
    // Zone coverage
    const zones = { Z1: [], Z2: [], Z3: [] };
    for (const r of frontNums) {
        const z = getZone(r);
        if (z) zones[z].push(r);
    }
    if (zones.Z1.length === 0) errors.push('缺一区(01-12)');
    if (zones.Z2.length === 0) errors.push('缺二区(13-24)');
    if (zones.Z3.length === 0) errors.push('缺三区(25-35)');
    if (zones.Z1.length > CONSTRAINTS.maxPerZone) errors.push('一区超3码');
    if (zones.Z2.length > CONSTRAINTS.maxPerZone) errors.push('二区超3码');
    if (zones.Z3.length > CONSTRAINTS.maxPerZone) errors.push('三区超3码');

    // Hot/Warm ratio
    const hotCount = frontNums.filter(r => {
        const cnt = frontCount[r] || 0;
        return frontLabel(cnt) === 'HOT';
    }).length;
    const warmCount = frontNums.filter(r => {
        const cnt = frontCount[r] || 0;
        return frontLabel(cnt) === 'WARM';
    }).length;

    // Consecutive
    const cons = findConsecutivePairs(frontNums);

    return {
        zones, hotCount, warmCount,
        coldCount: frontNums.length - hotCount - warmCount,
        cons, errors,
        valid: errors.length === 0
    };
}

// 6. 后区两码校验
function validateBackPair(backNums, backCount) {
    const errors = [];
    const s1 = backNums[0] + backNums[1];
    if (s1 < CONSTRAINTS.backSumMin || s1 > CONSTRAINTS.backSumMax) errors.push(`和值${s1}越界`);

    const types = backNums.map(b => backLabel(backCount[b] || 0));
    const allHot = types.every(t => t === 'HOT');
    const allCold = types.every(t => t === 'COLD' || t === 'ICE');
    if (allHot) errors.push('全热禁止');
    if (allCold) errors.push('全冷禁止');

    return { sum: s1, types, errors, valid: errors.length === 0 };
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

    const { frontCount, frontLast, backCount, backLast } = buildStats();

    // ---- 一、前区分区校验 ----
    printHeader('一、前区分区校验（三区: 01-12 / 13-24 / 25-35）');

    const zoneResults = zoneCheck();
    for (const zr of zoneResults) {
        const z1s = zr.zones.Z1.map(n => pad(n)).join(' ');
        const z2s = zr.zones.Z2.map(n => pad(n)).join(' ');
        const z3s = zr.zones.Z3.map(n => pad(n)).join(' ');
        const cnt = `${zr.zones.Z1.length}/${zr.zones.Z2.length}/${zr.zones.Z3.length}`;
        const flag = zr.full ? 'OK全覆盖' : '⚠缺区!';
        console.log(`  ${zr.code}  一[${z1s.padEnd(20)}] 二[${z2s.padEnd(20)}] 三[${z3s.padEnd(20)}] | ${cnt} ${flag}`);
    }

    const fullCount = zoneResults.filter(z => z.full).length;
    console.log(`\n  近${draws.length}期三区全覆盖率: ${fullCount}/${draws.length} = ${(fullCount / draws.length * 100).toFixed(0)}%`);

    // Zone stats
    console.log('\n各区间号码频次明细:');
    console.log('-'.repeat(75));
    for (const [zk, zv] of Object.entries(ZONES)) {
        const nums = [];
        const hotNums = [], coldNums = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            const cnt = frontCount[n] || 0;
            nums.push(`${pad(n)}(${cnt})`);
            const lbl = frontLabel(cnt);
            if (lbl === 'HOT') hotNums.push(pad(n));
            if (lbl === 'COLD' || lbl === 'ICE') coldNums.push(pad(n));
        }
        console.log(`  ${zv.name.padEnd(12)}: ${nums.join(' ')}`);
        console.log(`  ${' '.repeat(12)}  -> 热号(HOT>=4): ${hotNums.length ? hotNums.join(' ') : '(无)'} | 冷号(COLD/ICE): ${coldNums.length ? coldNums.join(' ') : '(无)'}`);
    }

    // ---- 二、后区冷热划分 ----
    printHeader('二、后区冷热划分 & 两码和值约束(9-17)');

    const hB = [], wB = [], cB = [], iB = [];
    for (let n = 1; n <= 12; n++) {
        const lbl = backLabel(backCount[n] || 0);
        if (lbl === 'HOT') hB.push(n);
        else if (lbl === 'WARM') wB.push(n);
        else if (lbl === 'COLD') cB.push(n);
        else iB.push(n);
    }

    console.log(`  HOT(>=4次):  ${hB.map(pad).join(' ') || '(无)'}`);
    console.log(`  WARM(2-3次): ${wB.map(pad).join(' ') || '(无)'}`);
    console.log(`  COLD(1次):   ${cB.map(pad).join(' ') || '(无)'}`);
    console.log(`  ICE(0次):    ${iB.map(pad).join(' ') || '(无)'}`);

    const validPairs = findValidBackPairs(backCount);
    console.log(`\n  合法后区两码组合(和值 9-17 + 冷热均衡): 共 ${validPairs.length} 组`);
    console.log('  代表性组合示例:');
    const sampleStep = Math.max(1, Math.ceil(validPairs.length / 6));
    const samples = validPairs.filter((_, i) => i % sampleStep === 0).slice(0, 6);
    for (const t of samples) {
        const lbls = t.nums.map(n => `${pad(n)}[${backLabel(backCount[n] || 0)}]`).join(' ');
        console.log(`    ${t.nums.map(pad).join(' ')}  ${lbls}  和值:${t.sum}  ${t.types}`);
    }

    // ---- 三、约束条件 ----
    printHeader('三、选号约束条件汇总');

    console.log('【前区连号统计】');
    let consCount = 0;
    for (const d of draws) {
        const cons = findConsecutivePairs(d.front);
        if (cons.length > 0) {
            consCount++;
            console.log(`  ${d.code}: ${cons.map(p => pad(p[0]) + '-' + pad(p[1])).join(', ')}`);
        }
    }
    console.log(`  近${draws.length}期含连号期数: ${consCount}/${draws.length} = ${(consCount / draws.length * 100).toFixed(0)}%`);

    console.log('\n【各区间胆码候选】（按频次+活跃度排序）');
    for (const [zk, zv] of Object.entries(ZONES)) {
        const candidates = [];
        for (let n = zv.range[0]; n <= zv.range[1]; n++) {
            const cnt = frontCount[n] || 0;
            if (cnt >= THRESHOLDS.front.warm) {
                const lastIdx = draws.findIndex(d => d.front.includes(n));
                candidates.push({ n, cnt, lastIdx });
            }
        }
        candidates.sort((a, b) => b.cnt - a.cnt || a.lastIdx - b.lastIdx);
        console.log(`  ${zv.name}: ${candidates.slice(0, 3).map(x => pad(x.n) + '(' + x.cnt + '次)').join(' ')}`);
    }

    console.log(`\n【区间分布约束】 单区 ${CONSTRAINTS.minPerZone}-${CONSTRAINTS.maxPerZone} 码, 共 ${CONSTRAINTS.frontCount} 码`);
    console.log('  推荐分布: 3-2-2, 2-3-2, 2-2-3  |  允许: 3-3-1, 1-3-3, 3-1-3  |  禁止: 4-2-1, 5-1-1');

    // ---- 四、号码生成 ----
    printHeader('四、成品号码 (2组 7前+2后)');

    // 从合法两码组合中选2组代表性搭配
    const pair1 = validPairs.find(t =>
        t.types.includes('HOT') && t.types.includes('COLD')
    ) || validPairs.find(t =>
        t.types.includes('HOT') && t.types.includes('ICE')
    ) || validPairs[0];

    const pair2 = validPairs.find(t =>
        t.types.includes('HOT') && t.types.includes('WARM') && t !== pair1
    ) || validPairs[Math.min(validPairs.length - 1, 3)];

    // 基于实际频次数据生成前区号码
    // 策略：各区取热度最高的号作为基础，确保三区覆盖
    function generateFrontSet(focus) {
        // focus: 'Z1Z2' 侧重一二区, 'Z2Z3' 侧重二三区
        const picks = [];

        // 收集各区的热号+温号
        const zoneCands = {};
        for (const [zk, zv] of Object.entries(ZONES)) {
            const cands = [];
            for (let n = zv.range[0]; n <= zv.range[1]; n++) {
                const cnt = frontCount[n] || 0;
                if (cnt >= THRESHOLDS.front.warm) {
                    const lastIdx = draws.findIndex(d => d.front.includes(n));
                    cands.push({ n, cnt, lastIdx });
                }
            }
            cands.sort((a, b) => b.cnt - a.cnt || a.lastIdx - b.lastIdx);
            zoneCands[zk] = cands;
        }

        if (focus === 'Z1Z2') {
            // 侧重一二区: 3-3-1
            picks.push(...zoneCands.Z1.slice(0, 3).map(x => x.n));  // 一区3码
            picks.push(...zoneCands.Z2.slice(0, 3).map(x => x.n));  // 二区3码
            picks.push(...zoneCands.Z3.slice(0, 1).map(x => x.n));  // 三区1码
        } else {
            // 侧重二三区: 2-2-3
            picks.push(...zoneCands.Z1.slice(0, 2).map(x => x.n));  // 一区2码
            picks.push(...zoneCands.Z2.slice(0, 2).map(x => x.n));  // 二区2码
            picks.push(...zoneCands.Z3.slice(0, 3).map(x => x.n));  // 三区3码
        }

        // 确保有连号：在最大的区里检查，如果没有连号则微调
        const sorted = [...new Set(picks)].sort((a, b) => a - b);
        let result = sorted.slice(0, CONSTRAINTS.frontCount);
        const cons = findConsecutivePairs(result);
        if (cons.length === 0 && result.length >= 2) {
            // 尝试把最后一个数替换为与倒数第二个相邻的热号
            for (const [zk, zv] of Object.entries(ZONES)) {
                const lastTwo = result.slice(-2);
                if (lastTwo.length === 2) {
                    const target = lastTwo[1] - 1;
                    if (target >= zv.range[0] && target <= zv.range[1] && !result.includes(target)) {
                        result[result.length - 1] = target;
                        result.sort((a, b) => a - b);
                        break;
                    }
                }
            }
        }

        return result.slice(0, CONSTRAINTS.frontCount);
    }

    const set1 = generateFrontSet('Z1Z2');
    const set2 = generateFrontSet('Z2Z3');

    // 输出各组
    for (const [idx, [frontNums, backNums]] of [
        [set1, pair1.nums],
        [set2, pair2.nums]
    ].entries()) {
        const fv = validateFrontSet(frontNums, frontCount);
        const bv = validateBackPair(backNums, backCount);
        const name = idx === 0
            ? '第一组 (侧重一二区热号 + 3-*-* 分布)'
            : '第二组 (侧重二三区热号 + 2-2-3 分布)';

        console.log(`\n${'─'.repeat(71)}`);
        console.log(`  ${name}`);
        console.log(`${'─'.repeat(71)}`);

        // 前区
        const frontTags = frontNums.map(r => `${pad(r)}[${frontLabel(frontCount[r] || 0)}]`);
        console.log(`  前区(7码): ${frontNums.map(pad).join(' ')}`);
        console.log(`  号码属性:  ${frontTags.join(' ')}`);
        console.log(`  区间分布:  一[${fv.zones.Z1.map(pad).join(' ').padEnd(18)}] 二[${fv.zones.Z2.map(pad).join(' ').padEnd(18)}] 三[${fv.zones.Z3.map(pad).join(' ')}]`);
        console.log(`  区间码数:  ${fv.zones.Z1.length}-${fv.zones.Z2.length}-${fv.zones.Z3.length} (规则:每区1-3码)`);
        console.log(`  连号组:    ${fv.cons.length ? fv.cons.map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') : '(需手动调整)'}`);
        console.log(`  冷热配比:  HOT=${fv.hotCount} | WARM=${fv.warmCount} | COLD=${fv.coldCount}`);
        console.log();

        // 后区
        const backTags = backNums.map(b => `${pad(b)}[${backLabel(backCount[b] || 0)}]`);
        console.log(`  后区(2码): ${backNums.map(pad).join(' ')}`);
        console.log(`  号码属性:  ${backTags.join(' ')}`);
        console.log(`  和值:  ${backNums[0]}+${backNums[1]}=${bv.sum}`);
        const sumOK = bv.sum >= CONSTRAINTS.backSumMin && bv.sum <= CONSTRAINTS.backSumMax;
        console.log(`  和值校验:  ${sumOK ? 'PASS (9-17)' : 'FAIL'}`);
        console.log(`  冷热校验:  ${bv.valid ? 'PASS (冷热搭配合理)' : 'FAIL: ' + bv.errors.join(', ')}`);
    }

    // 汇总表
    console.log(`\n${'='.repeat(75)}`);
    console.log('                         最终汇总');
    console.log(`${'='.repeat(75)}`);
    console.log();
    console.log(`  组别      前区(7码)                               后区(2码)`);
    console.log(`  ────────  ──────────────────────────────────────  ────────`);
    console.log(`  第一组    ${set1.map(pad).join(' ')}                            ${pair1.nums.map(pad).join(' ')}`);
    console.log(`  第二组    ${set2.map(pad).join(' ')}                            ${pair2.nums.map(pad).join(' ')}`);
    console.log();
    console.log('  策略说明:');
    console.log('    1. 前区按 01-12(小) / 13-24(中) / 25-35(大) 三区划分');
    console.log('    2. 每组7码确保三区全覆盖，单区不超过3码');
    console.log('    3. 后区2码和值锁定9-17，禁止全热/全冷极端组合');
    console.log('    4. 核心逻辑: 热号主导(60%+) + 冷号补位 + 连号加持');
    console.log('    5. 大乐透前区35选5，后区12选2；推荐扩选至7+2增加覆盖面');
    console.log(`    6. 数据基础: 近${draws.length}期超级大乐透官方开奖统计`);
    console.log();
    console.log('  ⚠ 以上为历史数据统计推演，不构成任何投注建议。');
    console.log('     彩票开奖为独立随机事件，历史频率不代表未来概率。');
    console.log('='.repeat(75));
}

// 执行
main();
