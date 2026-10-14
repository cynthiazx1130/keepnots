@echo off
chcp 65001 >nul
cd /d "%~dp0notes-app"
node dev\phone-preview.mjs
if errorlevel 1 pause
