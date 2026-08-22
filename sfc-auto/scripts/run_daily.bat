@echo off
REM ============================================================
REM Zucai 14 automated analysis orchestration (runs every 2 days)
REM Step 1: fetch + analyze
REM Step 2: backfill history evaluation
REM Step 3: deep analysis of backfill
REM Step 4: forecast future issues
REM Step 5: compare forecast vs real result (+ rebuild dashboard)
REM Step 6: publish site to GitHub Pages
REM ============================================================
chcp 65001 >nul
cd /d E:\AI_Works\sfc-auto

echo ============================================================
echo [1/5] Fetch latest data and analyze
echo ============================================================
node scripts\fetch_and_analyze.js
if errorlevel 1 (
    echo [ERROR] fetch_and_analyze.js failed
) else (
    echo [OK] fetch_and_analyze done
    echo.
    echo [1.5/6] Send notification (only when new data)
    node scripts\send_notify.js --only-when-new
)

echo.
echo ============================================================
echo [2/5] Backfill history evaluation
echo ============================================================
node scripts\backfill_history.js
if errorlevel 1 (
    echo [ERROR] backfill_history.js failed
) else (
    echo [OK] backfill_history done
)

echo.
echo ============================================================
echo [3/5] Deep analysis of backfill
echo ============================================================
node scripts\analyze_backfill.js
if errorlevel 1 (
    echo [ERROR] analyze_backfill.js failed
) else (
    echo [OK] analyze_backfill done
)

echo.
echo ============================================================
echo [4/5] Forecast future issues
echo ============================================================
node scripts\forecast_match.js
if errorlevel 1 (
    echo [ERROR] forecast_match.js failed
) else (
    echo [OK] forecast_match done
)

echo.
echo ============================================================
echo [5/5] Compare forecast vs real result
echo ============================================================
node scripts\compare_forecast.js
if errorlevel 1 (
    echo [ERROR] compare_forecast.js failed
) else (
    echo [OK] compare_forecast done, dashboard rebuilt
)

echo.
echo ============================================================
echo [6/6] Publish site to GitHub Pages
echo ============================================================
node E:\AI_Works\scripts\publish_site.js "更新14场数据"
if errorlevel 1 (
    echo [ERROR] publish_site.js failed
) else (
    echo [OK] publish_site done
)

echo.
echo ============================================================
echo All done
echo ============================================================
