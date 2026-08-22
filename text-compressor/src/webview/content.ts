// ============================================================
// WebView 内容生成器
// 生成面板的完整 HTML / CSS / JS
// ============================================================

import * as vscode from 'vscode';
import { METHODS, type CompressMethod } from '../compressor';

/**
 * 生成 WebView 面板的完整 HTML 内容
 */
export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  // 获取 VS Code 图标资源 URI
  const codiconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
  );

  // 分组按钮的 HTML
  const categories: Record<string, CompressMethod[]> = {};
  for (const m of METHODS) {
    if (!categories[m.category]) categories[m.category] = [];
    categories[m.category].push(m);
  }

  const categoryLabels: Record<string, string> = {
    whitespace: '🧹 空白处理',
    encoding: '🔐 编码转换',
    format: '📋 格式化',
    escape: '🛡 转义字符',
  };

  let buttonsHTML = '';
  for (const [cat, methods] of Object.entries(categories)) {
    buttonsHTML += `<div class="category-label">${categoryLabels[cat] || cat}</div>\n`;
    buttonsHTML += '<div class="button-group">\n';
    for (const m of methods) {
      buttonsHTML += `  <button class="compress-btn" data-method="${m.id}" title="${m.description}">
        <span class="btn-icon">${m.icon}</span>${m.label}
      </button>\n`;
    }
    buttonsHTML += '</div>\n';
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-inline' ${webview.cspSource};">
  <title>文本压缩工具</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #555);
      --btn-bg: var(--vscode-button-background, #0078d4);
      --btn-fg: var(--vscode-button-foreground, #fff);
      --btn-hover: var(--vscode-button-hoverBackground, #026ec1);
      --btn-secondary-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-secondary-fg: var(--vscode-button-secondaryForeground, #ccc);
      --btn-secondary-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --border: var(--vscode-panel-border, #333);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #fff);
      --scrollbar: var(--vscode-scrollbarSlider-background, #424242);
      --scrollbar-hover: var(--vscode-scrollbarSlider-hoverBackground, #4f4f4f);
      --error-bg: #5a1d1d;
      --error-fg: #f48771;
      --success-fg: #89d185;
    }

    body {
      font-family: var(--vscode-font-family, -apple-system, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 8px;
      line-height: 1.5;
      overflow-y: auto;
    }

    /* 顶部标题栏 */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .header h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
      white-space: nowrap;
    }
    .header-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    /* 内容区 */
    .section {
      margin-bottom: 10px;
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground, #999);
      margin-bottom: 4px;
    }

    /* 文本区域 */
    textarea {
      width: 100%;
      min-height: 80px;
      max-height: 200px;
      padding: 6px 8px;
      font-family: var(--vscode-editor-font-family, 'Cascadia Code', Consolas, monospace);
      font-size: 12px;
      line-height: 1.5;
      color: var(--input-fg);
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      resize: vertical;
      outline: none;
      transition: border-color 0.15s;
    }
    textarea:focus {
      border-color: var(--btn-bg);
    }
    textarea[readonly] {
      opacity: 0.85;
      cursor: default;
    }
    #output-area {
      border-color: var(--success-fg);
    }

    /* 统计栏 */
    .stats-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #999);
      padding: 3px 0;
    }
    .stats-bar .stat {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .stats-bar .stat-value {
      font-weight: 600;
      color: var(--vscode-charts-blue, #75beff);
    }
    #compression-stats {
      color: var(--success-fg);
    }
    #compression-stats .stat-value {
      color: var(--success-fg);
    }

    /* 按钮样式 */
    button {
      cursor: pointer;
      border: none;
      border-radius: 3px;
      font-size: 12px;
      padding: 4px 8px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s, opacity 0.15s;
      white-space: nowrap;
    }
    button:active { opacity: 0.8; }

    .btn-primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    .btn-primary:hover { background: var(--btn-hover); }

    .btn-secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-fg);
    }
    .btn-secondary:hover { background: var(--btn-secondary-hover); }

    .btn-small {
      font-size: 11px;
      padding: 2px 6px;
    }

    /* 压缩按钮分组 */
    .category-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground, #999);
      margin: 8px 0 3px;
      letter-spacing: 0.5px;
    }
    .button-group {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 2px;
    }

    .compress-btn {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-fg);
      font-size: 11px;
      padding: 3px 7px;
      border-radius: 3px;
    }
    .compress-btn:hover {
      background: var(--btn-bg);
      color: var(--btn-fg);
    }
    .compress-btn .btn-icon {
      font-size: 13px;
    }

    /* 错误提示 */
    .error-toast {
      position: fixed;
      top: 4px;
      left: 8px;
      right: 8px;
      background: var(--error-bg);
      color: var(--error-fg);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 100;
      display: none;
      animation: slideDown 0.2s ease;
    }
    .error-toast.show { display: block; }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* 滚动条 */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }

    /* 历史记录 */
    .history-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 6px;
      margin: 2px 0;
      background: var(--input-bg);
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .history-item:hover { background: var(--badge-bg); }
    .history-item .method-name { font-weight: 600; min-width: 70px; }
    .history-item .preview {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0 8px;
      color: var(--vscode-descriptionForeground, #999);
    }
    .history-item .saved { color: var(--success-fg); font-weight: 600; }

    /* 隐藏状态 */
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="error-toast" id="error-toast"></div>

  <!-- 标题栏 -->
  <div class="header">
    <h3>📝 文本压缩工具</h3>
    <div class="header-actions">
      <button class="btn-secondary btn-small" id="btn-history" title="查看压缩历史">📜 历史</button>
      <button class="btn-secondary btn-small" id="btn-swap" title="交换输入和输出">🔄 交换</button>
      <button class="btn-secondary btn-small" id="btn-clear" title="清空所有内容">🗑 清空</button>
    </div>
  </div>

  <!-- 输入区 -->
  <div class="section">
    <div class="section-title">
      <span>📥 输入文本</span>
      <button class="btn-secondary btn-small" id="btn-import" title="从编辑器获取选中文本">📋 从编辑器导入</button>
    </div>
    <textarea id="input-area" placeholder="在此粘贴或输入文本... 支持 Ctrl+Enter 使用上次压缩方式"></textarea>
    <div class="stats-bar" id="input-stats">
      <span class="stat">📊 字数: <span class="stat-value">0</span></span>
      <span class="stat">字符: <span class="stat-value">0</span></span>
      <span class="stat">行数: <span class="stat-value">0</span></span>
      <span class="stat">字节: <span class="stat-value">0</span></span>
    </div>
  </div>

  <!-- 压缩操作按钮 -->
  <div class="section">
    <div class="section-title">🔧 压缩操作</div>
    ${buttonsHTML}
  </div>

  <!-- 输出区 -->
  <div class="section">
    <div class="section-title">
      <span>📤 压缩结果</span>
      <div style="display:flex;gap:4px;">
        <button class="btn-primary btn-small" id="btn-copy" title="复制结果到剪贴板">📋 复制</button>
        <button class="btn-secondary btn-small" id="btn-replace" title="用结果替换编辑器选中文本">📥 替换选区</button>
      </div>
    </div>
    <textarea id="output-area" readonly placeholder="点击上方压缩按钮，结果将显示在此..."></textarea>
    <div class="stats-bar" id="output-stats">
      <span class="stat">📊 字数: <span class="stat-value">0</span></span>
      <span class="stat">字符: <span class="stat-value">0</span></span>
      <span class="stat">行数: <span class="stat-value">0</span></span>
      <span class="stat">字节: <span class="stat-value">0</span></span>
    </div>
    <div class="stats-bar" id="compression-stats" style="display:none;">
      <span class="stat">📉 节省: <span class="stat-value">0</span> 字符</span>
      <span class="stat">压缩率: <span class="stat-value">0%</span></span>
    </div>
  </div>

  <!-- 历史记录区 -->
  <div class="section hidden" id="history-section">
    <div class="section-title">📜 最近压缩记录</div>
    <div id="history-list"></div>
  </div>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      // ====== DOM 元素 ======
      const inputArea = document.getElementById('input-area');
      const outputArea = document.getElementById('output-area');
      const errorToast = document.getElementById('error-toast');
      const inputStats = document.getElementById('input-stats');
      const outputStats = document.getElementById('output-stats');
      const compressionStats = document.getElementById('compression-stats');
      const historySection = document.getElementById('history-section');
      const historyList = document.getElementById('history-list');

      // ====== 状态 ======
      let lastMethod = '';
      let history = [];
      const MAX_HISTORY = 20;
      let showHistory = false;

      // ====== 统计更新 ======
      function getStats(text) {
        const chars = text.length;
        // CJK 字数: 匹配中文、日文、韩文字符
        const cjk = (text.match(/[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff\\u3000-\\u303f\\uff00-\\uffef]/g) || []).length;
        // 英文单词数
        const words = (text.match(/[a-zA-Z0-9]+/g) || []).length;
        const lines = text ? text.split(/\\r?\\n/).length : 0;
        const bytes = new TextEncoder().encode(text).length;
        return { chars, words: cjk + words, lines, bytes };
      }

      function updateInputStats() {
        const text = inputArea.value;
        const stats = getStats(text);
        inputStats.querySelectorAll('.stat-value').forEach((el, i) => {
          el.textContent = [stats.words, stats.chars, stats.lines, stats.bytes][i];
        });
      }

      function updateOutputStats(text) {
        const stats = getStats(text);
        outputStats.querySelectorAll('.stat-value').forEach((el, i) => {
          el.textContent = [stats.words, stats.chars, stats.lines, stats.bytes][i];
        });
      }

      function updateCompressionStats(original, compressed) {
        const saved = original.length - compressed.length;
        const ratio = original.length > 0 ? ((saved / original.length) * 100).toFixed(1) + '%' : '0%';
        compressionStats.style.display = 'flex';
        compressionStats.querySelectorAll('.stat-value')[0].textContent = saved >= 0 ? saved : '+' + Math.abs(saved);
        compressionStats.querySelectorAll('.stat-value')[1].textContent = ratio;
      }

      // ====== 输入监听 ======
      let inputDebounce;
      inputArea.addEventListener('input', () => {
        updateInputStats();
        clearTimeout(inputDebounce);
        inputDebounce = setTimeout(() => {
          vscode.postMessage({ type: 'stats', text: inputArea.value });
        }, 200);
      });

      // Ctrl+Enter 使用上次压缩方式
      inputArea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter' && lastMethod) {
          e.preventDefault();
          doCompress(lastMethod);
        }
      });

      // ====== 压缩按钮事件 ======
      document.querySelectorAll('.compress-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const method = btn.dataset.method;
          doCompress(method);
        });
      });

      function doCompress(method) {
        const text = inputArea.value;
        if (!text) { showError('请先在输入框中输入文本'); return; }
        lastMethod = method;
        vscode.postMessage({ type: 'compress', method, text });
      }

      // ====== 工具栏按钮 ======
      document.getElementById('btn-copy').addEventListener('click', () => {
        const text = outputArea.value;
        if (!text) { showError('没有可复制的结果'); return; }
        navigator.clipboard.writeText(text).then(() => {
          showToast('✅ 已复制到剪贴板', false);
        }).catch(() => {
          vscode.postMessage({ type: 'copyToClipboard', text });
        });
      });

      document.getElementById('btn-replace').addEventListener('click', () => {
        const text = outputArea.value;
        if (!text) { showError('没有可替换的结果'); return; }
        vscode.postMessage({ type: 'replaceSelection', text });
      });

      document.getElementById('btn-import').addEventListener('click', () => {
        vscode.postMessage({ type: 'getSelection' });
      });

      document.getElementById('btn-clear').addEventListener('click', () => {
        inputArea.value = '';
        outputArea.value = '';
        updateInputStats();
        updateOutputStats('');
        compressionStats.style.display = 'none';
        vscode.postMessage({ type: 'clear' });
      });

      document.getElementById('btn-swap').addEventListener('click', () => {
        const tmp = inputArea.value;
        inputArea.value = outputArea.value;
        outputArea.value = tmp;
        updateInputStats();
        updateOutputStats(outputArea.value);
        if (outputArea.value && inputArea.value) {
          updateCompressionStats(inputArea.value, outputArea.value);
        }
      });

      document.getElementById('btn-history').addEventListener('click', () => {
        showHistory = !showHistory;
        historySection.classList.toggle('hidden', !showHistory);
        if (showHistory) renderHistory();
      });

      // ====== 消息接收 ======
      window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
          case 'compressed':
            outputArea.value = msg.result;
            updateOutputStats(msg.result);
            updateCompressionStats(msg.original, msg.result);
            // 添加到历史
            addHistory(msg.method, msg.original, msg.result, msg.saved);
            break;

          case 'selection':
            if (msg.text) {
              inputArea.value = msg.text;
              updateInputStats();
            }
            break;

          case 'copied':
            showToast('✅ 已复制到剪贴板', false);
            break;

          case 'replaced':
            showToast('✅ 已替换编辑器选区', false);
            break;

          case 'error':
            showError(msg.message);
            break;
        }
      });

      // ====== 历史记录 ======
      function addHistory(method, original, result, saved) {
        history.unshift({
          method,
          time: new Date().toLocaleTimeString('zh-CN'),
          preview: result.substring(0, 50) + (result.length > 50 ? '...' : ''),
          saved,
          original,
          result,
        });
        if (history.length > MAX_HISTORY) history.pop();
        if (showHistory) renderHistory();
      }

      function renderHistory() {
        if (history.length === 0) {
          historyList.innerHTML = '<div style="font-size:11px;color:#999;padding:4px;">暂无记录</div>';
          return;
        }
        historyList.innerHTML = history.map((h, i) =>
          '<div class="history-item" data-idx="' + i + '">' +
            '<span class="method-name">' + h.method + '</span>' +
            '<span class="preview">' + escapeHTML(h.preview) + '</span>' +
            '<span class="saved">' + (h.saved >= 0 ? '-' + h.saved : '+' + Math.abs(h.saved)) + '</span>' +
          '</div>'
        ).join('');

        historyList.querySelectorAll('.history-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.idx);
            const h = history[idx];
            inputArea.value = h.original;
            outputArea.value = h.result;
            updateInputStats();
            updateOutputStats(h.result);
            updateCompressionStats(h.original, h.result);
          });
        });
      }

      // ====== 工具函数 ======
      function escapeHTML(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function showError(msg) {
        errorToast.textContent = '⚠ ' + msg;
        errorToast.classList.add('show');
        setTimeout(() => errorToast.classList.remove('show'), 3000);
      }

      function showToast(msg, isError) {
        errorToast.textContent = msg;
        errorToast.style.background = isError ? 'var(--error-bg)' : 'var(--vscode-inputValidation-infoBackground, #063b49)';
        errorToast.style.color = isError ? 'var(--error-fg)' : 'var(--vscode-inputValidation-infoForeground, #75beff)';
        errorToast.classList.add('show');
        setTimeout(() => {
          errorToast.classList.remove('show');
          errorToast.style.background = 'var(--error-bg)';
          errorToast.style.color = 'var(--error-fg)';
        }, 2000);
      }
    })();
  </script>
</body>
</html>`;
}
