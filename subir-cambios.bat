@echo off
echo [INFO] Iniciando subida de cambios automatica...

if not exist .git (
    echo [ERROR] Este directorio no es un repositorio Git activo.
    exit /b 1
)

for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

echo [INFO] Rama actual detectada: %CURRENT_BRANCH%

git add .
if errorlevel 1 goto ADD_FAILED

set COMMIT_MSG=Auto-commit: %date% %time%
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto COMMIT_FAILED

:CHECK_REMOTE
git remote | findstr /C:"origin" >nul
if errorlevel 1 goto NO_REMOTE

git push origin %CURRENT_BRANCH%
if errorlevel 1 goto PUSH_FAILED

echo [SUCCESS] Cambios subidos exitosamente a origin/%CURRENT_BRANCH%.
exit /b 0

:ADD_FAILED
echo [ERROR] Fallo al agregar cambios ('git add .').
exit /b 1

:COMMIT_FAILED
git status | findstr /C:"nothing to commit" >nul
if not errorlevel 1 (
    echo [INFO] No hay cambios pendientes por confirmar.
    goto CHECK_REMOTE
)
echo [ERROR] Fallo al realizar el commit ('git commit').
exit /b 1

:NO_REMOTE
echo [INFO] No se ha configurado un repositorio remoto 'origin'. Saltando 'git push'.
echo [SUCCESS] Cambios confirmados localmente en la rama %CURRENT_BRANCH%.
exit /b 0

:PUSH_FAILED
echo [ERROR] Fallo al subir cambios ('git push') a la rama remota %CURRENT_BRANCH%.
exit /b 1
