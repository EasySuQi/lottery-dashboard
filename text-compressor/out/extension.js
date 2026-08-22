"use strict";
// ============================================================
// 扩展入口
// 注册命令、StatusBar、WebView Provider
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const provider_1 = require("./webview/provider");
const compressor_1 = require("./compressor");
const statusBar_1 = require("./statusBar");
let provider;
/**
 * 扩展激活入口
 */
function activate(context) {
    console.log('文本压缩工具已激活');
    // ---- 1. 注册 WebView 侧边栏面板 ----
    provider = new provider_1.CompressorViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(provider_1.CompressorViewProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } }));
    // ---- 2. 创建状态栏 ----
    const statusBar = (0, statusBar_1.createStatusBar)();
    context.subscriptions.push(statusBar);
    // ---- 3. 注册命令 ----
    // 打开面板
    context.subscriptions.push(vscode.commands.registerCommand('text-compressor.openPanel', () => {
        vscode.commands.executeCommand(`workbench.view.extension.text-compressor-sidebar`);
    }));
    // 压缩选中文本（弹出算法选择列表）
    context.subscriptions.push(vscode.commands.registerCommand('text-compressor.compressFromSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('请先选中要压缩的文本');
            return;
        }
        // 让用户选择压缩方法
        const methodItems = compressor_1.METHODS.map(m => ({
            label: `${m.icon} ${m.label}`,
            description: m.description,
            detail: m.id,
        }));
        const selected = await vscode.window.showQuickPick(methodItems, {
            placeHolder: '选择压缩方式',
            matchOnDescription: true,
        });
        if (!selected)
            return;
        const method = (0, compressor_1.getMethod)(selected.detail);
        if (!method)
            return;
        const text = editor.document.getText(editor.selection);
        try {
            const result = (0, compressor_1.compress)(text, method);
            // 用压缩结果替换选中文本
            await editor.edit((editBuilder) => {
                editBuilder.replace(editor.selection, result.result);
            });
            vscode.window.showInformationMessage(`压缩完成：${result.originalSize} → ${result.compressedSize} 字符（节省 ${result.saved} 字符，${result.ratio}）`);
        }
        catch (err) {
            vscode.window.showErrorMessage(err?.message || '压缩失败');
        }
    }));
    // 清空面板
    context.subscriptions.push(vscode.commands.registerCommand('text-compressor.clearAll', () => {
        provider.postMessage({ type: 'clear' });
    }));
    // ---- 4. 监听编辑器事件 ----
    let updateDebounce;
    const debouncedUpdate = () => {
        clearTimeout(updateDebounce);
        updateDebounce = setTimeout(statusBar_1.updateStatusBar, 300);
    };
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        (0, statusBar_1.updateStatusBar)();
    }));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => {
        debouncedUpdate();
    }));
    // 初始更新
    (0, statusBar_1.updateStatusBar)();
}
/**
 * 扩展停用时
 */
function deactivate() {
    console.log('文本压缩工具已停用');
}
//# sourceMappingURL=extension.js.map