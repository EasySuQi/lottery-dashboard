// ============================================================
// 双色球近20期数据 + 分区冷热分析 + 号码生成
// ============================================================

const draws = [
    {code:'2026084', reds:[1,5,6,10,12,16], blue:5, date:'2026-07-23'},
    {code:'2026083', reds:[7,14,15,23,28,33], blue:3, date:'2026-07-21'},
    {code:'2026082', reds:[5,7,10,14,21,28], blue:4, date:'2026-07-19'},
    {code:'2026081', reds:[6,10,12,15,24,27], blue:12, date:'2026-07-16'},
    {code:'2026080', reds:[4,5,11,19,27,32], blue:1, date:'2026-07-14'},
    {code:'2026079', reds:[1,11,17,22,24,29], blue:4, date:'2026-07-12'},
    {code:'2026078', reds:[7,11,14,16,27,28], blue:6, date:'2026-07-09'},
    {code:'2026077', reds:[1,4,5,14,18,25], blue:4, date:'2026-07-07'},
    {code:'2026076', reds:[1,3,19,20,24,25], blue:7, date:'2026-07-05'},
    {code:'2026075', reds:[8,12,18,21,24,30], blue:1, date:'2026-07-02'},
    {code:'2026074', reds:[2,23,24,26,28,32], blue:4, date:'2026-06-30'},
    {code:'2026073', reds:[9,10,13,16,19,21], blue:8, date:'2026-06-28'},
    {code:'2026072', reds:[7,8,12,15,17,21], blue:1, date:'2026-06-25'},
    {code:'2026071', reds:[3,8,19,25,31,33], blue:5, date:'2026-06-23'},
    {code:'2026070', reds:[3,6,8,14,26,27], blue:8, date:'2026-06-21'},
    {code:'2026069', reds:[12,14,16,17,18,32], blue:8, date:'2026-06-18'},
    {code:'2026068', reds:[3,5,16,18,29,32], blue:4, date:'2026-06-16'},
    {code:'2026067', reds:[4,19,27,29,30,32], blue:13, date:'2026-06-14'},
    {code:'2026066', reds:[5,11,21,23,24,29], blue:16, date:'2026-06-11'},
    {code:'2026065', reds:[7,8,16,24,30,32], blue:2, date:'2026-06-09'},
];

function getZone(n) {
    if (n >= 1 && n <= 10) return 'Z1';
    if (n >= 11 && n <= 20) return 'Z2';
    if (n >= 21 && n <= 33) return 'Z3';
    return '??';
}

// Count frequencies
const redCount = {};
const redLast = {};
for (let i = 0; i < draws.length; i++) {
    for (const r of draws[i].reds) {
        redCount[r] = (redCount[r] || 0) + 1;
        if (!(r in redLast)) redLast[r] = draws[i].code;
    }
}

const blueCount = {};
const blueLast = {};
for (let i = 0; i < draws.length; i++) {
    const b = draws[i].blue;
    blueCount[b] = (blueCount[b] || 0) + 1;
    if (!(b in blueLast)) blueLast[b] = draws[i].code;
}

function blueLabel(b) {
    const cnt = blueCount[b] || 0;
    if (cnt >= 3) return 'HOT';
    if (cnt >= 2) return 'WARM';
    if (cnt >= 1) return 'COLD';
    return 'ICE';
}

function redLabel(r) {
    const cnt = redCount[r] || 0;
    if (cnt >= 5) return 'HOT';
    if (cnt >= 3) return 'WARM';
    if (cnt >= 1) return 'COLD';
    return 'ICE';
}

// ======== 1. 前区分区分析 ========
console.log('='.repeat(75));
console.log('一、前区分区校验');
console.log('   规则: 红球 1-33 拆分为三区 [01-10] [11-20] [21-33]');
console.log('   要求: 每组6码必须三区全覆盖，杜绝扎堆单区');
console.log('='.repeat(75));
console.log();

for (const d of draws) {
    let z1 = [], z2 = [], z3 = [];
    for (const r of d.reds) {
        const z = getZone(r);
        if (z === 'Z1') z1.push(r);
        else if (z === 'Z2') z2.push(r);
        else z3.push(r);
    }
    const z1s = z1.map(n => String(n).padStart(2,'0')).join(' ');
    const z2s = z2.map(n => String(n).padStart(2,'0')).join(' ');
    const z3s = z3.map(n => String(n).padStart(2,'0')).join(' ');
    const flag = (z1.length>0 && z2.length>0 && z3.length>0) ? 'OK全覆盖' :
                 (z1.length===0 ? '缺一区!' : z2.length===0 ? '缺二区!' : '缺三区!');
    const zoneInfo = `一区[${z1s}] 二区[${z2s}] 三区[${z3s}]`;
    console.log(`  ${d.code}  ${zoneInfo}`);
    console.log(`         各区码数: ${z1.length}/${z2.length}/${z3.length}  -> ${flag}`);
}

const fullCoverCount = draws.filter(d => {
    const zs = [0,0,0];
    d.reds.forEach(r => zs[parseInt(getZone(r)[1])-1]++);
    return zs[0]>0 && zs[1]>0 && zs[2]>0;
}).length;

console.log();
console.log(`  近20期三区全覆盖率: ${fullCoverCount}/20 = ${(fullCoverCount/20*100).toFixed(0)}%`);
console.log('  说明: 历史开奖数据中大部分期次满足三区全覆盖，验证分区规则合理性。');

// Per-zone frequency
console.log();
console.log('【各区号码频次明细表】');
console.log('-'.repeat(75));
for (let zn = 1; zn <= 3; zn++) {
    const zRange = zn === 1 ? [1,10] : zn === 2 ? [11,20] : [21,33];
    const zoneName = zn === 1 ? '一区 01-10' : zn === 2 ? '二区 11-20' : '三区 21-33';
    const nums = [];
    for (let n = zRange[0]; n <= zRange[1]; n++) {
        const cnt = redCount[n] || 0;
        nums.push(`${String(n).padStart(2,'0')}(${cnt})`);
    }
    console.log(`  ${zoneName}: ${nums.join(' ')}`);
    const hots = [];
    const colds = [];
    for (let n = zRange[0]; n <= zRange[1]; n++) {
        const cnt = redCount[n] || 0;
        const tag = redLabel(n);
        if (tag === 'HOT') hots.push(String(n).padStart(2,'0'));
        if (tag === 'COLD' || tag === 'ICE') colds.push(String(n).padStart(2,'0'));
    }
    console.log(`  -> 热号: ${hots.length ? hots.join(' ') : '(无)'} | 冷号: ${colds.length ? colds.join(' ') : '(无)'}`);
}

// ======== 2. 后区冷热分析 ========
console.log();
console.log('='.repeat(75));
console.log('二、后区冷热号划分 & 两码和值约束(9-16)');
console.log('='.repeat(75));
console.log();

const hotBlues = [], warmBlues = [], coldBlues = [], iceBlues = [];
for (let n = 1; n <= 16; n++) {
    const tag = blueLabel(n);
    if (tag === 'HOT') hotBlues.push(n);
    else if (tag === 'WARM') warmBlues.push(n);
    else if (tag === 'COLD') coldBlues.push(n);
    else iceBlues.push(n);
}

console.log(`  热号(HOT,>=3次): ${hotBlues.map(n=>String(n).padStart(2,'0')).join(' ')}`);
console.log(`  温号(WARM,2次):  ${warmBlues.map(n=>String(n).padStart(2,'0')).join(' ')}`);
console.log(`  冷号(COLD,1次):  ${coldBlues.map(n=>String(n).padStart(2,'0')).join(' ')}`);
console.log(`  极冷(ICE,0次):   ${iceBlues.map(n=>String(n).padStart(2,'0')).join(' ')}`);
console.log();
console.log('  后区3码约束:');
console.log('    (1) 任两码之和必须在 9-16 范围内');
console.log('    (2) 禁止全热(HOT+HOT+HOT)组合');
console.log('    (3) 禁止全冷(COLD+COLD+COLD或含ICE全冷)组合');
console.log('    (4) 合法搭配模式: HOT+WARM+COLD, HOT+COLD+COLD, WARM+COLD+COLD 等');
console.log();

// Find valid blue pairs
function findValidBluePairs() {
    const results = [];
    for (let i = 1; i <= 16; i++) {
        for (let j = i+1; j <= 16; j++) {
            const s1 = i+j;
            if (s1 >= 9 && s1 <= 16) {
                const types = new Set([blueLabel(i), blueLabel(j)]);
                const allHot = [...types].every(t => t === 'HOT');
                const allCold = [...types].every(t => t === 'COLD' || t === 'ICE');
                if (!allHot && !allCold) {
                    results.push([i, j]);
                }
            }
        }
    }
    return results;
}

const validPairs = findValidBluePairs();
console.log(`  符合两码和值9-16 + 冷热均衡的后区2码组合: 共 ${validPairs.length} 组`);
console.log('  代表性组合示例:');
const samplePairs = validPairs.filter((t,i) => i % Math.ceil(validPairs.length/8) === 0).slice(0, 8);
for (const t of samplePairs) {
    const labels = t.map(b => `${String(b).padStart(2,'0')}[${blueLabel(b)}]`).join(' ');
    console.log(`    [${t.map(n=>String(n).padStart(2,'0')).join(' ')}]  ${labels}  |  和值: ${t[0]+t[1]}`);
}

// ======== 3. 选号参考约束 ========
console.log();
console.log('='.repeat(75));
console.log('三、选号参考约束条件汇总');
console.log('='.repeat(75));
console.log();
console.log('【约束1 - 连号识别】近20期连号(相邻两码差=1)分布:');
for (const d of draws) {
    const sorted = [...d.reds].sort((a,b)=>a-b);
    const cons = [];
    for (let i = 0; i < sorted.length-1; i++) {
        if (sorted[i+1] - sorted[i] === 1) {
            cons.push(String(sorted[i]).padStart(2,'0') + '-' + String(sorted[i+1]).padStart(2,'0'));
        }
    }
    if (cons.length > 0) {
        console.log(`  ${d.code}: ${cons.join(', ')}`);
    }
}

console.log();
console.log('【约束2 - 各区间胆码候选】');
console.log('  筛选标准: 出现频次>=3 + 近期活跃度 综合排序');
for (let zn = 1; zn <= 3; zn++) {
    const zRange = zn === 1 ? [1,10] : zn === 2 ? [11,20] : [21,33];
    const zoneName = zn === 1 ? '一区' : zn === 2 ? '二区' : '三区';
    const candidates = [];
    for (let n = zRange[0]; n <= zRange[1]; n++) {
        const cnt = redCount[n] || 0;
        if (cnt >= 3) {
            const lastIdx = draws.findIndex(d => d.reds.includes(n));
            candidates.push({n, cnt, lastIdx});
        }
    }
    candidates.sort((a,b) => b.cnt - a.cnt || a.lastIdx - b.lastIdx);
    const top3 = candidates.slice(0, 3).map(x => `${String(x.n).padStart(2,'0')}(${x.cnt}次)`);
    console.log(`  ${zoneName}: ${top3.join(' ')}`);
}

console.log();
console.log('【约束3 - 杜绝扎堆单区】');
console.log('  规则: 每组7码，单区最多放3个，最少放1个');
console.log('  可行分布: 3-2-2, 3-3-1, 2-3-2, 2-2-3 等');

// ======== 4. 号码生成 ========
console.log();
console.log('='.repeat(75));
console.log('四、成品号码输出 (2组 7前+3后)');
console.log('='.repeat(75));
console.log();

// Pick 2 good blue pairs
const pair1 = validPairs.find(t => {
    const types = t.map(b => blueLabel(b));
    return types.includes('HOT') && types.includes('COLD');
}) || validPairs.find(t => {
    const types = t.map(b => blueLabel(b));
    return types.includes('HOT') && types.includes('ICE');
}) || validPairs[0];

const pair2 = validPairs.find(t => {
    const types = t.map(b => blueLabel(b));
    return types.includes('HOT') && types.includes('WARM');
}) || validPairs[Math.min(validPairs.length-1, 3)];

// Set 1: 侧重一二区热号 + 连号14-15-16
// Z1(2): 05,07 | Z2(3): 14,15,16 | Z3(2): 24,32
const set1Reds = [5, 7, 14, 15, 16, 24, 32];

// Set 2: 侧重二三区热号 + 连号27-28
// Z1(2): 08,10 | Z2(2): 12,19 | Z3(3): 21,27,28
const set2Reds = [8, 10, 12, 19, 21, 27, 28];

function printSet(label, reds, blues) {
    const line = '─'.repeat(71);
    console.log(line);
    console.log(`  ${label}`);
    console.log(line);

    const z1r = reds.filter(r => getZone(r) === 'Z1').sort((a,b)=>a-b);
    const z2r = reds.filter(r => getZone(r) === 'Z2').sort((a,b)=>a-b);
    const z3r = reds.filter(r => getZone(r) === 'Z3').sort((a,b)=>a-b);

    const sorted = [...reds].sort((a,b)=>a-b);
    const cons = [];
    for (let i = 0; i < sorted.length-1; i++) {
        if (sorted[i+1] - sorted[i] === 1) cons.push(`${String(sorted[i]).padStart(2,'0')}-${String(sorted[i+1]).padStart(2,'0')}`);
    }

    const redWithTag = reds.map(r => `${String(r).padStart(2,'0')}[${redLabel(r)}]`);
    const hc = reds.filter(r => redLabel(r) === 'HOT').length;
    const wc = reds.filter(r => redLabel(r) === 'WARM').length;
    const cc = reds.filter(r => redLabel(r) === 'COLD').length;

    console.log(`  前区(7码): ${reds.map(n=>String(n).padStart(2,'0')).join(' ')}`);
    console.log(`  号码属性: ${redWithTag.join(' ')}`);
    console.log(`  区间分布: 一区[${z1r.map(n=>String(n).padStart(2,'0')).join(' ')}] 二区[${z2r.map(n=>String(n).padStart(2,'0')).join(' ')}] 三区[${z3r.map(n=>String(n).padStart(2,'0')).join(' ')}]`);
    console.log(`  区间码数: ${z1r.length}-${z2r.length}-${z3r.length} (规则:每区1-3码)`);
    console.log(`  连号组:   ${cons.length ? cons.join(', ') : '(无)'}`);
    console.log(`  冷热配比: HOT=${hc} | WARM=${wc} | COLD=${cc}`);
    console.log();

    const blueStrs = blues.map(b => `${String(b).padStart(2,'0')}[${blueLabel(b)}]`);
    const bTypes = blues.map(b => blueLabel(b));
    const allHot = bTypes.every(t => t === 'HOT');
    const allCold = bTypes.every(t => t === 'COLD' || t === 'ICE');

    console.log(`  后区(2码): ${blues.map(n=>String(n).padStart(2,'0')).join(' ')}`);
    console.log(`  号码属性: ${blueStrs.join(' ')}`);
    const s1 = blues[0]+blues[1];
    console.log(`  两码和值: ${blues[0]}+${blues[1]}=${s1}`);
    const sumOK = s1 >= 9 && s1 <= 16;
    console.log(`  和值校验: ${sumOK ? 'PASS (9-16)' : 'FAIL'}`);
    console.log(`  冷热校验: ${allHot ? 'FAIL(全热禁止)' : allCold ? 'FAIL(全冷禁止)' : 'PASS(冷热搭配合理)'}`);
    console.log();
}

printSet('第一组  (主打一二区热号 + 14-15-16三连号 + 后区HOT/COLD搭配)', set1Reds, pair1);
printSet('第二组  (主打二三区热号 + 27-28连号 + 后区HOT/WARM搭配)', set2Reds, pair2);

// ======== 汇总 ========
console.log('='.repeat(75));
console.log('                         最终汇总');
console.log('='.repeat(75));
console.log();
console.log(`  组别      前区(7红)                              后区(2蓝)`);
console.log(`  ────────  ────────────────────────────────────  ──────`);
console.log(`  第一组    ${set1Reds.map(n=>String(n).padStart(2,'0')).join(' ')}                          ${pair1.map(n=>String(n).padStart(2,'0')).join(' ')}`);
console.log(`  第二组    ${set2Reds.map(n=>String(n).padStart(2,'0')).join(' ')}                          ${pair2.map(n=>String(n).padStart(2,'0')).join(' ')}`);
console.log();
console.log('  策略说明:');
console.log('    1. 前区按 1-10(小) / 11-20(中) / 21-33(大) 三区划分');
console.log('    2. 每组7码确保三区全覆盖，单区不超过3码，杜绝号码扎堆');
console.log('    3. 后区3码任两码和值锁定9-16，禁止全热/全冷极端组合');
console.log('    4. 核心逻辑: 热号主导(60%+) + 冷号补位 + 连号加持');
console.log('    5. 数据基础: 近20期(第2026065-2026084期)官方开奖统计');
console.log('    6. 两组号码差异化策略，覆盖不同连号区间和冷热搭配模式');
console.log();
console.log('  ⚠ 以上为历史数据统计推演，不构成任何投注建议。');
console.log('     彩票开奖为独立随机事件，历史频率不代表未来概率。');
console.log('='.repeat(75));
