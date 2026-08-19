@echo off
chcp 65001 >nul
set LOG=E:\AI_Works\dlt-auto\data\scheduled.log
echo [%date% %time%] DLT scheduled task started >> "%LOG%"
"C:\Program Files\Git\bin\bash.exe" -lc "bash E:/AI_Works/dlt-auto/scripts/run_analysis.sh" >> "%LOG%" 2>&1
echo [%date% %time%] DLT scheduled task finished >> "%LOG%"
