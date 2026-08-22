#!/bin/bash
# ============================================================
# 双色球数据拉取脚本 (Shell 封装)
# 直接调用 Node.js 核心脚本来拉取数据
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  双色球数据拉取"
echo "=============================================="

cd "$ROOT_DIR"

# 运行核心分析脚本
node "$SCRIPT_DIR/fetch_and_analyze.js"

echo ""
echo "拉取完成！"
echo "数据文件: $ROOT_DIR/data/draws.json"
echo "报告文件: $ROOT_DIR/data/latest_report.md"
echo "仪表盘:   $ROOT_DIR/dashboard/index.html"
