import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;

  // Permite el acceso a recursos estáticos (CSS, JS, imágenes, etc.) para que no se rompan
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.includes('.') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/zamoranos')
  ) {
    return NextResponse.next();
  }

  // Genera una respuesta HTML premium fuera de línea con la estética de ShoesQR Boutique
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShoesQR Boutique — Fuera de Línea</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #fbfaf8;
      --bg-card: #ffffff;
      --color-gold: #b39359;
      --color-muted: #7e756c;
      --color-text: #2d2621;
      --border-color: rgba(179, 147, 89, 0.15);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      background-color: var(--bg-dark);
      color: var(--color-text);
      font-family: 'Inter', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
      padding: 20px;
    }
    
    .maintenance-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 50px 30px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(179, 147, 89, 0.06), 0 1px 3px rgba(0, 0, 0, 0.02);
      position: relative;
      animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    
    .brand-header {
      margin-bottom: 30px;
    }
    
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 28px;
      font-weight: 900;
      color: var(--color-text);
      letter-spacing: 2px;
      line-height: 1.2;
      text-transform: uppercase;
    }
    
    .brand-subtitle {
      font-family: 'Outfit', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--color-gold);
      letter-spacing: 4px;
      margin-top: 5px;
      text-transform: uppercase;
    }
    
    .badge {
      display: inline-block;
      background: rgba(179, 147, 89, 0.08);
      border: 1px solid rgba(179, 147, 89, 0.25);
      color: var(--color-gold);
      padding: 4px 12px;
      border-radius: 30px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 25px;
    }
    
    p {
      color: var(--color-muted);
      font-size: 14.5px;
      line-height: 1.7;
      margin-bottom: 35px;
    }
    
    .divider {
      height: 1px;
      background: var(--border-color);
      width: 60px;
      margin: 0 auto 25px;
    }
    
    .status-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 500;
      color: var(--color-muted);
      background: rgba(179, 147, 89, 0.03);
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(179, 147, 89, 0.08);
    }
    
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-gold);
      box-shadow: 0 0 6px var(--color-gold);
      animation: statusPulse 1.5s infinite alternate;
    }
    
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes statusPulse {
      0% {
        opacity: 0.4;
      }
      100% {
        opacity: 1;
      }
    }
  </style>
</head>
<body>

  <div class="maintenance-container">
    <div class="brand-header">
      <div class="brand-title">ShoesQR</div>
      <div class="brand-subtitle">Boutique</div>
    </div>
    
    <div class="badge">Fuera de Línea</div>
    
    <div class="divider"></div>
    
    <p>
      Nuestra plataforma de calzado inteligente, simulación de etiquetas QR y administración se encuentra fuera de servicio temporalmente por tareas de mantenimiento técnico. Volveremos muy pronto para brindarle el mejor servicio.
    </p>
    
    <div class="status-indicator">
      <div class="status-dot"></div>
      <span>Estado: Mantenimiento Técnico Programado</span>
    </div>
  </div>

</body>
</html>`;

  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
