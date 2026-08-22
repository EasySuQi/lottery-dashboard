/**
 * 预加载脚本 —— 通过 contextBridge 安全暴露主进程 API 给渲染进程
 * 渲染进程只能通过 window.electronAPI 调用这里暴露的方法
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** 打开文件夹选择对话框，返回文件夹路径和文件列表 */
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  /** 刷新指定文件夹的文件列表 */
  refreshFiles: (folderPath) => ipcRenderer.invoke('refresh-files', folderPath),

  /** 检查新文件名是否存在冲突 */
  checkConflicts: (folderPath, newNames) =>
    ipcRenderer.invoke('check-conflicts', folderPath, newNames),

  /** 执行批量重命名 */
  executeRename: (folderPath, renamePairs) =>
    ipcRenderer.invoke('execute-rename', folderPath, renamePairs),

  /** 撤销最近一次重命名操作 */
  undoRename: () => ipcRenderer.invoke('undo-rename'),
});
