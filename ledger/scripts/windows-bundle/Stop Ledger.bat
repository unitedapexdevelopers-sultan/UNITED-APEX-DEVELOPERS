@echo off
echo Stopping Ledger server...
taskkill /FI "WINDOWTITLE eq Ledger Server*" /T /F >nul 2>&1
echo Done. You can close the Ledger browser window separately if it's still open.
pause
