@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "ROOT=%~dp0"
set "PORT=3010"

if exist "%ROOT%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (`findstr /B /I "PORT=" "%ROOT%.env"`) do set "PORT=%%B"
)

REM trim spaces
for /f "tokens=* delims= " %%P in ("%PORT%") do set "PORT=%%P"

echo ============================================
echo   Neo Desktop Calendar - 방화벽 인바운드 허용
echo ============================================
echo   TCP 포트: %PORT%
echo   폴더: %ROOT%
echo.
echo   LAN(Web) 모드에서 다른 PC가 접속할 때 필요합니다.
echo   규칙 추가에 실패하면 이 파일을
echo   우클릭 -^> 관리자 권한으로 실행 하세요.
echo.

netsh advfirewall firewall delete rule name="Neo Desktop Calendar LAN (%PORT%)" >nul 2>&1
netsh advfirewall firewall add rule name="Neo Desktop Calendar LAN (%PORT%)" dir=in action=allow protocol=TCP localport=%PORT%
if errorlevel 1 (
  echo [실패] 방화벽 규칙을 추가하지 못했습니다.
  echo        관리자 권한으로 다시 실행해 주세요.
) else (
  echo [완료] TCP %PORT% 인바운드 허용 규칙이 추가되었습니다.
)
echo.
pause
endlocal
