#!/usr/bin/env node
// ============================================================
// 站点发布脚本 —— 重新打包并推送到 GitHub Pages
// ============================================================
// 功能:
//   1. 调用 build_site.js 重新打包 docs/ 目录
//   2. git add docs/ + commit + push 到 origin main
//   3. 若 docs/ 无变化则跳过推送（避免空 commit）
//
// 用法:
//   node scripts/publish_site.js [提交说明]
//   node scripts/publish_site.js "更新福彩数据"
//
// 供各分析 Agent 在收尾时自动调用。
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const BUILD_SCRIPT = path.join(__dirname, 'build_site.js');

function run(cmd, opts) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function main() {
  const commitMsg = process.argv[2] || '更新仪表盘数据';

  console.log('='.repeat(60));
  console.log('  站点发布脚本 publish_site.js');
  console.log('='.repeat(60));

  // Step 1: 重新打包
  console.log('\n[1/3] 重新打包 docs/ 目录...');
  try {
    run(`node "${BUILD_SCRIPT}"`);
  } catch (e) {
    console.error('  ❌ 打包失败:', e.message);
    process.exit(1);
  }

  // 检查是否为 git 仓库
  let isRepo = false;
  try {
    run('git rev-parse --is-inside-work-tree');
    isRepo = true;
  } catch (_) {}

  if (!isRepo) {
    console.log('\n  ⚠ 当前目录不是 git 仓库，跳过推送（仅完成打包）');
    console.log('  提示: 先执行 git init 并关联远程仓库');
    return;
  }

  // Step 2: 暂存 docs/
  console.log('\n[2/3] 暂存 docs/ 变更...');
  run('git add docs/');

  // 检查是否有变更
  let hasChanges = false;
  try {
    const status = run('git status --porcelain docs/');
    hasChanges = status.trim().length > 0;
  } catch (_) {}

  if (!hasChanges) {
    console.log('  ℹ docs/ 无变化，跳过提交推送');
    console.log('='.repeat(60));
    return;
  }

  // Step 3: 提交 + 推送
  console.log('\n[3/3] 提交并推送...');
  try {
    run(`git commit -m "${commitMsg}"`);
    console.log('  ✅ 已提交');
  } catch (e) {
    // commit 失败可能是无变化或未配置身份，打印信息
    console.log('  ⚠ 提交失败:', e.message.split('\n')[0]);
  }

  try {
    const pushOut = run('git push origin main');
    console.log('  ✅ 已推送到 origin main');
    if (pushOut.trim()) console.log(pushOut.trim().split('\n').slice(-3).join('\n'));
  } catch (e) {
    console.error('  ❌ 推送失败:', e.message.split('\n')[0]);
    console.error('  请检查网络或 GitHub 认证状态');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  ✅ 发布完成！');
  console.log('  🌐 站点: https://easysuqi.github.io/lottery-dashboard/');
  console.log('='.repeat(60));
}

main();
