@echo off
echo ================================
echo  ShoesQR Boutique - Subir Cambios
echo ================================
git init
git add .
git commit -m "Initial commit: ShoesQR Boutique demo"

echo.
echo Desplegando con Vercel CLI...
npx vercel --prod --yes
if %ERRORLEVEL% EQU 0 (
  echo ================================
  echo  Desplegado en Vercel OK
  echo ================================
) else (
  echo ================================
  echo  ERROR al desplegar en Vercel
  echo ================================
)
pause
