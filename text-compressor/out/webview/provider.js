"use strict";
// ============================================================
// WebView Provider
// 实现 WebviewViewProvider 接口，管理前后端通信
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
exports.CompressorViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const compressor_1 = require("../compressor");
const content_1 = require("./content");
class CompressorViewProvider {
    _extensionUri;
    static viewType = 'text-compressor.panel';
    _view;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    /**
     * 当 WebView 面板被创建或变为可见时调用
     */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        // 渲染 HTML 内容
        webviewView.webview.html = (0, content_1.getWebviewContent)(webviewView.webview, this._extensionUri);
        // 监听来自 WebView 的消息
        webviewView.webview.onDidReceiveMessage((message) => this._handleMessage(message, webviewView.webview), undefined, []);
        // 面板可见性变化时，保持内容不丢失
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // 面板重新可见时的处理（如有需要）
            }
        });
    }
    /**
     * 处理来自 WebView 的消息
     */
    _handleMessage(message, webview) {
        switch (message.type) {
            case 'compress': {
                const method = (0, compressor_1.getMethod)(message.method);
                if (!method) {
                    webview.postMessage({ type: 'error', message: `未知的压缩方法: ${message.method}` });
                    return;
                }
                try {
                    const result = (0, compressor_1.compress)(message.text, method);
                    webview.postMessage({
                        type: 'compressed',
                        method: method.label,
                        original: message.text,
                        result: result.result,
                        saved: result.saved,
                        ratio: result.ratio,
                    });
                }
                catch (err) {
                    webview.postMessage({
                        type: 'error',
                        message: err?.message || '压缩过程中发生错误',
                    });
                }
                break;
            }
            case 'getSelection': {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    const text = editor.document.getText(editor.selection);
                    webview.postMessage({ type: 'selection', text });
                }
                else {
                    webview.postMessage({
                        type: 'error',
                        message: '编辑器中无选中文本，请先选中要导入的文本',
                    });
                }
                break;
            }
            case 'copyToClipboard': {
                vscode.env.clipboard.writeText(message.text).then(() => {
                    webview.postMessage({ type: 'copied' });
                });
                break;
            }
            case 'replaceSelection': {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.edit((editBuilder) => {
                        if (editor.selection.isEmpty) {
                            // 没有选区时，替换整个文档
                            const fullRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length));
                            editBuilder.replace(fullRange, message.text);
                        }
                        else {
                            editBuilder.replace(editor.selection, message.text);
                        }
                    }).then((success) => {
                        if (success) {
                            webview.postMessage({ type: 'replaced' });
                        }
                    });
                }
                break;
            }
            case 'stats': {
                // 统计信息已由 WebView 前端处理，此处可做服务端二次统计
                break;
            }
            case 'clear': {
                // 面板已在前端清空，此处可做额外清理
                break;
            }
            default:
                break;
        }
    }
    /**
     * 向 WebView 推送消息（供外部命令调用）
     */
    postMessage(message) {
        this._view?.webview.postMessage(message);
    }
}
exports.CompressorViewProvider = CompressorViewProvider;
//# sourceMappingURL=provider.js.map