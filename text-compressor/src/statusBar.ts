// ============================================================
// 状态栏管理
// 底部状态栏实时显示字数/字符数
// ============================================================

import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;

/**
 * 创建状态栏项
 */
export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = '文本压缩工具';
  statusBarItem.text = '$(symbol-text) 字数统计';
  statusBarItem.tooltip = '点击打开文本压缩面板';
  statusBarItem.command = 'text-compressor.openPanel';
  statusBarItem.show();
  return statusBarItem;
}

/**
 * 实时更新状态栏的文字统计
 */
export function updateStatusBar(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    statusBarItem.hide();
    return;
  }
  statusBarItem.show();

  const text = editor.selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(editor.selection);

  const stats = countText(text);
  const isSelection = !editor.selection.isEmpty;

  const prefix = isSelection ? '$(selection)' : '$(symbol-text)';
  statusBarItem.text = `${prefix} 字数:${stats.words} 字符:${stats.chars} 行数:${stats.lines}`;
  statusBarItem.tooltip = isSelection
    ? `选中文本: ${stats.words} 字 | ${stats.chars} 字符 | ${stats.lines} 行 | ${stats.bytes} 字节\n点击打开压缩面板`
    : `当前文档: ${stats.words} 字 | ${stats.chars} 字符 | ${stats.lines} 行 | ${stats.bytes} 字节\n点击打开压缩面板`;
}

/**
 * 文本统计（CJK 友好）
 */
export function countText(text: string): TextStats {
  const chars = text.length;
  // CJK 字符（中文/日文/韩文）
  const cjk = (text.match(/[一-鿿㐀-䶿豈-﫿　-〿＀-￯]/g) || []).length;
  // 英文/数字单词
  const engWords = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  const words = cjk + engWords;
  const lines = text ? text.split(/\r?\n/).length : 0;
  const bytes = new TextEncoder().encode(text).length;

  return { words, chars, lines, bytes };
}

export interface TextStats {
  words: number;
  chars: number;
  lines: number;
  bytes: number;
}
