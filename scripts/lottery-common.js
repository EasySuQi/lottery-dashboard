#!/usr/bin/env node
// ============================================================
// 彩票自动化公共库 (lottery-common.js)
// 供 dlt-auto / ssq-auto / sfc-auto 三个自动化项目复用
// 功能: fetch 重试 / POST 通知 / 数据读写 / 期号排序 / 日志
// 依赖: Node.js 18+（内置全局 fetch）
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

// ====== 基础工具 ======
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function pad(n, len = 2) {
    return String(n).padStart(len, '0');
}

function now() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
    console.log(`[${now()}] ${msg}`);
}

// ====== 文件读写 ======
function loadJson(file, fallback = null) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`[${now()}] ⚠ 读取 ${file} 失败: ${e.message}`);
    }
    return fallback;
}

function saveJson(file, data, indent = 2) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, indent), 'utf8');
    return data;
}

function appendLog(file, msg) {
    try {
        fs.appendFileSync(file, `[${now()}] ${msg}\n`, 'utf8');
    } catch (_) {}
}

function logError(file, msg, err) {
    const errMsg = `[${now()}] ERROR: ${msg}\n${err ? err.stack || err.message || err : ''}\n`;
    console.error(errMsg);
    appendLog(file, errMsg);
}

// ====== 网络请求（Node 18+ 全局 fetch，替代 curl 子进程） ======
async function fetchJson(url, opts = {}) {
    const retries = opts.retries ?? 3;
    const retryDelayMs = opts.retryDelayMs ?? 30000;
    const timeoutMs = opts.timeoutMs ?? 30000;
    const headers = opts.headers || {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.sporttery.cn/',
        'Connection': 'keep-alive'
    };

    let lastErr = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            let resp;
            try {
                resp = await fetch(url, { headers, signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
            }
            const text = await resp.text();
            return JSON.parse(text);
        } catch (e) {
            lastErr = e;
            log(`⚠ 第 ${attempt}/${retries} 次请求失败: ${e.message}`);
            if (attempt < retries) {
                log(`  等待 ${retryDelayMs / 1000}s 后重试...`);
                await sleep(retryDelayMs);
            }
        }
    }
    throw new Error(`请求失败，已重试 ${retries} 次: ${lastErr ? lastErr.message : '未知错误'}`);
}

// POST JSON（用于 IM webhook 推送）
async function postJson(url, body, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: typeof body === 'string' ? body : JSON.stringify(body),
            signal: controller.signal
        });
        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
        }
        if (!text) return null;
        try { return JSON.parse(text); } catch (_) { return text; }
    } finally {
        clearTimeout(timer);
    }
}

// ====== 期号工具（数字安全排序） ======
function toCodeNum(code) {
    const n = Number(String(code).replace(/\D/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function sortByCodeDesc(list) {
    return [...list].sort((a, b) => toCodeNum(b.code) - toCodeNum(a.code));
}

// 通用增量合并：按 code 去重，新数据在前
function mergeByCode(existing, fresh) {
    const existingCodes = new Set(existing.map(d => d.code));
    const freshEntries = fresh.filter(d => !existingCodes.has(d.code));

    if (freshEntries.length === 0) {
        return { draws: existing, newCount: 0, latestCode: existing[0]?.code || null };
    }
    const merged = sortByCodeDesc([...freshEntries, ...existing]);
    return { draws: merged, newCount: freshEntries.length, latestCode: freshEntries[0].code };
}

module.exports = {
    sleep, pad, now, log, appendLog, logError,
    loadJson, saveJson, fetchJson, postJson,
    toCodeNum, sortByCodeDesc, mergeByCode
};