@echo off
setlocal

echo === Lowlight Studio Gallery Creator ===
echo.

set /p CLIENT=Client name (e.g. Jess Portraits):
set /p SRC=Source folder (e.g. C:\Exports\Jess_Final):

if "%CLIENT%"=="" (
  echo Client name is required.
  pause
  exit /b 1
)

if "%SRC%"=="" (
  echo Source folder is required.
  pause
  exit /b 1
)

python make_gallery.py "%CLIENT%" "%SRC%"
echo.
echo Done. Now open GitHub Desktop -> Commit -> Push.
pause
