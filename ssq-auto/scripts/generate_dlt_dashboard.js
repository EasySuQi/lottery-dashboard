// ============================================================
// 超级大乐透 仪表盘数据生成器
// 用法: node scripts/generate_dlt_dashboard.js
// 输出: data/dashboard_dlt_data.json
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

// ====== 配置常量 ======
const ZONES = {
  Z1: { name: '一区(小)', range: [1, 12] },
  Z2: { name: '二区(中)', range: [13, 24] },
  Z3: { name: '三区(大)', range: [25, 35] },
};
const THRESHOLDS = {
  front: { hot: 4, warm: 2, cold: 1 },
  back: { hot: 4, warm: 2, cold: 1 },
};
const DATA_FILE = path.join(__dirname, '..', 'data', 'dashboard_dlt_data.json');
const API_URL = 'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=30&isDetails=1&pageNo=1';

// ====== 工具函数 ======
function getZone(n) {
  if (n >= 1 && n <= 12) return 'Z1';
  if (n >= 13 && n <= 24) return 'Z2';
  if (n >= 25 && n <= 35) return 'Z3';
  return null;
}
function pad(n, len) { return String(n).padStart(len || 2, '0'); }
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

// ====== HTTP 请求 ======
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON 解析失败: ' + e.message)); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('请求超时')); });
  });
}

// ====== 分析函数 ======
function findConsecutivePairs(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] === 1) pairs.push([sorted[i], sorted[i + 1]]);
  }
  return pairs;
}

function buildStats(draws) {
  const frontCount = {}, backCount = {};
  for (const d of draws) {
    for (const r of d.front) frontCount[r] = (frontCount[r] || 0) + 1;
    for (const b of d.back) backCount[b] = (backCount[b] || 0) + 1;
  }
  return { frontCount, backCount };
}

function generatePredictions(draws, frontCount, backCount) {
  // 收集各区热号+温号
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

  // 第一组: 3-3-1 侧重一二区
  const set1 = [
    ...zoneCands.Z1.slice(0, 3).map(x => x.n),
    ...zoneCands.Z2.slice(0, 3).map(x => x.n),
    ...zoneCands.Z3.slice(0, 1).map(x => x.n),
  ];
  // 第二组: 2-2-3 侧重二三区
  const set2 = [
    ...zoneCands.Z1.slice(0, 2).map(x => x.n),
    ...zoneCands.Z2.slice(0, 2).map(x => x.n),
    ...zoneCands.Z3.slice(0, 3).map(x => x.n),
  ];

  // 确保连号
  function ensureCons(nums) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b).slice(0, 7);
    if (findConsecutivePairs(sorted).length === 0 && sorted.length >= 2) {
      const lastTwo = sorted.slice(-2);
      const target = lastTwo[1] - 1;
      if (!sorted.includes(target) && target >= 1) {
        sorted[sorted.length - 1] = target;
        sorted.sort((a, b) => a - b);
      }
    }
    return sorted.slice(0, 7);
  }

  const finalSet1 = ensureCons(set1);
  const finalSet2 = ensureCons(set2);

  // 后区: 找合法两码组合
  function findValidBackPairs() {
    const valid = [];
    for (let i = 1; i <= 12; i++) {
      for (let j = i + 1; j <= 12; j++) {
        const s1 = i + j;
        if (s1 >= 9 && s1 <= 17) {
          const types = [backLabel(backCount[i] || 0), backLabel(backCount[j] || 0)];
          const allHot = types.every(t => t === 'HOT');
          const allCold = types.every(t => t === 'COLD' || t === 'ICE');
          if (!allHot && !allCold) valid.push({ nums: [i, j], sum: s1, types });
        }
      }
    }
    return valid;
  }

  const validPairs = findValidBackPairs();
  const pair1 = validPairs.find(t => t.types.includes('HOT') && t.types.includes('COLD'))
             || validPairs.find(t => t.types.includes('HOT') && t.types.includes('ICE'))
             || validPairs[0];
  const pair2 = validPairs.find(t => t.types.includes('WARM') && t.types.includes('COLD') && t !== pair1)
             || validPairs[Math.min(validPairs.length - 1, 3)];

  function distLabel(nums) {
    const z = { Z1: [], Z2: [], Z3: [] };
    for (const n of nums) { const zk = getZone(n); if (zk) z[zk].push(n); }
    return `${z.Z1.length}-${z.Z2.length}-${z.Z3.length}`;
  }
  function hotCount(nums) { return nums.filter(n => frontLabel(frontCount[n] || 0) === 'HOT').length; }
  function warmCount(nums) { return nums.filter(n => frontLabel(frontCount[n] || 0) === 'WARM').length; }

  return [
    {
      name: `第一组 (${distLabel(finalSet1)} 分布 / 一二区侧重)`,
      fronts: finalSet1.sort((a, b) => a - b),
      backs: pair1 ? pair1.nums : [1, 8],
      distribution: distLabel(finalSet1),
      hotCount: hotCount(finalSet1), warmCount: warmCount(finalSet1),
      coldCount: 7 - hotCount(finalSet1) - warmCount(finalSet1),
      consecutivePairs: findConsecutivePairs(finalSet1.sort((a, b) => a - b)),
      backSum: pair1 ? pair1.sum : 9,
      backTypes: pair1 ? pair1.types.join('+') : 'COLD+WARM',
    },
    {
      name: `第二组 (${distLabel(finalSet2)} 分布 / 二三区侧重)`,
      fronts: finalSet2.sort((a, b) => a - b),
      backs: pair2 ? pair2.nums : [3, 9],
      distribution: distLabel(finalSet2),
      hotCount: hotCount(finalSet2), warmCount: warmCount(finalSet2),
      coldCount: 7 - hotCount(finalSet2) - warmCount(finalSet2),
      consecutivePairs: findConsecutivePairs(finalSet2.sort((a, b) => a - b)),
      backSum: pair2 ? pair2.sum : 13,
      backTypes: pair2 ? pair2.types.join('+') : 'WARM+WARM',
    },
  ];
}

// ====== 主流程 ======
async function main() {
  let draws = null;

  // 尝试从网络拉取
  try {
    console.log('📡 正在从 sporttery.cn 拉取大乐透数据...');
    const resp = await fetchJSON(API_URL);
    if (!resp.success || resp.errorCode !== '0') throw new Error(resp.errorMessage || 'API 返回异常');
    const list = resp.value.list;
    draws = list.slice(0, 20).map(d => {
      const parts = d.lotteryDrawResult.split(' ').map(Number);
      return { code: d.lotteryDrawNum, front: parts.slice(0, 5), back: parts.slice(5, 7), date: d.lotteryDrawTime };
    });
    console.log('✅ 网络数据获取成功');
  } catch (netErr) {
    console.log(`⚠️ 网络请求失败 (${netErr.message})，尝试本地缓存...`);
    // 从本地缓存加载
    const cacheFile = path.join(__dirname, '..', 'data', 'dlt_draws_cache.json');
    if (fs.existsSync(cacheFile)) {
      draws = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.log('✅ 从本地缓存加载成功');
    } else {
      console.error('❌ 无网络数据且本地缓存不存在，请先手动拉取API数据到 data/dlt_draws_cache.json');
      process.exit(1);
    }
  }

  console.log(`✅ 获取到 ${draws.length} 期数据 (${draws[draws.length - 1].code} - ${draws[0].code})`);

  const { frontCount, backCount } = buildStats(draws);

  // 前区排名
  const frontRanking = [];
  for (let n = 1; n <= 35; n++) {
    frontRanking.push({ num: pad(n), count: frontCount[n] || 0, label: frontLabel(frontCount[n] || 0) });
  }
  frontRanking.sort((a, b) => b.count - a.count);

  // 后区排名
  const backRanking = [];
  for (let n = 1; n <= 12; n++) {
    backRanking.push({ num: pad(n), count: backCount[n] || 0, label: backLabel(backCount[n] || 0) });
  }
  backRanking.sort((a, b) => b.count - a.count);

  // 各区详情
  const zoneStats = {};
  for (const [zk, zv] of Object.entries(ZONES)) {
    const hot = [], warm = [], cold = [], ice = [];
    for (let n = zv.range[0]; n <= zv.range[1]; n++) {
      const cnt = frontCount[n] || 0;
      const lbl = frontLabel(cnt);
      if (lbl === 'HOT') hot.push(pad(n));
      else if (lbl === 'WARM') warm.push(pad(n));
      else if (lbl === 'COLD') cold.push(pad(n));
      else ice.push(pad(n));
    }
    zoneStats[zk] = { name: zv.name, hot, warm, cold, ice };
  }

  // 后区分级
  const backZones = { hot: [], warm: [], cold: [], ice: [] };
  for (let n = 1; n <= 12; n++) {
    const lbl = backLabel(backCount[n] || 0);
    if (lbl === 'HOT') backZones.hot.push(pad(n));
    else if (lbl === 'WARM') backZones.warm.push(pad(n));
    else if (lbl === 'COLD') backZones.cold.push(pad(n));
    else backZones.ice.push(pad(n));
  }

  // 三区逐期分布
  const zoneDist = draws.map(d => {
    const zones = { Z1: 0, Z2: 0, Z3: 0 };
    for (const r of d.front) { const z = getZone(r); if (z) zones[z]++; }
    return { code: d.code, date: d.date, fronts: d.front, backs: d.back, Z1: zones.Z1, Z2: zones.Z2, Z3: zones.Z3, full: zones.Z1 > 0 && zones.Z2 > 0 && zones.Z3 > 0 };
  });

  // 连号趋势
  const consTrend = draws.map(d => {
    const pairs = findConsecutivePairs(d.front);
    return { code: d.code, date: d.date, count: pairs.length, pairs: pairs.map(p => p.map(pad).join('-')) };
  });
  const consRate = consTrend.filter(c => c.count > 0).length / draws.length;
  const fullCovRate = zoneDist.filter(z => z.full).length / draws.length;

  // 前区遗漏趋势 (Top 6 )
  const topFrontNums = frontRanking.slice(0, 6).map(r => r.num);
  const frontTrend = draws.map(d => {
    const entry = { code: d.code };
    for (const n of topFrontNums) entry[n] = d.front.includes(parseInt(n)) ? 1 : 0;
    return entry;
  });

  // 选号推荐
  const predictions = generatePredictions(draws, frontCount, backCount);

  // 最新一期开奖
  const latest = draws[0];

  // 复盘: 用倒数第二期开奖 vs 当前预测
  // （首次运行没有历史预测，置空）
  const review = {
    note: '上一期预测复盘（需至少运行两次后才有对比数据）',
  };

  const output = {
    generatedAt: new Date().toISOString(),
    gameType: '超级大乐透',
    dataRange: {
      totalDraws: draws.length,
      earliestIssue: draws[draws.length - 1].code,
      latestIssue: draws[0].code,
      latestDate: latest.date,
    },
    latestDraw: {
      code: latest.code,
      fronts: latest.front,
      backs: latest.back,
      date: latest.date,
    },
    frontFrequency: (() => { const o = {}; for (let n = 1; n <= 35; n++) o[String(n)] = frontCount[n] || 0; return o; })(),
    backFrequency: (() => { const o = {}; for (let n = 1; n <= 12; n++) o[String(n)] = backCount[n] || 0; return o; })(),
    zoneDistribution: zoneDist,
    zoneStats,
    backZones,
    frontRanking,
    backRanking,
    frontTrend,
    topFrontNums,
    topBackNums: backRanking.slice(0, 6).map(r => r.num),
    consecutiveTrend: consTrend,
    consecutiveRate: consRate,
    fullCoverageRate: fullCovRate,
    latestPrediction: {
      generatedAt: new Date().toISOString(),
      forIssue: latest.code,
      groups: predictions,
    },
    review,
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ 仪表盘数据已生成: ${DATA_FILE}`);
  console.log(`   期数: ${draws.length} | 最新: ${latest.code}期 (${latest.date})`);
  console.log(`   前区热号: ${frontRanking.filter(r => r.label === 'HOT').length} 个`);
  console.log(`   后区热号: ${backRanking.filter(r => r.label === 'HOT').length} 个`);
  console.log(`   三区全覆盖率: ${(fullCovRate * 100).toFixed(0)}%`);
  console.log(`   连号率: ${(consRate * 100).toFixed(0)}%`);
}

main().catch(e => { console.error('❌ 数据生成失败:', e.message); process.exit(1); });
