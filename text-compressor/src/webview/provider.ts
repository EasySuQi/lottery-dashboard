// ============================================================
// WebView Provider
// 实现 WebviewViewProvider 接口，管理前后端通信
// ============================================================

import * as vscode from 'vscode';
import { compress, getMethod, type CompressMethod } from '../compressor';
import { getWebviewContent } from './content';

export class CompressorViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'text-compressor.panel';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /**
   * 当 WebView 面板被创建或变为可见时调用
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // 渲染 HTML 内容
    webviewView.webview.html = getWebviewContent(webviewView.webview, this._extensionUri);

    // 监听来自 WebView 的消息
    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this._handleMessage(message, webviewView.webview),
      undefined,
      []
    );

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
  private _handleMessage(message: WebviewMessage, webview: vscode.Webview): void {
    switch (message.type) {
      case 'compress': {
        const method = getMethod(message.method);
        if (!method) {
          webview.postMessage({ type: 'error', message: `未知的压缩方法: ${message.method}` });
          return;
        }
        try {
          const result = compress(message.text, method);
          webview.postMessage({
            type: 'compressed',
            method: method.label,
            original: message.text,
            result: result.result,
            saved: result.saved,
            ratio: result.ratio,
          });
        } catch (err: any) {
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
        } else {
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
              const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
              );
              editBuilder.replace(fullRange, message.text);
            } else {
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
  postMessage(message: any): void {
    this._view?.webview.postMessage(message);
  }
}

/** WebView → Extension 的消息类型 */
type WebviewMessage =
  | { type: 'compress'; method: string; text: string }
  | { type: 'getSelection' }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'replaceSelection'; text: string }
  | { type: 'stats'; text: string }
  | { type: 'clear' };
