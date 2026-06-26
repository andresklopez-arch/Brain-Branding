// === Cliente WebSocket y Estado Compartido ===

let socket = null;
let reconnectInterval = 3000;
let userSession = null;

// Obtener datos del usuario desde localStorage
function loadUserSession() {
  const sessionStr = localStorage.getItem('zamoranos_session');
  if (sessionStr) {
    userSession = JSON.parse(sessionStr);
    return userSession;
  }
  return null;
}

function saveUserSession(user) {
  userSession = user;
  localStorage.setItem('zamoranos_session', JSON.stringify(user));
}

function clearUserSession() {
  userSession = null;
  localStorage.removeItem('zamoranos_session');
}

// Inicializar AudioContext tras interacción del usuario
let audioContextInitialized = false;
function initAudioOnInteraction() {
  if (audioContextInitialized) return;
  const init = () => {
    // Probar inicialización silenciosa
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      audioContextInitialized = true;
      console.log('[AUDIO] AudioContext inicializado correctamente.');
    }
    window.removeEventListener('click', init);
    window.removeEventListener('touchstart', init);
  };
  window.addEventListener('click', init);
  window.addEventListener('touchstart', init);
}

// Generador de Sonido Sintetizado con Web Audio API (Chime de notificación)
function playNotificationSound(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    if (type === 'success') {
      // Tono ascendente alegre (Pedido Nuevo)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } 
    else if (type === 'alert') {
      // Chime campana premium resonante (Listo para entregar)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, ctx.currentTime); // A4
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    }
  } catch (error) {
    console.warn('[AUDIO] No se pudo reproducir sonido debido a políticas del navegador.', error);
  }
}

// Disparar Vibración física de dispositivo
function triggerDeviceVibration(pattern = [100, 50, 100, 50, 200]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

let connectionBanner = null;
let currentReconnectDelay = 2000;
const maxReconnectDelay = 30000;

function showConnectionStatus(status) {
  if (!connectionBanner) {
    connectionBanner = document.createElement('div');
    connectionBanner.id = 'ws-connection-banner';
    connectionBanner.style.cssText = `
      position: fixed;
      top: -60px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 24px;
      border-radius: 50px;
      font-size: 0.9rem;
      font-weight: 800;
      color: white;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      backdrop-filter: blur(8px);
      transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.3s ease;
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    document.body.appendChild(connectionBanner);
  }

  if (status === 'disconnected') {
    connectionBanner.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)';
    connectionBanner.style.border = '1px solid rgba(248, 113, 113, 0.4)';
    connectionBanner.innerHTML = `⚠️ Sin conexión con el servidor. Reintentando en ${Math.round(currentReconnectDelay / 1000)}s...`;
    connectionBanner.style.top = '16px';
  } else if (status === 'connected') {
    if (connectionBanner.style.top === '16px') {
      connectionBanner.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%)';
      connectionBanner.style.border = '1px solid rgba(52, 211, 153, 0.4)';
      connectionBanner.innerHTML = `✔️ Conexión restablecida`;
      setTimeout(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          connectionBanner.style.top = '-60px';
        }
      }, 3000);
    }
  }
}

// Inicializar conexión WebSocket
function connectWebSocket(onMessageCallback) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('[WS] Conectado al servidor en tiempo real.');
    currentReconnectDelay = 2000;
    showConnectionStatus('connected');
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (onMessageCallback) {
        onMessageCallback(payload.type, payload.data);
      }
    } catch (e) {
      console.error('[WS] Error al decodificar mensaje:', e);
    }
  };

  socket.onclose = () => {
    console.warn(`[WS] Conexión cerrada. Intentando reconectar en ${currentReconnectDelay}ms...`);
    showConnectionStatus('disconnected');
    setTimeout(() => {
      currentReconnectDelay = Math.min(currentReconnectDelay * 2, maxReconnectDelay);
      connectWebSocket(onMessageCallback);
    }, currentReconnectDelay);
  };

  socket.onerror = (err) => {
    console.error('[WS] Error en socket:', err);
  };
}

// Enviar evento por WebSocket
function sendWsEvent(type, data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
    return true;
  }
  console.warn('[WS] No se pudo enviar el mensaje, socket cerrado.');
  return false;
}

// Inicializar listeners de interacción al cargar el script
initAudioOnInteraction();
