@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 坚果云 WebDAV 代理（守心便签同步用）
echo.
echo   正在启动坚果云 WebDAV 代理...
echo.
echo   便签应用「服务器地址」填:  http://127.0.0.1:8080/dav/
echo   账户/密码填坚果云账号与授权密码
echo.
echo   同步期间请保持本窗口开着；不需要同步时关闭窗口即可停止。
echo.
node dev\webdav-proxy.mjs 8080
pause
