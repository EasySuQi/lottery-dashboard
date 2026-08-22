@echo off
chcp 65001 >nul
echo === Creating LotterySSQ (Tue/Thu/Sun 21:30) ===
schtasks /Create /TN "LotterySSQ" /TR "E:\AI_Works\ssq-auto\scripts\scheduled_ssq.bat" /SC WEEKLY /D TUE,THU,SUN /ST 21:30 /F
echo exit=%errorlevel%

echo.
echo === Creating LotteryDLT (Mon/Wed/Sat 21:40) ===
schtasks /Create /TN "LotteryDLT" /TR "E:\AI_Works\dlt-auto\scripts\scheduled_dlt.bat" /SC WEEKLY /D MON,WED,SAT /ST 21:40 /F
echo exit=%errorlevel%

echo.
echo === Creating LotterySFC14 (Daily 10:00) ===
schtasks /Create /TN "LotterySFC14" /TR "E:\AI_Works\sfc-auto\scripts\scheduled_sfc.bat" /SC DAILY /ST 10:00 /F
echo exit=%errorlevel%

echo.
echo === Done ===
