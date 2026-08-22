/**
 * 批量重命名工具 —— 主进程入口
 * 负责：窗口创建、IPC 通信处理、文件系统操作
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// ========== 全局状态 ==========
let mainWindow = null;
/** @type {{ folder: string, original: string, renamed: string }[]} */
let renameHistory = [];  // 记录最近一次操作，用于撤销

// ========== 窗口创建 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: '批量重命名工具',
    // 安全配置（不可违反）
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 开发时可打开 DevTools
  // mainWindow.webContents.openDevTools();
}

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
  createWindow();

  // Mac 点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出（Mac 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ========== IPC 处理：选择文件夹 ==========
ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择要批量重命名的文件夹',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '用户取消了选择' };
    }

    const folderPath = result.filePaths[0];
    const files = loadFileList(folderPath);
    return { success: true, folder: folderPath, files };
  } catch (err) {
    return { success: false, message: `选择文件夹失败：${err.message}` };
  }
});

// ========== IPC 处理：刷新文件列表 ==========
ipcMain.handle('refresh-files', async (_event, folderPath) => {
  try {
    const files = loadFileList(folderPath);
    return { success: true, files };
  } catch (err) {
    return { success: false, message: `刷新失败：${err.message}` };
  }
});

// ========== IPC 处理：检查文件命名冲突 ==========
ipcMain.handle('check-conflicts', async (_event, folderPath, newNames) => {
  try {
    const conflicts = [];
    for (const newName of newNames) {
      const targetPath = path.join(folderPath, newName);
      if (fs.existsSync(targetPath)) {
        conflicts.push(newName);
      }
    }
    return { success: true, conflicts };
  } catch (err) {
    return { success: false, message: `冲突检查失败：${err.message}` };
  }
});

// ========== IPC 处理：执行重命名 ==========
ipcMain.handle('execute-rename', async (_event, folderPath, renamePairs) => {
  try {
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    const history = []; // 保存本次操作记录用于撤销

    for (const pair of renamePairs) {
      const oldPath = path.join(folderPath, pair.original);
      const newPath = path.join(folderPath, pair.renamed);

      try {
        // 跳过无需重命名的文件
        if (pair.original === pair.renamed) {
          continue;
        }

        // 如果目标文件已存在且不是源文件本身，则添加序号避免覆盖
        if (fs.existsSync(newPath) && pair.original !== pair.renamed) {
          const ext = path.extname(pair.renamed);
          const base = path.basename(pair.renamed, ext);
          let counter = 1;
          let altPath;
          do {
            altPath = path.join(folderPath, `${base}_(${counter})${ext}`);
            counter++;
          } while (fs.existsSync(altPath) && counter < 100);

          fs.renameSync(oldPath, altPath);
          history.push({ folder: folderPath, original: pair.original, renamed: path.basename(altPath) });
        } else {
          fs.renameSync(oldPath, newPath);
          history.push({ folder: folderPath, original: pair.original, renamed: pair.renamed });
        }

        successCount++;
      } catch (fileErr) {
        failCount++;
        errors.push(`${pair.original} → ${pair.renamed}: ${fileErr.message}`);
      }
    }

    // 保存操作历史供撤销
    renameHistory = history;

    return {
      success: true,
      successCount,
      failCount,
      errors,
      history,
    };
  } catch (err) {
    return { success: false, message: `重命名操作失败：${err.message}` };
  }
});

// ========== IPC 处理：撤销最近一次重命名 ==========
ipcMain.handle('undo-rename', async () => {
  try {
    if (renameHistory.length === 0) {
      return { success: false, message: '没有可撤销的操作' };
    }

    let undoCount = 0;
    const errors = [];

    for (const record of renameHistory) {
      try {
        const currentPath = path.join(record.folder, record.renamed);
        const originalPath = path.join(record.folder, record.original);

        if (fs.existsSync(currentPath)) {
          if (fs.existsSync(originalPath)) {
            // 原始文件名已被占用（不应该发生），跳过
            errors.push(`${record.renamed}：撤销失败，原始文件名已被占用`);
            continue;
          }
          fs.renameSync(currentPath, originalPath);
          undoCount++;
        } else {
          errors.push(`${record.renamed}：文件已不存在，无法撤销`);
        }
      } catch (fileErr) {
        errors.push(`${record.renamed}：${fileErr.message}`);
      }
    }

    // 清空撤销历史
    renameHistory = [];

    return { success: true, undoCount, errors };
  } catch (err) {
    return { success: false, message: `撤销失败：${err.message}` };
  }
});

// ========== 内部工具函数 ==========

/**
 * 读取文件夹内所有文件的名称列表（跳过子目录）
 * @param {string} folderPath - 文件夹绝对路径
 * @returns {{ name: string, size: number, ext: string }[]}
 */
function loadFileList(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = path.join(folderPath, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        files.push({
          name: entry.name,
          size: stat.size,
          ext: path.extname(entry.name).toLowerCase(),
        });
      } catch {
        // 跳过无法读取的文件
        files.push({
          name: entry.name,
          size: 0,
          ext: path.extname(entry.name).toLowerCase(),
        });
      }
    }
  }

  // 按文件名排序
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return files;
}
