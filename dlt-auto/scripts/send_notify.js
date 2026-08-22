#!/usr/bin/env node
// ============================================================
// 大乐透分析 Webhook 通知推送 v1.0
// 支持: 飞书 / 企业微信 / 钉钉
// ============================================================

const fs = require('fs');
const path = require('path');
const common = require(path.join(__dirname, '..', '..', 'scripts', 'lottery-common.js'));

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DASHBOARD_DATA_PATH = path.join(ROOT, 'data', 'dashboard_data.json');
const ERROR_LOG_PATH = path.join(ROOT, 'data', 'error.log');
const LAST_RUN_PATH = path.join(ROOT, 'data', 'last_run.json');

function pad(n, len) { return String(n).padStart(len || 2, '0'); }

function loadConfig() { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
function loadDashboardData() { return JSON.parse(fs.readFileSync(DASHBOARD_DATA_PATH, 'utf8')); }

function buildMessageContent(data) {
    const latest = data.latestDraw;
    const pred = data.latestPrediction;
    const review = data.review;
    const lines = [];

    lines.push('## 🟠🔵 超级大乐透第 ' + latest.code + ' 期 分区冷热分析\n');
    lines.push('> 📅 开奖日期: **' + latest.date + '**');
    lines.push('> 🎱 前区: ' + latest.front.map(n => pad(n)).join(' ') + '  后区: ' + latest.back.map(n => pad(n)).join(' ') + '\n');

    lines.push('### 🔥 前区热号 Top 6\n');
    for (let i = 0; i < Math.min(6, data.frontRanking.length); i++) {
        const r = data.frontRanking[i];
        lines.push('- ' + r.num + ' (出现 **' + r.count + '** 次 ' + r.label + ')');
    }
    lines.push('');

    lines.push('### 🔵 后区热号 Top 3\n');
    for (let i = 0; i < Math.min(3, data.backRanking.length); i++) {
        const b = data.backRanking[i];
        lines.push('- ' + b.num + ' (出现 **' + b.count + '** 次 ' + b.label + ')');
    }
    lines.push('');

    if (pred && pred.groups) {
        lines.push('### 🎯 本期推荐 (7+2)\n');
        for (const g of pred.groups) {
            lines.push('> **' + g.name + '**');
            lines.push('> 🟠 \`' + g.front.map(n => pad(n)).join(' ') + '\`');
            lines.push('> 🔵 \`' + g.back.map(n => pad(n)).join(' ') + '\`');
            lines.push('> 分区: ' + g.distribution + ' | 连号: ' + ((g.consecutivePairs || []).map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') || '--') + ' | 冷热: H' + g.hotCount + '-W' + g.warmCount + '-C' + g.coldCount + '\n');
        }
    }

    if (review) {
        lines.push('### 📋 上期复盘\n');
        lines.push('> 前区命中: **' + review.bestFrontHits + '/7**  后区命中: **' + review.bestBackHits + '/2**\n');
    }

    lines.push('📊 [查看完整报告](file:///E:/AI_Works/dlt-auto/dashboard/index.html)\n');
    lines.push('<font color="comment">⚠️ 历史统计推演，不构成投注建议。彩票为独立随机事件。</font>');

    return lines.join('\n');
}

async function sendFeishu(webhook, message) {
    const result = await common.postJson(webhook, { msg_type: 'text', content: { text: message } });
    if (result && typeof result === 'object' && result.code !== undefined && result.code !== 0) {
        throw new Error('飞书返回错误: [' + result.code + '] ' + result.msg);
    }
}

async function sendWecom(webhook, message) {
    await common.postJson(webhook, { msgtype: 'markdown', markdown: { content: message } });
}

// ====== 参数解析 ======
// 用法:
//   node send_notify.js [通道名] [--only-when-new] [--dry-run]
//   通道名: feishu / wecom / dingtalk（默认推送所有启用通道）
//   --only-when-new: 仅当最近一次分析有新数据时推送（读取 last_run.json，避免重复推送）
//   --dry-run: 只构建消息不发送（用于测试）
async function main() {
    const args = process.argv.slice(2);
    const forceChannel = args.find(a => !a.startsWith('--')) || null;
    const onlyWhenNew = args.includes('--only-when-new');
    const dryRun = args.includes('--dry-run');

    const config = loadConfig();
    const data = loadDashboardData();

    if (!config.notifications.enabled && !forceChannel) {
        console.log('🔕 通知功能未启用');
        return;
    }

    // 无新数据时跳过推送（避免重复推送旧报告）
    if (onlyWhenNew) {
        const lastRun = common.loadJson(LAST_RUN_PATH, null);
        if (!lastRun) {
            console.log('ℹ 未找到 last_run.json，按 --only-when-new 跳过推送');
            return;
        }
        if (!lastRun.updated) {
            console.log('ℹ 最近一次分析无更新 (updated=false)，跳过推送（--only-when-new）');
            return;
        }
    }

    const message = buildMessageContent(data);
    if (dryRun) {
        console.log('🧪 --dry-run 模式：以下消息将发送（未实际推送）');
        console.log('-'.repeat(60));
        console.log(message);
        console.log('-'.repeat(60));
        return;
    }

    const results = [];

    for (const channel of config.notifications.channels) {
        if (!channel.enabled && !forceChannel) continue;
        if (forceChannel && channel.type !== forceChannel) continue;
        if (!channel.webhook) {
            console.log('⚠ ' + channel.name + ': webhook URL 未配置，跳过');
            continue;
        }

        try {
            console.log('📤 正在发送通知到 ' + channel.name + '...');
            switch (channel.type) {
                case 'feishu': await sendFeishu(channel.webhook, message); break;
                case 'wecom': await sendWecom(channel.webhook, message); break;
                default: console.log('⚠ 未知类型: ' + channel.type); continue;
            }
            console.log('✅ ' + channel.name + ' 发送成功');
            results.push({ channel: channel.name, success: true });
        } catch (e) {
            console.error('❌ ' + channel.name + ' 发送失败: ' + e.message);
            results.push({ channel: channel.name, success: false, error: e.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log('\n📊 通知推送完成: ' + successCount + '/' + results.length + ' 成功');
}

main().catch(e => {
    console.error('❌ 通知脚本执行异常: ' + e.message);
    process.exit(1);
});
