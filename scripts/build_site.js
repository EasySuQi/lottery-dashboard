#!/usr/bin/env node
// ============================================================
// 站点打包脚本 —— 生成可发布到 GitHub Pages 的静态站点
// ============================================================
// 功能:
//   1. 读取三个仪表盘的模板 HTML 与数据 JSON
//   2. 将数据内嵌进 HTML（消除 file:// 与跨域 fetch 问题，单文件即可打开）
//   3. 输出到 docs/ 目录（GitHub Pages 可直接托管）
//   4. 生成聚合首页 index.html，一键跳转到三个仪表盘
//
// 输出文件:
//   docs/index.html   聚合首页
//   docs/ssq.html     双色球仪表盘
//   docs/dlt.html     超级大乐透仪表盘
//   docs/sfc14.html   足彩14场仪表盘
//
// 用法:
//   node scripts/build_site.js
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');

// —— 三个站点的模板与数据定义 ——
const SITES = [
  {
    key: 'ssq',
    title: '🔴🔵 双色球 分区冷热分析仪表盘',
    desc: '双色球近30期冷热号、三区分布、连号率、选号推荐',
    template: path.join(ROOT, 'ssq-auto', 'dashboard', 'index.html'),
    dataFile: path.join(ROOT, 'ssq-auto', 'data', 'dashboard_data.json'),
    output: path.join(DOCS_DIR, 'ssq.html'),
    accent: '#C30D23'
  },
  {
    key: 'dlt',
    title: '🎯 超级大乐透 分区冷热分析仪表盘',
    desc: '大乐透近20期冷热号、三区分布、连号率、选号推荐',
    template: path.join(ROOT, 'ssq-auto', 'dashboard', 'dlt_index.html'),
    dataFile: path.join(ROOT, 'ssq-auto', 'data', 'dashboard_dlt_data.json'),
    output: path.join(DOCS_DIR, 'dlt.html'),
    accent: '#E65100'
  },
  {
    key: 'sfc14',
    title: '⚽ 足彩14场胜负彩 分析仪表盘',
    desc: '14场胜负彩胜平负分布、位置热度、奖金冷热度、难度评估、往期对比',
    template: path.join(ROOT, 'sfc-auto', 'dashboard', 'index.html'),
    dataFile: path.join(ROOT, 'sfc-auto', 'data', 'dashboard_data.json'),
    output: path.join(DOCS_DIR, 'sfc14.html'),
    accent: '#1a237e'
  }
];

function loadJSON(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    console.error(`  ⚠ 数据文件不存在: ${p}`);
  } catch (e) {
    console.error(`  ⚠ 读取失败: ${p} — ${e.message}`);
  }
  return null;
}

// 将模板中 async function loadData() {...} 替换为内嵌数据返回
function inlineData(html, data) {
  const dataJson = JSON.stringify(data);
  const pattern = /async function loadData\(\)\s*\{[\s\S]*?\n\}/;
  if (!pattern.test(html)) {
    console.error('  ⚠ 模板中未找到 loadData 函数，无法内嵌数据');
    return null;
  }
  const replacement = 'async function loadData() {\n  // 数据已内嵌（由 build_site.js 生成）\n  return __INLINE_DATA__;\n}';
  return html.replace(pattern, replacement.replace('__INLINE_DATA__', dataJson));
}

// 生成聚合首页
function generateIndex(sites) {
  const cards = sites.map(s => {
    const safeTitle = s.title.replace(/[🔴🔵🎯⚽]/g, '').trim();
    return `
      <a class="card" href="${s.key}.html">
        <div class="card-accent" style="background:${s.accent};"></div>
        <h2>${s.title}</h2>
        <p>${s.desc}</p>
        <span class="arrow">进入 →</span>
      </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>彩票数据分析仪表盘</title>
<style>
  :root { --bg: #0f1220; --card: #1a1f36; --text: #e8eaf6; --muted: #9aa0b8; --border: #2a3050; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .hero { text-align: center; padding: 60px 20px 30px; }
  .hero h1 { font-size: 2em; margin-bottom: 8px; }
  .hero p { color: var(--muted); font-size: 0.95em; }
  .grid { max-width: 1100px; margin: 0 auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
  .card { position: relative; display: block; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; text-decoration: none; color: var(--text); transition: transform 0.15s, box-shadow 0.15s; overflow: hidden; }
  .card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .card-accent { position: absolute; top: 0; left: 0; right: 0; height: 4px; }
  .card h2 { font-size: 1.15em; margin-bottom: 10px; }
  .card p { color: var(--muted); font-size: 0.85em; line-height: 1.5; margin-bottom: 16px; }
  .arrow { color: #6c8cff; font-size: 0.9em; font-weight: 600; }
  .footer { text-align: center; padding: 30px 20px 50px; color: var(--muted); font-size: 0.78em; }
  .footer a { color: #6c8cff; }
</style>
</head>
<body>
  <div class="hero">
    <h1>📊 彩票数据分析仪表盘</h1>
    <p>历史开奖数据统计推演，仅供参考</p>
  </div>
  <div class="grid">
${cards}
  </div>
  <div class="footer">
    <p>数据来源：中国福利彩票发行管理中心 (cwl.gov.cn) · 国家体育总局体育彩票管理中心 (sporttery.cn)</p>
    <p>⚠️ 以上为历史数据统计推演，不构成任何投注建议。彩票开奖为独立随机事件。请理性购彩，量力而行。</p>
    <p>生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
  </div>
</body>
</html>`;
}

// ====== 主流程 ======
function main() {
  console.log('='.repeat(60));
  console.log('  站点打包脚本 build_site.js');
  console.log('='.repeat(60));

  // 确保输出目录存在
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  const results = [];

  for (const site of SITES) {
    console.log(`\n📦 打包 ${site.key} → ${path.basename(site.output)}`);

    // 读取模板
    if (!fs.existsSync(site.template)) {
      console.error(`  ⚠ 模板不存在: ${site.template}`);
      continue;
    }
    const html = fs.readFileSync(site.template, 'utf8');

    // 读取数据
    const data = loadJSON(site.dataFile);
    if (!data) {
      console.error(`  ⚠ 跳过 ${site.key}（数据缺失）`);
      continue;
    }

    // 内嵌数据
    const result = inlineData(html, data);
    if (!result) {
      console.error(`  ⚠ 跳过 ${site.key}（内嵌失败）`);
      continue;
    }

    fs.writeFileSync(site.output, result, 'utf8');
    const sizeKB = (Buffer.byteLength(result, 'utf8') / 1024).toFixed(0);
    console.log(`  ✅ 已生成 ${site.output} (${sizeKB} KB)`);
    results.push(site);
  }

  // 生成聚合首页
  if (results.length > 0) {
    const indexHtml = generateIndex(results);
    const indexPath = path.join(DOCS_DIR, 'index.html');
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    console.log(`\n🏠 已生成聚合首页 ${indexPath}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  ✅ 打包完成！共 ${results.length} 个仪表盘`);
  console.log('  📁 输出目录: ' + DOCS_DIR);
  console.log('  📌 下一步: 将 docs/ 目录推送到 GitHub 并开启 Pages');
  console.log('='.repeat(60));
}

main();
