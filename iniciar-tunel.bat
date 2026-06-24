@echo off
title Astro Link - Tunel Localtunnel
echo =============================================================
echo [INFO] Iniciando tunel HTTPS publico usando Localtunnel...
echo [INFO] Tu API local estara expuesta de manera segura.
echo [INFO] Copia la URL provista (ej. https://xxxx.localtunnel.me)
echo [INFO] y pegala en tu Consola de Meta Developers.
echo [INFO]
echo [INFO] Para WhatsApp webhook: https://xxxx.localtunnel.me/webhooks/whatsapp
echo [INFO] Para Messenger webhook: https://xxxx.localtunnel.me/webhooks/messenger
echo =============================================================
echo.
npx localtunnel --port 8000
