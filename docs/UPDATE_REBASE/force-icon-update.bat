@echo off
REM Force Windows Icon Cache Clear for Roopik
REM Run this as Administrator for best results

echo ========================================
echo Force Icon Cache Clear for Roopik
echo ========================================
echo.

echo [1/5] Closing all Roopik processes...
taskkill /F /IM Roopik.exe >nul 2>&1
timeout /t 2 >nul

echo [2/5] Stopping Windows Explorer...
taskkill /F /IM explorer.exe >nul 2>&1
timeout /t 2 >nul

echo [3/5] Deleting icon cache files...
del /F /Q "%LOCALAPPDATA%\IconCache.db" >nul 2>&1
del /F /Q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*.db" >nul 2>&1
del /F /Q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\thumbcache*.db" >nul 2>&1

echo [4/5] Clearing icon cache registry...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Icons" /f >nul 2>&1

echo [5/5] Restarting Windows Explorer...
start explorer.exe
timeout /t 2 >nul

echo.
echo ========================================
echo Icon cache cleared!
echo ========================================
echo.
echo Next steps:
echo 1. Restart your computer (most reliable)
echo 2. Open Task Manager and check the icon
echo 3. If still old, the icon might be embedded incorrectly
echo.
pause

