@echo off
echo [INFO] Iniciando subida de cambios automática...

git add .
if errorlevel 1 goto error_add

git commit -m "Auto-commit"

git remote | findstr "origin" >nul
if errorlevel 1 goto no_remote

git push origin master
if errorlevel 1 goto error_push
echo [SUCCESS] Cambios subidos a origin.
goto end

:no_remote
echo [SUCCESS] Cambios confirmados localmente (sin remoto).
goto end

:error_add
echo [ERROR] Falló al agregar cambios.
exit /b 1

:error_push
echo [ERROR] Falló al subir cambios.
exit /b 1

:end
