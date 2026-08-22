@echo off
chcp 65001 >nul
set LOG=E:\AI_Works\ssq-auto\data\scheduled.log
echo [%date% %time%] SSQ scheduled task started >> "%LOG%"
"C:\Program Files\Git\bin\bash.exe" -lc "bash E:/AI_Works/ssq-auto/scripts/run_analysis.sh" >> "%LOG%" 2>&1
echo [%date% %time%] SSQ scheduled task finished >> "%LOG%"
