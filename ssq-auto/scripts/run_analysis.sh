#!/bin/bash
# ============================================================
# 双色球自动化完整流程脚本
# 拉取 → 分析 → 报告 → 仪表盘 → 通知
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  双色球自动化分析完整流程"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

cd "$ROOT_DIR"

# Step 1: 数据拉取 + 分析 + 报告生成
echo ""
echo "[1/3] 拉取数据并分析..."
node "$SCRIPT_DIR/fetch_and_analyze.js"

# Step 2: 刷新仪表盘数据（fetch_and_analyze.js 已生成，此处仅确认）
echo ""
echo "[2/3] 确认仪表盘数据..."
if [ -f "$ROOT_DIR/data/dashboard_data.json" ]; then
    echo "  ✅ dashboard_data.json 已生成"
    echo "  📊 打开仪表盘: $ROOT_DIR/dashboard/index.html"
else
    echo "  ⚠ dashboard_data.json 未找到！"
fi

# Step 3: 发送通知
echo ""
echo "[3/4] 发送通知..."
node "$SCRIPT_DIR/send_notify.js" --only-when-new || echo "  ⚠ 通知发送失败（不影响数据更新）"

# Step 4: 发布站点
echo ""
echo "[4/4] 发布站点到 GitHub Pages..."
node "E:/AI_Works/scripts/publish_site.js" "更新福彩数据" || echo "  ⚠ 发布失败（不影响数据更新）"

echo ""
echo "=============================================="
echo "  ✅ 全流程完成！"
echo "=============================================="
echo "  📁 数据: $ROOT_DIR/data/draws.json"
echo "  📝 报告: $ROOT_DIR/data/latest_report.md"
echo "  📊 面板: $ROOT_DIR/dashboard/index.html"
echo "  🌐 站点: https://easysuqi.github.io/lottery-dashboard/"
