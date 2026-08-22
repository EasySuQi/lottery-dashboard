#!/usr/bin/env node
// ============================================================
// 双色球分析 Webhook 通知推送 v1.0
// 支持: 企业微信 / 钉钉 / 飞书
// ============================================================

const fs = require('fs');
const path = require('path');
const common = require(path.join(__dirname, '..', '..', 'scripts', 'lottery-common.js'));

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DASHBOARD_DATA_PATH = path.join(ROOT, 'data', 'dashboard_data.json');
const DRAWS_PATH = path.join(ROOT, 'data', 'draws.json');
const ERROR_LOG_PATH = path.join(ROOT, 'data', 'error.log');
const LAST_RUN_PATH = path.join(ROOT, 'data', 'last_run.json');

function pad(n, len = 2) { return String(n).padStart(len, '0'); }

function loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadDashboardData() {
    return JSON.parse(fs.readFileSync(DASHBOARD_DATA_PATH, 'utf8'));
}

// ====== 构建消息内容 ======
function buildMessageContent(data) {
    const latest = data.latestDraw;
    const pred = data.latestPrediction;
    const review = data.review;

    const lines = [];
    lines.push(`## 🔴🔵 双色球第 ${latest.code} 期 分区冷热分析`);
    lines.push('');
    lines.push(`> 📅 开奖日期: **${latest.date}**`);
    lines.push(`> 🎱 开奖号码: <font color="warning">${latest.reds.map(n => pad(n)).join(' ')}</font> + <font color="info">${pad(latest.blue)}</font>`);
    lines.push('');

    // 前区热号摘要
    lines.push('### 🔥 前区热号 Top 6');
    lines.push('');
    for (let i = 0; i < Math.min(6, data.redRanking.length); i++) {
        const r = data.redRanking[i];
        lines.push(`- ${r.num} (出现 **${r.count}** 次 ${r.label})`);
    }
    lines.push('');

    // 蓝球热号摘要
    lines.push('### 🔵 蓝球热号 Top 3');
    lines.push('');
    for (let i = 0; i < Math.min(3, data.blueRanking.length); i++) {
        const b = data.blueRanking[i];
        lines.push(`- ${b.num} (出现 **${b.count}** 次 ${b.label})`);
    }
    lines.push('');

    // 推荐号码
    if (pred && pred.groups) {
        lines.push('### 🎯 本期推荐 (7+2)');
        lines.push('');
        for (const g of pred.groups) {
            lines.push(`> **${g.name}**`);
            lines.push(`> 🔴 \`${g.reds.map(n => pad(n)).join(' ')}\``);
            lines.push(`> 🔵 \`${g.blues.map(n => pad(n)).join(' ')}\``);
            lines.push(`> 分区: ${g.distribution} | 连号: ${(g.consecutivePairs || []).map(p => pad(p[0]) + '-' + pad(p[1])).join(', ') || '--'} | 冷热: H${g.hotCount}-W${g.warmCount}-C${g.coldCount}`);
            lines.push('');
        }
    }

    // 复盘
    if (review) {
        lines.push('### 📋 上期复盘');
        lines.push('');
        lines.push(`> 上期推荐最佳红球命中: **${review.bestRedHits}/7**`);
        lines.push(`> 蓝球: **${review.bestBlueHit ? '命中 ✅' : '未中 ❌'}**`);
        lines.push('');
    }

    // 统计摘要
    lines.push('### 📊 统计摘要');
    lines.push('');
    lines.push(`> 连号出现率: **${(data.consecutiveRate * 100).toFixed(0)}%**`);
    lines.push(`> 三区全覆盖率: **${(data.fullCoverageRate * 100).toFixed(0)}%**`);
    lines.push('');

    lines.push(`📊 [查看完整报告](file:///E:/AI_Works/ssq-auto/dashboard/index.html)`);
    lines.push('');
    lines.push('<font color="comment">⚠️ 历史统计推演，不构成投注建议。彩票为独立随机事件。</font>');

    return lines.join('\n');
}

// ====== 企业微信 ======
async function sendWecom(webhook, message) {
    await common.postJson(webhook, {
        msgtype: 'markdown',
        markdown: { content: message }
    });
}

// ====== 钉钉 ======
async function sendDingtalk(webhook, message) {
    await common.postJson(webhook, {
        msgtype: 'markdown',
        markdown: {
            title: '双色球分区冷热分析',
            text: message
        }
    });
}

// ====== 飞书 ======
async function sendFeishu(webhook, message) {
    // 使用 text 格式：兼容性好，关键词校验可靠
    const result = await common.postJson(webhook, {
        msg_type: 'text',
        content: { text: message }
    });
    if (result && typeof result === 'object' && result.code !== undefined && result.code !== 0) {
        throw new Error('飞书返回错误: [' + result.code + '] ' + result.msg);
    }
}

// ====== 主流程 ======
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
        console.log('🔕 通知功能未启用。如需启用，请修改 config.json 中 notifications.enabled = true');
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
                case 'wecom': await sendWecom(channel.webhook, message); break;
                case 'dingtalk': await sendDingtalk(channel.webhook, message); break;
                case 'feishu': await sendFeishu(channel.webhook, message); break;
                default:
                    console.log('⚠ 未知通知类型: ' + channel.type);
                    continue;
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
