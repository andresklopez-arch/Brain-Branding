@echo off
echo ==========================================
echo SUBIENDO CAMBIOS DE BRAIN BRANDING A GITHUB Y FIREBASE
echo ==========================================
git add .
git commit -m "Respaldo Automatico Brain Branding"
git push origin master
echo Desplegando en Firebase...
firebase deploy --only hosting
echo ==========================================
echo PROCESO TERMINADO CON EXITO
echo ==========================================
pause
