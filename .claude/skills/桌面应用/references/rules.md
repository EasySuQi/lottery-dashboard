# 桌面应用技术选型规则手册

## 一、技术选型决策树

按以下流程图从根到叶进行决策：

```
用户需求
│
├─ 是否需要调用系统硬件（摄像头/蓝牙/串口/USB）？
│  ├─ 是 → Electron（硬件 API 最成熟）
│  └─ 否 → 继续
│
├─ 是否需要渲染大量图表/数据表格？
│  ├─ 是 → 继续判断
│  │  ├─ 用户熟悉 Python → Python + PyQt6
│  │  └─ 否则 → Electron（ECharts/Recharts 生态丰富）
│  └─ 否 → 继续
│
├─ 是否追求极小的安装包体积（< 20MB）？
│  ├─ 是 → Tauri（Rust 后端，包体 ~5MB）
│  └─ 否 → 继续
│
├─ 是否需要复杂的系统级功能（托盘/快捷键/开机启动/多窗口）？
│  ├─ 是 → Electron（生态系统最完善，示例最多）
│  └─ 否 → 继续
│
├─ 是否为快速原型/内部工具，开发速度优先？
│  ├─ 是 → Python + tkinter（纯 Python，零配置）
│  └─ 否 → 继续
│
├─ 应用复杂度如何？
│  ├─ 简单（≤3 个功能页面）→ Tauri
│  └─ 复杂（≥4 个功能页面）→ Electron
│
└─ 默认推荐 → Electron（生态最成熟，社区最大）
```

## 二、各技术栈详细评估

### 2.1 Electron

| 维度 | 评分 | 说明 |
|------|------|------|
| 开发效率 | ⭐⭐⭐⭐⭐ | Web 技术栈，前端开发者零门槛 |
| 包体积 | ⭐⭐ | 含 Chromium，基础 ~150MB |
| 内存占用 | ⭐⭐ | 渲染进程 ≈50-100MB |
| 硬件 API | ⭐⭐⭐⭐⭐ | Chromium API + Node.js 原生模块 |
| 跨平台 | ⭐⭐⭐⭐⭐ | Windows/Mac/Linux 一等支持 |
| 社区生态 | ⭐⭐⭐⭐⭐ | npm 包直接可用，教程最多 |
| 构建工具 | ⭐⭐⭐⭐ | electron-builder / electron-forge |

**适用场景**：
- 企业级桌面应用
- 需要复杂 UI 交互的应用
- 数据仪表盘和大屏展示
- 调用摄像头、麦克风、蓝牙等硬件
- 团队以 Web 前端开发者为主

**不适用场景**：
- 对安装包大小有严格要求的场景（替代：Tauri）
- 纯 CLI 工具包装（替代：Python tkinter）
- 嵌入设备/低性能机器

**版本锁定**：
- Electron 版本：`^33.0.0`（2026 年最新稳定版）
- Chromium 版本：随 Electron 内置
- Node.js 版本：`≥18.0.0`

### 2.2 Tauri

| 维度 | 评分 | 说明 |
|------|------|------|
| 开发效率 | ⭐⭐⭐ | 需懂 Rust 或仅用前端 + Tauri API |
| 包体积 | ⭐⭐⭐⭐⭐ | 不含浏览器引擎，~5-15MB |
| 内存占用 | ⭐⭐⭐⭐⭐ | 使用系统 WebView，~20-40MB |
| 硬件 API | ⭐⭐⭐ | 通过 Rust crate 调用，门槛较高 |
| 跨平台 | ⭐⭐⭐⭐ | Windows/Mac/Linux 支持良好 |
| 社区生态 | ⭐⭐⭐ | 快速成长中，常用插件已有 |
| 构建工具 | ⭐⭐⭐⭐ | Tauri CLI，配置较简洁 |

**适用场景**：
- 包体积敏感的轻量工具
- 对启动速度有要求（秒开）
- Rust 技术栈团队
- 简单的 CRUD 桌面应用

**不适用场景**：
- 需频繁调用 Chromium 独有 API（替代：Electron）
- 需使用大量 Node.js 原生模块（替代：Electron）
- 复杂硬件交互
- 团队无 Rust 经验且需要深度定制后端

**版本锁定**：
- Tauri 版本：`^2.0`（2026 年稳定版）
- Rust 版本：`≥1.75`
- Node.js 版本：`≥16.0.0`

### 2.3 Python + GUI 框架

| 维度 | 评分 | 说明 |
|------|------|------|
| 开发效率 | ⭐⭐⭐⭐ | Python 语法简洁，快速原型 |
| 包体积 | ⭐⭐⭐ | PyInstaller 打包 ~50-100MB |
| 内存占用 | ⭐⭐⭐ | 取决于 GUI 框架 |
| 硬件 API | ⭐⭐⭐⭐ | pyserial/opencv/pyaudio 成熟 |
| 跨平台 | ⭐⭐⭐ | tkinter 各平台体验不一致 |
| 社区生态 | ⭐⭐⭐⭐ | 数据处理生态优秀 |
| 构建工具 | ⭐⭐⭐ | PyInstaller / Nuitka |

**框架选择**：

| GUI 框架 | 适用场景 | 包体积 | 美观度 |
|----------|---------|--------|--------|
| tkinter | 快速原型、简单工具 | ~15MB | ⭐⭐ |
| PyQt6 | 专业应用、数据面板 | ~80MB | ⭐⭐⭐⭐⭐ |
| CustomTkinter | 现代化 tkinter 变体 | ~20MB | ⭐⭐⭐⭐ |

**适用场景**：
- 数据科学/可视化桌面应用
- 科学计算工具的 GUI 包装
- 快速原型验证
- Python 技术栈团队

**不适用场景**：
- 需要 Web 渲染引擎的场景（替代：Electron）
- 追求原生 OS 风格 UI（替代：Tauri）
- 需要 Chromium 开发者工具调试 UI

## 三、项目模板参考

### 3.1 Electron 项目最小配置

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  }
}
```

**关键配置项**：
- `main`：主进程入口文件路径
- `scripts.start`：开发启动命令
- `electron-builder` 配置放在 `package.json` 的 `build` 字段

### 3.2 Tauri 项目最小结构

```
my-tauri-app/
├── src-tauri/          # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs
├── src/                # Web 前端
│   ├── index.html
│   └── app.js
└── package.json
```

### 3.3 Python GUI 项目最小结构

```
my-python-app/
├── main.py             # 入口文件
├── requirements.txt    # 依赖清单
├── gui/
│   ├── __init__.py
│   ├── main_window.py  # 主窗口
│   └── widgets/        # 自定义组件
└── build.py            # PyInstaller 构建脚本
```

## 四、常用依赖速查

### 4.1 Electron 常用依赖

| 功能 | npm 包 | 用途 |
|------|--------|------|
| 数据存储 | `electron-store` | 本地 JSON 文件持久化 |
| SQLite | `better-sqlite3` | 嵌入式数据库 |
| HTTP 请求 | `axios` | 网络请求 |
| 图表 | `echarts` | 数据可视化 |
| UI 框架 | `bootstrap` / `tailwindcss` | 响应式布局 |
| 文件对话框 | Electron 内置 `dialog` | 打开/保存文件 |
| 系统托盘 | Electron 内置 `Tray` | 托盘图标与菜单 |
| 自动更新 | `electron-updater` | 应用自动更新 |

### 4.2 Tauri 常用插件

| 功能 | 插件 | 用途 |
|------|------|------|
| 数据存储 | `tauri-plugin-store` | 本地持久化 |
| SQLite | `tauri-plugin-sql` | 嵌入式数据库 |
| HTTP 请求 | `tauri-plugin-http` | 网络请求 |
| 文件系统 | `tauri-plugin-fs` | 文件读写 |
| 系统通知 | `tauri-plugin-notification` | 桌面通知 |
| 剪贴板 | `tauri-plugin-clipboard-manager` | 读写剪贴板 |

### 4.3 Python GUI 常用依赖

| 功能 | pip 包 | 用途 |
|------|--------|------|
| GUI 框架 | `PyQt6` / `customtkinter` | 界面框架 |
| 数据存储 | 内置 `sqlite3` | 嵌入式数据库 |
| HTTP 请求 | `requests` | 网络请求 |
| 图表 | `matplotlib` / `pyqtgraph` | 数据可视化 |
| 打包 | `pyinstaller` | 构建可执行文件 |
| 硬件串口 | `pyserial` | 串口通信 |
| 图像处理 | `opencv-python` / `Pillow` | 图像/视频处理 |

## 五、安全规则（Electron 专用）

在 `src/main/index.js` 中创建 BrowserWindow 时，必须使用以下安全配置：

```js
const mainWindow = new BrowserWindow({
  webPreferences: {
    sandbox: true,              // 启用沙箱
    contextIsolation: true,     // 必须启用上下文隔离
    nodeIntegration: false,     // 必须禁用 Node 集成
    preload: path.join(__dirname, '../preload/index.js'),  // 预加载脚本
  }
});
```

**禁止的配置**：
- ❌ `contextIsolation: false`
- ❌ `nodeIntegration: true`
- ❌ `sandbox: false`（除非有充分理由）
- ❌ 在渲染进程中直接使用 `require('fs')` 等 Node.js 模块

**正确的 IPC 通信模式**：
```
渲染进程 → preload（contextBridge）→ 主进程
主进程 → preload（ipcRenderer）→ 渲染进程
```
