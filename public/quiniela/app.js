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
  decryptData,
  createGovernanceLog,
  getGovernanceLogs,
  backupUserToIndexedDB,
  restoreUserFromIndexedDB
} from './app_db.js';

// ── VARIABLES DE CONTROL GLOBAL ──────────────────────────────────────────
let currentUser = null;
let systemConfig = null;
let currentTicketSelections = {}; // match_id -> 'L'|'E'|'V'
let lastCreatedTicket = null;
let serverTimeOffset = 0; // offset antifraude del reloj

async function syncServerTime() {
  try {
    const res = await fetch("https://worldtimeapi.org/api/timezone/America/Mexico_City");
    if (res.ok) {
      const data = await res.json();
      const serverTime = new Date(data.datetime).getTime();
      const localTime = Date.now();
      serverTimeOffset = serverTime - localTime;
      console.log(`⏱️ [Reloj Antifraude] Reloj sincronizado con servidor de CDMX. Offset: ${serverTimeOffset}ms`);
    }
  } catch (err) {
    console.warn("⚠️ [Reloj Antifraude] No se pudo conectar al API de tiempo. Usando reloj local.");
  }
}

// ── SISTEMA DE NOTIFICACIONES NATIVAS EN MÓVIL/ESCRITORIO (PWA) ──────────
window.sendLocalNotification = function(title, body) {
  if (!("Notification" in window)) {
    console.warn("Notifications not supported in this browser.");
    return;
  }
  
  if (Notification.permission === "granted") {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body: body,
          icon: "logo-quiniela.png",
          badge: "logo-quiniela.png",
          vibrate: [200, 100, 200],
          tag: "quiniela-ia-alert"
        });
      });
    } else {
      new Notification(title, {
        body: body,
        icon: "logo-quiniela.png"
      });
    }
  }
};

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
  
  // Sincronizar reloj antifraude en segundo plano
  await syncServerTime();
  
  // Registrar Service Worker para soporte offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('⚙️ [PWA] Service Worker registrado:', reg.scope))
      .catch(err => console.warn('⚠️ [PWA] Registro de Service Worker fallido:', err));
  }
  
  // Compresor y caché WebP en cliente para optimización del Logotipo
  cacheLogoAsWebP();
  
  // Inicializar DB
  await initDatabase();
  
  // Cargar configuración de costos
  systemConfig = await getSystemConfig();
  
  // Checar si hay sesión guardada en localStorage (Descifrada)
  let savedUser = localStorage.getItem("qia_current_user");
  
  // Si no está en LocalStorage, intentar restaurar de IndexedDB (Sugerencia 3)
  if (!savedUser) {
    const restored = await restoreUserFromIndexedDB();
    if (restored) {
      localStorage.setItem("qia_current_user", JSON.stringify(restored));
      savedUser = JSON.stringify(restored);
    }
  }
  
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
      // Mostrar Onboarding en primer ingreso para definir Nombre y Apodo
      const onboard = document.getElementById("onboarding-view");
      if (onboard) onboard.classList.remove("hidden");
    }

    // Solicitar permisos de notificación móvil/PWA tras cargar splash
    setTimeout(() => {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
          if (permission === "granted") {
            showToast("¡Notificaciones del Cyber Stadium activadas!", "success");
            window.sendLocalNotification("🏟️ ¡BIENVENIDO AL CYBER STADIUM!", "Recibirás alertas en tu celular sobre partidos, saldos y cierres de quinielas.");
          }
        });
      }
    }, 3000);
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
  
  // Limpiar respaldo IndexedDB de forma segura (Sugerencia 3)
  try {
    const request = indexedDB.open("qia_stadium_backup_db", 1);
    request.onsuccess = (e) => {
      const dbInstance = e.target.result;
      if (dbInstance.objectStoreNames.contains("backup_store")) {
        const tx = dbInstance.transaction("backup_store", "readwrite");
        tx.objectStore("backup_store").delete("current_user_session");
      }
    };
  } catch (e) {
    console.warn("IndexedDB logout clear failed:", e);
  }
  
  showToast("Sesión cerrada. Reiniciando Estadio...", "info");
  setTimeout(() => {
    window.location.reload();
  }, 1000);
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
  let refreshedUser = currentUser;
  const savedUser = localStorage.getItem("qia_current_user");
  if (savedUser) {
    try {
      refreshedUser = decryptData(JSON.parse(savedUser));
    } catch (err) {
      refreshedUser = JSON.parse(savedUser);
    }
  }
  currentUser = refreshedUser;
  
  document.getElementById("header-balance").textContent = `$${Number(currentUser.balance).toFixed(2)}`;
  
  const headerUser = document.getElementById("header-username");
  if (headerUser && currentUser && currentUser.alias) {
    headerUser.textContent = "@" + currentUser.alias;
  }
  
  const welcomeAlias = document.getElementById("welcome-alias");
  if (welcomeAlias && currentUser && currentUser.alias) {
    welcomeAlias.textContent = "@" + currentUser.alias;
  }
  
  // Cargar avatar y tier visual de forma dinámica (Sugerencia 1 y 2)
  loadUserAvatarAndTier();
  
  if (panel === "dashboard") {
    // 1. Bolsa y Premios (Dinámico)
    document.getElementById("jackpot-amount").textContent = `$${Number(systemConfig.pool_jackpot).toFixed(2)}`;
    const jackpotVal = Number(systemConfig.pool_jackpot);
    const places = Number(systemConfig.pool_places) || 3;
    const prizesContainer = document.getElementById("jackpot-prizes-container");
    if (prizesContainer) {
      prizesContainer.innerHTML = "";
      let remaining = 100;
      for (let i = 0; i < places; i++) {
        let p = (i === places - 1) ? remaining : Math.round(remaining * 0.5);
        remaining -= p;
        const amount = (p / 100) * jackpotVal;
        
        let label = (i+1) + "er Lugar";
        if (i+1 === 2) label = "2do Lugar";
        if (i+1 === 3) label = "3er Lugar";
        if (i+1 > 3) label = (i+1) + "to Lugar";
        
        prizesContainer.innerHTML += `
          <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase text-white/50 tracking-widest">${label}</span>
            <span class="text-accent text-lg font-black italic">$${amount.toFixed(2)}</span>
          </div>
        `;
      }
    }
    
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
    
    // 3. Marcadores en Vivo
    const fixtures = await getFixtures();
    renderLiveScores(fixtures);
    
    // 4. Leaderboard Semanal y Acumulado
    const weeklyBoard = await getLeaderboard('weekly');
    renderLeaderboard(weeklyBoard, 'leaderboard-weekly-container');
    const accBoard = await getLeaderboard('accumulated');
    renderLeaderboard(accBoard, 'leaderboard-accumulated-container');

    // 5. Renderizar jugadas/tickets registrados (Sugerencia 1)
    renderUserTickets();
  }
  
  if (panel === "play") {
    // 1. Cargar partidos para jugar
    const fixtures = await getFixtures();
    renderPlayFixtures(fixtures);
    window.updatePoolCost();

    // 2. Verificar límite de apuestas (Sugerencia 3)
    const isLocked = window.checkBettingDeadlineStatus();
    const alertEl = document.getElementById("betting-deadline-alert");
    const submitBtn = document.querySelector("#panel-play button[onclick='window.purchaseTicket()']");
    
    if (alertEl) {
      if (isLocked) {
        alertEl.classList.remove("hidden");
        const isAdminBypass = systemConfig.bypass_deadline_testing && currentUser && currentUser.is_admin;
        const isManual = systemConfig.manual_locked;
        
        let titleMsg = isManual ? "APUESTAS CERRADAS POR EL ADMIN" : "APUESTAS CERRADAS (LÍMITE VIERNES 6:00 PM)";
        let subMsg = isManual ? "El registro ha sido clausurado manualmente." : "El registro de quinielas se reabrirá el lunes.";
        
        if (isAdminBypass) {
          alertEl.className = "p-12 rounded-2xl border mb-15 text-xxs uppercase tracking-wider font-bold bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse";
          alertEl.innerHTML = `<i class="ri-alert-line mr-6 text-sm"></i> 🟢 ${titleMsg} <br><span class="text-[9px] opacity-80 mt-4 block">* MODO ADMIN PRUEBAS: Tienes permiso para saltar el bloqueo y comprar.</span>`;
          if (submitBtn) submitBtn.disabled = false;
        } else {
          alertEl.className = "p-12 rounded-2xl border mb-15 text-xxs uppercase tracking-wider font-bold bg-red-500/10 border-red-500/20 text-red-500 animate-pulse";
          alertEl.innerHTML = `<i class="ri-lock-2-line mr-6 text-sm"></i> 🔴 ${titleMsg} <br><span class="text-[9px] opacity-80 mt-4 block">${subMsg}</span>`;
          if (submitBtn) submitBtn.disabled = true;
        }
      } else {
        alertEl.classList.add("hidden");
        if (submitBtn) submitBtn.disabled = false;
      }
    }
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
    document.getElementById("cfg-pool-places").value = systemConfig.pool_places || 3;
    document.getElementById("cfg-pool-extra-goals").value = systemConfig.extra_goals_cost;

    // 5. Poblar restricción de horario (Sugerencia 3)
    document.getElementById("cfg-deadline-day").value = systemConfig.betting_deadline_day !== undefined ? systemConfig.betting_deadline_day : 5;
    document.getElementById("cfg-deadline-hour").value = systemConfig.betting_deadline_hour !== undefined ? systemConfig.betting_deadline_hour : 18;
    document.getElementById("cfg-deadline-bypass").checked = systemConfig.bypass_deadline_testing !== undefined ? systemConfig.bypass_deadline_testing : true;

    // 6. Configurar botón de bloqueo manual
    const lockBtn = document.getElementById("btn-toggle-manual-lock");
    if (lockBtn) {
      const isLockedManual = systemConfig.manual_locked || false;
      if (isLockedManual) {
        lockBtn.textContent = "🔓 ABRIR APUESTAS AHORA";
        lockBtn.style.background = "#22c55e"; // verde
        lockBtn.style.color = "#000";
        lockBtn.style.boxShadow = "0 0 20px rgba(34,197,94,0.3)";
      } else {
        lockBtn.textContent = "🔒 CERRAR APUESTAS AHORA";
        lockBtn.style.background = "var(--accent)"; // bronce
        lockBtn.style.color = "#000";
        lockBtn.style.boxShadow = "0 0 20px rgba(205,127,50,0.2)";
      }
    }

    // 7. Renderizar bitácora de gobernanza (Auditoría)
    renderGovernanceLogs();

    // 8. Dibujar gráficos estadísticos interactivos (Sugerencia 2)
    setTimeout(() => {
      drawAdminAnalyticsChart();
    }, 100);
  }
}

// Cargar vista inicial tras login
function loadAppView() {
  document.getElementById("app-container").classList.remove("hidden");
  
  // Mostrar apodo en la cabecera para personalización de marca
  const headerUser = document.getElementById("header-username");
  if (headerUser && currentUser && currentUser.alias) {
    headerUser.textContent = "@" + currentUser.alias;
  }
  
  // Mostrar apodo en bienvenida del dashboard
  const welcomeAlias = document.getElementById("welcome-alias");
  if (welcomeAlias && currentUser && currentUser.alias) {
    welcomeAlias.textContent = "@" + currentUser.alias;
  }
  
  // Cargar avatar y tier visual de forma dinámica (Sugerencia 1 y 2)
  loadUserAvatarAndTier();
  
  // Mostrar dock de admin si es administrador
  if (currentUser.is_admin) {
    document.getElementById("dock-admin").classList.remove("hidden");
  } else {
    document.getElementById("dock-admin").classList.add("hidden");
  }
  
  window.appNavigate("dashboard");
}

// ── ADMIN TABS CONTROLLER ────────────────────────────────────────────────
window.switchAdminTab = function(tabName) {
  const tabs = ["matches", "rules", "payments", "users", "reports"];
  tabs.forEach(t => {
    const pnl = document.getElementById(`adm-view-${t}`);
    const btn = document.getElementById(`tab-adm-${t}`);
    if (pnl) pnl.classList.add("hidden");
    if (btn) {
      btn.classList.remove("active");
    }
  });
  
  const pnlObj = document.getElementById(`adm-view-${tabName}`);
  const btnObj = document.getElementById(`tab-adm-${tabName}`);
  if (pnlObj) pnlObj.classList.remove("hidden");
  if (btnObj) {
    btnObj.classList.add("active");
  }
};

// ── VERIFICACIÓN DE LÍMITE DE APUESTAS (Sugerencia 3) ──────────────────────
window.checkBettingDeadlineStatus = function() {
  if (!systemConfig) return false;
  
  // El bloqueo manual del Administrador prevalece sobre la fecha límite
  if (systemConfig.manual_locked) {
    return true;
  }
  
  const deadlineDay = systemConfig.betting_deadline_day !== undefined ? systemConfig.betting_deadline_day : 5; // default Friday (5)
  const deadlineHour = systemConfig.betting_deadline_hour !== undefined ? systemConfig.betting_deadline_hour : 18; // default 6 PM (18:00)
  
  if (deadlineDay === "none" || deadlineDay === -1) return false;
  
  // Usar hora real del servidor (antifraude)
  const now = new Date(Date.now() + serverTimeOffset);
  const day = now.getDay(); // 0: Sunday, 1: Monday, ..., 5: Friday, 6: Saturday
  const hour = now.getHours();
  
  // Normalizar Sunday (0) a 7 para hacer la comparación secuencial
  let normDay = day === 0 ? 7 : day;
  let normDeadlineDay = deadlineDay === 0 ? 7 : deadlineDay;
  
  if (normDay > normDeadlineDay) {
    return true;
  }
  if (normDay === normDeadlineDay && hour >= deadlineHour) {
    return true;
  }
  return false;
};

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

function renderLeaderboard(leaderboard, containerId = "leaderboard-container") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  
  leaderboard.forEach(row => {
    const div = document.createElement("div");
    const isMe = currentUser && row.alias === currentUser.alias;
    
    // Si soy yo, aplicar borde y fondo bronce de Cyber Stadium para resaltar
    div.className = `board-row flex justify-between items-center py-10 px-8 rounded-xl border transition-all ${
      isMe 
        ? 'border-accent/40 bg-accent/10 shadow-[0_0_15px_rgba(205,127,50,0.15)]' 
        : 'border-transparent'
    }`;
    
    let medalClass = "bg-white/5 text-white";
    if (row.rank === 1) medalClass = "rank-1";
    if (row.rank === 2) medalClass = "rank-2";
    if (row.rank === 3) medalClass = "rank-3";
    
    div.innerHTML = `
      <div class="flex items-center gap-10">
        <span class="rank-badge ${medalClass}">${row.rank}</span>
        <div class="flex flex-col">
          <span class="text-xs font-black text-white">${isMe ? '✨ Tú (@' + row.alias + ')' : '@' + row.alias}</span>
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
  // 1. Validar límite de apuestas (Sugerencia 3)
  const isLocked = window.checkBettingDeadlineStatus();
  if (isLocked) {
    const isAdminBypass = systemConfig.bypass_deadline_testing && currentUser && currentUser.is_admin;
    if (!isAdminBypass) {
      showToast("Las apuestas están cerradas hasta el lunes (límite de Viernes 6:00 PM superado).", "error");
      return;
    }
  }

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
    
    // Enviar notificación local al celular
    window.sendLocalNotification("🎫 TICKET QUINIELA EMITIDO", `Tu ticket ${lastCreatedTicket.id} por $${cost.toFixed(2)} MXN ha sido guardado con éxito.`);
    
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
    
    // Enviar notificación local
    window.sendLocalNotification("💳 RECARGA CON TARJETA", `Tu saldo ha sido abonado con $${amount.toFixed(2)} MXN exitosamente.`);
    
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
    
    // Guardar log de auditoría
    await createGovernanceLog(
      "Aprobación de Recarga",
      `Se aprobó manualmente la transferencia SPEI ID: ${txId}`,
      currentUser
    );

    // Notificación local de saldo cargado
    try {
      const refreshedUser = localStorage.getItem("qia_current_user");
      const decU = decryptData(JSON.parse(refreshedUser));
      window.sendLocalNotification("💰 TRANSFERENCIA APROBADA", `Tu depósito SPEI ha sido verificado. Saldo actual: $${decU.balance.toFixed(2)} MXN.`);
    } catch (e) {}
    
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
  const places = Number(document.getElementById("cfg-pool-places").value) || 3;
  const extraGoals = Number(document.getElementById("cfg-pool-extra-goals").value);
  
  const deadlineDayStr = document.getElementById("cfg-deadline-day").value;
  const deadlineDay = deadlineDayStr === "-1" ? -1 : Number(deadlineDayStr);
  const deadlineHour = Number(document.getElementById("cfg-deadline-hour").value);
  const bypassBypass = document.getElementById("cfg-deadline-bypass").checked;

  const updatedCfg = {
    pool_cost: cost,
    pool_fee: fee,
    pool_jackpot: jackpot,
    pool_places: places,
    extra_goals_cost: extraGoals,
    extra_striker_cost: systemConfig.extra_striker_cost, // mantener este por default
    betting_deadline_day: deadlineDay,
    betting_deadline_hour: deadlineHour,
    bypass_deadline_testing: bypassBypass,
    manual_locked: systemConfig.manual_locked || false // PRESERVAR ESTO
  };
  
  await saveSystemConfig(updatedCfg);
  systemConfig = updatedCfg;
  
  // Guardar log de auditoría
  await createGovernanceLog(
    "Ajuste de Gobernanza",
    `Costos actualizados: Costo=$${cost}, App=${fee}%, Bolsa=$${jackpot}, Ganadores=${places}, Límite=${deadlineDayStr} a las ${deadlineHour}:00h`,
    currentUser
  );

  showToast("Ajustes de Gobernanza actualizados.", "success");
  window.appNavigate("dashboard");
};

// ── BOTÓN FÍSICO DE BLOQUEO MANUAL (BOTÓN CERRAR APUESTAS AHORA) ───────────
window.toggleManualBettingLock = async function() {
  const currentLock = systemConfig.manual_locked || false;
  const newLock = !currentLock;
  
  systemConfig.manual_locked = newLock;
  await saveSystemConfig(systemConfig);
  
  // Guardar log de auditoría
  await createGovernanceLog(
    "Bloqueo Manual",
    `El administrador cambió el estado del bloqueo manual a: ${newLock ? 'BLOQUEADO' : 'ABIERTO'}`,
    currentUser
  );

  if (newLock) {
    showToast("¡Apuestas CERRADAS manualmente para todos!", "error");
    window.sendLocalNotification("🚨 APUESTAS CERRADAS", "El administrador ha cerrado las apuestas de forma manual. ¡Los partidos están por comenzar!");
  } else {
    showToast("¡Apuestas ABIERTAS manualmente con éxito!", "success");
    window.sendLocalNotification("🏟️ APUESTAS ABIERTAS", "El administrador ha reabierto el registro de quinielas. ¡Ingresa tus jugadas!");
  }
  
  // Refrescar panel admin para actualizar interfaz del botón
  refreshPanelData("admin");
};

// Cierre Semanal Admin
window.executeWeeklyClosure = async function() {
  showToast("Calculando aciertos e ingresando contratos...", "info");
  
  setTimeout(async () => {
    const res = await executeDBClose(systemConfig);
    if (res.success) {
      showToast(res.message, "success");
      
      // Guardar log de auditoría
      await createGovernanceLog(
        "Cierre Semanal",
        `Se ejecutó el cierre de jornada. Distribuidos $${systemConfig.pool_jackpot} MXN entre ${res.winners.length} ganadores.`,
        currentUser
      );

      // Notificación de cierre semanal
      window.sendLocalNotification("🏆 CIERRE DE QUINIELA COMPLETADO", `La bolsa de esta semana se ha distribuido. ¡Consulta la clasificación para ver tus aciertos!`);
      
      window.appNavigate("dashboard");
    } else {
      showToast(res.message, "error");
    }
  }, 2000);
};

// ── RENDERIZADOR DE BITÁCORA DE GOBERNANZA (AUDITORÍA) ────────────────────
async function renderGovernanceLogs() {
  const container = document.getElementById("admin-governance-logs-container");
  if (!container) return;
  
  const logs = await getGovernanceLogs();
  container.innerHTML = "";
  
  if (logs.length === 0) {
    container.innerHTML = `<p class="text-xxs opacity-40 text-center uppercase tracking-widest py-10">No hay registros de gobernanza.</p>`;
    return;
  }
  
  logs.forEach(log => {
    const div = document.createElement("div");
    div.className = "py-8 text-xxs uppercase tracking-wider font-bold space-y-2";
    
    div.innerHTML = `
      <div class="flex justify-between items-center text-white">
        <span>⚡ Acción: <span class="text-accent">${log.action}</span></span>
        <span class="text-xxxxs opacity-30">${new Date(log.created_at).toLocaleString()}</span>
      </div>
      <div class="text-[9px] text-white/50 lowercase italic" style="text-transform: none;">${log.details}</div>
      <div class="text-[8px] text-white/30">Operador: @${log.user_alias} (${log.user_id})</div>
    `;
    container.appendChild(div);
  });
}

// Actualizar cartelera desde Google / API-Football (Simulado)
window.fetchMatchesAPI = async function() {
  showToast("Conectando con la API de Google / API-Football...", "info");
  
  setTimeout(async () => {
    // Aquí se llamaría a la API real (e.g. fetch('https://v3.football.api-sports.io/...'))
    // y se formatearían los datos. Por ahora, usamos el mock de IA (Liga MX top partidos)
    const suggestions = await getIASuggestions();
    await acceptSuggestionsAsFixtures(suggestions);
    showToast("¡Partidos más atractivos de la semana sincronizados exitosamente!", "success");
    window.appNavigate("dashboard");
  }, 2000);
};

// Enviar comprobante por WhatsApp (Wallet)
window.sendVoucherWhatsApp = function() {
  if (!currentUser) return;
  let msg = `*🎫 QUINIELA CYBER STADIUM - SOLICITUD DE RECARGA *\n`;
  msg += `*Usuario:* @${currentUser.alias}\n`;
  msg += `*Tel/Correo:* ${currentUser.phone || currentUser.email}\n`;
  msg += `\nHe subido un comprobante de transferencia SPEI en la aplicación. Por favor, aprueba la recarga de mi saldo.\n`;
  msg += `\n🤖 Quiniela con Inteligencia Artificial - Deporte Premium.`;
  
  const uri = "https://wa.me/527712339238?text=" + encodeURIComponent(msg);
  window.open(uri, "_blank");
};

// ── MÉTODOS DE RECARGA OXXO PAY (Sugerencia 3) ──────────────────────────
window.currentOxxoTx = null;

window.generateOxxoSlip = function() {
  const amount = Number(document.getElementById("oxxo-amount").value);
  if (!amount || amount < 50) {
    showToast("Monto mínimo para OXXO Pay: $50.00 MXN", "error");
    return;
  }
  
  const refNum = "9876-" + Math.floor(Math.random()*9000 + 1000) + "-" + Math.floor(Math.random()*9000 + 1000) + "-" + Math.floor(Math.random()*9000 + 1000);
  
  const modal = document.getElementById("oxxo-modal");
  const container = document.getElementById("oxxo-slip-content");
  if (!modal || !container) return;
  
  container.innerHTML = `
    <div class="flex justify-between items-center border-b border-gray-200 pb-10 mb-10">
      <span class="text-xs font-black tracking-wider text-[#E21A22]">OXXO PAY</span>
      <span class="text-[9px] font-bold text-gray-500">MÉXICO</span>
    </div>
    
    <div class="py-10 space-y-4">
      <span class="text-[8px] font-black text-gray-400 uppercase tracking-widest block" style="color: #999; text-transform: uppercase;">Monto a Pagar</span>
      <span class="text-3xl font-black italic tracking-tighter text-black block">$${amount.toFixed(2)} MXN</span>
      <span class="text-[8px] text-gray-400 block" style="color: #999; text-transform: none;">* OXXO cobrará una comisión fija de $15 MXN en caja.</span>
    </div>
    
    <div class="bg-gray-100 p-12 rounded-xl border border-gray-200 space-y-4">
      <span class="text-[8px] font-black text-gray-500 uppercase tracking-widest block" style="color: #666; text-transform: uppercase;">Referencia de Pago</span>
      <span class="text-md font-black text-black tracking-widest font-mono block">${refNum}</span>
    </div>
    
    <div class="pt-10 space-y-6">
      <span class="text-[8px] font-black text-gray-400 uppercase tracking-widest block" style="color: #999; text-transform: uppercase;">Código de Barras</span>
      <div class="flex justify-center">
        <canvas id="oxxo-barcode-canvas" width="250" height="60" class="border border-gray-200 rounded p-4 bg-white"></canvas>
      </div>
    </div>
    
    <div class="text-[7px] text-gray-500 uppercase tracking-wider leading-relaxed pt-10 border-t border-gray-100" style="text-transform: none; text-align: left; color: #555;">
      1. Dile al cajero que vas a realizar un pago de OXXO PAY.<br>
      2. Proporciona el número de referencia de 16 dígitos o escanea el código.<br>
      3. Conserva tu ticket impreso como comprobante de pago.
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  // Dibujar código de barras Code 128 simulado en Canvas
  setTimeout(() => {
    const canvas = document.getElementById("oxxo-barcode-canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      
      // Generar barras aleatorias de anchos realistas
      let x = 10;
      while (x < canvas.width - 10) {
        const width = Math.random() < 0.6 ? 2 : (Math.random() < 0.8 ? 4 : 6);
        const gap = Math.random() < 0.6 ? 2 : (Math.random() < 0.8 ? 4 : 6);
        ctx.fillRect(x, 5, width, canvas.height - 10);
        x += width + gap;
      }
    }
  }, 150);
  
  window.currentOxxoTx = {
    amount: amount,
    ref: refNum
  };
};

window.closeOxxoModal = function() {
  document.getElementById("oxxo-modal").classList.add("hidden");
};

window.simulateOxxoPayment = async function() {
  if (!window.currentOxxoTx) return;
  const tx = {
    user_id: currentUser.phone || currentUser.email,
    amount: window.currentOxxoTx.amount,
    type: "deposit",
    gateway: "oxxo_pay",
    status: "approved",
    ref: window.currentOxxoTx.ref
  };
  
  await registerTransaction(tx);
  showToast("¡Depósito registrado en caja OXXO con éxito!", "success");
  
  // Enviar notificación local
  window.sendLocalNotification("🏪 DEPÓSITO OXXO PAY", `Tu pago por $${tx.amount.toFixed(2)} MXN ha sido validado en sucursal con éxito.`);
  
  window.closeOxxoModal();
  window.appNavigate("wallet");
};

// ── RENDERIZADOR DE TICKETS DE USUARIO (Sugerencia 1) ────────────────────
async function renderUserTickets() {
  const container = document.getElementById("user-tickets-container");
  if (!container) return;
  
  const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
  const userTickets = tickets.filter(t => t.user_id === currentUser.phone || t.user_id === currentUser.email);
  container.innerHTML = "";
  
  if (userTickets.length === 0) {
    container.innerHTML = `<p class="text-xxs opacity-40 text-center uppercase tracking-widest py-10">Aún no tienes jugadas esta semana.</p>`;
    return;
  }
  
  userTickets.forEach(t => {
    const div = document.createElement("div");
    div.className = "flex justify-between items-center py-8 text-xxs uppercase tracking-wider font-bold cursor-pointer hover:bg-white/5 p-6 rounded-xl transition-all";
    div.onclick = () => showTicketDetails(t);
    
    let statusColor = "text-accent";
    let statusText = "Activa";
    if (t.status === "checked") {
      statusColor = "text-[#00ff88]";
      statusText = `${t.hits} Aciertos (${t.prize > 0 ? 'Ganador $' + t.prize.toFixed(1) : 'Sin Premio'})`;
    }
    
    div.innerHTML = `
      <div class="flex flex-col">
        <span class="text-white">${t.id}</span>
        <span class="text-xxxxs opacity-30 mt-2">${new Date(t.created_at).toLocaleString()}</span>
      </div>
      <div class="flex flex-col items-end gap-2">
        <span class="${statusColor}">${statusText}</span>
        <span class="text-[8px] opacity-40 font-black">$${t.total_cost.toFixed(2)} MXN</span>
      </div>
    `;
    container.appendChild(div);
  });
}

// ── GRÁFICOS ESTADÍSTICOS INTERACTIVOS (Sugerencia 2) ─────────────────────
function drawAdminAnalyticsChart() {
  const canvas = document.getElementById("admin-analytics-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  // Limpiar lienzo
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Extraer datos de ventas agrupados por últimos 5 días
  const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie"];
  const salesData = [150, 300, 200, 450, 0]; // Base mock
  
  tickets.forEach(t => {
    const d = new Date(t.created_at).getDay(); // 0-6
    if (d >= 1 && d <= 5) {
      salesData[d - 1] += t.total_cost;
    }
  });
  
  const maxVal = Math.max(...salesData, 500);
  
  // Configurar padding del gráfico
  const padding = 20;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  
  // Dibujar cuadrícula
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding + (chartHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
  }
  
  // Dibujar línea con sombra y gradiente de neón bronce
  ctx.strokeStyle = "#cd7f32";
  ctx.lineWidth = 3;
  ctx.shadowBlur = 10;
  ctx.shadowColor = "rgba(205,127,50,0.5)";
  
  ctx.beginPath();
  const points = [];
  for (let i = 0; i < salesData.length; i++) {
    const x = padding + (chartWidth / (salesData.length - 1)) * i;
    const y = canvas.height - padding - (salesData[i] / maxVal) * chartHeight;
    points.push({ x, y });
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0; // reset
  
  // Gradiente bronce transparente para relleno de área
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(205, 127, 50, 0.25)");
  gradient.addColorStop(1, "rgba(205, 127, 50, 0)");
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(points[0].x, canvas.height - padding);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, canvas.height - padding);
  ctx.closePath();
  ctx.fill();
  
  // Dibujar puntos y etiquetas
  ctx.fillStyle = "#ffd700"; // Oro
  points.forEach((p, idx) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Etiqueta del día
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "8px Outfit";
    ctx.textAlign = "center";
    ctx.fillText(days[idx], p.x, canvas.height - 5);
    
    // Etiqueta del monto
    if (salesData[idx] > 0) {
      ctx.fillStyle = "#e3a869";
      ctx.font = "bold 8px Outfit";
      ctx.fillText(`$${Math.round(salesData[idx])}`, p.x, p.y - 8);
    }
  });
}

// ── COMPLETAR ONBOARDING MINIMALISTA (Sugerencia) ────────────────────────
window.completeOnboarding = async function() {
  const name = document.getElementById("onboard-name").value;
  const alias = document.getElementById("onboard-alias").value;
  
  if (!name || !alias || alias.trim().length < 3) {
    showToast("Por favor ingresa tu nombre y un apodo de al menos 3 caracteres.", "error");
    return;
  }
  
  showToast("Preparando tu estadio personalizado...", "info");
  
  const mockUser = {
    phone: "jugador_" + Date.now(),
    email: alias + "@cyberstadium.mx",
    name: name,
    alias: alias,
    balance: 200, // Saldo inicial
    is_admin: true, // Habilitar admin para pruebas rápidas
    created_at: new Date().toISOString()
  };
  
  import('./app_db.js').then(async dbMod => {
    // Registrar/Login local e inyectar
    currentUser = await dbMod.registerOrLoginUser(mockUser);
    
    showToast(`🏟️ ¡Bienvenido al Estadio, @${alias}!`, "success");
    
    // Ocultar onboarding e iniciar
    document.getElementById("onboarding-view").classList.add("hidden");
    loadAppView();
  });
};

// ── PERSONALIZACIÓN Y TEMA VISUAL (Sugerencias 1 y 2) ────────────────────
function loadUserAvatarAndTier() {
  if (!currentUser || !currentUser.alias) return;

  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser.alias)}`;
  
  // 1. Mostrar Avatares Generativos DiceBear
  const headerAvatar = document.getElementById("header-avatar");
  if (headerAvatar) {
    headerAvatar.src = avatarUrl;
    headerAvatar.classList.remove("hidden");
  }
  
  const welcomeAvatar = document.getElementById("welcome-avatar");
  if (welcomeAvatar) {
    welcomeAvatar.src = avatarUrl;
    welcomeAvatar.classList.remove("hidden");
  }

  // 2. Personalización del Tema Visual por Nivel de Aciertos (Visual Tiering)
  const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
  const userTickets = tickets.filter(t => t.user_id === currentUser.phone || t.user_id === currentUser.email);
  const checked = userTickets.filter(t => t.status === "checked");
  
  let avgHits = 0;
  if (checked.length > 0) {
    avgHits = checked.reduce((sum, t) => sum + t.hits, 0) / checked.length;
  } else {
    // Si es nuevo, intentar buscar en el seed del leaderboard por defecto
    const defaultWeekly = JSON.parse(localStorage.getItem("qia_leaderboard") || "[]");
    const found = defaultWeekly.find(r => r.alias === currentUser.alias);
    if (found) avgHits = found.hits;
  }

  const tierBadge = document.getElementById("user-tier-badge");
  if (tierBadge) {
    if (avgHits >= 6) {
      // ORO
      tierBadge.innerHTML = `<i class="ri-vip-crown-fill mr-4" style="color:#ffd700;"></i> RANGO ORO`;
      tierBadge.style.color = "#ffd700";
      tierBadge.style.background = "rgba(255, 215, 0, 0.15)";
      tierBadge.style.borderColor = "rgba(255, 215, 0, 0.35)";
      tierBadge.style.boxShadow = "0 0 15px rgba(255, 215, 0, 0.25)";
      if (welcomeAvatar) welcomeAvatar.style.borderColor = "#ffd700";
    } else if (avgHits >= 4) {
      // PLATA
      tierBadge.innerHTML = `<i class="ri-medal-fill mr-4" style="color:#e2e8f0;"></i> RANGO PLATA`;
      tierBadge.style.color = "#e2e8f0";
      tierBadge.style.background = "rgba(226, 232, 240, 0.15)";
      tierBadge.style.borderColor = "rgba(226, 232, 240, 0.35)";
      tierBadge.style.boxShadow = "0 0 15px rgba(226, 232, 240, 0.25)";
      if (welcomeAvatar) welcomeAvatar.style.borderColor = "#e2e8f0";
    } else {
      // BRONCE
      tierBadge.innerHTML = `<i class="ri-award-fill mr-4" style="color:#cd7f32;"></i> RANGO BRONCE`;
      tierBadge.style.color = "#cd7f32";
      tierBadge.style.background = "rgba(205, 127, 50, 0.15)";
      tierBadge.style.borderColor = "rgba(205, 127, 50, 0.35)";
      tierBadge.style.boxShadow = "0 0 15px rgba(205, 127, 50, 0.25)";
      if (welcomeAvatar) welcomeAvatar.style.borderColor = "#cd7f32";
    }
  }
}
