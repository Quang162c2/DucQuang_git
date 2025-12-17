@echo off
cd /d %~dp0
echo Starting server at http://localhost:8000
py -3 -m http.server 8000 2>nul || python -m http.server 8000
pause
