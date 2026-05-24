@echo off
echo ============================================================
echo   SUBIENDO CAMBIOS DE QUINIELA IA A FIREBASE Y GITHUB
echo ============================================================

:: Verificar si es repositorio git e inicializar si es necesario
if not exist .git (
    echo [INFO] Inicializando repositorio Git...
    git init
    git checkout -b main
)

:: Agregar archivos a git
git add .

:: Commit
git commit -m "Respaldando Quiniela Mundialista IA - Stadium Edition"

:: Si tiene control remoto, subirlo
git remote | findstr . >nul
if %errorlevel% equ 0 (
    echo [INFO] Subiendo cambios a GitHub...
    git push origin main
) else (
    echo [WARN] No se detecto un repositorio remoto configurado en Git. Omitiendo push.
)

:: Desplegar en Firebase
echo [INFO] Desplegando en Firebase Hosting...
call firebase deploy --only hosting --project brain-branding
if %errorlevel% equ 0 (
    echo [OK] Despliegue en Firebase completado con exito.
) else (
    echo [WARN] Error o firebase no configurado para este proyecto todavia.
)

echo ============================================================
echo   PROCESO COMPLETADO
echo ============================================================
