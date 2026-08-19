#!/usr/bin/env node
// ============================================================
// 大乐透分析 Webhook 通知推送 v1.0
// 支持: 飞书 / 企业微信 / 钉钉
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DASHBOARD_DATA_PATH = path.join(ROOT, 'data', 'dashboard_data.json');
const ERROR_LOG_PATH = path.join(ROOT, 'data', 'error.log');

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

function sendFeishu(webhook, message) {
    const body = JSON.stringify({ msg_type: 'text', content: { text: message } });
    const tmpFile = path.join(ROOT, 'data', '_feishu_payload.json');
    fs.writeFileSync(tmpFile, body, 'utf8');
    try {
        const result = execSync('curl -s -X POST -H "Content-Type: application/json" -d @' + tmpFile + ' "' + webhook + '"', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
        const parsed = JSON.parse(result);
        if (parsed.code !== 0) throw new Error('飞书返回错误: [' + parsed.code + '] ' + parsed.msg);
    } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
}

function sendWecom(webhook, message) {
    const body = JSON.stringify({ msgtype: 'markdown', markdown: { content: message } });
    execSync('curl -s -X POST -H "Content-Type: application/json" -d \'' + body.replace(/'/g, "'\\''") + '\' "' + webhook + '"', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
}

function main() {
    const args = process.argv.slice(2);
    const forceChannel = args[0] || null;
    const config = loadConfig();
    const data = loadDashboardData();

    if (!config.notifications.enabled && !forceChannel) {
        console.log('🔕 通知功能未启用');
        return;
    }

    const message = buildMessageContent(data);
    const results = [];

    for (const channel of config.notifications.channels) {
        if (!channel.enabled && !forceChannel) continue;
        if (forceChannel && channel.type !== forceChannel) continue;
        if (!channel.webhook) { console.log('⚠ ' + channel.name + ': webhook URL 未配置'); continue; }

        try {
            console.log('📤 正在发送通知到 ' + channel.name + '...');
            switch (channel.type) {
                case 'feishu': sendFeishu(channel.webhook, message); break;
                case 'wecom': sendWecom(channel.webhook, message); break;
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

main();
