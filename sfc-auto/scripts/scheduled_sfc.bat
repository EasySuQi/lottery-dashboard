@echo off
chcp 65001 >nul
set LOG=E:\AI_Works\sfc-auto\data\scheduled.log
echo [%date% %time%] SFC14 scheduled task started >> "%LOG%"
call E:\AI_Works\sfc-auto\scripts\run_daily.bat >> "%LOG%" 2>&1
echo [%date% %time%] SFC14 scheduled task finished >> "%LOG%"
