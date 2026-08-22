# AI Works 项目配置

## 语言偏好

- **所有回复必须使用简体中文**，包括但不限于：分析结果、代码注释、错误说明、任务汇报
- 代码中的变量名、函数名可使用英文，但注释和文档使用中文
- 输出到终端的内容（console.log / print）使用中文
- Markdown 文档标题、说明文字使用中文

## 项目结构

```
E:\AI_Works\
├── .Codex\              # Codex 配置
│   ├── settings.local.json
│   └── skills\           # 自定义 Skills
│       ├── 福彩\         # 双色球分析
│       ├── 体彩\         # 大乐透分析
│       └── skill-builder\ # Skill 编写助手
```

## 已有 Skills

| Skill | 路径 | 用途 |
|-------|------|------|
| 福彩 | `.Codex/skills/福彩/` | 双色球分区冷热分析 & 选号生成 |
| 体彩 | `.Codex/skills/体彩/` | 超级大乐透分区冷热分析 & 选号生成 |
| 体彩14场 | `.Codex/skills/体彩14场/` | 足彩14场胜负彩评估引擎 |
| skill-builder | `.Codex/skills/skill-builder/` | Skill 编写助手（元技能） |

## 自动化 Agent

| Agent | 路径 | 用途 |
|-------|------|------|
| 福彩-agent | `.Codex/agents/福彩-agent.md` | 双色球自动化分析：定时拉取 → 分析 → 报告 → 仪表盘 → 通知 |

## 自动化项目

| 项目 | 路径 | 用途 |
|------|------|------|
| ssq-auto | `ssq-auto/` | 双色球全自动分析系统（数据持久化 + HTML 可视化面板 + IM webhook 推送） |

## 环境信息

- 操作系统：Windows 11 Pro
- Shell：Git Bash
- Node.js：v24.18.0
- Python：按需安装
