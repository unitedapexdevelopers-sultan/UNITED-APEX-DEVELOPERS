@echo off
set VBS=%TEMP%\LedgerShortcut.vbs

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS%"
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\Ledger.lnk" >> "%VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS%"
echo oLink.TargetPath = "%~dp0Start Ledger.bat" >> "%VBS%"
echo oLink.WorkingDirectory = "%~dp0" >> "%VBS%"
echo oLink.IconLocation = "%~dp0icon.ico, 0" >> "%VBS%"
echo oLink.WindowStyle = 7 >> "%VBS%"
echo oLink.Save >> "%VBS%"

cscript //nologo "%VBS%"
del "%VBS%"

echo.
echo Shortcut "Ledger" created on your Desktop.
pause
