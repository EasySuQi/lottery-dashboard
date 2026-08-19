#!/bin/bash
# ============================================================
# 大乐透自动化完整流程脚本
# 拉取 → 分析 → 报告 → 仪表盘 → 通知
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  大乐透自动化分析完整流程"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

cd "$ROOT_DIR"

echo ""
echo "[1/2] 拉取数据并分析..."
node "$SCRIPT_DIR/fetch_and_analyze.js"

echo ""
echo "[2/3] 发送通知..."
node "$SCRIPT_DIR/send_notify.js" feishu || echo "  ⚠ 通知发送失败（不影响数据更新）"

echo ""
echo "[3/3] 发布站点到 GitHub Pages..."
node "E:/AI_Works/scripts/publish_site.js" "更新大乐透数据" || echo "  ⚠ 发布失败（不影响数据更新）"

echo ""
echo "=============================================="
echo "  ✅ 全流程完成！"
echo "=============================================="
echo "  📁 数据: $ROOT_DIR/data/draws.json"
echo "  📝 报告: $ROOT_DIR/data/latest_report.md"
echo "  📊 面板: $ROOT_DIR/dashboard/index.html"
echo "  🌐 站点: https://easysuqi.github.io/lottery-dashboard/"
