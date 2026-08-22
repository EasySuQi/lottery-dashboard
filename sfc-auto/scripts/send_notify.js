#!/usr/bin/env node
// ============================================================
// 足彩14场胜负彩 Webhook 通知推送 v1.0
// 支持: 企业微信 / 钉钉 / 飞书
// ============================================================

const fs = require('fs');
const path = require('path');
const common = require(path.join(__dirname, '..', '..', 'scripts', 'lottery-common.js'));

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DASHBOARD_DATA_PATH = path.join(ROOT, 'data', 'dashboard_data.json');
const LAST_RUN_PATH = path.join(ROOT, 'data', 'last_run.json');

function fmtMoney(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(0) + '万';
    return n.toLocaleString();
}

function loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadDashboardData() {
    return JSON.parse(fs.readFileSync(DASHBOARD_DATA_PATH, 'utf8'));
}

// ====== 构建消息内容 ======
function buildMessageContent(data) {
    const latest = data.latestDraw;
    const diff = data.difficulty;
    const summ = data.summary;

    const lines = [];
    lines.push(`⚽ 足彩14场胜负彩 第 ${latest.code} 期 分析报告`);
    lines.push('');
    lines.push(`📅 开奖日期: ${latest.date}`);
    lines.push(`💰 销售额: ${fmtMoney(latest.totalSale)}元`);

    // 14场赛果摘要
    if (latest.matches && latest.matches.length > 0) {
        const resultIcons = latest.matches.map((m, i) => {
            const r = latest.results[i];
            return r === 3 ? '🏠' : r === 1 ? '🤝' : r === 0 ? '✈️' : '❓';
        });
        lines.push(`🏟 赛果: ${resultIcons.join(' ')}`);
    }

    lines.push('');
    lines.push(`🏆 一等奖: ${latest.prize1Count}注 / ${fmtMoney(latest.prize1Amount)}元`);
    lines.push(`🥈 二等奖: ${latest.prize2Count}注 / ${fmtMoney(latest.prize2Amount)}元`);
    lines.push('');
    lines.push(`⚖ 难度评级: ${diff.levelLabel} (${diff.totalScore.toFixed(1)}/10)`);
    lines.push(`📊 平局率: ${(diff.avgDrawRate * 100).toFixed(1)}%`);
    lines.push(`📈 奖金波动CV: ${summ.prizeCV.toFixed(2)}`);
    lines.push('');

    // 高风险位置
    if (data.riskyPositions && data.riskyPositions.length > 0) {
        lines.push('⚠ 高风险场次位置:');
        for (const p of data.riskyPositions.slice(0, 5)) {
            const matchInfo = p.match ? ` (${p.match.home}vs${p.match.away})` : '';
            lines.push(`  第${p.position}场${matchInfo}: ${p.riskLabel}`);
        }
        lines.push('');
    }

    // 高确定性位置
    if (data.safePositions && data.safePositions.length > 0) {
        lines.push('✅ 高确定性位置(倾向明确):');
        for (const p of data.safePositions.slice(0, 3)) {
            const maxLabel = { win: '主胜', draw: '平局', lose: '客胜' }[p.maxKey];
            const matchInfo = p.match ? ` (${p.match.home}vs${p.match.away})` : '';
            lines.push(`  第${p.position}场: ${maxLabel} ${p.maxVal}次${matchInfo}`);
        }
        lines.push('');
    }

    // 联赛统计摘要
    if (data.leagueSummary && data.leagueSummary.length > 0) {
        lines.push('📊 主要联赛 (出场次数):');
        for (const l of data.leagueSummary.slice(0, 5)) {
            const winRate = l.homeWinRate.toFixed(0);
            lines.push(`  ${l.name}: ${l.appearances}场 | 主胜率${winRate}%`);
        }
        lines.push('');
    }

    lines.push('');
    lines.push(`📊 查看完整报告: file:///E:/AI_Works/sfc-auto/dashboard/index.html`);
    lines.push('');
    lines.push('⚠️ 历史统计推演，不构成投注建议。足球赛果为独立事件。');

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
        markdown: { title: '足彩14场分析', text: message }
    });
}

// ====== 飞书 ======
async function sendFeishu(webhook, message) {
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
