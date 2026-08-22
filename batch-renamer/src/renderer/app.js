/**
 * 批量重命名工具 —— 渲染进程逻辑
 * 负责：UI 交互、规则应用、预览更新、撤销管理
 */

// ========== 应用状态 ==========
const state = {
  folderPath: '',           // 当前文件夹路径
  originalFiles: [],         // 原始文件列表 [{name, size, ext}, ...]
  renamedFiles: [],          // 重命名后的文件名列表（与 originalFiles 一一对应）
  hasUnsavedChanges: false,  // 是否有未执行的更改
  lastOperation: null,       // { type: 'rename'|'undo', count: number, undoAvailable: boolean }
};

// ========== DOM 元素缓存 ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  btnSelectFolder: $('#btnSelectFolder'),
  btnUndo: $('#btnUndo'),
  folderInfo: $('#folderInfo'),
  folderPath: $('#folderPath'),
  fileCount: $('#fileCount'),
  rulesPanel: $('#rulesPanel'),
  previewPanel: $('#previewPanel'),
  fileTableBody: $('#fileTableBody'),
  emptyState: $('#emptyState'),
  changeCount: $('#changeCount'),
  btnExecute: $('#btnExecute'),
  toast: $('#toast'),
  // 规则输入控件
  addPrefix: $('#addPrefix'),
  btnApplyPrefix: $('#btnApplyPrefix'),
  delPrefix: $('#delPrefix'),
  btnRemovePrefix: $('#btnRemovePrefix'),
  addSuffix: $('#addSuffix'),
  btnApplySuffix: $('#btnApplySuffix'),
  delSuffix: $('#delSuffix'),
  btnRemoveSuffix: $('#btnRemoveSuffix'),
  findText: $('#findText'),
  replaceText: $('#replaceText'),
  btnReplace: $('#btnReplace'),
  seqPosition: $('#seqPosition'),
  seqStart: $('#seqStart'),
  seqDigits: $('#seqDigits'),
  btnInsertSeq: $('#btnInsertSeq'),
  caseType: $('#caseType'),
  btnCase: $('#btnCase'),
  btnResetAll: $('#btnResetAll'),
};

// ========== 初始化 ==========
function init() {
  bindEvents();
}

// ========== 事件绑定 ==========
function bindEvents() {
  dom.btnSelectFolder.addEventListener('click', onSelectFolder);
  dom.btnUndo.addEventListener('click', onUndo);
  dom.btnExecute.addEventListener('click', onExecute);

  // 规则按钮
  dom.btnApplyPrefix.addEventListener('click', () => applyAddPrefix());
  dom.btnRemovePrefix.addEventListener('click', () => applyRemovePrefix());
  dom.btnApplySuffix.addEventListener('click', () => applyAddSuffix());
  dom.btnRemoveSuffix.addEventListener('click', () => applyRemoveSuffix());
  dom.btnReplace.addEventListener('click', () => applyReplace());
  dom.btnInsertSeq.addEventListener('click', () => applyInsertSeq());
  dom.btnCase.addEventListener('click', () => applyCaseTransform());
  dom.btnResetAll.addEventListener('click', () => applyReset());

  // 实时输入预览 —— 输入时自动更新预览
  dom.addPrefix.addEventListener('input', () => applyAddPrefix());
  dom.delPrefix.addEventListener('input', () => applyRemovePrefix());
  dom.addSuffix.addEventListener('input', () => applyAddSuffix());
  dom.delSuffix.addEventListener('input', () => applyRemoveSuffix());
  dom.findText.addEventListener('input', () => {
    if (dom.findText.value.trim()) applyReplace();
  });
  dom.replaceText.addEventListener('input', () => {
    if (dom.findText.value.trim()) applyReplace();
  });

  // 序号参数变化时自动更新
  dom.seqPosition.addEventListener('change', () => {
    if (dom.btnInsertSeq.disabled) applyInsertSeq();
  });
  dom.seqStart.addEventListener('input', () => {
    if (dom.btnInsertSeq.disabled) applyInsertSeq();
  });
  dom.seqDigits.addEventListener('input', () => {
    if (dom.btnInsertSeq.disabled) applyInsertSeq();
  });
}

// ========== 文件夹选择 ==========
async function onSelectFolder() {
  const result = await window.electronAPI.selectFolder();
  if (!result.success) {
    showToast(result.message || '选择文件夹失败', 'error');
    return;
  }

  state.folderPath = result.folder;
  state.originalFiles = result.files;
  // 初始化 renamedFiles 为原始文件名
  state.renamedFiles = result.files.map(f => f.name);
  state.hasUnsavedChanges = false;
  state.lastOperation = null;

  // 更新 UI
  renderFolderInfo();
  enableControls(true);
  renderPreview();
  dom.btnUndo.disabled = true;
}

// ========== 重置所有文件名 ==========
function applyReset() {
  if (state.originalFiles.length === 0) return;
  state.renamedFiles = state.originalFiles.map(f => f.name);
  state.hasUnsavedChanges = false;
  renderPreview();
  showToast('已恢复为原始文件名', 'info');
}

// ========== 添加前缀 ==========
function applyAddPrefix() {
  const prefix = dom.addPrefix.value.trim();
  if (!prefix) return;

  state.renamedFiles = state.renamedFiles.map(name => {
    // 先移除当前已添加的这个前缀（避免重复叠加）
    const nameWithoutPrefix = name.startsWith(prefix) ? name.slice(prefix.length) : name;
    return prefix + nameWithoutPrefix;
  });

  state.hasUnsavedChanges = true;
  // 保留输入框内容，方便微调
  dom.addPrefix.value = prefix;
  renderPreview();

  // 高亮已应用的按钮
  flashButton(dom.btnApplyPrefix);
}

// ========== 删除前缀 ==========
function applyRemovePrefix() {
  const prefix = dom.delPrefix.value.trim();
  if (!prefix) return;

  state.renamedFiles = state.renamedFiles.map(name => {
    if (name.startsWith(prefix)) {
      return name.slice(prefix.length);
    }
    return name;
  });

  state.hasUnsavedChanges = true;
  dom.delPrefix.value = prefix;
  renderPreview();
  flashButton(dom.btnRemovePrefix);
}

// ========== 添加后缀 ==========
// 注意：后缀加在文件名与扩展名之间，例如 "file.txt" → "file_backup.txt"
function applyAddSuffix() {
  const suffix = dom.addSuffix.value.trim();
  if (!suffix) return;

  state.renamedFiles = state.renamedFiles.map(name => {
    const extIndex = findExtIndex(name);
    const base = name.slice(0, extIndex);
    const ext = name.slice(extIndex);
    // 先检查是否已有相同后缀
    if (extIndex > 0 && base.endsWith(suffix)) {
      return name; // 已有此后缀，跳过
    }
    return base + suffix + ext;
  });

  state.hasUnsavedChanges = true;
  dom.addSuffix.value = suffix;
  renderPreview();
  flashButton(dom.btnApplySuffix);
}

// ========== 删除后缀 ==========
function applyRemoveSuffix() {
  const suffix = dom.delSuffix.value.trim();
  if (!suffix) return;

  state.renamedFiles = state.renamedFiles.map(name => {
    const extIndex = findExtIndex(name);
    const base = name.slice(0, extIndex);
    const ext = name.slice(extIndex);
    if (base.endsWith(suffix)) {
      return base.slice(0, base.length - suffix.length) + ext;
    }
    return name;
  });

  state.hasUnsavedChanges = true;
  dom.delSuffix.value = suffix;
  renderPreview();
  flashButton(dom.btnRemoveSuffix);
}

// ========== 查找替换 ==========
function applyReplace() {
  const findText = dom.findText.value;
  const replaceText = dom.replaceText.value;
  if (!findText) return;

  state.renamedFiles = state.renamedFiles.map(name =>
    name.split(findText).join(replaceText)
  );

  state.hasUnsavedChanges = true;
  renderPreview();
  flashButton(dom.btnReplace);
}

// ========== 插入序号 ==========
function applyInsertSeq() {
  const position = dom.seqPosition.value;  // 'prefix' | 'suffix'
  const start = parseInt(dom.seqStart.value, 10) || 0;
  const digits = parseInt(dom.seqDigits.value, 10) || 2;

  // 生成新文件名时，先恢复到原始文件名再插入序号（避免序号重复叠加）
  const baseNames = [...state.originalFiles.map(f => f.name)];

  state.renamedFiles = baseNames.map((name, i) => {
    const seq = String(start + i).padStart(digits, '0');
    const extIndex = findExtIndex(name);
    const base = name.slice(0, extIndex);
    const ext = name.slice(extIndex);

    if (position === 'prefix') {
      return seq + '_' + base + ext;
    } else {
      return base + '_' + seq + ext;
    }
  });

  state.hasUnsavedChanges = true;
  renderPreview();
  flashButton(dom.btnInsertSeq);
}

// ========== 大小写转换 ==========
function applyCaseTransform() {
  const caseType = dom.caseType.value;
  if (!caseType) return;

  state.renamedFiles = state.renamedFiles.map(name => {
    const extIndex = findExtIndex(name);
    const base = name.slice(0, extIndex);
    const ext = name.slice(extIndex);

    switch (caseType) {
      case 'lower':
        return base.toLowerCase() + ext.toLowerCase();
      case 'upper':
        return base.toUpperCase() + ext.toUpperCase();
      case 'title':
        return toTitleCase(base) + (ext ? ext.toLowerCase() : '');
      default:
        return name;
    }
  });

  dom.caseType.value = ''; // 操作后重置选择
  state.hasUnsavedChanges = true;
  renderPreview();
  flashButton(dom.btnCase);
}

// ========== 执行重命名 ==========
async function onExecute() {
  if (!state.hasUnsavedChanges) {
    showToast('没有需要执行的更改', 'info');
    return;
  }

  // 构建重命名对儿列表（只包含实际更改的文件）
  const renamePairs = [];
  for (let i = 0; i < state.originalFiles.length; i++) {
    const original = state.originalFiles[i].name;
    const renamed = state.renamedFiles[i];
    if (original !== renamed) {
      renamePairs.push({ original, renamed });
    }
  }

  if (renamePairs.length === 0) {
    showToast('没有需要重命名的文件', 'info');
    return;
  }

  // 先检查命名冲突
  const newNames = renamePairs.map(p => p.renamed);
  const conflictResult = await window.electronAPI.checkConflicts(state.folderPath, newNames);
  if (!conflictResult.success) {
    showToast(conflictResult.message, 'error');
    return;
  }

  if (conflictResult.conflicts.length > 0) {
    const conflictList = conflictResult.conflicts.join('\n• ');
    const confirmed = confirm(
      `⚠️ 检测到 ${conflictResult.conflicts.length} 个文件名冲突：\n\n• ${conflictList}\n\n这可能导致文件被覆盖。是否继续？`
    );
    if (!confirmed) return;
  }

  // 执行重命名
  const result = await window.electronAPI.executeRename(state.folderPath, renamePairs);
  if (!result.success) {
    showToast(result.message, 'error');
    return;
  }

  // 显示结果
  const msg = `✅ 成功重命名 ${result.successCount} 个文件` +
    (result.failCount > 0 ? `，${result.failCount} 个失败` : '');
  showToast(msg, result.failCount > 0 ? 'error' : 'success');

  // 更新状态：将 renamedFiles 同步到 originalFiles
  state.originalFiles = state.renamedFiles.map((name, i) => ({
    name,
    size: state.originalFiles[i]?.size || 0,
    ext: getFileExt(name),
  }));
  state.hasUnsavedChanges = false;
  state.lastOperation = { type: 'rename', count: result.successCount, undoAvailable: result.successCount > 0 };
  dom.btnUndo.disabled = !state.lastOperation.undoAvailable;

  renderPreview();
}

// ========== 撤销操作 ==========
async function onUndo() {
  if (!state.lastOperation || !state.lastOperation.undoAvailable) {
    showToast('没有可撤销的操作', 'info');
    return;
  }

  const result = await window.electronAPI.undoRename();
  if (!result.success) {
    showToast(result.message, 'error');
    return;
  }

  const msg = `↩ 已撤销 ${result.undoCount} 个文件的重命名` +
    (result.errors.length > 0 ? `，${result.errors.length} 个失败` : '');
  showToast(msg, result.errors.length > 0 ? 'error' : 'success');

  // 刷新列表
  const refreshResult = await window.electronAPI.refreshFiles(state.folderPath);
  if (refreshResult.success) {
    state.originalFiles = refreshResult.files;
    state.renamedFiles = refreshResult.files.map(f => f.name);
    state.hasUnsavedChanges = false;
    state.lastOperation = null;
    dom.btnUndo.disabled = true;
    renderPreview();
  }
}

// ========== 渲染：文件夹信息 ==========
function renderFolderInfo() {
  dom.folderInfo.classList.remove('hidden');
  dom.folderPath.textContent = state.folderPath;
  dom.fileCount.textContent = `${state.originalFiles.length} 个文件`;
}

// ========== 渲染：预览表格 ==========
function renderPreview() {
  dom.previewPanel.classList.remove('hidden');

  if (state.originalFiles.length === 0) {
    dom.fileTableBody.innerHTML = '';
    dom.emptyState.classList.remove('hidden');
    dom.changeCount.textContent = '';
    dom.btnExecute.disabled = true;
    return;
  }

  dom.emptyState.classList.add('hidden');

  // 构建表格行
  const rows = [];
  let changedCount = 0;

  for (let i = 0; i < state.originalFiles.length; i++) {
    const original = state.originalFiles[i].name;
    const renamed = state.renamedFiles[i] || original;
    const isChanged = original !== renamed;

    if (isChanged) changedCount++;

    rows.push(`
      <tr class="${isChanged ? 'changed' : ''}">
        <td class="col-status">
          <span class="status-badge ${isChanged ? 'status-changed' : 'status-unchanged'}">
            ${isChanged ? '已更改' : '—'}
          </span>
        </td>
        <td class="col-original" title="${escapeHtml(original)}">${escapeHtml(original)}</td>
        <td class="col-arrow">${isChanged ? '→' : ''}</td>
        <td class="col-renamed">
          <span class="${isChanged ? 'renamed-text' : ''}" title="${escapeHtml(renamed)}">
            ${escapeHtml(renamed)}
          </span>
        </td>
      </tr>
    `);
  }

  dom.fileTableBody.innerHTML = rows.join('');

  // 更新统计
  if (changedCount > 0) {
    dom.changeCount.textContent = `${changedCount} 个文件已更改`;
    dom.btnExecute.disabled = false;
  } else {
    dom.changeCount.textContent = '';
    dom.btnExecute.disabled = true;
  }
}

// ========== 启用/禁用控件 ==========
function enableControls(enabled) {
  // 规则输入框
  dom.addPrefix.disabled = !enabled;
  dom.delPrefix.disabled = !enabled;
  dom.addSuffix.disabled = !enabled;
  dom.delSuffix.disabled = !enabled;
  dom.findText.disabled = !enabled;
  dom.replaceText.disabled = !enabled;
  dom.seqPosition.disabled = !enabled;
  dom.seqStart.disabled = !enabled;
  dom.seqDigits.disabled = !enabled;
  dom.caseType.disabled = !enabled;

  // 规则按钮
  dom.btnApplyPrefix.disabled = !enabled;
  dom.btnRemovePrefix.disabled = !enabled;
  dom.btnApplySuffix.disabled = !enabled;
  dom.btnRemoveSuffix.disabled = !enabled;
  dom.btnReplace.disabled = !enabled;
  dom.btnInsertSeq.disabled = !enabled;
  dom.btnCase.disabled = !enabled;
  dom.btnResetAll.disabled = !enabled;

  // 规则面板
  if (enabled) {
    dom.rulesPanel.classList.remove('hidden');
  }
}

// ========== Toast 提示 ==========
let toastTimer = null;
function showToast(message, type) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    dom.toast.classList.add('hidden');
  }

  dom.toast.textContent = message;
  dom.toast.className = `toast toast-${type}`;
  dom.toast.classList.remove('hidden');

  toastTimer = setTimeout(() => {
    dom.toast.classList.add('hidden');
    toastTimer = null;
  }, 2500);
}

// ========== 按钮闪烁反馈 ==========
function flashButton(btn) {
  btn.style.transform = 'scale(0.93)';
  setTimeout(() => {
    btn.style.transform = 'scale(1)';
  }, 100);
}

// ========== 工具函数 ==========

/**
 * 查找文件名中扩展名的起始位置
 * 对于 "file.txt" 返回 4（.的位置）
 * 对于 ".gitignore" 返回 0（隐藏文件，整个算文件名）
 * 对于 "archive.tar.gz" 返回 7（.tar.gz，双扩展名保留）
 */
function findExtIndex(filename) {
  // 隐藏文件（以 . 开头）视为无扩展名
  if (filename.startsWith('.')) return filename.length;

  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename.length;

  // 检查是否为常见双扩展名（如 .tar.gz, .d.ts）
  const doubleExts = ['.tar.gz', '.tar.bz2', '.tar.xz', '.d.ts', '.min.js', '.min.css'];
  for (const dExt of doubleExts) {
    if (filename.endsWith(dExt)) {
      return filename.length - dExt.length;
    }
  }

  return lastDot;
}

/** 根据文件名获取扩展名 */
function getFileExt(filename) {
  const idx = findExtIndex(filename);
  return idx >= filename.length ? '' : filename.slice(idx).toLowerCase();
}

/** 首字母大写 */
function toTitleCase(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** HTML 转义，防止 XSS */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, c => map[c]);
}

// ========== 启动 ==========
init();
