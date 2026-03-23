@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo  正在启动 SVG 动画导出工具...
echo.
npm start
echo.
pause
