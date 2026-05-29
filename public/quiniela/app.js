/* ============================================================
   QUINIELA MUNDIALISTA IA — CORE APPLICATION CONTROLLER (app.js)
   ============================================================ */

import {
  initDatabase,
  getSystemConfig,
  saveSystemConfig,
  getFixtures,
  getIASuggestions,
  getGoogleAISearchResults,
  encryptAISearchData,
  decryptAISearchData,
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
  fetchAllUsers,
  updateUserBalance,
  addFixture,
  deleteFixture,
  batchAddFixtures,
  clearAllFixtures,
  updateFixtureScore,
  cancelFixture,
  getActiveTickets,
  getUserTickets
} from './app_db.js';
// ── VARIABLES DE CONTROL GLOBAL ──────────────────────────────────────────
let currentUser = null;
let systemConfig = null;
let currentTicketSelections = {}; // match_id -> 'L'|'E'|'V'
let lastCreatedTicket = null;
let serverTimeOffset = 0; // offset antifraude del reloj
let cachedFixturesList = [];
let cachedUsersList = [];
let adminMasterSelections = {}; // match_id -> 'L'|'E'|'V'|'C'
let isPurchasing = false;
async function syncServerTime() {
  console.log("⏱️ [Reloj Antifraude] Usando validación nativa de Firebase en lugar de API externa.");
  serverTimeOffset = 0;
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
async function initApp() {
  console.log("⚽ Quiniela Mundialista IA inicializando...");
  
  // Registro de actividad global para seguridad (Auto-logout)
  document.addEventListener('click', () => {
    localStorage.setItem("qia_last_activity", Date.now().toString());
  });
  
  initStarsBackground();
  
  // Sincronizar reloj antifraude en segundo plano
  syncServerTime();
  

  // Compresor y caché WebP en cliente para optimización del Logotipo
  cacheLogoAsWebP();
  
  // Inicializar DB con timeout antifallo
  try {
    await Promise.race([
      initDatabase(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), 5000))
    ]);
  } catch (err) {
    console.warn("⚠️ initDatabase tardó demasiado o falló. Continuando offline...", err);
    setTimeout(() => {
      showToast("⚠️ MODO SIN CONEXIÓN: Mostrando datos guardados", "error");
    }, 2000);
  }
  
  // Actualizar resultados de partidos en segundo plano mediante Buscador de Google / IA
  setTimeout(async () => {
    try {
      const updated = await autoUpdateMatchResults(true);
      if (updated > 0) {
        console.log(`✅ [Google Search AI] Se han auto-actualizado ${updated} partidos.`);
      }
    } catch(e) {
      console.warn("Error auto-actualizando marcadores:", e);
    }
  }, 3500);
  
  // Cargar configuración de costos con timeout
  try {
    systemConfig = await Promise.race([
      getSystemConfig(),
      new Promise((_, r) => setTimeout(() => r(null), 3000))
    ]);
  } catch (err) {}
  if (!systemConfig) {
    systemConfig = { pool_cost: 50, pool_fee: 10, pool_jackpot: 5000, pool_places: 3, extra_goals_cost: 10, extra_striker_cost: 15, betting_deadline_day: 5, betting_deadline_hour: 18, bypass_deadline_testing: true, manual_locked: false };
  }
  
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
        
        // Auto-logout (24 horas de inactividad)
        const lastActivity = parseInt(localStorage.getItem("qia_last_activity")) || Date.now();
        if (Date.now() - lastActivity > 24 * 60 * 60 * 1000) {
          showToast("🔒 Sesión expirada por inactividad de 24 horas. Por favor reingresa.", "error");
          localStorage.removeItem("qia_current_user");
          throw new Error("Session expired due to inactivity");
        }
        
        if (!currentUser || typeof currentUser.balance !== 'number' || isNaN(currentUser.balance) || (currentUser.alias && currentUser.alias.startsWith('enc_qia:'))) {
          throw new Error("Corrupted user session");
        }
        loadAppView();
      } catch (err) {
        console.warn("⚠️ Sesión de usuario corrupta o antigua detectada. Cerrando sesión...", err);
        localStorage.removeItem("qia_current_user");
        currentUser = null;
        const onboard = document.getElementById("onboarding-view");
        if (onboard) onboard.classList.remove("hidden");
      }
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
            showToast("¡Notificaciones del Quiniela Mundialista activadas!", "success");
            window.sendLocalNotification("🏟️ ¡BIENVENIDO AL Quiniela Mundialista!", "Recibirás alertas en tu celular sobre partidos, saldos y cierres de quinielas.");
          }
        });
      }
    }, 3000);
  }, 1800);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

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

// Validación de Alias Real, Alfanumérico e Irrepetible
window.validateAliasAvailability = async function(alias) {
  const feedback = document.getElementById("alias-feedback");
  const pinLabel = document.getElementById("pin-label");
  const nameInput = document.getElementById("onboard-name");
  
  if (!alias || alias.trim().length < 3) {
    feedback.classList.add("hidden");
    if (nameInput) nameInput.disabled = false;
    if (pinLabel) pinLabel.textContent = "Crea tu PIN de Seguridad (4 dígitos)";
    return;
  }
  feedback.classList.remove("hidden");
  
  // 1. Regla de Validación de Caracteres en el Alias (Sugerencia 1)
  const aliasRegex = /^[a-zA-Z0-9_]{3,15}$/;
  const cleanAlias = alias.trim().toLowerCase();
  
  const submitBtn = document.querySelector("#onboarding-view button");

  if (!aliasRegex.test(cleanAlias)) {
    feedback.textContent = "Alias no válido. Solo letras, números o guiones bajos (3-15 carac.).";
    feedback.style.color = "var(--danger)";
    if (submitBtn) submitBtn.disabled = true;
    return;
  }
  
  if (cleanAlias.includes("admin") || cleanAlias.includes("antigravity")) {
    feedback.textContent = "Alias no disponible / Reservado";
    feedback.style.color = "var(--danger)";
    if (submitBtn) submitBtn.disabled = true;
    return;
  }
  
  // Buscar en la base de datos si ya existe el usuario por su email
  try {
    const email = cleanAlias + "@quinielamundialista.mx";
    const existingUser = await getUserData(email);
    
    if (existingUser) {
      feedback.textContent = "¡Perfil encontrado! Al ingresar, iniciarás sesión en tu cuenta.";
      feedback.style.color = "#ffd700"; // Oro para indicar perfil existente
      if (submitBtn) submitBtn.disabled = false;
      
      // Autocompletar y deshabilitar Nombre Completo (Sugerencia 3)
      if (nameInput) {
        nameInput.value = existingUser.name;
        nameInput.disabled = true;
      }
      // Ajustar etiqueta de PIN para Login (Sugerencia 2)
      if (pinLabel) {
        pinLabel.textContent = "Ingresa tu PIN de Seguridad";
      }
      
      // Enfocar automáticamente el input de PIN (Sugerencia 3 del paso anterior)
      const pinInput = document.getElementById("onboard-pin");
      if (pinInput) {
        setTimeout(() => {
          pinInput.focus();
        }, 150); // Pequeño delay de 150ms para un efecto visual óptimo
      }
    } else {
      feedback.textContent = "¡Alias disponible en el Quiniela Mundialista!";
      feedback.style.color = "var(--success)"; // Verde de éxito
      if (submitBtn) submitBtn.disabled = false;
      
      // Habilitar Nombre Completo para Registro
      if (nameInput) {
        nameInput.disabled = false;
      }
      // Ajustar etiqueta de PIN para Registro (Sugerencia 2)
      if (pinLabel) {
        pinLabel.textContent = "Crea tu PIN de Seguridad (4 dígitos)";
      }
    }
  } catch(e) {
    console.error("Error verificando alias:", e);
    feedback.textContent = "⚠️ Error al conectar con la base de datos. Intenta de nuevo.";
    feedback.style.color = "var(--danger)";
    if (submitBtn) submitBtn.disabled = true;
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
      balance: 0, // Inicia con 0 obligatoriamente
      is_admin: false, // Quitar admin por defecto a invitados
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
    email: alias + "@quinielamundialista.mx",
    name: name,
    alias: alias,
    balance: 0, // saldo inicial 0
    is_admin: false, // admin deshabilitado para usuarios normales
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
  const refreshedUser = localStorage.getItem("qia_current_user") 
    ? decryptData(JSON.parse(localStorage.getItem("qia_current_user"))) 
    : currentUser;
  currentUser = refreshedUser;
  
  document.getElementById("header-balance").textContent = `$${Number(currentUser.balance).toFixed(2)}`;
  
  if (panel === "dashboard") {
    // 1. Bolsa y Premios (Dinámico)
    const dbMod = await import('./app_db.js');
    const activeTickets = await dbMod.getActiveTickets();
    const poolCost = Number(systemConfig.pool_cost) || 50;
    const poolFee = Number(systemConfig.pool_fee) || 10;
    const jackpotVal = activeTickets.length * poolCost * (1 - (poolFee / 100));

    document.getElementById("jackpot-amount").textContent = `$${jackpotVal.toFixed(2)}`;
    const places = Number(systemConfig.pool_places) || 3;
    const prizesContainer = document.getElementById("jackpot-prizes-container");
    if (prizesContainer) {
      prizesContainer.innerHTML = "";
      const percentages = [];
      if (places === 1) {
        percentages.push(100);
      } else if (places === 3) {
        percentages.push(50, 35, 15);
      } else {
        let remaining = 100;
        for (let i = 0; i < places; i++) {
          let p = (i === places - 1) ? remaining : Math.round(remaining * 0.5);
          percentages.push(p);
          remaining -= p;
        }
      }
      
      percentages.forEach((p, i) => {
        const amount = (p / 100) * jackpotVal;
        let label = (i+1) + "er Lugar";
        if (i+1 === 2) label = "2do Lugar";
        if (i+1 === 3) label = "3er Lugar";
        if (i+1 > 3) label = (i+1) + "to Lugar";
        
        prizesContainer.innerHTML += `
          <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase /50 tracking-widest">${label}</span>
            <span class="text-accent text-lg font-black italic">$${amount.toFixed(2)}</span>
          </div>
        `;
      });
    }
    
    // 2. Cargar Estadísticas del Jugador y Limpiar Expirados
    let tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    
    // 2.1 Limpieza de Tickets Expirados (6 Horas para RESERVED)
    const sixHoursMs = 6 * 60 * 60 * 1000;
    const now = Date.now();
    let ticketsChanged = false;
    
    tickets = tickets.filter(t => {
      if (t.status === "reserved" && t.created_at) {
        const createdTime = new Date(t.created_at).getTime();
        if (now - createdTime > sixHoursMs) {
          ticketsChanged = true;
          import('./app_db.js').then(dbMod => {
            if (dbMod.db) {
              dbMod.db.collection("tickets").doc(t.id).delete().catch(console.error);
            }
          });
          return false;
        }
      }
      return true;
    });
    
    if (ticketsChanged) {
      localStorage.setItem("qia_tickets", JSON.stringify(tickets));
    }
    
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
    cachedFixturesList = fixtures;
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
    let fixtures = await getFixtures();
    cachedFixturesList = fixtures;
    const poolMatchesCount = Number(systemConfig.pool_matches_count) || 10;
    const reqSelections = Number(systemConfig.required_selections) || 10;
    
    // Mostrar todos los partidos activos asignados por el administrador (soporta 11, 15 o mas partidos en cartelera)
    fixtures = fixtures;
    
    // Poblar de forma dinámica las etiquetas de requeridos y contadores
    const reqEl = document.getElementById("play-required-count");
    if (reqEl) reqEl.textContent = reqSelections;
    
    const instrEl = document.getElementById("play-instruction-text");
    if (instrEl) {
      instrEl.textContent = `Elige tus ${reqSelections} partidos estratégicos y selecciona Local (L), Empate (E) o Visita (V).`;
    }
    
    renderPlayFixtures(fixtures);
    window.updatePoolCost();
    startMatchCountdownTimer();      // Mejora 1: countdown en tiempo real
    scheduleMatchReminder30min(fixtures); // Mejora 3: notif 30 min antes

    // 2. Verificar límite de apuestas (Sugerencia 3)
    const isLocked = window.checkBettingDeadlineStatus();
    const alertEl = document.getElementById("betting-deadline-alert");
    const submitBtn = document.querySelector("#panel-play button[onclick='window.purchaseTicket()']");
    
    if (alertEl) {
      if (isLocked) {
        alertEl.classList.remove("hidden");
        const isAdminBypass = systemConfig.bypass_deadline_testing && currentUser && currentUser.is_admin;
        const isManual = systemConfig.manual_locked;
        
        // Determinar si es bloqueo por primer partido iniciado
        let isFirstMatchStarted = false;
        try {
          let fixturesList = [...cachedFixturesList];
          if (fixturesList.length === 0) {
            const rawFixtures = localStorage.getItem("qia_fixtures");
            if (rawFixtures) fixturesList = JSON.parse(rawFixtures);
          }
          if (fixturesList && fixturesList.length > 0) {
            const poolMatchesCount = Number(systemConfig.pool_matches_count) || 10;
            const sortedFixtures = fixturesList
              .sort((a, b) => {
                const attractionA = Number(a.attraction_index || a.attraction) || 0;
                const attractionB = Number(b.attraction_index || b.attraction) || 0;
                return attractionB - attractionA;
              })
              .slice(0, poolMatchesCount);
            
            let earliestTimestamp = Infinity;
            sortedFixtures.forEach(f => {
              const ts = new Date(f.date).getTime();
              if (!isNaN(ts) && ts < earliestTimestamp) earliestTimestamp = ts;
            });
            if (earliestTimestamp !== Infinity && (Date.now() + serverTimeOffset) >= earliestTimestamp) {
              isFirstMatchStarted = true;
            }
          }
        } catch(e) {}
        
        let titleMsg = isManual 
          ? "APUESTAS CERRADAS POR EL ADMIN" 
          : (isFirstMatchStarted ? "APUESTAS CERRADAS (JORNADA EN CURSO)" : "APUESTAS CERRADAS (LÍMITE ALCANZADO)");
        let subMsg = isManual 
          ? "El registro ha sido clausurado manualmente." 
          : (isFirstMatchStarted ? "El primer partido de la quiniela ya ha comenzado." : "El registro de quinielas se reabrirá el lunes.");
        
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
    renderPerformanceChart();
    // Historial financiero
    const txs = await getTransactions(currentUser.phone || currentUser.email);
    renderTransactionHistory(txs);
  }
  
  if (panel === "admin") {
    // 1. Stats Admin
    const stats = await getAdminStats();
    document.getElementById("adm-stat-sales").textContent = `$${stats.total_sales.toFixed(2)}`;
    document.getElementById("adm-stat-users").textContent = stats.users_count;
    
    // Llenar listas heredadas de god-mode
    loadAdminPanel();
    
    // Cargar caché encriptada del Buscador Google AI si existe
    const cachedAISearch = localStorage.getItem("qia_last_ai_search");
    if (cachedAISearch) {
      try {
        const results = decryptAISearchData(cachedAISearch);
        if (results) {
          // Sincronizar el chip activo guardado en la caché
          const categories = ["todos", "euro", "copa", "local"];
          categories.forEach(cat => {
            const el = document.getElementById(`chip-ai-${cat}`);
            if (el) el.classList.toggle("active", cat === (results.category || 'todos'));
          });

          const overviewContainer = document.getElementById("google-ai-overview-container");
          const overviewText = document.getElementById("google-ai-overview-text");
          if (overviewContainer && overviewText && results.overview) {
            overviewText.innerHTML = results.overview;
            overviewContainer.classList.remove("hidden");
          }
          
          const container = document.getElementById("admin-api-matches-container");
          if (container && results.matches && results.matches.length > 0) {
            container.innerHTML = "";
            results.matches.forEach(s => {
              const div = document.createElement("div");
              div.className = "flex justify-between items-center p-12 bg-white/5 rounded-xl border border-black/5 text-xxs font-bold uppercase tracking-wider hover:bg-white/10 transition-all";
              div.style.marginBottom = "8px";
              
              let dateStr = "TBA";
              try {
                const d = new Date(s.date);
                dateStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
              } catch(e) {}

              div.innerHTML = `
                <div class="flex flex-col" style="max-width: 70%; text-align: left;">
                  <span class="text-xs font-black text-primary" style="font-size: 11px; font-weight: 900;">${s.team_local} vs ${s.team_visita}</span>
                  <span class="text-xxxxs opacity-35 mt-2 flex items-center gap-4" style="margin-top: 4px; font-size: 8px;"><i class="ri-calendar-line"></i> ${dateStr}</span>
                  <span class="text-[8px] opacity-45 lowercase italic mt-4" style="text-transform: none; line-height: 1.2; margin-top: 4px; display: block; font-size: 8px;">${s.reason || ''}</span>
                </div>
                <div class="flex flex-col items-end gap-6" style="gap: 6px;">
                  <span class="text-[8px] bg-purple-500/10 text-purple-600 px-6 py-2 rounded-full border border-purple-500/20 font-black" style="font-size: 8px; font-weight: 900;">${s.group}</span>
                  <button onclick="window.adminAddFromAPI('${s.id}', '${s.team_local}', '${s.team_visita}', '${s.date}', '${s.group}', ${s.attraction_index})" class="bg-[#4285F4] text-white px-10 py-5 rounded-xl text-[9px] uppercase font-black hover:opacity-90 transition-all shadow-[0_0_10px_rgba(66,133,244,0.15)]" style="border: none; cursor: pointer; border-radius: 12px; font-size: 9px; font-weight: 900; padding: 5px 10px;">Agregar</button>
                </div>
              `;
              container.appendChild(div);
            });
          }
        }
      } catch(e) {
        console.error("Error cargando caché de búsqueda IA:", e);
      }
    }
    
    // 2. Sugerencias IA
    const suggestions = await getIASuggestions();
    renderIASuggestions(suggestions);
    
    // 3. Pendientes SPEI
    const speis = await getPendingSPEI();
    renderAdminSPEI(speis);
    
    // 4. Poblar inputs de costos con config actual
    document.getElementById("cfg-pool-cost").value = systemConfig.pool_cost;
    document.getElementById("cfg-pool-fee").value = systemConfig.pool_fee;
    
    const jackpotInput = document.getElementById("cfg-pool-jackpot");
    if (jackpotInput) jackpotInput.value = systemConfig.pool_jackpot;
    
    document.getElementById("cfg-pool-places").value = systemConfig.pool_places || 3;
    
    const extraGoalsInput = document.getElementById("cfg-pool-extra-goals");
    if (extraGoalsInput) extraGoalsInput.value = systemConfig.extra_goals_cost;

    const poolMatchesInput = document.getElementById("cfg-pool-matches");
    if (poolMatchesInput) poolMatchesInput.value = systemConfig.pool_matches_count !== undefined ? systemConfig.pool_matches_count : 10;
    
    const reqSelInput = document.getElementById("cfg-required-selections");
    if (reqSelInput) reqSelInput.value = systemConfig.required_selections !== undefined ? systemConfig.required_selections : 10;

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
  
  // Mostrar apodo y nombre completo en la cabecera para personalización de marca
  const headerUser = document.getElementById("header-username");
  const headerFull = document.getElementById("header-fullname");
  const headerAvatar = document.getElementById("header-avatar");
  const headerCrown = document.getElementById("header-admin-crown");
  const menuRole = document.getElementById("menu-user-role");
  const menuName = document.getElementById("menu-user-name");
  const menuBtnAdmin = document.getElementById("menu-btn-admin");
  
  if (currentUser) {
    const isMaster = currentUser.role === 'master' || (currentUser.name || "").trim().toLowerCase() === 'andres';
    
    if (headerUser && currentUser.alias) {
      headerUser.textContent = "@" + currentUser.alias;
    }
    if (headerFull && currentUser.name) {
      headerFull.textContent = currentUser.name;
    }
    
    // 1. Avatar dinámico con inicial y gradiente premium
    if (headerAvatar) {
      const firstLetter = (currentUser.name || currentUser.alias || "U").substring(0, 1).toUpperCase();
      headerAvatar.textContent = firstLetter;
      
      if (isMaster) {
        headerAvatar.style.background = "linear-gradient(135deg, #ffd700, #ff8c00)"; // Oro / Naranja premium
        headerAvatar.style.color = "#000";
        headerAvatar.style.boxShadow = "0 0 15px rgba(255, 215, 0, 0.45)";
      } else {
        headerAvatar.style.background = "linear-gradient(135deg, #00e5ff, #00ff88)"; // Verde / Azul neón
        headerAvatar.style.color = "#000";
        headerAvatar.style.boxShadow = "0 0 15px rgba(0, 229, 255, 0.25)";
      }
    }
    
    // 2. Icono de Corona para Administrador Maestro
    if (headerCrown) {
      if (isMaster) {
        headerCrown.style.display = "inline-block";
        headerCrown.classList.remove("hidden");
      } else {
        headerCrown.style.display = "none";
        headerCrown.classList.add("hidden");
      }
    }
    
    // 3. Menú flotante: Nombre y Rol
    if (menuName && currentUser.name) {
      menuName.textContent = currentUser.name;
    }
    if (menuRole) {
      if (isMaster) {
        menuRole.textContent = "ADMINISTRADOR MAESTRO";
        menuRole.style.color = "#ffd700";
      } else {
        menuRole.textContent = "MIEMBRO JUGADOR";
        menuRole.style.color = "var(--accent)";
      }
    }
    
    // 4. Mostrar botón de Modo Admin en menú flotante
    if (menuBtnAdmin) {
      if (isMaster) {
        menuBtnAdmin.style.display = "flex";
        menuBtnAdmin.classList.remove("hidden");
      } else {
        menuBtnAdmin.style.display = "none";
        menuBtnAdmin.classList.add("hidden");
      }
    }
  }
  
  // Mostrar dock de admin SIEMPRE OCULTO hasta ingresar PIN
  document.getElementById("dock-admin").classList.add("hidden");
  
  window.appNavigate("dashboard");
}

// Controladores para menú flotante de perfil en cabecera
window.toggleHeaderProfileMenu = function() {
  const menu = document.getElementById("header-profile-menu");
  if (!menu) return;
  const isHidden = menu.style.display === "none" || menu.classList.contains("hidden");
  
  if (isHidden) {
    menu.style.display = "flex";
    menu.classList.remove("hidden");
  } else {
    menu.style.display = "none";
    menu.classList.add("hidden");
  }
};

window.copyUserAliasToClipboard = function() {
  if (currentUser && currentUser.alias) {
    navigator.clipboard.writeText("@" + currentUser.alias).then(() => {
      showToast("¡Apodo copiado al portapapeles!", "success");
    }).catch(() => {
      showToast("Error al copiar apodo", "error");
    });
  }
};

// Cerrar menú flotante si el usuario hace clic en el estadio fuera del perfil
document.addEventListener("click", function(event) {
  const badge = document.querySelector(".user-profile-badge");
  const menu = document.getElementById("header-profile-menu");
  if (!badge || !menu) return;
  if (!badge.contains(event.target) && !menu.contains(event.target)) {
    menu.style.display = "none";
    menu.classList.add("hidden");
  }
});

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

/**
 * @function checkBettingDeadlineStatus
 * @description Evalúa si el registro de quinielas se encuentra bloqueado.
 * El bloqueo ocurre por tres factores:
 *   1. Bloqueo manual explícito por parte del administrador.
 *   2. Cierre automático si ya inició el primer partido de la cartelera activa.
 *   3. Límite de tiempo programado tradicional (Gobernanza de Día y Hora).
 * @returns {boolean} True si las apuestas están cerradas, False si continúan abiertas.
 */
window.checkBettingDeadlineStatus = function() {
  if (!systemConfig) return false;
  
  // El bloqueo manual del Administrador prevalece sobre la fecha límite
  if (systemConfig.manual_locked) {
    return true;
  }
  
  // 1. CIERRE AUTOMÁTICO: Bloqueo inmediato al iniciar el primer partido de la quiniela
  try {
    let fixturesList = [...cachedFixturesList];
    if (fixturesList.length === 0) {
      const rawFixtures = localStorage.getItem("qia_fixtures");
      if (rawFixtures) {
        fixturesList = JSON.parse(rawFixtures);
      }
    }
    
    if (fixturesList && fixturesList.length > 0) {
      const poolMatchesCount = Number(systemConfig.pool_matches_count) || 10;
      
      // Ordenar fixtures por atracción idéntico al Estadio para mapear la cartelera activa
      const sortedFixtures = fixturesList
        .sort((a, b) => {
          const attractionA = Number(a.attraction_index || a.attraction) || 0;
          const attractionB = Number(b.attraction_index || b.attraction) || 0;
          return attractionB - attractionA;
        })
        .slice(0, poolMatchesCount);
      
      let earliestTimestamp = Infinity;
      sortedFixtures.forEach(f => {
        try {
          const d = new Date(f.date);
          const ts = d.getTime();
          if (!isNaN(ts) && ts < earliestTimestamp) {
            earliestTimestamp = ts;
          }
        } catch(e) {}
      });
      
      const nowTs = Date.now() + serverTimeOffset;
      if (earliestTimestamp !== Infinity && nowTs >= earliestTimestamp) {
        console.log("🔒 [Cierre Automático] Bloqueo activo: Ya inició el partido de apertura:", new Date(earliestTimestamp));
        return true;
      }
    }
  } catch(e) {
    console.warn("⚠️ [Seguridad Horario] Error evaluando el inicio del partido de apertura:", e);
  }
  
  // 2. Límite tradicional por día/hora de gobernanza
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
  
  if (!fixtures || fixtures.length === 0) {
    container.innerHTML = `<p class="text-xxs opacity-40 text-center uppercase tracking-widest py-14 w-full" style="grid-column: 1 / -1; font-size: 10px; color: var(--text-primary); text-transform: uppercase;">No hay partidos reales registrados en la cartelera de esta semana.</p>`;
    return;
  }
  
  // Ordenar por fecha cronológicamente
  fixtures.sort((a, b) => {
    const tsA = new Date(a.date).getTime();
    const tsB = new Date(b.date).getTime();
    if (!isNaN(tsA) && !isNaN(tsB)) return tsA - tsB;
    return 0;
  });
  
  let latestTicket = null;
  if (typeof currentUser !== 'undefined' && currentUser) {
    try {
      const localList = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
      const myTickets = localList.filter(t => t.user_id === currentUser.phone || t.user_id === currentUser.email);
      if (myTickets.length > 0) {
        myTickets.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        latestTicket = myTickets[0];
      }
    } catch(e) {}
  }

  const template = document.getElementById("carousel-card-template");
  let firstActiveCard = null;

  window._prevScores = window._prevScores || {};

  // Quitar el scroll horizontal y flex para hacerlo lista compacta
  container.className = "";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "8px";
  container.style.maxHeight = "350px";
  container.style.overflowY = "auto";
  container.style.paddingRight = "6px";

  fixtures.forEach(f => {
    const isLive = f.status === "live";
    const isFinished = f.status === "finished";

    const card = document.createElement("div");
    card.style.background = isLive ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.5)";
    card.style.border = isLive ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid var(--border-glass, rgba(205,127,50,0.2))";
    card.style.borderRadius = "12px";
    card.style.padding = "10px 14px";
    card.style.display = "flex";
    card.style.justifyContent = "space-between";
    card.style.alignItems = "center";
    
    let statusBadge = "";
    if (isLive) {
      statusBadge = `<span class="pulsing-live text-xxs font-black text-red-500 uppercase tracking-widest" style="color: #ef4444;"><span class="live-dot" style="margin-right:4px;"></span>En Vivo</span>`;
    } else if (isFinished) {
      statusBadge = `<span class="text-xxs font-black opacity-30 uppercase tracking-widest">Finalizado</span>`;
    } else {
      let dateLabel = f.date;
      try {
        const d = new Date(f.date);
        if (!isNaN(d.getTime())) {
          dateLabel = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + " " + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      } catch(e) {}
      statusBadge = `<span class="text-xxs font-black opacity-40 uppercase tracking-widest">${dateLabel}</span>`;
    }

    let localScore = (isLive || isFinished) && f.score_local != null ? f.score_local : '-';
    let visitaScore = (isLive || isFinished) && f.score_visita != null ? f.score_visita : '-';
    
    // Check hit
    let hitBadge = "";
    if (latestTicket && isFinished && f.score_local != null && f.score_visita != null) {
      let realResult = 'E';
      if (Number(f.score_local) > Number(f.score_visita)) realResult = 'L';
      else if (Number(f.score_local) < Number(f.score_visita)) realResult = 'V';
      const m = latestTicket.matches.find(x => x.match_id === f.id);
      if (m && m.prediction === realResult) {
        card.style.borderColor = 'rgba(0, 255, 136, 0.4)';
        card.style.background = 'rgba(0, 255, 136, 0.05)';
        hitBadge = `<span class="text-xxs font-black uppercase" style="margin-left: 6px; background: rgba(0,255,136,0.2); color: #00ff88; padding: 2px 8px; border-radius: 9999px;" title="¡Atinaste!">✅ Acertado</span>`;
      }
    }

    // Check blink for live score changes
    let scoreStyle = "font-size: 14px; font-weight: 900; font-style: italic; color: var(--accent, #cd7f32);";
    if (isLive) {
      const prev = window._prevScores[f.id] || { l: localScore, v: visitaScore };
      if (prev.l !== localScore || prev.v !== visitaScore) {
        scoreStyle += " animation: live-pulse 1s infinite; color: white;";
      }
      window._prevScores[f.id] = { l: localScore, v: visitaScore };
    }

    card.innerHTML = `
      <div style="flex:1;">
        <div style="margin-bottom: 6px; display:flex; align-items:center;">
          <span class="text-xxxxs font-black uppercase text-accent" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(0,0,0,0.05); padding: 2px 8px; border-radius: 9999px;">${f.group || "QUINIELA"}</span>
          ${hitBadge}
        </div>
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase;">
          <div style="margin-bottom: 2px;">${f.team_local}</div>
          <div>${f.team_visita}</div>
        </div>
      </div>
      <div style="text-align: right; display:flex; flex-direction:column; justify-content:space-between; height:100%;">
        <div style="margin-bottom: 6px;">${statusBadge}</div>
        <div style="${scoreStyle}">
          ${localScore} - ${visitaScore}
        </div>
      </div>
    `;
    
    container.appendChild(card);
    if (!isFinished && !firstActiveCard) {
      firstActiveCard = card;
    }
  });

  // Auto-scroll al partido activo
  if (firstActiveCard) {
    setTimeout(() => {
      container.scrollTo({ left: firstActiveCard.offsetLeft - container.offsetLeft - 20, behavior: 'smooth' });
    }, 500);
  }
}

function renderLeaderboard(leaderboard, containerId = "leaderboard-container") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  
  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = `<p class="text-xxs opacity-40 text-center uppercase tracking-widest py-20 w-full" style="font-size: 10px; color: var(--text-primary); text-transform: uppercase;">No hay aciertos registrados de jugadores reales todavía esta semana.</p>`;
    return;
  }
  
  leaderboard.forEach(row => {
    const div = document.createElement("div");
    div.className = "board-row flex justify-between items-center py-10";
    
    let medalClass = "bg-white/5 ";
    if (row.rank === 1) medalClass = "rank-1";
    if (row.rank === 2) medalClass = "rank-2";
    if (row.rank === 3) medalClass = "rank-3";
    
    div.innerHTML = `
      <div class="flex items-center gap-10">
        <span class="rank-badge ${medalClass}">${row.rank}</span>
        <div class="flex flex-col">
          <span class="text-xs font-black ">@${row.alias}</span>
          <span class="text-[8px] opacity-30 uppercase font-black">${row.name}</span>
        </div>
      </div>
      <span class="text-xs font-black text-accent">${row.hits} Aciertos</span>
    `;
    container.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// MEJORAS DE CARTELERA — Countdown, Timezone, Notificación 30 min
// ══════════════════════════════════════════════════════════════════════════

// ── Mejora 2: Detectar zona horaria del usuario ───────────────────────────
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
console.log('🌍 Zona horaria detectada:', USER_TZ);

// ── Mejora 1: Countdown en tiempo real ───────────────────────────────────
let _countdownInterval = null;

function startMatchCountdownTimer() {
  // Limpiar intervalo previo si existe
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
  // Actualizar cada 60 segundos sin re-renderizar todo
  _countdownInterval = setInterval(() => {
    const chips = document.querySelectorAll('[data-countdown-ts]');
    chips.forEach(chip => {
      const ts = Number(chip.getAttribute('data-countdown-ts'));
      const now = Date.now() + (typeof serverTimeOffset !== 'undefined' ? serverTimeOffset : 0);
      const diffMs = ts - now;
      if (diffMs <= 0) {
        // Partido iniciado — mostrar EN CURSO y deshabilitar botones
        chip.innerHTML = '<span style="color:#ef4444;font-weight:900;animation:pulse 1s infinite;">🔴 EN CURSO</span>';
        // Deshabilitar botones de ese partido
        const matchId = chip.getAttribute('data-match-id');
        if (matchId) {
          ['L','E','V'].forEach(op => {
            const btn = document.getElementById(`btn-bet-${matchId}-${op}`);
            if (btn) { btn.disabled = true; btn.style.opacity = '0.35'; btn.style.cursor = 'not-allowed'; }
          });
        }
        return;
      }
      const diffMins = Math.round(diffMs / 60000);
      const diffHours = Math.round(diffMs / 3600000);
      const diffDays = Math.round(diffMs / 86400000);
      let rel = '';
      if (diffMins < 60) rel = `En ${diffMins} min`;
      else if (diffHours < 24) rel = `En ${diffHours} h`;
      else if (diffDays === 1) rel = 'Mañana';
      else if (diffDays === 2) rel = 'Pasado mañana';
      else rel = `En ${diffDays} días`;
      chip.textContent = `⚡ ${rel}`;
    });
  }, 60000);
}

// ── Mejora 3: Notificación 30 min antes del primer partido ───────────────
let _reminderTimeout = null;

function scheduleMatchReminder30min(fixtures) {
  if (_reminderTimeout) { clearTimeout(_reminderTimeout); _reminderTimeout = null; }
  if (!fixtures || fixtures.length === 0) return;

  // Encontrar el partido más próximo que aún no haya iniciado
  const now = Date.now() + (typeof serverTimeOffset !== 'undefined' ? serverTimeOffset : 0);
  let earliest = Infinity;
  let earliestName = '';

  fixtures.forEach(f => {
    if (!f.date) return;
    const ts = new Date(f.date).getTime();
    if (!isNaN(ts) && ts > now && ts < earliest) {
      earliest = ts;
      earliestName = `${f.team_local} vs ${f.team_visita}`;
    }
  });

  if (earliest === Infinity) return;

  const msUntil30MinBefore = (earliest - now) - (30 * 60 * 1000);
  if (msUntil30MinBefore <= 0) return; // ya pasó la ventana de 30 min

  console.log(`🔔 Recordatorio programado en ${Math.round(msUntil30MinBefore/60000)} min para: ${earliestName}`);

  _reminderTimeout = setTimeout(() => {
    if (typeof window.sendLocalNotification === 'function') {
      window.sendLocalNotification(
        '⚡ ¡30 MIN PARA EL PRIMER PARTIDO!',
        `${earliestName} está por comenzar. ¡Ingresa tus predicciones antes de que cierre la quiniela!`
      );
    }
  }, msUntil30MinBefore);
}

// ── Helper: tiempo relativo en español ────────────────────────────────────
function getRelativeTime(dateObj) {
  const now = Date.now() + (typeof serverTimeOffset !== 'undefined' ? serverTimeOffset : 0);
  const diffMs = dateObj.getTime() - now;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) return null; // ya inició
  if (diffMins < 60) return `En ${diffMins} min`;
  if (diffHours < 24) return `En ${diffHours} h`;
  if (diffDays === 1) return 'Mañana';
  if (diffDays === 2) return 'Pasado mañana';
  return `En ${diffDays} días`;
}

// ── Helper: color de badge según liga/grupo ───────────────────────────────
function getLeagueBadge(group) {
  if (!group) return '';
  const g = group.toUpperCase();
  let bg, color, icon;
  if (g.includes('LIGA MX') || g.includes('MEX')) { bg='rgba(0,189,60,0.15)'; color='#00bd3c'; icon='🇲🇽'; }
  else if (g.includes('CHAMPIONS') || g.includes('UCL')) { bg='rgba(0,120,255,0.15)'; color='#0078ff'; icon='⭐'; }
  else if (g.includes('EUROPA') || g.includes('UEL')) { bg='rgba(255,140,0,0.15)'; color='#ff8c00'; icon='🟠'; }
  else if (g.includes('PREMIER') || g.includes('PL')) { bg='rgba(103,0,255,0.15)'; color='#6700ff'; icon='🏴󠁧󠁢󠁥󠁮󠁧󠁿'; }
  else if (g.includes('LALIGA') || g.includes('ESP')) { bg='rgba(255,0,60,0.15)'; color='#ff003c'; icon='🇪🇸'; }
  else if (g.includes('SERIE A') || g.includes('ITA')) { bg='rgba(0,90,170,0.15)'; color='#005aaa'; icon='🇮🇹'; }
  else if (g.includes('BUNDESLIGA') || g.includes('GER')) { bg='rgba(230,0,0,0.15)'; color='#e60000'; icon='🇩🇪'; }
  else if (g.includes('MLS') || g.includes('USA')) { bg='rgba(12,35,64,0.15)'; color='#0c2340'; icon='🇺🇸'; }
  else if (g.includes('COPA') || g.includes('AMERICA')) { bg='rgba(255,215,0,0.15)'; color='#cd7f32'; icon='🌎'; }
  else if (g.includes('MUNDIAL') || g.includes('FIFA') || g.includes('FRIENDLY')) { bg='rgba(255,215,0,0.15)'; color='#ffd700'; icon='🌍'; }
  else { bg='rgba(255,255,255,0.08)'; color='rgba(255,255,255,0.5)'; icon='⚽'; }
  return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:1px;padding:2px 7px;border-radius:20px;background:${bg};color:${color};border:1px solid ${color}33;">${icon} ${group}</span>`;
}

// Renderizadores de Jugar Quiniela
function renderPlayFixtures(fixtures) {
  const container = document.getElementById("play-matches-container");
  if (!container) return;
  container.innerHTML = "";
  
  // Ordenar por fecha: los más próximos primero
  fixtures.sort((a, b) => {
    const tsA = new Date(a.date).getTime();
    const tsB = new Date(b.date).getTime();
    if (!isNaN(tsA) && !isNaN(tsB)) return tsA - tsB;
    return 0;
  });
  
  let lastDateGroup = "";

  fixtures.forEach((f, idx) => {
    // Generate date group
    let currentGroup = "PRÓXIMAMENTE";
    if (f.date) {
      try {
        const d = new Date(f.date);
        if (!isNaN(d.getTime())) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          const fDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          
          if (fDate.getTime() < today.getTime()) {
            currentGroup = "JUGADOS";
          } else if (fDate.getTime() === today.getTime()) {
            currentGroup = "HOY";
          } else if (fDate.getTime() === tomorrow.getTime()) {
            currentGroup = "MAÑANA";
          } else {
            const tzOpts = { timeZone: typeof USER_TZ !== 'undefined' ? USER_TZ : 'America/Mexico_City' };
            const weekday = d.toLocaleDateString('es-MX', { ...tzOpts, weekday: 'long' });
            const dayMonth = d.toLocaleDateString('es-MX', { ...tzOpts, day: 'numeric', month: 'short' });
            currentGroup = `${weekday.toUpperCase()} ${dayMonth.toUpperCase()}`;
          }
        }
      } catch(e) {}
    }

    if (currentGroup !== lastDateGroup) {
      const divider = document.createElement("div");
      divider.className = "date-divider text-center mb-10 mt-10";
      divider.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
      divider.style.paddingBottom = "16px";
      divider.innerHTML = `<span class="text-xxs font-black uppercase text-accent px-6" style="letter-spacing: 4px; background: #121212; padding-top: 4px; padding-bottom: 4px; border-radius: 9999px; border: 1px solid rgba(205,127,50,0.3); box-shadow: 0 0 15px rgba(205,127,50,0.15);">${currentGroup}</span>`;
      container.appendChild(divider);
      lastDateGroup = currentGroup;
    }

    const row = document.createElement("div");
    row.className = "match-play-row";
    
    const sel = currentTicketSelections[f.id] || "";

    // ── 1. Fecha, hora y estado del partido ─────────────────────────────
    let dateLabel = '';
    let isLive = false;
    let relativeTag = '';

    if (f.date) {
      try {
        const d = new Date(f.date);
        if (!isNaN(d.getTime())) {
          const now = Date.now() + (typeof serverTimeOffset !== 'undefined' ? serverTimeOffset : 0);
          const diffMs = d.getTime() - now;

          // ¿Ya inició? (menos de 0ms = en curso, asumimos 105 min de duración)
          isLive = diffMs < 0 && diffMs > -(105 * 60000);

          // Mejora 2: usar zona horaria real del usuario
          const tzOpts = { timeZone: USER_TZ };
          const weekday = d.toLocaleDateString('es-MX', { ...tzOpts, weekday: 'long' });
          const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
          const dayMonth = d.toLocaleDateString('es-MX', { ...tzOpts, day: 'numeric', month: 'short' });
          const time = d.toLocaleTimeString('es-MX', { ...tzOpts, hour: '2-digit', minute: '2-digit', hour12: true });

          if (isLive) {
            dateLabel = `<span style="display:inline-flex;align-items:center;gap:5px;color:#ef4444;font-weight:900;font-size:9px;animation:pulse 1.5s infinite;">
              <span style="width:7px;height:7px;background:#ef4444;border-radius:50%;display:inline-block;animation:pulse 1s infinite;"></span>
              EN CURSO
            </span>`;
          } else {
            // ── Tiempo relativo ─────────────────────────────────────────
            const rel = getRelativeTime(d);
            // Mejora 1: atributos data para countdown en tiempo real
            const relHtml = rel
              ? `<span data-countdown-ts="${d.getTime()}" data-match-id="${f.id}" style="display:inline-flex;align-items:center;font-size:7px;font-weight:900;padding:2px 8px;border-radius:20px;background:rgba(0,229,255,0.1);color:#00e5ff;border:1px solid rgba(0,229,255,0.2);margin-left:5px;">⚡ ${rel}</span>`
              : '';
            relativeTag = relHtml;
            dateLabel = `📅 ${weekdayCap} ${dayMonth} &nbsp;·&nbsp; ⏰ ${time}`;
          }
        }
      } catch(e) {
        dateLabel = `📅 ${f.date}`;
      }
    } else {
      dateLabel = '📅 Por Confirmar';
    }

    // ── 2. Badge de liga/grupo ──────────────────────────────────────────
    const leagueBadge = getLeagueBadge(f.group);

    // ── 3. Deshabilitar botones si el partido ya inició ─────────────────
    const btnDisabled = isLive ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : '';
    const btnClass = (op) => `bet-btn ${sel === op ? 'selected' : ''}`;

    let vsContent = '<span class="text-accent italic text-xxxxs tracking-[2px] self-center">VS</span>';
    if ((isLive || f.status === 'finished' || f.score_local != null) && f.score_local != null && f.score_visita != null) {
      vsContent = `<span class="font-black italic tracking-[2px] self-center" style="color:#ffffff; font-size:11px; background:rgba(0,0,0,0.4); padding:4px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 0 10px rgba(0,0,0,0.5);">${f.score_local} - ${f.score_visita}</span>`;
    }

    row.innerHTML = `
      <div class="match-play-teams" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="flex:1; text-align:left;">${f.team_local}</span>
        ${vsContent}
        <span style="flex:1; text-align:right;">${f.team_visita}</span>
      </div>

      <div style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:-2px;margin-bottom:6px;">
        ${leagueBadge}
        ${isLive
          ? dateLabel
          : `<span style="font-size:9px;font-weight:700;opacity:0.55;text-transform:uppercase;letter-spacing:1px;color:var(--accent);">${dateLabel}</span>${relativeTag}`
        }
      </div>

      <div class="bet-selector-grid">
        <button id="btn-bet-${f.id}-L" class="${btnClass('L')}" onclick="window.selectBet('${f.id}', 'L')" ${btnDisabled}>LOCAL</button>
        <button id="btn-bet-${f.id}-E" class="${btnClass('E')}" onclick="window.selectBet('${f.id}', 'E')" ${btnDisabled}>EMPATE</button>
        <button id="btn-bet-${f.id}-V" class="${btnClass('V')}" onclick="window.selectBet('${f.id}', 'V')" ${btnDisabled}>VISITA</button>
      </div>
    `;
    container.appendChild(row);
  });
}


window.selectBet = function(matchId, selection) {
  if (currentTicketSelections[matchId] === selection) {
    // Deselect if already selected the same
    delete currentTicketSelections[matchId];
  } else {
    // Check limit if adding new match
    if (!currentTicketSelections[matchId]) {
      const count = Object.keys(currentTicketSelections).length;
      const reqSel = Number(systemConfig.required_selections) || 10;
      if (count >= reqSel) {
        if (typeof showToast === "function") showToast(`Ya elegiste ${reqSel} partidos. Quita uno si quieres cambiar.`, "error");
        return;
      }
    }
    currentTicketSelections[matchId] = selection;
  }
  
  // Actualizar clases de botones
  ["L", "E", "V"].forEach(op => {
    const btn = document.getElementById(`btn-bet-${matchId}-${op}`);
    if (btn) {
      btn.classList.toggle("selected", op === currentTicketSelections[matchId]);
    }
  });
  
  const currentCount = Object.keys(currentTicketSelections).length;
  const countEl = document.getElementById("play-selections-count");
  if (countEl) countEl.textContent = currentCount;
  
  window.updatePoolCost();

  // Ofrecer compra automática e inmediata al completar las 10 predicciones (required_selections)
  const reqSel = Number(systemConfig.required_selections) || 10;
  if (currentCount === reqSel) {
    setTimeout(() => {
      const confirmPurchase = confirm(`¡Acabas de elegir tus ${reqSel} resultados!\n\n¿Deseas comprar esta quiniela ahora mismo por $${(Number(systemConfig.pool_cost) || 50).toFixed(2)} MXN?`);
      if (confirmPurchase) {
        window.purchaseTicket();
      }
    }, 250);
  }
};

window.updatePoolCost = function() {
  let cost = Number(systemConfig.pool_cost) || 50;
  
  // Agregar Side Bets
  const sidebetGoals = document.getElementById("sidebet-goals")?.checked || false;
  const sidebetStriker = document.getElementById("sidebet-striker")?.checked || false;
  
  if (sidebetGoals) cost += Number(systemConfig.extra_goals_cost) || 10;
  if (sidebetStriker) cost += Number(systemConfig.extra_striker_cost) || 15;
  
  document.getElementById("pool-total-cost").textContent = `$${cost.toFixed(2)}`;
};

// Confirmar y comprar ticket
window.purchaseTicket = async function() {
  if (isPurchasing) return;

  // 1. Validar límite de apuestas (Sugerencia 3)
  const isLocked = window.checkBettingDeadlineStatus();
  if (isLocked) {
    const isAdminBypass = systemConfig.bypass_deadline_testing && currentUser && currentUser.is_admin;
    if (!isAdminBypass) {
      showToast("Las apuestas están cerradas hasta el lunes (límite de Viernes 6:00 PM superado).", "error");
      return;
    }
  }

  // Asegurar que ha seleccionado exactamente el número configurado de partidos
  const reqSel = Number(systemConfig.required_selections) || 10;
  const currentSelCount = Object.keys(currentTicketSelections).length;
  
  if (currentSelCount !== reqSel) {
    showToast(`Debes seleccionar exactamente ${reqSel} partidos para ingresar tu quiniela (llevas ${currentSelCount}).`, "error");
    return;
  }
  
  // Validar saldo
  const cost = parseFloat(document.getElementById("pool-total-cost").textContent.replace("$", ""));
  const balance = Number(currentUser.balance) || 0;
  
  let ticketStatus = "active";
  
  if (balance < cost) {
    isPurchasing = true; 
    try {
      const dbMod = await import('./app_db.js');
      const userTxs = await dbMod.getTransactions(currentUser.phone || currentUser.email);
      const hasPendingSPEI = userTxs.some(tx => tx.gateway === "spei" && tx.status === "pending");
      
      if (hasPendingSPEI) {
        showToast("⏳ No tienes saldo, pero tu quiniela se guardará como RESERVADA hasta que se apruebe tu recarga.", "info");
        ticketStatus = "reserved";
      } else {
        isPurchasing = false;
        showToast("Saldo insuficiente. Ve a la Billetera para reportar una recarga.", "error");
        window.appNavigate("wallet");
        return;
      }
    } catch(e) {
      isPurchasing = false;
      showToast("Error al verificar transacciones.", "error");
      return;
    }
  } else {
    isPurchasing = true;
  }
  
  const btn = document.querySelector("#panel-play button[onclick='window.purchaseTicket()']");
  if (btn) {
    btn.disabled = true;
    btn.textContent = ticketStatus === "reserved" ? "RESERVANDO..." : "EMITIENDO JUGADA...";
  }

  showToast(ticketStatus === "reserved" ? "Guardando reserva..." : "Emitiendo ticket encriptado...", "info");
  
  setTimeout(async () => {
    try {
      const sidebetGoals = document.getElementById("sidebet-goals")?.checked || false;
      const sidebetStriker = document.getElementById("sidebet-striker")?.checked || false;
      
      const ticket = {
        id: "tkt-" + Date.now(),
        user_id: currentUser.email || currentUser.phone,
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
        status: ticketStatus,
        hits: 0
      };
      
      const dbMod = await import('./app_db.js');
      lastCreatedTicket = await dbMod.createTicket(ticket);
      
      if (ticketStatus === "active") {
        currentUser.balance = (Number(currentUser.balance) || 0) - cost;
        localStorage.setItem("qia_current_user", JSON.stringify(dbMod.encryptData(currentUser)));
        document.getElementById("header-balance").textContent = `$${Number(currentUser.balance).toFixed(2)}`;
      }
      
      showToast(ticketStatus === "reserved" ? "¡Quiniela Reservada con éxito!" : "¡Ticket emitido con éxito!", "success");
      
      window.sendLocalNotification(
        ticketStatus === "reserved" ? "⏳ QUINIELA RESERVADA" : "🎫 TICKET QUINIELA EMITIDO", 
        ticketStatus === "reserved" ? `Tu quiniela ${lastCreatedTicket.id} está reservada y a la espera de pago.` : `Tu ticket ${lastCreatedTicket.id} por $${cost.toFixed(2)} MXN ha sido guardado.`
      );
      
      currentTicketSelections = {};
      const elGoals = document.getElementById("sidebet-goals");
      if (elGoals) elGoals.checked = false;
      const elStriker = document.getElementById("sidebet-striker");
      if (elStriker) elStriker.checked = false;
      
      showTicketDetails(lastCreatedTicket);
    } catch (e) {
      console.error(e);
      showToast("Error al emitir: " + (e.message || "Desc"), "error");
    } finally {
      isPurchasing = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Confirmar y Emitir Ticket";
      }
    }
  }, 1000);
};

// Modal de ticket details
function showTicketDetails(ticket) {
  const modal = document.getElementById("ticket-modal");
  const container = document.getElementById("ticket-modal-content");
  if (!modal || !container) return;
  
  container.innerHTML = `
    <div class="bg-white/5 p-12 rounded-2xl border border-black/5 space-y-6 text-xxs font-bold uppercase tracking-wider ">
      <div>Ticket ID: <span class="text-accent">${ticket.id}</span></div>
      <div>Usuario: <span class="text-accent">@${ticket.user_alias}</span></div>
      <div style="display:flex; justify-content:space-between;">
        <span>Fecha de Emisión: <span class="opacity-50">${new Date(ticket.created_at).toLocaleString()}</span></span>
        <span class="text-[#00ff88]">Aciertos Totales: <span id="modal-total-hits" class="font-black text-sm">0</span></span>
      </div>
    </div>
    
    <div class="space-y-6">
      <h4 class="text-[9px] font-black uppercase text-accent tracking-widest mt-12 mb-6">PREDICCIONES DEL TICKET</h4>
      <div class="divide-y divide-white/5 space-y-4" id="ticket-modal-predictions"></div>
    </div>
    
    <div class="bg-white/5 p-12 rounded-2xl border border-black/5 space-y-6 text-xxs font-bold uppercase tracking-wider  mt-12">
      <div>Side Bet Goles Totales: <span class="text-accent">${ticket.sidebet_goals ? 'SÍ (+3 goles)' : 'NO'}</span></div>
      <div>Side Bet Primer Gol: <span class="text-accent">${ticket.sidebet_striker ? `SÍ (${ticket.sidebet_striker_value})` : 'NO'}</span></div>
      <div class="border-t border-black/10 pt-6 mt-6 flex justify-between">
        <span>Costo Total:</span>
        <span class="text-success text-sm font-black">$${ticket.total_cost.toFixed(2)} MXN</span>
      </div>
    </div>
  `;
  
  // Agregar predicciones
  getFixtures().then(fixtures => {
    const predContainer = document.getElementById("ticket-modal-predictions");
    let totalHits = 0;
    ticket.matches.forEach(m => {
      const f = fixtures.find(match => match.id === m.match_id);
      if (f) {
        let realResult = null;
        let scoreStr = "";
        let isFinishedOrLive = f.status === 'finished' || f.status === 'live' || (typeof f.score_local === 'number' && typeof f.score_visita === 'number');
        
        if (isFinishedOrLive && typeof f.score_local === 'number' && typeof f.score_visita === 'number') {
           scoreStr = ` <span class="text-accent ml-2">(${f.score_local} - ${f.score_visita})</span>`;
           if (f.score_local > f.score_visita) realResult = 'L';
           else if (f.score_local === f.score_visita) realResult = 'E';
           else realResult = 'V';
        }
        
        let predClass = "bg-accent text-black";
        let resultIcon = "";
        if (realResult !== null) {
          if (realResult === m.prediction) {
            predClass = "bg-[#00ff88] text-black";
            resultIcon = "✅";
            totalHits++;
          } else {
            predClass = "bg-red-500 text-white";
            resultIcon = "❌";
          }
        }

        const row = document.createElement("div");
        row.className = "flex justify-between items-center py-6 text-xxs uppercase tracking-wider font-bold";
        row.innerHTML = `
          <span>${f.team_local} vs ${f.team_visita}${scoreStr}</span>
          <div class="flex items-center gap-4">
            ${resultIcon}
            <span class="${predClass} font-black px-6 py-2 rounded-lg">${m.prediction}</span>
          </div>
        `;
        predContainer.appendChild(row);
      }
    });
    
    const hitsEl = document.getElementById("modal-total-hits");
    if (hitsEl) hitsEl.textContent = totalHits;
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
  
  let msg = `*🎫 QUINIELA MUNDIALISTA IA — Quiniela Mundialista *\n`;
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
        <span class="">${tx.gateway === 'stripe' ? 'Recarga Stripe' : 'Carga SPEI (Folio ' + tx.ref + ')'}</span>
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
      user_id: currentUser.email || currentUser.phone,
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
    
    // Alerta al Admin
    localStorage.setItem("qia_admin_alert", JSON.stringify({ user: currentUser.alias || currentUser.name, amount: amount, ts: Date.now() }));
    
    window.appNavigate("wallet");
  }, 1500);
};

// Simular Depósito de SPEI (Subida de Comprobante)
window.simulateSPEIDeposit = async function() {
  const amount = Number(document.getElementById("spei-amount").value);
  const ref = document.getElementById("spei-ref").value;
  const dateStr = document.getElementById("spei-date").value;
  const timeStr = document.getElementById("spei-time").value;
  const fileInput = document.getElementById("spei-file");
  
  if (!amount || !ref || !dateStr || !timeStr) {
    showToast("Por favor ingresa todos los datos: monto, fecha, hora y referencia.", "error");
    return;
  }
  
  const userId = currentUser.email || currentUser.phone;
  
  // Anti-Spam: Verificar transacciones pendientes
  const dbMod = await import('./app_db.js');
  const userTxs = await dbMod.getTransactions(userId);
  const hasPending = userTxs.some(tx => tx.gateway === "spei" && tx.status === "pending");
  if (hasPending) {
    showToast("⏳ Ya tienes un reporte de transferencia en revisión. Por favor espera a que un administrador lo valide.", "error");
    return;
  }
  
  showToast("Procesando evidencia y enviando reporte...", "info");
  
  let base64Image = null;
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) { // 2MB max
      showToast("La imagen es muy pesada. Máximo 2MB.", "error");
      return;
    }
    
    // Comprimir imagen usando Canvas
    base64Image = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          if (width > height && width > 800) {
            height *= 800 / width;
            width = 800;
          } else if (height > 800) {
            width *= 800 / height;
            height = 800;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  
  const tx = {
    user_id: userId,
    amount: amount,
    type: "deposit",
    gateway: "spei",
    status: "pending",
    ref: ref,
    transfer_date: dateStr,
    transfer_time: timeStr,
    evidence_b64: base64Image || null
  };
  
  await dbMod.registerTransaction(tx);
  
  // Alerta al Admin
  localStorage.setItem("qia_admin_alert", JSON.stringify({ user: currentUser.alias || currentUser.name, amount: amount, ts: Date.now() }));

  // Limpiar inputs
  document.getElementById("spei-amount").value = "";
  document.getElementById("spei-ref").value = "";
  document.getElementById("spei-date").value = "";
  document.getElementById("spei-time").value = "";
  if (fileInput) fileInput.value = "";
  
  showToast("✅ ¡Reporte enviado! Se validará en aprox. 1 a 3 horas. Ya puedes PRE-LLENAR y RESERVAR tu quiniela en el Estadio sin saldo.", "success");
  setTimeout(() => {
    window.appNavigate("dashboard");
  }, 3500);
};

// Renderizadores de Panel de Administrador
function renderIASuggestions(suggestions) {
  const container = document.getElementById("admin-ia-matches-container");
  if (!container) return;
  container.innerHTML = "";
  
  suggestions.forEach(s => {
    const div = document.createElement("div");
    div.className = "flex justify-between items-center p-10 bg-white/5 rounded-xl border border-black/5 text-xxs font-bold uppercase tracking-wider";
    
    div.innerHTML = `
      <div class="flex flex-col">
        <span class="">${s.team_local} vs ${s.team_visita}</span>
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
  showToast("IA Computando fixtures de los próximos 8 días...", "info");
  
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
    div.className = "bg-white/5 p-12 rounded-2xl border border-black/5 space-y-8 text-xxs font-bold uppercase tracking-wider";
    
    div.innerHTML = `
      <div class="flex justify-between">
        <span class="">Usuario: @${tx.user_id}</span>
        <span class="text-success">$${Number(tx.amount).toFixed(2)} MXN</span>
      </div>
      <div>Referencia/Concepto: <span class="text-accent">${tx.ref}</span></div>
      ${tx.transfer_date ? `<div class="text-[9px] text-white/50 tracking-widest mt-2">Fecha/Hora de Envío: ${tx.transfer_date} ${tx.transfer_time || ''}</div>` : ''}
      ${tx.evidence_b64 ? `<div class="mt-8"><img src="${tx.evidence_b64}" alt="Evidencia SPEI" class="w-full h-auto max-h-32 object-contain rounded border border-white/10 cursor-pointer" onclick="window.open('${tx.evidence_b64}', '_blank')" /></div>` : ''}
      <div class="flex gap-4 pt-4 border-t border-black/5 mt-6">
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
  
  const jackpotInput = document.getElementById("cfg-pool-jackpot");
  const jackpot = jackpotInput ? Number(jackpotInput.value) : (systemConfig.pool_jackpot || 5000);
  
  const places = Number(document.getElementById("cfg-pool-places").value) || 3;
  
  const extraGoalsInput = document.getElementById("cfg-pool-extra-goals");
  const extraGoals = extraGoalsInput ? Number(extraGoalsInput.value) : (systemConfig.extra_goals_cost || 10);
  
  const deadlineDayStr = document.getElementById("cfg-deadline-day").value;
  const deadlineDay = deadlineDayStr === "-1" ? -1 : Number(deadlineDayStr);
  const deadlineHour = Number(document.getElementById("cfg-deadline-hour").value);
  const bypassBypass = document.getElementById("cfg-deadline-bypass").checked;

  const poolMatches = Number(document.getElementById("cfg-pool-matches").value) || 10;
  const reqSelections = Number(document.getElementById("cfg-required-selections").value) || 10;

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
    pool_matches_count: poolMatches,
    required_selections: reqSelections,
    manual_locked: systemConfig.manual_locked || false // PRESERVAR ESTO
  };
  
  await saveSystemConfig(updatedCfg);
  systemConfig = updatedCfg;
  
  // Guardar log de auditoría
  await createGovernanceLog(
    "Ajuste de Gobernanza",
    `Costos actualizados: Costo=$${cost}, App=${fee}%, Bolsa=$${jackpot}, Ganadores=${places}, Cartelera=${poolMatches}, Requeridos=${reqSelections}, Límite=${deadlineDayStr} a las ${deadlineHour}:00h`,
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
      <div class="flex justify-between items-center ">
        <span>⚡ Acción: <span class="text-accent">${log.action}</span></span>
        <span class="text-xxxxs opacity-30">${new Date(log.created_at).toLocaleString()}</span>
      </div>
      <div class="text-[9px] /50 lowercase italic" style="text-transform: none;">${log.details}</div>
      <div class="text-[8px] /30">Operador: @${log.user_alias} (${log.user_id})</div>
    `;
    container.appendChild(div);
  });
}

// Actualizar cartelera desde Google / API-Football (Simulado)
// Buscar partidos en ESPN API y mostrarlos para agregar manualmente
window.adminSearchAPI = async function() {
  showToast("Buscando partidos globales...", "info");
  
  const container = document.getElementById("admin-api-matches-container");
  if (!container) return;
  container.innerHTML = "<div class='text-center text-xs opacity-40 py-20 uppercase tracking-widest'>Conectando con ESPN...</div>";

  try {
    const suggestions = await getIASuggestions();
    container.innerHTML = "";
    
    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = "<div class='text-center text-xs opacity-40 py-20 uppercase tracking-widest'>No se encontraron partidos próximos.</div>";
      return;
    }

    suggestions.forEach(s => {
      const div = document.createElement("div");
      div.className = "flex justify-between items-center p-10 bg-white/5 rounded-xl border border-black/5 text-xxs font-bold uppercase tracking-wider";
      
      let dateStr = "TBA";
      try {
        dateStr = new Date(s.date).toLocaleString();
      } catch(e) {}

      div.innerHTML = `
        <div class="flex flex-col">
          <span class="">${s.team_local} vs ${s.team_visita}</span>
          <span class="text-xxxxs opacity-30 mt-2">${dateStr}</span>
        </div>
        <div class="flex items-center gap-10">
          <span class="text-[8px] bg-purple-500/20 text-purple-400 px-6 py-2 rounded-full border border-purple-500/25">${s.group}</span>
          <button onclick="window.adminAddFromAPI('${s.id}', '${s.team_local}', '${s.team_visita}', '${s.date}', '${s.group}', ${s.attraction_index})" class="bg-green-500 text-black px-8 py-4 rounded text-[9px] uppercase font-black hover:bg-green-400 border border-green-400">Agregar</button>
        </div>
      `;
      container.appendChild(div);
    });
    showToast(`Se encontraron ${suggestions.length} partidos.`, "success");
  } catch (err) {
    container.innerHTML = "<div class='text-center text-red-500 py-20 uppercase tracking-widest'>Error de conexión con la API.</div>";
  }
};

// Buscar partidos más atractivos mediante el Buscador Google con Modo IA

function getSelectedScanLeagues() {
  const cbs = document.querySelectorAll(".scan-league-cb:checked");
  const leagues = [];
  cbs.forEach(cb => {
    const val = cb.value;
    if (val === "mex.1") leagues.push("mex.1");
    if (val === "mex.w.1") leagues.push("mex.w.1", "fifa.w.friendly");
    if (val === "mex.2") leagues.push("mex.2");
    if (val === "uefa.champions") leagues.push("uefa.champions", "uefa.europa", "uefa.euro");
    if (val === "esp.1") leagues.push("esp.1", "eng.1", "fra.1", "ned.1", "por.1");
    if (val === "ita.1") leagues.push("ita.1", "ger.1");
    if (val === "usa.1") leagues.push("usa.1");
    if (val === "arg.1") leagues.push("arg.1", "bra.1", "conmebol.america", "conmebol.libertadores", "conmebol.sudamericana");
    if (val === "fifa.friendly") leagues.push("fifa.friendly");
  });
  return leagues;
}

window.adminSearchGoogleAI = async function(category = 'todos') {

  const daysSelect = document.getElementById("google-ai-search-days");
  const scanDays = daysSelect ? Number(daysSelect.value) : 8;


  const selectedLeagues = getSelectedScanLeagues();
  const allCbsCount = document.querySelectorAll(".scan-league-cb").length;
  const checkedCbsCount = document.querySelectorAll(".scan-league-cb:checked").length;
  const isCustomScan = checkedCbsCount < allCbsCount;

  const queryInput = document.getElementById("google-ai-search-input");
  const rawQuery = queryInput ? queryInput.value.trim() : "";
  
  // Sanitización de seguridad contra XSS e inyecciones (Recomendación 1)
  const query = rawQuery.replace(/[<>'"&]/g, (match) => {
    const map = {
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
      '&': '&amp;'
    };
    return map[match];
  }).substring(0, 150);

  const container = document.getElementById("admin-api-matches-container");
  if (!container) return;
  
  const bulkBar = document.getElementById("admin-bulk-actions-bar");
  if (bulkBar) {
    bulkBar.style.display = "none";
    bulkBar.classList.add("hidden");
  }
  
  const overviewContainer = document.getElementById("google-ai-overview-container");
  const overviewText = document.getElementById("google-ai-overview-text");

  // Intentar servir desde la caché estructurada de 8 días (Recomendación 3)
  const cacheKey = `qia_ai_cache_${category}`;
  
  const cachedDataStr = isCustomScan ? null : localStorage.getItem(cacheKey);

  if (cachedDataStr) {
    try {
      const cachedData = decryptAISearchData(cachedDataStr);
      const cacheAge = Date.now() - (cachedData.timestamp || 0);
      if (cacheAge < 5 * 60 * 1000) { // TTL de 5 minutos
        console.log(`⚡ [Google AI Mode] Sirviendo caché para la categoría: ${category} (${Math.round(cacheAge/1000)}s de antigüedad)`);
        
        if (overviewContainer && overviewText && cachedData.overview) {
          overviewText.innerHTML = cachedData.overview;
          overviewContainer.classList.remove("hidden");
        }
        
        container.innerHTML = "";
        if (!cachedData.matches || cachedData.matches.length === 0) {
          container.innerHTML = "<div class='text-center text-xs opacity-40 py-20 uppercase tracking-widest'>No se encontraron partidos en los próximos 8 días.</div>";
          if (bulkBar) {
            bulkBar.style.display = "none";
            bulkBar.classList.add("hidden");
          }
        } else {
          if (bulkBar) {
            bulkBar.style.display = "flex";
            bulkBar.classList.remove("hidden");
            const selectAllCb = document.getElementById("bulk-select-all");
            if (selectAllCb) selectAllCb.checked = false;
            window.updateBulkSelectedCount();
          }
          cachedData.matches.forEach(s => {
            const div = document.createElement("div");
            div.className = "flex justify-between items-center p-12 bg-white/5 rounded-xl border border-black/5 text-xxs font-bold uppercase tracking-wider hover:bg-white/10 transition-all";
            div.style.marginBottom = "8px";
            
            let dateStr = "TBA";
            try {
              const d = new Date(s.date);
              dateStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            } catch(e) {}

            const attractVal = s.attraction_index || 80;
            let attractColor = "#00e5ff";
            let attractText = "Recomendado";
            let attractGlow = "";
            if (attractVal >= 95) {
              attractColor = "#ffd700"; // Dorado Premium
              attractText = "Élite 🔥";
              attractGlow = "text-shadow: 0 0 10px rgba(255, 215, 0, 0.4);";
            } else if (attractVal >= 90) {
              attractColor = "#a855f7"; // Púrpura Alta
              attractText = "Destacado ⚡";
            }

            div.innerHTML = `
              <div class="flex items-center" style="max-width: 65%;">
                <input type="checkbox" class="bulk-match-checkbox w-18 h-18 accent-accent" value="${s.id}" data-local="${s.team_local}" data-visita="${s.team_visita}" data-date="${s.date}" data-group="${s.group}" data-attraction="${s.attraction_index}" onchange="window.updateBulkSelectedCount()" style="width: 18px; height: 18px; opacity: 1; -webkit-appearance: checkbox; appearance: checkbox; margin-right: 12px; cursor: pointer; flex-shrink: 0; position: relative; z-index: 10;">
                <div class="flex flex-col" style="text-align: left;">
                  <span class="text-xs font-black text-primary" style="font-size: 11px; font-weight: 900;">${s.team_local} vs ${s.team_visita}</span>
                  <span class="text-xxxxs opacity-35 mt-2 flex items-center gap-4" style="margin-top: 4px; font-size: 8px;"><i class="ri-calendar-line"></i> ${dateStr}</span>
                  <span class="text-[8px] opacity-45 lowercase italic mt-4" style="text-transform: none; line-height: 1.2; margin-top: 4px; display: block; font-size: 8px;">${s.reason || ''}</span>
                </div>
              </div>
              <div class="flex flex-col items-end gap-6" style="gap: 6px;">
                <span class="text-[7px] font-black uppercase px-6 py-2 rounded-full" style="font-size: 7px; font-weight: 900; background: ${attractColor}20; color: ${attractColor}; border: 1px solid ${attractColor}30; ${attractGlow}">${attractText} IA ${attractVal}%</span>
                <span class="text-[8px] bg-purple-500/10 text-purple-600 px-6 py-2 rounded-full border border-purple-500/20 font-black" style="font-size: 8px; font-weight: 900;">${s.group}</span>
                <button onclick="window.adminAddFromAPI('${s.id}', '${s.team_local}', '${s.team_visita}', '${s.date}', '${s.group}', ${s.attraction_index})" class="bg-[#4285F4] text-white px-10 py-5 rounded-xl text-[9px] uppercase font-black hover:opacity-90 transition-all shadow-[0_0_10px_rgba(66,133,244,0.15)]" style="border: none; cursor: pointer; border-radius: 12px; font-size: 9px; font-weight: 900; padding: 5px 10px;">Agregar</button>
              </div>
            `;
            container.appendChild(div);
          });
        }
        
        showToast(`Búsqueda (Caché rápida) completada para: ${category.toUpperCase()}`, "success");
        return;
      }
    } catch(e) {
      console.warn("Error cargando caché rápida", e);
    }
  }

  showToast("Preguntando al buscador de Google con Modo IA...", "info");
  
  // Ocultar el overview actual de inmediato
  if (overviewContainer) overviewContainer.classList.add("hidden");

  // Mostrar el ESQUELETO DE CARGA (Skeleton Loading UI)
  container.innerHTML = `
    <!-- Google AI Overview Skeleton -->
    <div class="p-16 rounded-2xl border mb-15 skeleton-card" style="background: rgba(66, 133, 244, 0.03); border-color: rgba(66, 133, 244, 0.1); padding: 16px; border-radius: var(--radius-md);">
      <div class="flex items-center gap-6 mb-10 text-[#4285F4] font-black text-[9px] uppercase tracking-widest animate-pulse" style="font-weight:900; font-size:9px; letter-spacing:2px; display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <i class="ri-sparkling-fill animate-spin-slow"></i> Analizando cartelera con Google AI...
      </div>
      <div class="space-y-8" style="display:flex; flex-direction:column; gap:8px;">
        <div class="skeleton-line skeleton-pulse" style="height: 10px; width: 95%;"></div>
        <div class="skeleton-line skeleton-pulse" style="height: 10px; width: 85%;"></div>
        <div class="skeleton-line skeleton-pulse" style="height: 10px; width: 90%;"></div>
      </div>
    </div>

    <!-- Match Cards Skeletons -->
    <div class="space-y-8" style="display:flex; flex-direction:column; gap:8px;">
      ${[1, 2, 3].map(() => `
        <div class="flex justify-between items-center p-12 bg-white/5 rounded-xl border border-black/5 skeleton-card" style="margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:12px;">
          <div class="flex flex-col" style="width: 60%; display:flex; flex-direction:column; gap:6px;">
            <div class="skeleton-line skeleton-pulse" style="height: 12px; width: 80%;"></div>
            <div class="skeleton-line skeleton-pulse" style="height: 8px; width: 45%; margin-top:4px;"></div>
            <div class="skeleton-line skeleton-pulse" style="height: 6px; width: 95%; margin-top:4px;"></div>
          </div>
          <div class="flex flex-col items-end gap-6" style="width: 25%; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <div class="skeleton-line skeleton-pulse" style="height: 14px; width: 55px; border-radius:8px;"></div>
            <div class="skeleton-line skeleton-pulse" style="height: 20px; width: 65px; border-radius:12px; margin-top:6px;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  setTimeout(async () => {
    try {
      const results = await getGoogleAISearchResults(query, category, selectedLeagues, scanDays);
      container.innerHTML = "";
      
      // Mostrar Overview con fade-in suave
      if (overviewContainer && overviewText) {
        overviewText.innerHTML = results.overview;
        overviewContainer.classList.remove("hidden");
      }
      
      if (!results.matches || results.matches.length === 0) {
        container.innerHTML = "<div class='text-center text-xs opacity-40 py-20 uppercase tracking-widest'>No se encontraron partidos en los próximos 8 días.</div>";
        if (bulkBar) {
          bulkBar.style.display = "none";
          bulkBar.classList.add("hidden");
        }
        return;
      }

      if (bulkBar) {
        bulkBar.style.display = "flex";
        bulkBar.classList.remove("hidden");
        const selectAllCb = document.getElementById("bulk-select-all");
        if (selectAllCb) selectAllCb.checked = false;
        window.updateBulkSelectedCount();
      }

      results.matches.forEach(s => {
        const div = document.createElement("div");
        div.className = "flex justify-between items-center p-12 bg-white/5 rounded-xl border border-black/5 text-xxs font-bold uppercase tracking-wider hover:bg-white/10 transition-all";
        div.style.marginBottom = "8px";
        
        let dateStr = "TBA";
        try {
          const d = new Date(s.date);
          dateStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch(e) {}

        const attractVal = s.attraction_index || 80;
        let attractColor = "#00e5ff";
        let attractText = "Recomendado";
        let attractGlow = "";
        if (attractVal >= 95) {
          attractColor = "#ffd700"; // Dorado Premium
          attractText = "Élite 🔥";
          attractGlow = "text-shadow: 0 0 10px rgba(255, 215, 0, 0.4);";
        } else if (attractVal >= 90) {
          attractColor = "#a855f7"; // Púrpura Alta
          attractText = "Destacado ⚡";
        }

        div.innerHTML = `
          <div class="flex items-center" style="max-width: 65%;">
            <input type="checkbox" class="bulk-match-checkbox w-18 h-18 accent-accent" value="${s.id}" data-local="${s.team_local}" data-visita="${s.team_visita}" data-date="${s.date}" data-group="${s.group}" data-attraction="${s.attraction_index}" onchange="window.updateBulkSelectedCount()" style="width: 18px; height: 18px; opacity: 1; -webkit-appearance: checkbox; appearance: checkbox; margin-right: 12px; cursor: pointer; flex-shrink: 0; position: relative; z-index: 10;">
            <div class="flex flex-col" style="text-align: left;">
              <span class="text-xs font-black text-primary" style="font-size: 11px; font-weight: 900;">${s.team_local} vs ${s.team_visita}</span>
              <span class="text-xxxxs opacity-35 mt-2 flex items-center gap-4" style="margin-top: 4px; font-size: 8px;"><i class="ri-calendar-line"></i> ${dateStr}</span>
              <span class="text-[8px] opacity-45 lowercase italic mt-4" style="text-transform: none; line-height: 1.2; margin-top: 4px; display: block; font-size: 8px;">${s.reason || ''}</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-6" style="gap: 6px;">
            <span class="text-[7px] font-black uppercase px-6 py-2 rounded-full" style="font-size: 7px; font-weight: 900; background: ${attractColor}20; color: ${attractColor}; border: 1px solid ${attractColor}30; ${attractGlow}">${attractText} IA ${attractVal}%</span>
            <span class="text-[8px] bg-purple-500/10 text-purple-600 px-6 py-2 rounded-full border border-purple-500/20 font-black" style="font-size: 8px; font-weight: 900;">${s.group}</span>
            <button onclick="window.adminAddFromAPI('${s.id}', '${s.team_local}', '${s.team_visita}', '${s.date}', '${s.group}', ${s.attraction_index})" class="bg-[#4285F4] text-white px-10 py-5 rounded-xl text-[9px] uppercase font-black hover:opacity-90 transition-all shadow-[0_0_10px_rgba(66,133,244,0.15)]" style="border: none; cursor: pointer; border-radius: 12px; font-size: 9px; font-weight: 900; padding: 5px 10px;">Agregar</button>
          </div>
        `;
        container.appendChild(div);
      });
      
      // Guardar en la caché por categorías estructurada con timestamp (Recomendación 3)
      results.timestamp = Date.now();
      results.category = category;
      localStorage.setItem(cacheKey, encryptAISearchData(results));
      
      // Guardar también en la caché global del Buscador Google AI para la carga inicial
      localStorage.setItem("qia_last_ai_search", encryptAISearchData(results));
      showToast(`¡Búsqueda con Google AI completada! Se encontraron ${results.matches.length} partidos.`, "success");
    } catch (err) {
      console.error(err);
      container.innerHTML = "<div class='text-center text-red-500 py-20 uppercase tracking-widest'>Error al consultar Google AI.</div>";
    }
  }, 2200); // Un pequeño retraso para darle realismo a la "búsqueda con IA"
};

// Controlador de clics en los chips de filtros rápidos de Google AI
window.adminSelectAISearchChip = function(queryText, category) {
  const queryInput = document.getElementById("google-ai-search-input");
  if (queryInput) {
    queryInput.value = queryText;
  }
  
  // Actualizar clases activas en los chips
  const categories = ["todos", "euro", "copa", "local"];
  categories.forEach(cat => {
    const el = document.getElementById(`chip-ai-${cat}`);
    if (el) el.classList.toggle("active", cat === category);
  });
  
  // Lanzar la búsqueda de inmediato
  window.adminSearchGoogleAI(category);
};

// Limpiar específicamente la caché de la barra de búsqueda IA al instante
window.clearAISearchCacheOnly = function() {
  localStorage.removeItem("qia_last_ai_search");
  localStorage.removeItem("qia_ai_cache_todos");
  localStorage.removeItem("qia_ai_cache_euro");
  localStorage.removeItem("qia_ai_cache_copa");
  localStorage.removeItem("qia_ai_cache_local");
  showToast("Caché del buscador IA vaciada. Recargando cartelera...", "success");
  
  // Detectar la categoría activa según la clase del chip
  let activeCategory = 'todos';
  const categories = ["todos", "euro", "copa", "local"];
  categories.forEach(cat => {
    const el = document.getElementById(`chip-ai-${cat}`);
    if (el && el.classList.contains("active")) {
      activeCategory = cat;
    }
  });
  
  // Ocultar barra por lote al limpiar
  const bulkBar = document.getElementById("admin-bulk-actions-bar");
  if (bulkBar) {
    bulkBar.style.display = "none";
    bulkBar.classList.add("hidden");
  }

  window.adminSearchGoogleAI(activeCategory);
};

// Métodos de selección por lote (Bulk Actions)
window.updateBulkSelectedCount = function() {
  const checkboxes = document.querySelectorAll(".bulk-match-checkbox:checked");
  const countSpan = document.getElementById("bulk-selected-count");
  if (countSpan) countSpan.textContent = checkboxes.length;
};

window.toggleSelectAllMatches = function(checked) {
  const checkboxes = document.querySelectorAll(".bulk-match-checkbox");
  checkboxes.forEach(cb => cb.checked = checked);
  window.updateBulkSelectedCount();
};

window.adminAddSelectedBulk = async function() {
  const checkboxes = document.querySelectorAll(".bulk-match-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("Por favor selecciona al menos un partido.", "error");
    return;
  }
  
  showToast(`Agregando ${checkboxes.length} partidos a la Quiniela...`, "info");
  
  for (let cb of checkboxes) {
    const id = cb.value;
    const local = cb.getAttribute("data-local");
    const visita = cb.getAttribute("data-visita");
    const date = cb.getAttribute("data-date");
    const group = cb.getAttribute("data-group");
    const attraction = Number(cb.getAttribute("data-attraction")) || 80;
    
    const f = {
      id: "espn-" + id,
      team_local: local,
      team_visita: visita,
      score_local: 0,
      score_visita: 0,
      status: "upcoming",
      priority: attraction > 85 ? "high" : "normal",
      date: date,
      attraction_index: attraction,
      group: group
    };
    
    await addFixture(f);
  }
  
  showToast(`¡Se agregaron ${checkboxes.length} partidos con éxito!`, "success");
  
  // Limpiar selección de Todos
  const allSelectCb = document.getElementById("bulk-select-all");
  if (allSelectCb) allSelectCb.checked = false;
  
  // Recargar vistas de administración y cliente
  loadAdminPanel();
  window.refreshPanelData('dashboard');
  window.refreshPanelData('play');
};

// Limpiar de forma manual y absoluta la caché del navegador/Service Worker
window.forceClearAppCache = async function() {
  showToast("Limpiando caché del Service Worker...", "info");
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
      }
      
      const cacheNames = await caches.keys();
      for (let cacheName of cacheNames) {
        await caches.delete(cacheName);
      }
      
      localStorage.removeItem("logo_webp_cache");
      localStorage.removeItem("qia_last_ai_search");
      localStorage.removeItem("qia_ai_cache_todos");
      localStorage.removeItem("qia_ai_cache_euro");
      localStorage.removeItem("qia_ai_cache_copa");
      localStorage.removeItem("qia_ai_cache_local");
      
      showToast("Caché eliminada con éxito. Reiniciando aplicación...", "success");
      setTimeout(() => {
        window.location.reload(true);
      }, 1500);
    } catch (err) {
      showToast("Error al limpiar caché: " + err.message, "error");
    }
  } else {
    showToast("Caché no soportada en este navegador.", "info");
  }
};

window.adminAddFromAPI = async function(id, local, visita, date, group, attraction) {
  const f = {
    id: "espn-" + id,
    team_local: local,
    team_visita: visita,
    score_local: 0,
    score_visita: 0,
    status: "upcoming",
    priority: attraction > 85 ? "high" : "normal",
    date: date,
    attraction_index: attraction,
    group: group
  };
  
  await addFixture(f);
  showToast(`¡${local} vs ${visita} agregado a la Quiniela!`, "success");
  loadAdminPanel();
  window.refreshPanelData('dashboard');
  window.refreshPanelData('play');
};

// Enviar comprobante por WhatsApp (Wallet)
window.sendVoucherWhatsApp = function() {
  if (!currentUser) return;
  let msg = `*🎫 QUINIELA Quiniela Mundialista - SOLICITUD DE RECARGA *\n`;
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

// ── RENDERIZADOR DE TICKETS DE USUARIO ───────────────────────────────────
// Estrategia dual: consulta Firestore Y localStorage, fusiona sin duplicados.
// Garantiza que los tickets aparezcan sin importar en qué modo se crearon.
async function renderUserTickets() {
  const container = document.getElementById("user-tickets-container");
  if (!container || !currentUser) return;

  container.innerHTML = `<p class="text-xxs opacity-30 text-center uppercase tracking-widest py-10">Cargando jugadas...</p>`;

  const userId = currentUser.email || currentUser.phone;
  console.log("🎫 [renderUserTickets] Buscando tickets para userId:", userId);

  // --- ESTRATEGIA DUAL: Firestore + localStorage ---
  let firestoreTickets = [];
  let localTickets = [];

  // 1. Buscar en Firestore (función getUserTickets ya tiene su propio fallback)
  try {
    firestoreTickets = await getUserTickets(userId);
    console.log("🔥 [Firestore] Tickets encontrados:", firestoreTickets.length);
  } catch(e) {
    console.warn("⚠️ [Firestore] Error al obtener tickets:", e);
  }

  // 2. Buscar también en localStorage directamente (por si quedaron en modo simulación)
  try {
    const localList = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    localTickets = localList.filter(t =>
      t.user_id === currentUser.phone || t.user_id === currentUser.email
    );
    console.log("💾 [localStorage] Tickets encontrados:", localTickets.length);
  } catch(e) {
    console.warn("⚠️ [localStorage] Error al leer tickets:", e);
  }

  // 3. Fusionar ambas fuentes eliminando duplicados por ID
  const ticketMap = new Map();
  [...firestoreTickets, ...localTickets].forEach(t => {
    if (!ticketMap.has(t.id)) ticketMap.set(t.id, t);
  });
  const userTickets = Array.from(ticketMap.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  console.log("✅ [renderUserTickets] Total tickets únicos a mostrar:", userTickets.length);

  // Actualizar contador de jugadas activas
  const activeCount = userTickets.filter(t => t.status === "active").length;
  const statEl = document.getElementById("stat-active-tickets");
  if (statEl) statEl.textContent = activeCount;

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

    if (t.status === "reserved") {
      statusColor = "text-yellow-400 font-black";
      statusText = "⏳ Reservada (pago pendiente)";
    } else if (t.status === "checked") {
      statusColor = "text-[#00ff88]";
      const prize = Number(t.prize) || 0;
      statusText = `${t.hits || 0} Aciertos (${prize > 0 ? '🏆 Ganador $' + prize.toFixed(1) : 'Sin Premio'})`;
    } else if (t.status === "active") {
      const userBalance = Number(currentUser.balance);
      if (isNaN(userBalance) || userBalance < 0) {
        statusColor = "text-red-500 font-black";
        statusText = "INACTIVA (SIN SALDO)";
      }
    }

    div.innerHTML = `
      <div class="flex flex-col">
        <span>${t.id}</span>
        <span class="text-xxxxs opacity-30 mt-2">${new Date(t.created_at).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
      </div>
      <div class="flex flex-col items-end gap-2">
        <span class="${statusColor}">${statusText}</span>
        <span class="text-[8px] opacity-40 font-black">$${Number(t.total_cost).toFixed(2)} MXN</span>
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
  const nameInput = document.getElementById("onboard-name");
  const aliasInput = document.getElementById("onboard-alias");
  const pinInput = document.getElementById("onboard-pin");
  
  if (!nameInput || !aliasInput || !pinInput) return;
  
  const name = nameInput.value.trim();
  const alias = aliasInput.value.trim();
  const pin = pinInput.value.trim();
  
  if (!name || !alias || alias.length < 3) {
    showToast("Por favor ingresa tu nombre y un apodo de al menos 3 caracteres.", "error");
    return;
  }
  
  // Validar formato del alias (Sugerencia 1)
  const aliasRegex = /^[a-zA-Z0-9_]{3,15}$/;
  if (!aliasRegex.test(alias.toLowerCase())) {
    showToast("Alias no válido. Solo letras, números o guiones bajos (3-15 carac.).", "error");
    return;
  }
  
  // Validar PIN (4 dígitos numéricos) (Sugerencia 2)
  if (!/^\d{4}$/.test(pin)) {
    showToast("Por favor ingresa un PIN de seguridad de exactamente 4 dígitos numéricos.", "error");
    return;
  }
  
  const loginForm = document.getElementById("login-form-container");
  if (loginForm) loginForm.classList.add("hidden");
  const loginLoading = document.getElementById("login-loading-container");
  if (loginLoading) loginLoading.classList.remove("hidden");
  
  const cleanAlias = alias.toLowerCase();
  const email = cleanAlias + "@quinielamundialista.mx";
  
  import('./app_db.js').then(async dbMod => {
    try {
      // Intentar buscar si el usuario ya existe en base de datos
      const existingUser = await dbMod.getUserData(email);
      
      if (existingUser) {
        // 1. Verificar si está bloqueado temporalmente (Sugerencia 2)
        const lockoutTime = localStorage.getItem("qia_lockout_until_" + email);
        if (lockoutTime && Date.now() < Number(lockoutTime)) {
          const minsLeft = Math.ceil((Number(lockoutTime) - Date.now()) / 60000);
          showToast(`❌ Acceso bloqueado. Intenta de nuevo en ${minsLeft} min.`, "error");
          if (loginLoading) loginLoading.classList.add("hidden");
          if (loginForm) loginForm.classList.remove("hidden");
          return;
        }

        // Validación de PIN anti-suplantación ultra-segura
        if (!existingUser.pin || existingUser.pin !== pin) {
          // Incrementar intentos fallidos
          let attempts = Number(localStorage.getItem("qia_failed_attempts_" + email) || 0) + 1;
          localStorage.setItem("qia_failed_attempts_" + email, attempts);
          
          if (attempts >= 3) {
            // Bloquear por 15 minutos
            const lockUntil = Date.now() + 15 * 60 * 1000;
            localStorage.setItem("qia_lockout_until_" + email, lockUntil);
            localStorage.removeItem("qia_failed_attempts_" + email);
            showToast("❌ Demasiados intentos fallidos. Bloqueado por 15 minutos.", "error");
            
            // Log de auditoría
            await dbMod.createGovernanceLog(
              "Bloqueo de Cuenta",
              `Se bloqueó temporalmente el acceso por 15 minutos al alias @${alias} tras 3 intentos fallidos de PIN.`,
              { phone: "sistema", email: email, alias: alias }
            );
          } else {
            showToast(`❌ PIN incorrecto. Intentos restantes: ${3 - attempts}`, "error");
          }
          
          if (loginLoading) loginLoading.classList.add("hidden");
          if (loginForm) loginForm.classList.remove("hidden");
          return;
        }
        
        // PIN Correcto: Limpiar contadores de bloqueo
        localStorage.removeItem("qia_failed_attempts_" + email);
        localStorage.removeItem("qia_lockout_until_" + email);
        
        // Loguear como usuario existente (conserva su saldo y estadísticas!)
        currentUser = existingUser;
        // Asegurar que el current user local esté guardado (encriptado)
        localStorage.setItem("qia_current_user", JSON.stringify(dbMod.encryptData(existingUser)));
        showToast(`🏟️ ¡Bienvenido de nuevo, @${alias}!`, "success");
      } else {
        // Crear un usuario nuevo e irrepetible con su PIN seguro
        const newUser = {
          phone: "jugador_" + Date.now(),
          email: email,
          name: name,
          alias: alias,
          pin: pin, // Guardar el PIN (será encriptado en registerOrLoginUser)
          balance: 0, // Saldo inicial 0
          is_admin: false, // Sin admin
          created_at: new Date().toISOString()
        };
        currentUser = await dbMod.registerOrLoginUser(newUser);
        showToast(`🏟️ ¡Bienvenido al Estadio, @${alias}!`, "success");
      }
      
      document.getElementById("onboarding-view").classList.add("hidden");
      loadAppView();
    } catch(e) {
      console.error(e);
      showToast("Error al ingresar: " + e.message, "error");
      if (loginLoading) loginLoading.classList.add("hidden");
      if (loginForm) loginForm.classList.remove("hidden");
    }
  }).catch(e => {
      console.error(e);
      showToast("Error crítico al cargar entorno.", "error");
      if (loginLoading) loginLoading.classList.add("hidden");
      if (loginForm) loginForm.classList.remove("hidden");
  });
};

// ==========================================
// ADMIN (GOD MODE) LOGIC
// ==========================================

window.promptAdminAccess = async function() {
  // Restringir acceso estricto: Solo Andres con apodo YoY puede acceder
  const cleanName = (currentUser?.name || "").trim().toLowerCase();
  const cleanAlias = (currentUser?.alias || "").trim().toLowerCase();
  
  if (cleanName !== "andres" || cleanAlias !== "yoy") {
    showToast("🚫 Acceso Denegado: Solo el Administrador principal @YoY (Andres) tiene permisos.", "error");
    return;
  }

  const cfg = await getSystemConfig();
  const adminPin = cfg?.admin_pin || "569323";
  
  const input = prompt("🔐 INGRESA PIN MAESTRO:");
  if (input === adminPin) {
    if (currentUser) currentUser.is_admin = true;
    document.getElementById("dock-admin").classList.remove("hidden");
    window.appNavigate("admin");
  } else if (input !== null) {
    showToast("❌ PIN Incorrecto", "error");
  }
};

async function loadAdminPanel() {
  const stats = await getAdminStats();
  if (document.getElementById("admin-stat-users")) {
    document.getElementById("admin-stat-users").textContent = stats.users_count || 0;
    document.getElementById("admin-stat-sales").textContent = `$${(stats.total_sales || 0).toLocaleString()}`;
    const profitEstim = (stats.total_sales || 0) * 0.2; // 20% Admin Profit
    document.getElementById("admin-stat-prizes").textContent = `$${profitEstim.toLocaleString()}`;
  }

  const users = await fetchAllUsers();
  cachedUsersList = users;
  renderAdminUsersTable(users);

  const fixtures = await getFixtures();
  const fbody = document.getElementById("admin-master-quiniela-container");
  if (fbody) {
    fbody.innerHTML = "";
    
    // 1. Obtener partidos que están en las quinielas activas
    const activeTickets = await getActiveTickets();
    const activeMatchIds = new Set();
    activeTickets.forEach(t => {
      if (t.matches) {
        t.matches.forEach(m => activeMatchIds.add(m.match_id));
      }
      if (t.selections) {
        Object.keys(t.selections).forEach(matchId => activeMatchIds.add(matchId));
      }
    });

    const activeFixtures = fixtures.filter(f => activeMatchIds.has(f.id));

    if (activeFixtures.length === 0) {
      fbody.innerHTML = `<div class="text-center text-xs opacity-40 py-20 uppercase tracking-widest" style="font-size: 10px; color: var(--text-primary); text-transform: uppercase;">No hay quinielas activas registradas en este momento. Los partidos aparecerán aquí cuando los usuarios compren sus boletos.</div>`;
    } else {
      // Poblar selecciones actuales
      activeFixtures.forEach(f => {
        if (f.status === 'finished') {
          if (f.result_home > f.result_away) adminMasterSelections[f.id] = 'L';
          else if (f.result_home < f.result_away) adminMasterSelections[f.id] = 'V';
          else adminMasterSelections[f.id] = 'E';
        } else if (f.status === 'canceled') {
          adminMasterSelections[f.id] = 'C';
        }
      });

      activeFixtures.forEach(f => {
        const row = document.createElement("div");
        row.className = "flex justify-between items-center gap-12 py-10 border-b border-white/5";
        row.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
        
        const local = f.team_home || f.team_local || "TBA";
        const visita = f.team_away || f.team_visita || "TBA";
        
        let dateStr = f.date;
        let timeStr = "";
        if (f.date && f.date.includes("T")) {
          try {
            const d = new Date(f.date);
            if (!isNaN(d.getTime())) {
              dateStr = d.toLocaleDateString();
              timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
          } catch(e) {}
        } else if (f.date && f.date.includes(",")) {
          const parts = f.date.split(",");
          dateStr = parts[0].trim();
          timeStr = parts[1] ? parts[1].trim() : "";
        }

        const sel = adminMasterSelections[f.id] || "";
        
        row.innerHTML = `
          <div class="flex flex-col text-left" style="max-width: 45%; flex-grow: 1;">
            <span class="text-xs font-black text-primary" style="font-size: 11px; font-weight: 900; color: #fff;">${local} vs ${visita}</span>
            <span class="text-xxxxs opacity-35 mt-2 flex items-center gap-4" style="font-size: 8px; margin-top: 4px; color: rgba(255,255,255,0.4);"><i class="ri-calendar-line"></i> ${dateStr} ${timeStr} | ${f.group || "LIGA MX"}</span>
          </div>
          
          <div class="flex items-center gap-6" style="display: flex; gap: 6px; align-items: center;">
            <div class="bet-selector-grid" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; width: 140px;">
              <button id="btn-master-${f.id}-L" class="bet-btn text-[8px] ${sel === 'L' ? 'selected' : ''}" onclick="window.selectMasterResult('${f.id}', 'L')" style="font-size: 8px; padding: 4px 6px; border-radius: 6px;">L</button>
              <button id="btn-master-${f.id}-E" class="bet-btn text-[8px] ${sel === 'E' ? 'selected' : ''}" onclick="window.selectMasterResult('${f.id}', 'E')" style="font-size: 8px; padding: 4px 6px; border-radius: 6px;">E</button>
              <button id="btn-master-${f.id}-V" class="bet-btn text-[8px] ${sel === 'V' ? 'selected' : ''}" onclick="window.selectMasterResult('${f.id}', 'V')" style="font-size: 8px; padding: 4px 6px; border-radius: 6px;">V</button>
            </div>
            
            <button id="btn-master-${f.id}-C" class="bet-btn text-[8px]" onclick="window.selectMasterResult('${f.id}', 'C')" style="font-size: 8px; padding: 4px 6px; border-radius: 6px; background: ${sel === 'C' ? '#e3a869' : 'rgba(227,168,105,0.1)'}; border: 1px solid rgba(227,168,105,0.25); color: ${sel === 'C' ? '#000' : '#e3a869'}; width: 28px;" title="Cancelar partido">C</button>
            
            <button onclick="window.adminDeleteFixture('${f.id}')" class="btn text-xs p-6" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #ef4444; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; cursor: pointer; border: none;" title="Eliminar partido">🗑</button>
          </div>
        `;
        fbody.appendChild(row);
      });
    }
  }

  const logs = await getGovernanceLogs();
  const lbody = document.getElementById("admin-logs-list");
  if (lbody) {
    lbody.innerHTML = "";
    logs.forEach(l => {
      const tr = document.createElement("tr");
      tr.className = "border-b border-black border-opacity-10 text-xs";
      tr.innerHTML = `
        <td class="py-10 opacity-70">${new Date(l.created_at).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
        <td class="py-10 font-bold ">${l.details}</td>
        <td class="py-10 text-accent opacity-80">@${l.user_alias}</td>
      `;
      lbody.appendChild(tr);
    });
  }
}

// Controladores de la Quiniela Maestra para Lote de Resultados
window.selectMasterResult = function(matchId, selection) {
  if (adminMasterSelections[matchId] === selection) {
    delete adminMasterSelections[matchId];
  } else {
    adminMasterSelections[matchId] = selection;
  }
  
  ["L", "E", "V", "C"].forEach(op => {
    const btn = document.getElementById(`btn-master-${matchId}-${op}`);
    if (btn) {
      btn.classList.toggle("selected", op === adminMasterSelections[matchId]);
      if (op === 'C') {
        btn.style.background = op === adminMasterSelections[matchId] ? "#e3a869" : "rgba(227,168,105,0.1)";
        btn.style.color = op === adminMasterSelections[matchId] ? "#000" : "#e3a869";
      }
    }
  });
};

window.adminSaveMasterQuiniela = async function() {
  const matchesToUpdate = Object.keys(adminMasterSelections);
  if (matchesToUpdate.length === 0) {
    showToast("No has seleccionado resultados para guardar.", "error");
    return;
  }
  
  showToast("Guardando resultados de la Quiniela Maestra...", "info");
  
  let successCount = 0;
  for (let matchId of matchesToUpdate) {
    const sel = adminMasterSelections[matchId];
    let success = false;
    
    if (sel === 'C') {
      success = await cancelFixture(matchId);
    } else {
      let homeScore = 0;
      let awayScore = 0;
      if (sel === 'L') { homeScore = 1; awayScore = 0; }
      else if (sel === 'V') { homeScore = 0; awayScore = 1; }
      else if (sel === 'E') { homeScore = 1; awayScore = 1; }
      
      success = await updateFixtureScore(matchId, homeScore, awayScore);
    }
    
    if (success) successCount++;
  }
  
  await createGovernanceLog(
    "Guardado Quiniela Maestra",
    `Se definieron resultados para ${successCount} partidos de la cartelera de forma simultánea.`,
    currentUser
  );
  
  localStorage.setItem("qia_live_event", JSON.stringify({ type: 'score', text: `🏆 ¡El Administrador ha publicado los resultados oficiales de la Quiniela Maestra! Revisa tus aciertos en Estadio.`, ts: Date.now() }));
  
  showToast(`✅ Se guardaron ${successCount} resultados correctamente.`, "success");
  
  loadAdminPanel();
  window.refreshPanelData('dashboard');
  window.refreshPanelData('play');
};

window.adminConsultMatchResults = async function() {
  const btn = event && event.currentTarget ? event.currentTarget : document.querySelector('button[onclick="window.adminConsultMatchResults()"]');
  let originalText = '<i class="ri-google-fill mr-2"></i>Consultar Resultados';
  if (btn) {
    originalText = btn.innerHTML;
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin mr-2"></i>Consultando...`;
    btn.disabled = true;
  }
  showToast("Consultando a través del buscador de Google (Modo IA) los resultados...", "info");
  
  try {
    const updatedCount = await autoUpdateMatchResults(false);
    if (updatedCount > 0) {
      showToast(`✅ Se actualizaron automáticamente ${updatedCount} partidos.`, "success");
      localStorage.setItem("qia_live_event", JSON.stringify({ type: 'score', text: `🏆 ¡El Buscador IA ha actualizado los resultados oficiales de la Quiniela! Revisa tus aciertos.`, ts: Date.now() }));
      loadAdminPanel();
      window.refreshPanelData('dashboard');
      window.refreshPanelData('play');
    } else {
      showToast("No se encontraron resultados nuevos o finalizados en la búsqueda.", "info");
    }
  } catch(e) {
    showToast("Error al consultar resultados vía IA.", "error");
    console.error(e);
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
};

function renderAdminUsersTable(usersToRender) {
  const tbody = document.getElementById("admin-users-list");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  usersToRender.forEach(u => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-black border-opacity-10";
    tr.innerHTML = `
      <td class="py-10">
        <div class="font-bold ">${u.name}</div>
        <div class="text-xs opacity-50">@${u.alias || "user"}</div>
      </td>
      <td class="py-10 text-right font-black text-accent">$${(u.balance || 0).toLocaleString()}</td>
      <td class="py-10 text-center">
        <button onclick="window.adminAdjustBalance('${u.id}', '${u.name}')" class="btn text-xs px-10 py-5" style="background: rgba(16,185,129,0.2); border: 1px solid var(--color-primary);">+/–</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.searchAdminUsers = function(query) {
  if (!query || query.trim() === "") {
    renderAdminUsersTable(cachedUsersList);
    return;
  }
  const cleanQuery = query.trim().toLowerCase();
  const filtered = cachedUsersList.filter(u => {
    const nameMatch = u.name && u.name.toLowerCase().includes(cleanQuery);
    const aliasMatch = u.alias && u.alias.toLowerCase().includes(cleanQuery);
    return nameMatch || aliasMatch;
  });
  renderAdminUsersTable(filtered);
};

window.adminAdjustBalance = async function(uid, userName) {
  const input = prompt(`Ajustar saldo de ${userName}\nIngresa el monto a sumar (o valor negativo para restar):`, "0");
  if (input === null || input.trim() === "") return;
  const amount = Number(input);
  if (isNaN(amount)) return showToast("Monto inválido", "error");

  const success = await updateUserBalance(uid, amount);
  if (success) {
    await createGovernanceLog("ADMIN_ADJUST_BALANCE", `Ajuste de $${amount} a ${userName}`, currentUser);
    showToast(`✅ Saldo ajustado en $${amount}`, "success");
    loadAdminPanel();
  } else {
    showToast("❌ Error al ajustar saldo", "error");
  }
};

window.adminAddFixture = async function() {
  const home = prompt("Equipo Local:");
  if (!home) return;
  const away = prompt("Equipo Visitante:");
  if (!away) return;
  const dateStr = prompt("Fecha y Hora (YYYY-MM-DD HH:MM):", "2026-06-11 15:00");
  if (!dateStr) return;
  
  // Validación de Rango Dinámico (Recomendación 2)
  const fixtureDate = new Date(dateStr);
  if (isNaN(fixtureDate.getTime())) {
    showToast("❌ Fecha y hora inválida. Debe ser YYYY-MM-DD HH:MM", "error");
    return;
  }

  const today = new Date();
  const limitDate = new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000);
  
  if (fixtureDate < today || fixtureDate > limitDate) {
    const confirmMsg = `⚠️ ATENCIÓN: La fecha seleccionada (${fixtureDate.toLocaleString('es-MX')}) está fuera del rango ideal de los siguientes 8 días (del ${today.toLocaleDateString('es-MX')} al ${limitDate.toLocaleDateString('es-MX')}).\n\n¿Seguro que deseas agregar este partido de todas formas?`;
    if (!confirm(confirmMsg)) {
      showToast("❌ Operación cancelada. Fecha fuera de rango.", "info");
      return;
    }
  }

  const grp = prompt("Grupo / Fase:", "Group A");

  const newFixture = {
    id: `fix_${Date.now()}`,
    team_home: home,
    team_away: away,
    date: fixtureDate.toISOString(),
    group: grp || "Group A",
    status: "pending",
    result_home: null,
    result_away: null,
    attraction_index: 80
  };

  const success = await addFixture(newFixture);
  if (success) {
    showToast("✅ Partido agregado", "success");
    loadAdminPanel();
  } else {
    showToast("❌ Error al agregar", "error");
  }
};


window.adminDeleteFixture = async function(id) {
  import('./app_db.js').then(async dbMod => {
    const activeTickets = await dbMod.getActiveTickets();
    const isUsed = activeTickets.some(t => {
      if (t.matches) return t.matches.some(m => m.match_id === id);
      if (t.selections) return t.selections[id] !== undefined;
      return false;
    });
    
    if (isUsed) {
      showToast("⚠️ Bloqueo de Gobernanza: No puedes eliminar un partido que ya cuenta con apuestas activas en juego.", "error");
      return;
    }
    
    if (confirm("¿Seguro que deseas eliminar este partido?")) {
      const success = await dbMod.deleteFixture(id);
      if (success) {
        showToast("Partido eliminado", "success");
        loadAdminPanel();
      }
    }
  });
};


window.adminSetScore = async function(id, home, away) {
  const resultHome = prompt(`🏆 Goles de ${home}:`, "0");
  if (resultHome === null) return;
  const resultAway = prompt(`🏆 Goles de ${away}:`, "0");
  if (resultAway === null) return;
  
  if (isNaN(resultHome) || isNaN(resultAway) || resultHome.trim() === "" || resultAway.trim() === "") {
    return showToast("❌ Los goles deben ser números válidos", "error");
  }
  
  const success = await updateFixtureScore(id, resultHome, resultAway);
  if (success) {
    await createGovernanceLog("ADMIN_SET_SCORE", `Marcador guardado: ${home} ${resultHome} - ${resultAway} ${away}`, currentUser);
    localStorage.setItem("qia_live_event", JSON.stringify({ type: 'score', text: `🏆 ¡El partido ${home} vs ${away} ha terminado! Revisa tus aciertos.`, ts: Date.now() }));
    showToast("✅ Resultado guardado correctamente", "success");
    loadAdminPanel();
    window.refreshPanelData('dashboard');
    window.refreshPanelData('play');
  } else {
    showToast("❌ Error al guardar marcador", "error");
  }
};


window.adminClearFixtures = async function() {
  import('./app_db.js').then(async dbMod => {
    const activeTickets = await dbMod.getActiveTickets();
    if (activeTickets.length > 0) {
      showToast("⚠️ Bloqueo de Gobernanza: No puedes vaciar la cartelera si existen quinielas activas registradas en juego.", "error");
      return;
    }
    
    if (confirm("🚨 ¿ESTÁS SEGURO? Esto eliminará TODOS los partidos actuales.")) {
      const success = await dbMod.clearAllFixtures();
      if (success) {
        showToast("Partidos limpiados", "success");
        loadAdminPanel();
        window.refreshPanelData('dashboard');
        window.refreshPanelData('play');
      }
    }
  });
};


window.adminHardResetDatabase = async function() {
  if (confirm("🚨 ¡ADVERTENCIA DE GOBERNANZA MÁXIMA!\n\nEsto restablecerá toda la base de datos local de la aplicación al estado original de fábrica:\n- Eliminará todos los usuarios registrados.\n- Limpiará todas las jugadas y transacciones.\n- Vaciará toda la cartelera de partidos.\n\n¿Estás absolutamente seguro de realizar esta acción irreversible?")) {
    const pin = prompt("Por favor ingresa el PIN de seguridad administrativa para confirmar:");
    if (pin !== "1234" && pin !== "569323") {
      showToast("❌ PIN incorrecto. Operación cancelada por gobernanza.", "error");
      return;
    }
    
    showToast("Restableciendo base de datos local...", "info");
    
    setTimeout(() => {
      localStorage.clear();
      showToast("✅ Base de datos restablecida a valores de fábrica con éxito.", "success");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }, 1500);
  }
};




window.adminExportGovernanceLogs = async function() {
  import('./app_db.js').then(async dbMod => {
    const logs = await dbMod.getGovernanceLogs();
    if (!logs || logs.length === 0) {
      showToast("No hay registros en la bitácora para exportar.", "info");
      return;
    }
    
    // Crear archivo CSV con BOM UTF-8 para compatibilidad absoluta con Excel
    let csvContent = "\uFEFF";
    csvContent += "Fecha/Hora,Accion,Detalle,Usuario\n";
    
    logs.forEach(log => {
      const date = new Date(log.created_at || log.timestamp).toLocaleString('es-MX');
      const action = `"${(log.action || '').replace(/"/g, '""')}"`;
      const detail = `"${(log.detail || '').replace(/"/g, '""')}"`;
      const user = `"${(log.user_alias || log.user || '').replace(/"/g, '""')}"`;
      csvContent += `${date},${action},${detail},${user}\n`;
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bitacora_gobernanza_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("¡Bitácora exportada exitosamente a CSV!", "success");
  });
};

window.adminSimulateAPI = async function() {
  if (!confirm("Esto descargará e insertará los partidos de la Jornada 1 del Mundial (Mock). ¿Continuar?")) return;
  
  const mockFixtures = [
    { id: "fix_api_1", team_home: "USA", team_away: "Mexico", date: new Date(Date.now() + 86400000).toISOString(), group: "Group A", status: "pending", result_home: null, result_away: null, attraction_index: 95 },
    { id: "fix_api_2", team_home: "Canada", team_away: "Panama", date: new Date(Date.now() + 86400000*2).toISOString(), group: "Group B", status: "pending", result_home: null, result_away: null, attraction_index: 80 },
    { id: "fix_api_3", team_home: "Argentina", team_away: "Brazil", date: new Date(Date.now() + 86400000*3).toISOString(), group: "Group C", status: "pending", result_home: null, result_away: null, attraction_index: 100 },
    { id: "fix_api_4", team_home: "Spain", team_away: "Germany", date: new Date(Date.now() + 86400000*4).toISOString(), group: "Group D", status: "pending", result_home: null, result_away: null, attraction_index: 90 }
  ];

  showToast("⏳ Conectando con API-Football...", "info");
  setTimeout(async () => {
    const success = await batchAddFixtures(mockFixtures);
    if (success) {
      await createGovernanceLog("ADMIN_API_SYNC", "Sincronización masiva de Partidos vía API", currentUser);
      showToast("✅ API Sincronizada", "success");
      loadAdminPanel();
      window.refreshPanelData('dashboard');
      window.refreshPanelData('play');
    } else {
      showToast("❌ Error al guardar datos de API", "error");
    }
  }, 1500);
};

window.handleCSVUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split("\n");
    const fixturesToAdd = [];
    
    // Saltamos la línea de encabezado y parseamos
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(",");
      if (cols.length >= 5) {
        // Anti-injection sanitization
        const home = cols[0].replace(/[<>"'=\/]/g, "").trim();
        const away = cols[1].replace(/[<>"'=\/]/g, "").trim();
        const dateStr = cols[2].trim() + "T" + cols[3].trim() + ":00";
        const grp = cols[4].replace(/[<>"'=\/]/g, "").trim();
        
        try {
          const validDate = new Date(dateStr);
          fixturesToAdd.push({
            id: `fix_csv_${Date.now()}_${i}`,
            team_home: home,
            team_away: away,
            date: validDate.toISOString(),
            group: grp,
            status: "pending",
            result_home: null,
            result_away: null,
            attraction_index: 80
          });
        } catch (err) {
          console.warn("Fila con fecha inválida:", lines[i]);
        }
      }
    }
    
    if (fixturesToAdd.length > 0) {
      const success = await batchAddFixtures(fixturesToAdd);
      if (success) {
        await createGovernanceLog("ADMIN_CSV_IMPORT", `Importados ${fixturesToAdd.length} partidos por CSV`, currentUser);
        showToast(`✅ ${fixturesToAdd.length} Partidos importados`, "success");
        loadAdminPanel();
        window.refreshPanelData('dashboard');
        window.refreshPanelData('play');
      } else {
        showToast("❌ Error subiendo CSV a la nube", "error");
      }
    } else {
      showToast("⚠️ Archivo vacío o formato incorrecto", "info");
    }
    event.target.value = ""; // Limpiar input
  };
  
  reader.readAsText(file);
};

window.adminCancelFixture = async function(id) {
  if (!confirm("🚨 ¿Seguro que deseas CANCELAR este partido? Se dará por acertado a todos los que lo pronosticaron.")) return;
  const success = await cancelFixture(id);
  if (success) {
    await createGovernanceLog("ADMIN_CANCEL_MATCH", `Partido ${id} cancelado`, currentUser);
    localStorage.setItem("qia_live_event", JSON.stringify({ type: 'cancel', text: `⛔ Un partido ha sido cancelado. Se considerará acierto para todos los participantes.`, ts: Date.now() }));
    showToast("✅ Partido cancelado", "success");
    loadAdminPanel();
    window.refreshPanelData('dashboard');
    window.refreshPanelData('play');
  } else {
    showToast("❌ Error al cancelar", "error");
  }
};

let userChart = null;
async function renderPerformanceChart() {
  const ctx = document.getElementById('performanceChart');
  if (!ctx) return;
  
  const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
  const myTickets = tickets.filter(t => t.user_id === currentUser.alias || t.user_id === currentUser.phone || t.user_id === currentUser.email);
  
  const labels = myTickets.map((t, i) => `Jornada ${i + 1}`);
  const data = myTickets.map(t => t.hits || 0);
  
  if (userChart) {
    userChart.destroy();
  }
  
  userChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['Semana 1'],
      datasets: [{
        label: 'Aciertos por Quiniela',
        data: data.length > 0 ? data : [0],
        borderColor: '#cd7f32',
        backgroundColor: 'rgba(205, 127, 50, 0.2)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#cd7f32',
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          beginAtZero: true, 
          max: 14, 
          ticks: { color: '#000', stepSize: 2 } 
        },
        x: { ticks: { color: '#000' } }
      }
    }
  });
}

// 🌐 Receptor de Notificaciones Globales en Tiempo Real (Cross-Tab)
window.addEventListener('storage', function(e) {
  if (e.key === 'qia_live_event') {
    if (e.newValue) {
      try {
        const eventData = JSON.parse(e.newValue);
        // Evitamos notificaciones repetidas
        if (Date.now() - eventData.ts < 5000) {
          showToast(eventData.text, "info");
        }
      } catch (err) {}
    }
  }
});

// 🚨 Receptor de Alertas para Administrador (Recargas)
window.addEventListener('storage', function(e) {
  if (e.key === 'qia_admin_alert' && e.newValue) {
    if (currentUser && currentUser.is_admin) {
      try {
        const alertData = JSON.parse(e.newValue);
        if (Date.now() - alertData.ts < 5000) {
          // Sonido de Caja Registradora / Campanilla
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
            osc.start();
            osc.stop(ctx.currentTime + 1);
          } catch(err) { console.warn("No se pudo reproducir el sonido de recarga", err); }

          showToast(`🚨 RECARGA SOLICITADA: ${alertData.user} ha depositado $${alertData.amount.toFixed(2)}`, "success");
          if (currentPanel === "admin") {
            loadAdminPanel();
          }
        }
      } catch (err) {}
    }
  }
});
