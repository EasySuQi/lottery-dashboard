"use strict";
// ============================================================
// 状态栏管理
// 底部状态栏实时显示字数/字符数
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusBar = createStatusBar;
exports.updateStatusBar = updateStatusBar;
exports.countText = countText;
const vscode = __importStar(require("vscode"));
let statusBarItem;
/**
 * 创建状态栏项
 */
function createStatusBar() {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
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
function updateStatusBar() {
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
function countText(text) {
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
//# sourceMappingURL=statusBar.js.map