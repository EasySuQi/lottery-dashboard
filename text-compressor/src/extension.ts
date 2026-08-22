// ============================================================
// 扩展入口
// 注册命令、StatusBar、WebView Provider
// ============================================================

import * as vscode from 'vscode';
import { CompressorViewProvider } from './webview/provider';
import { compress, getMethod, METHODS } from './compressor';
import { createStatusBar, updateStatusBar } from './statusBar';

let provider: CompressorViewProvider;

/**
 * 扩展激活入口
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('文本压缩工具已激活');

  // ---- 1. 注册 WebView 侧边栏面板 ----
  provider = new CompressorViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CompressorViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ---- 2. 创建状态栏 ----
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  // ---- 3. 注册命令 ----
  // 打开面板
  context.subscriptions.push(
    vscode.commands.registerCommand('text-compressor.openPanel', () => {
      vscode.commands.executeCommand(`workbench.view.extension.text-compressor-sidebar`);
    })
  );

  // 压缩选中文本（弹出算法选择列表）
  context.subscriptions.push(
    vscode.commands.registerCommand('text-compressor.compressFromSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('请先选中要压缩的文本');
        return;
      }

      // 让用户选择压缩方法
      const methodItems = METHODS.map(m => ({
        label: `${m.icon} ${m.label}`,
        description: m.description,
        detail: m.id,
      }));

      const selected = await vscode.window.showQuickPick(methodItems, {
        placeHolder: '选择压缩方式',
        matchOnDescription: true,
      });

      if (!selected) return;

      const method = getMethod(selected.detail);
      if (!method) return;

      const text = editor.document.getText(editor.selection);

      try {
        const result = compress(text, method);
        // 用压缩结果替换选中文本
        await editor.edit((editBuilder) => {
          editBuilder.replace(editor.selection, result.result);
        });
        vscode.window.showInformationMessage(
          `压缩完成：${result.originalSize} → ${result.compressedSize} 字符（节省 ${result.saved} 字符，${result.ratio}）`
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(err?.message || '压缩失败');
      }
    })
  );

  // 清空面板
  context.subscriptions.push(
    vscode.commands.registerCommand('text-compressor.clearAll', () => {
      provider.postMessage({ type: 'clear' });
    })
  );

  // ---- 4. 监听编辑器事件 ----
  let updateDebounce: NodeJS.Timeout | undefined;
  const debouncedUpdate = () => {
    clearTimeout(updateDebounce);
    updateDebounce = setTimeout(updateStatusBar, 300);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateStatusBar();
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      debouncedUpdate();
    })
  );

  // 初始更新
  updateStatusBar();
}

/**
 * 扩展停用时
 */
export function deactivate(): void {
  console.log('文本压缩工具已停用');
}
