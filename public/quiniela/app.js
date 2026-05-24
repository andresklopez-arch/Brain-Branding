/* ============================================================
   QUINIELA MUNDIALISTA IA — CORE APPLICATION CONTROLLER (app.js)
   ============================================================ */

import {
  initDatabase,
  getSystemConfig,
  saveSystemConfig,
  getFixtures,
  getIASuggestions,
  acceptSuggestionsAsFixtures,
  getLeaderboard,
  registerOrLoginUser,
  getUserData,
  registerTransaction,
  getTransactions,
  getPendingSPEI,
  approveSPEITransaction,
  declineSPEITransaction,
  createTicket,
  getAdminStats,
  executeWeeklyClosure as executeDBClose,
  decryptData
} from './app_db.js';

// ── VARIABLES DE CONTROL GLOBAL ──────────────────────────────────────────
let currentUser = null;
let systemConfig = null;
let currentTicketSelections = {}; // match_id -> 'L'|'E'|'V'
let lastCreatedTicket = null;

// ── TOAST MESSAGING ENGINE ───────────────────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "ri-information-line";
  if (type === "success") icon = "ri-checkbox-circle-line";
  if (type === "error") icon = "ri-error-warning-line";
  
  toast.innerHTML = `<i class="${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  
  // Remover con animación suave
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── INICIALIZACIÓN DE LA APLICACIÓN ──────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  console.log("⚽ Quiniela Mundialista IA inicializando...");
  initStarsBackground();
  
  // Registrar Service Worker para soporte offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('⚙️ [PWA] Service Worker registrado:', reg.scope);
        // Pedir permiso para notificaciones push simuladas
        if ('Notification' in window) {
          Notification.requestPermission().then(status => {
            console.log('⚙️ [PWA] Permiso de notificaciones:', status);
          });
        }
      })
      .catch(err => console.warn('⚠️ [PWA] Registro de Service Worker fallido:', err));
  }
  
  // Compresor y caché WebP en cliente para optimización del Logotipo
  cacheLogoAsWebP();
  
  // Inicializar DB
  await initDatabase();
  
  // Cargar configuración de costos
  systemConfig = await getSystemConfig();
  
  // Checar si hay sesión guardada en localStorage (Descifrada)
  const savedUser = localStorage.getItem("qia_current_user");
  
  // Simular carga de splash screen (1.5 segundos)
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => splash.remove(), 800);
    }
    
    if (savedUser) {
      try {
        currentUser = decryptData(JSON.parse(savedUser));
      } catch (err) {
        currentUser = JSON.parse(savedUser);
      }
      loadAppView();
    } else {
      document.getElementById("login-view").classList.remove("hidden");
    }
  }, 1800);
});

// Compresor y Caché WebP en cliente para logotipo
function cacheLogoAsWebP() {
  const cached = localStorage.getItem("logo_webp_cache");
  if (cached) {
    applyCachedLogo(cached);
    return;
  }
  
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = "logo-quiniela.png";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const webpUrl = canvas.toDataURL("image/webp", 0.85); // 85% calidad WebP
      localStorage.setItem("logo_webp_cache", webpUrl);
      applyCachedLogo(webpUrl);
      console.log("⚡ [Performance] Logo comprimido a WebP y cacheado localmente.");
    } catch (e) {
      console.warn("Fallo conversión de logo a WebP:", e);
    }
  };
}

function applyCachedLogo(dataUrl) {
  // Buscar todas las imágenes e inyectar base64 WebP de inmediato
  setTimeout(() => {
    const images = document.querySelectorAll('img[src="logo-quiniela.png"], img.splash-logo, img.w-24, img.w-10');
    images.forEach(img => {
      img.src = dataUrl;
    });
  }, 50);
}

// Simulador de notificaciones Push locales
window.triggerMockPush = function(title, body) {
  if ('serviceWorker' in navigator && 'Notification' in window) {
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body: body,
          icon: "./logo-quiniela.png",
          badge: "./logo-quiniela.png",
          vibrate: [200, 100, 200]
        });
      });
    } else {
      showToast(body, "success");
    }
  } else {
    showToast(body, "success");
  }
};

// ── FONDO DE ESTRELLAS INTERACTIVO ───────────────────────────────────────
function initStarsBackground() {
  const containers = ["splash-stars", "login-stars"];
  containers.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Generar estrellas dinámicas
    let starsStr = "";
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const o = Math.random();
      starsStr += `radial-gradient(1px 1px at ${x}vw ${y}vh, rgba(255,255,255,${o}), rgba(0,0,0,0)), `;
    }
    el.style.backgroundImage = starsStr.slice(0, -2);
  });
}

// ── AUTHENTICATION LAYERS (SIMULATION) ──────────────────────────────────
let selectedAuthTab = "google";

window.switchLoginTab = function(tab) {
  selectedAuthTab = tab;
  document.getElementById("btn-login-google").classList.toggle("active", tab === "google");
  document.getElementById("btn-login-phone").classList.toggle("active", tab === "phone");
  
  document.getElementById("form-google").classList.toggle("hidden", tab !== "google");
  document.getElementById("form-phone").classList.toggle("hidden", tab !== "phone");
  document.getElementById("form-otp").classList.add("hidden");
};

// Validación de Alias
window.validateAliasAvailability = function(alias) {
  const feedback = document.getElementById("alias-feedback");
  if (!alias || alias.trim().length < 3) {
    feedback.classList.add("hidden");
    return;
  }
  feedback.classList.remove("hidden");
  // Simple validación cosmética futurista
  if (alias.toLowerCase().includes("admin") || alias.toLowerCase().includes("antigravity")) {
    feedback.textContent = "Alias no disponible / Reservado";
    feedback.style.color = "var(--danger)";
    document.getElementById("btn-auth-phone-submit").disabled = true;
  } else {
    feedback.textContent = "¡Alias disponible en el Cyber Stadium!";
    feedback.style.color = "var(--success)";
    document.getElementById("btn-auth-phone-submit").disabled = false;
  }
};

// Autenticación por Google (Simulada con Popup Futurista)
window.simulateGoogleAuth = async function() {
  showToast("Abriendo portal seguro de Google...", "info");
  
  setTimeout(async () => {
    // Datos simulados premium de Google
    const mockUser = {
      phone: "google_user_" + Math.floor(Math.random()*90000 + 10000),
      email: "rey.stadium.guest@gmail.com",
      name: "Invitado Arena",
      alias: "arena_champion_" + Math.floor(Math.random()*900 + 100),
      balance: 150, // saldo inicial de prueba
      is_admin: true, // Habilitar Admin por defecto para probar todo
      created_at: new Date().toISOString()
    };
    
    currentUser = await registerOrLoginUser(mockUser);
    showToast("¡Autenticación con Google exitosa!", "success");
    
    document.getElementById("login-view").classList.add("hidden");
    loadAppView();
  }, 1200);
};

// Autenticación por Teléfono (Paso 1: SMS)
window.simulatePhoneAuth = function() {
  const name = document.getElementById("auth-name").value;
  const alias = document.getElementById("auth-alias").value;
  const phone = document.getElementById("auth-phone").value;
  
  if (!name || !alias || !phone || phone.length < 10) {
    showToast("Por favor completa los campos correctamente (Teléfono 10 dígitos).", "error");
    return;
  }
  
  showToast("Enviando código de verificación SMS...", "info");
  
  setTimeout(() => {
    document.getElementById("form-phone").classList.add("hidden");
    document.getElementById("form-otp").classList.remove("hidden");
    showToast("Código SMS enviado: 888888 (Ingresa este código para validar)", "success");
  }, 1000);
};

// Paso 2: Validación OTP
window.simulateOtpVerify = async function() {
  const otp = document.getElementById("auth-otp").value;
  if (otp !== "888888") {
    showToast("Código incorrecto. Ingresa 888888.", "error");
    return;
  }
  
  const name = document.getElementById("auth-name").value;
  const alias = document.getElementById("auth-alias").value;
  const phone = document.getElementById("auth-phone").value;
  
  const mockUser = {
    phone: phone,
    email: alias + "@cyberstadium.mx",
    name: name,
    alias: alias,
    balance: 200, // saldo de cortesía
    is_admin: true, // admin habilitado para prueba
    created_at: new Date().toISOString()
  };
  
  currentUser = await registerOrLoginUser(mockUser);
  showToast("¡Teléfono verificado en la cadena de bloques!", "success");
  
  document.getElementById("login-view").classList.add("hidden");
  loadAppView();
};

// Cerrar sesión
window.handleLogout = function() {
  localStorage.removeItem("qia_current_user");
  currentUser = null;
  document.getElementById("app-container").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
  
  // Limpiar inputs
  document.getElementById("auth-name").value = "";
  document.getElementById("auth-alias").value = "";
  document.getElementById("auth-phone").value = "";
  document.getElementById("auth-otp").value = "";
  
  showToast("Sesión cerrada. ¡Vuelve pronto al Cyber Stadium!", "info");
};

// ── NAVIGATION CONTROLLER ────────────────────────────────────────────────
let currentPanel = "dashboard";

window.appNavigate = function(panelName) {
  // Desactivar paneles
  const panels = ["dashboard", "play", "wallet", "admin"];
  panels.forEach(p => {
    const el = document.getElementById(`panel-${p}`);
    if (el) el.classList.add("hidden");
    
    const dockEl = document.getElementById(`dock-${p}`);
    if (dockEl) dockEl.classList.remove("active");
  });
  
  // Activar actual
  document.getElementById(`panel-${panelName}`).classList.remove("hidden");
  document.getElementById(`dock-${panelName}`).classList.add("active");
  
  currentPanel = panelName;
  
  // Recargar datos dinámicos según el panel abierto
  refreshPanelData(panelName);
};

// ── RECOLECCIÓN DE DATOS DINÁMICOS POR PANEL ──────────────────────────────
async function refreshPanelData(panel) {
  if (!currentUser) return;
  
  // Cargar saldo de cabecera siempre
  const refreshedUser = localStorage.getItem("qia_current_user") 
    ? JSON.parse(localStorage.getItem("qia_current_user")) 
    : currentUser;
  currentUser = refreshedUser;
  
  document.getElementById("header-balance").textContent = `$${Number(currentUser.balance).toFixed(2)}`;
  
  if (panel === "dashboard") {
    // 1. Bolsa y Premios
    document.getElementById("jackpot-amount").textContent = `$${Number(systemConfig.pool_jackpot).toFixed(2)}`;
    const jackpotVal = Number(systemConfig.pool_jackpot);
    document.getElementById("prize-1st").textContent = `$${(jackpotVal * 0.5).toFixed(2)}`;
    document.getElementById("prize-2nd").textContent = `$${(jackpotVal * 0.3).toFixed(2)}`;
    document.getElementById("prize-3rd").textContent = `$${(jackpotVal * 0.2).toFixed(2)}`;
    
    // 2. Cargar Estadísticas del Jugador
    const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    const userTickets = tickets.filter(t => t.user_id === currentUser.phone || t.user_id === currentUser.email);
    document.getElementById("stat-active-tickets").textContent = userTickets.filter(t => t.status === "active").length;
    
    const checked = userTickets.filter(t => t.status === "checked");
    if (checked.length > 0) {
      const avg = checked.reduce((sum, t) => sum + t.hits, 0) / checked.length;
      document.getElementById("stat-avg-hits").textContent = avg.toFixed(1);
    } else {
      document.getElementById("stat-avg-hits").textContent = "--";
    }
    
    // 3. Marcadores en Vivo (Liga MX prioridad)
    const fixtures = await getFixtures();
    renderLiveScores(fixtures);
    
    // 4. Leaderboard Semanal
    const leaderboard = await getLeaderboard();
    renderLeaderboard(leaderboard);
  }
  
  if (panel === "play") {
    // 1. Cargar partidos para jugar
    const fixtures = await getFixtures();
    renderPlayFixtures(fixtures);
    window.updatePoolCost();
  }
  
  if (panel === "wallet") {
    document.getElementById("wallet-balance").textContent = `$${Number(currentUser.balance).toFixed(2)}`;
    // Historial financiero
    const txs = await getTransactions(currentUser.phone || currentUser.email);
    renderTransactionHistory(txs);
  }
  
  if (panel === "admin") {
    // 1. Stats Admin
    const stats = await getAdminStats();
    document.getElementById("adm-stat-sales").textContent = `$${stats.total_sales.toFixed(2)}`;
    document.getElementById("adm-stat-users").textContent = stats.users_count;
    
    // 2. Sugerencias IA
    const suggestions = await getIASuggestions();
    renderIASuggestions(suggestions);
    
    // 3. Pendientes SPEI
    const speis = await getPendingSPEI();
    renderAdminSPEI(speis);
    
    // 4. Poblar inputs de costos con config actual
    document.getElementById("cfg-pool-cost").value = systemConfig.pool_cost;
    document.getElementById("cfg-pool-fee").value = systemConfig.pool_fee;
    document.getElementById("cfg-pool-jackpot").value = systemConfig.pool_jackpot;
    document.getElementById("cfg-pool-extra-goals").value = systemConfig.extra_goals_cost;
  }
}

// Cargar vista inicial tras login
function loadAppView() {
  document.getElementById("app-container").classList.remove("hidden");
  
  // Mostrar dock de admin si es administrador
  if (currentUser.is_admin) {
    document.getElementById("dock-admin").classList.remove("hidden");
  } else {
    document.getElementById("dock-admin").classList.add("hidden");
  }
  
  window.appNavigate("dashboard");
}

// ── RENDERS Y POPULATORS DE DOCK ─────────────────────────────────────────

// Renderizadores de Dashboard
function renderLiveScores(fixtures) {
  const container = document.getElementById("live-scores-container");
  if (!container) return;
  container.innerHTML = "";
  
  // Mapear partidos en vivo o terminados de Liga MX
  fixtures.forEach(f => {
    const card = document.createElement("div");
    const isLive = f.status === "live";
    card.className = `live-match-card ${isLive ? 'is-live' : ''}`;
    
    let statusBadge = "";
    if (f.status === "live") {
      statusBadge = `<span class="pulsing-live text-xxs font-black text-red-500 uppercase tracking-widest"><span class="live-dot mr-4"></span>En Vivo</span>`;
    } else if (f.status === "finished") {
      statusBadge = `<span class="text-xxs font-black opacity-30 uppercase tracking-widest">Finalizado</span>`;
    } else {
      statusBadge = `<span class="text-xxs font-black opacity-40 uppercase tracking-widest">${f.date}</span>`;
    }
    
    card.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="text-[8px] bg-white/5 border border-white/5 px-6 py-2 rounded-full font-black uppercase text-accent">LIGA MX</span>
        ${statusBadge}
      </div>
      <div class="flex items-center justify-between mt-4">
        <div class="flex flex-col">
          <span class="text-xs font-black text-white uppercase">${f.team_local}</span>
          <span class="text-xs font-black text-white uppercase mt-4">${f.team_visita}</span>
        </div>
        <div class="flex flex-col items-end gap-4">
          <span class="text-md font-black italic text-accent">${f.score_local}</span>
          <span class="text-md font-black italic text-accent">${f.score_visita}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderLeaderboard(leaderboard) {
  const container = document.getElementById("leaderboard-container");
  if (!container) return;
  container.innerHTML = "";
  
  leaderboard.forEach(row => {
    const div = document.createElement("div");
    div.className = "board-row flex justify-between items-center py-10";
    
    let medalClass = "bg-white/5 text-white";
    if (row.rank === 1) medalClass = "rank-1";
    if (row.rank === 2) medalClass = "rank-2";
    if (row.rank === 3) medalClass = "rank-3";
    
    div.innerHTML = `
      <div class="flex items-center gap-10">
        <span class="rank-badge ${medalClass}">${row.rank}</span>
        <div class="flex flex-col">
          <span class="text-xs font-black text-white">@${row.alias}</span>
          <span class="text-[8px] opacity-30 uppercase font-black">${row.name}</span>
        </div>
      </div>
      <span class="text-xs font-black text-accent">${row.hits} Aciertos</span>
    `;
    container.appendChild(div);
  });
}

// Renderizadores de Jugar Quiniela
function renderPlayFixtures(fixtures) {
  const container = document.getElementById("play-matches-container");
  if (!container) return;
  container.innerHTML = "";
  
  fixtures.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "match-play-row";
    
    const sel = currentTicketSelections[f.id] || "";
    
    row.innerHTML = `
      <div class="match-play-teams">
        <span class="text-white">${f.team_local}</span>
        <span class="text-accent italic text-xxxxs tracking-[2px] self-center">VS</span>
        <span class="text-white text-right">${f.team_visita}</span>
      </div>
      <div class="bet-selector-grid">
        <button id="btn-bet-${f.id}-L" class="bet-btn ${sel === 'L' ? 'selected' : ''}" onclick="window.selectBet('${f.id}', 'L')">LOCAL</button>
        <button id="btn-bet-${f.id}-E" class="bet-btn ${sel === 'E' ? 'selected' : ''}" onclick="window.selectBet('${f.id}', 'E')">EMPATE</button>
        <button id="btn-bet-${f.id}-V" class="bet-btn ${sel === 'V' ? 'selected' : ''}" onclick="window.selectBet('${f.id}', 'V')">VISITA</button>
      </div>
    `;
    container.appendChild(row);
  });
}

window.selectBet = function(matchId, selection) {
  currentTicketSelections[matchId] = selection;
  
  // Actualizar clases de botones
  ["L", "E", "V"].forEach(op => {
    const btn = document.getElementById(`btn-bet-${matchId}-${op}`);
    if (btn) {
      btn.classList.toggle("selected", op === selection);
    }
  });
  
  window.updatePoolCost();
};

window.updatePoolCost = function() {
  let cost = Number(systemConfig.pool_cost) || 50;
  
  // Agregar Side Bets
  const sidebetGoals = document.getElementById("sidebet-goals").checked;
  const sidebetStriker = document.getElementById("sidebet-striker").checked;
  
  if (sidebetGoals) cost += Number(systemConfig.extra_goals_cost) || 10;
  if (sidebetStriker) cost += Number(systemConfig.extra_striker_cost) || 15;
  
  document.getElementById("pool-total-cost").textContent = `$${cost.toFixed(2)}`;
};

// Confirmar y comprar ticket
window.purchaseTicket = async function() {
  // Asegurar que ha seleccionado todos los partidos
  const fixtures = await getFixtures();
  const missing = fixtures.filter(f => !currentTicketSelections[f.id]);
  
  if (missing.length > 0) {
    showToast(`Te falta predecir ${missing.length} partidos de la quiniela.`, "error");
    return;
  }
  
  // Validar saldo
  const cost = parseFloat(document.getElementById("pool-total-cost").textContent.replace("$", ""));
  if (Number(currentUser.balance) < cost) {
    showToast("Saldo insuficiente. Ve a la Billetera para realizar una recarga.", "error");
    window.appNavigate("wallet");
    return;
  }
  
  showToast("Emitiendo ticket encriptado...", "info");
  
  setTimeout(async () => {
    const sidebetGoals = document.getElementById("sidebet-goals").checked;
    const sidebetStriker = document.getElementById("sidebet-striker").checked;
    
    const ticket = {
      id: "tkt-" + Date.now(),
      user_id: currentUser.phone || currentUser.email,
      user_alias: currentUser.alias,
      matches: Object.keys(currentTicketSelections).map(matchId => ({
        match_id: matchId,
        prediction: currentTicketSelections[matchId]
      })),
      sidebet_goals: sidebetGoals,
      sidebet_goals_value: sidebetGoals ? 3 : null, // predicción de goles promedio por default
      sidebet_striker: sidebetStriker,
      sidebet_striker_value: sidebetStriker ? "Henry Martín" : null,
      total_cost: cost,
      status: "active",
      hits: 0
    };
    
    lastCreatedTicket = await createTicket(ticket);
    showToast("¡Ticket emitido con éxito!", "success");
    window.triggerMockPush("¡Ticket Registrado! 🎫", `Tu quiniela de $${ticket.total_cost.toFixed(2)} ha sido enviada al Cyber Estadio.`);
    
    // Limpiar predicciones
    currentTicketSelections = {};
    document.getElementById("sidebet-goals").checked = false;
    document.getElementById("sidebet-striker").checked = false;
    
    // Abrir Modal de Ticket y Compartir por WhatsApp
    showTicketDetails(lastCreatedTicket);
  }, 1000);
};

// Modal de ticket details
function showTicketDetails(ticket) {
  const modal = document.getElementById("ticket-modal");
  const container = document.getElementById("ticket-modal-content");
  if (!modal || !container) return;
  
  container.innerHTML = `
    <div class="bg-white/5 p-12 rounded-2xl border border-white/5 space-y-6 text-xxs font-bold uppercase tracking-wider text-white">
      <div>Ticket ID: <span class="text-accent">${ticket.id}</span></div>
      <div>Usuario: <span class="text-accent">@${ticket.user_alias}</span></div>
      <div>Fecha de Emisión: <span class="opacity-50">${new Date(ticket.created_at).toLocaleString()}</span></div>
    </div>
    
    <div class="space-y-6">
      <h4 class="text-[9px] font-black uppercase text-accent tracking-widest mt-12 mb-6">PREDICCIONES DEL TICKET</h4>
      <div class="divide-y divide-white/5 space-y-4" id="ticket-modal-predictions"></div>
    </div>
    
    <div class="bg-white/5 p-12 rounded-2xl border border-white/5 space-y-6 text-xxs font-bold uppercase tracking-wider text-white mt-12">
      <div>Side Bet Goles Totales: <span class="text-accent">${ticket.sidebet_goals ? 'SÍ (+3 goles)' : 'NO'}</span></div>
      <div>Side Bet Primer Gol: <span class="text-accent">${ticket.sidebet_striker ? `SÍ (${ticket.sidebet_striker_value})` : 'NO'}</span></div>
      <div class="border-t border-white/10 pt-6 mt-6 flex justify-between">
        <span>Costo Total:</span>
        <span class="text-success text-sm font-black">$${ticket.total_cost.toFixed(2)} MXN</span>
      </div>
    </div>
  `;
  
  // Agregar predicciones
  getFixtures().then(fixtures => {
    const predContainer = document.getElementById("ticket-modal-predictions");
    ticket.matches.forEach(m => {
      const f = fixtures.find(match => match.id === m.match_id);
      if (f) {
        const row = document.createElement("div");
        row.className = "flex justify-between items-center py-6 text-xxs uppercase tracking-wider font-bold";
        row.innerHTML = `
          <span>${f.team_local} vs ${f.team_visita}</span>
          <span class="bg-accent text-black font-black px-6 py-2 rounded-lg">${m.prediction}</span>
        `;
        predContainer.appendChild(row);
      }
    });
  });
  
  modal.classList.remove("hidden");
}

window.closeTicketModal = function() {
  document.getElementById("ticket-modal").classList.add("hidden");
  window.appNavigate("dashboard");
};

// Compartir ticket en WhatsApp
window.shareTicketOnWhatsApp = function() {
  if (!lastCreatedTicket) return;
  
  let msg = `*🎫 QUINIELA MUNDIALISTA IA — CYBER STADIUM *\n`;
  msg += `*Ticket ID:* ${lastCreatedTicket.id}\n`;
  msg += `*Usuario:* @${lastCreatedTicket.user_alias}\n`;
  msg += `*Costo:* $${lastCreatedTicket.total_cost.toFixed(2)} MXN\n\n`;
  msg += `*Predicciones de la Semana:*\n`;
  
  getFixtures().then(fixtures => {
    lastCreatedTicket.matches.forEach((m, idx) => {
      const f = fixtures.find(match => match.id === m.match_id);
      if (f) {
        msg += `${idx + 1}. ${f.team_local} vs ${f.team_visita} ➔ *${m.prediction}*\n`;
      }
    });
    
    if (lastCreatedTicket.sidebet_goals) msg += `➔ *Side Bet Goles Totales:* Activado (+3 goles)\n`;
    if (lastCreatedTicket.sidebet_striker) msg += `➔ *Side Bet Primer Gol:* Henry Martín\n`;
    
    msg += `\n🤖 Quiniela con Inteligencia Artificial - Deporte Premium.`;
    
    const uri = "https://wa.me/527712339238?text=" + encodeURIComponent(msg);
    window.open(uri, "_blank");
  });
};

// Renderizadores de Billetera (Stripe + SPEI)
function renderTransactionHistory(txs) {
  const container = document.getElementById("tx-history-container");
  if (!container) return;
  container.innerHTML = "";
  
  if (txs.length === 0) {
    container.innerHTML = `<p class="text-xxs opacity-40 text-center uppercase tracking-widest py-10">No hay movimientos recientes.</p>`;
    return;
  }
  
  txs.forEach(tx => {
    const div = document.createElement("div");
    div.className = "flex justify-between items-center py-10 text-xxs uppercase tracking-wider font-bold";
    
    let color = "text-accent";
    if (tx.status === "approved") color = "text-[#00ff88]";
    if (tx.status === "declined") color = "text-red-500";
    
    let symbol = tx.type === "deposit" ? "+" : "-";
    
    div.innerHTML = `
      <div class="flex flex-col">
        <span class="text-white">${tx.gateway === 'stripe' ? 'Recarga Stripe' : 'Carga SPEI (Folio ' + tx.ref + ')'}</span>
        <span class="text-xxxxs opacity-30 mt-2">${new Date(tx.created_at).toLocaleString()}</span>
      </div>
      <div class="flex flex-col items-end gap-2">
        <span class="${color}">${symbol}$${Number(tx.amount).toFixed(2)}</span>
        <span class="text-[8px] opacity-40 font-black">${tx.status}</span>
      </div>
    `;
    container.appendChild(div);
  });
}

// Simular Depósito de Stripe
window.simulateStripeDeposit = function() {
  const amount = Number(document.getElementById("stripe-amount").value);
  if (!amount || amount < 20) {
    showToast("Monto mínimo de recarga con tarjeta: $20.00 MXN", "error");
    return;
  }
  
  showToast("Iniciando pasarela de pagos Stripe...", "info");
  
  setTimeout(async () => {
    const tx = {
      user_id: currentUser.phone || currentUser.email,
      amount: amount,
      type: "deposit",
      gateway: "stripe",
      status: "approved",
      ref: "stripe-" + Math.floor(Math.random()*900000 + 100000)
    };
    
    await registerTransaction(tx);
    showToast("¡Recarga inmediata aprobada por Stripe!", "success");
    window.appNavigate("wallet");
  }, 1500);
};

// Simular Depósito de SPEI (Subida de Comprobante)
window.simulateSPEIDeposit = function() {
  const amount = Number(document.getElementById("spei-amount").value);
  const ref = document.getElementById("spei-ref").value;
  
  if (!amount || !ref) {
    showToast("Por favor ingresa el monto y la referencia del SPEI.", "error");
    return;
  }
  
  showToast("Subiendo comprobante de transferencia...", "info");
  
  setTimeout(async () => {
    const tx = {
      user_id: currentUser.phone || currentUser.email,
      amount: amount,
      type: "deposit",
      gateway: "spei",
      status: "pending",
      ref: ref
    };
    
    await registerTransaction(tx);
    showToast("Comprobante subido. La recarga se validará en unos minutos.", "success");
    window.triggerMockPush("SPEI Recibido ⚡", `Tu comprobante de $${tx.amount.toFixed(2)} con folio ${tx.ref} ha sido enviado a validación.`);
    
    // Limpiar inputs
    document.getElementById("spei-amount").value = "";
    document.getElementById("spei-ref").value = "";
    
    window.appNavigate("wallet");
  }, 1200);
};

// Renderizadores de Panel de Administrador
function renderIASuggestions(suggestions) {
  const container = document.getElementById("admin-ia-matches-container");
  if (!container) return;
  container.innerHTML = "";
  
  suggestions.forEach(s => {
    const div = document.createElement("div");
    div.className = "flex justify-between items-center p-10 bg-white/5 rounded-xl border border-white/5 text-xxs font-bold uppercase tracking-wider";
    
    div.innerHTML = `
      <div class="flex flex-col">
        <span class="text-white">${s.team_local} vs ${s.team_visita}</span>
        <span class="text-xxxxs opacity-30 mt-2">${s.date}</span>
      </div>
      <div class="flex items-center gap-10">
        <span class="text-purple-400 font-black">⚡ IA ${s.attraction_index}%</span>
        <span class="text-[8px] bg-purple-500/20 text-purple-400 px-6 py-2 rounded-full border border-purple-500/25">LIGA MX</span>
      </div>
    `;
    container.appendChild(div);
  });
}

window.acceptIASuggestion = async function() {
  showToast("IA Computando fixtures de los próximos 21 días...", "info");
  
  setTimeout(async () => {
    const suggestions = await getIASuggestions();
    await acceptSuggestionsAsFixtures(suggestions);
    showToast("¡Fixtures semanales populados con Liga MX por IA!", "success");
    window.appNavigate("dashboard");
  }, 1200);
};

function renderAdminSPEI(speis) {
  const container = document.getElementById("admin-spei-container");
  if (!container) return;
  container.innerHTML = "";
  
  if (speis.length === 0) {
    container.innerHTML = `<p class="text-xxs opacity-40 text-center uppercase tracking-widest py-10">No hay transferencias SPEI pendientes.</p>`;
    return;
  }
  
  speis.forEach(tx => {
    const div = document.createElement("div");
    div.className = "bg-white/5 p-12 rounded-2xl border border-white/5 space-y-8 text-xxs font-bold uppercase tracking-wider";
    
    div.innerHTML = `
      <div class="flex justify-between">
        <span class="text-white">Usuario: @${tx.user_id}</span>
        <span class="text-success">$${Number(tx.amount).toFixed(2)} MXN</span>
      </div>
      <div>Referencia/Folio SPEI: <span class="text-accent">${tx.ref}</span></div>
      <div class="flex gap-4 pt-4 border-t border-white/5">
        <button onclick="window.approveSPEI('${tx.id}')" class="flex-1 bg-[#00ff88] text-black font-black py-6 rounded-xl text-[8px]">APROBAR</button>
        <button onclick="window.declineSPEI('${tx.id}')" class="w-16 bg-red-500/20 border border-red-500/30 text-red-500 font-black py-6 rounded-xl text-[8px]">RECHAZAR</button>
      </div>
    `;
    container.appendChild(div);
  });
}

window.approveSPEI = async function(txId) {
  showToast("Validando SPEI con Banco Central (Simulado)...", "info");
  setTimeout(async () => {
    await approveSPEITransaction(txId);
    showToast("¡Transferencia SPEI aprobada exitosamente!", "success");
    window.triggerMockPush("¡SPEI Aprobado! 💰", "Tu recarga SPEI ha sido aprobada y aplicada a tu balance.");
    window.appNavigate("admin");
  }, 1000);
};

window.declineSPEI = async function(txId) {
  await declineSPEITransaction(txId);
  showToast("Transferencia rechazada.", "error");
  window.appNavigate("admin");
};

// Ajustar costos de Gobernanza en Admin
window.saveAdminConfig = async function() {
  const cost = Number(document.getElementById("cfg-pool-cost").value);
  const fee = Number(document.getElementById("cfg-pool-fee").value);
  const jackpot = Number(document.getElementById("cfg-pool-jackpot").value);
  const extraGoals = Number(document.getElementById("cfg-pool-extra-goals").value);
  
  const updatedCfg = {
    pool_cost: cost,
    pool_fee: fee,
    pool_jackpot: jackpot,
    extra_goals_cost: extraGoals,
    extra_striker_cost: systemConfig.extra_striker_cost // mantener este por default
  };
  
  await saveSystemConfig(updatedCfg);
  systemConfig = updatedCfg;
  
  showToast("Ajustes de Gobernanza actualizados.", "success");
  window.appNavigate("dashboard");
};

// Cierre Semanal Admin
window.executeWeeklyClosure = async function() {
  showToast("Calculando aciertos e ingresando contratos...", "info");
  
  setTimeout(async () => {
    const res = await executeDBClose(systemConfig);
    if (res.success) {
      showToast(res.message, "success");
      window.triggerMockPush("🏆 ¡Bolsa Repartida!", "El cierre semanal ha finalizado. ¡Consulta la clasificación para ver si ganaste!");
      window.appNavigate("dashboard");
    } else {
      showToast(res.message, "error");
    }
  }, 2000);
};
