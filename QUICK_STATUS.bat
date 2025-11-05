@echo off
cls
echo ========================================
echo   CLARA SYSTEM STATUS
echo ========================================
echo.

echo Checking ports...
echo.

netstat -ano | findstr ":8080.*LISTENING" >nul
if %errorlevel%==0 (
    echo [OK] UNIFIED SERVER - Running on port 8080
    echo.
    echo   ACCESS LINKS:
    echo     CLIENT: http://localhost:8080
    echo     STAFF:  http://localhost:8080/staff
    echo.
) else (
    echo [X] UNIFIED SERVER - Not running on port 8080
    echo     This is REQUIRED for both Client and Staff!
    echo.
)

netstat -ano | findstr ":5173.*LISTENING" >nul
if %errorlevel%==0 (
    echo [OK] CLIENT DEV - Running on port 5173 (proxied via 8080)
) else (
    echo [X] CLIENT DEV - Not running (needed for dev mode)
)
echo.

netstat -ano | findstr ":5174.*LISTENING" >nul
if %errorlevel%==0 (
    echo [OK] STAFF DEV - Running on port 5174 (proxied via 8080)
) else (
    echo [X] STAFF DEV - Not running (needed for dev mode)
)
echo.

echo ========================================
echo   ACCESS LINKS
echo ========================================
echo.
echo   CLIENT: http://localhost:8080
echo   STAFF:  http://localhost:8080/staff
echo.
echo   Staff Login: nagashreen@gmail.com / password
echo.
echo ========================================
echo.
pause
