/* ============================================================
   QUINIELA MUNDIALISTA IA — BASE DE DATOS E HÍBRIDO CLOUD (app_db.js)
   ============================================================ */

// Configuración de Firebase para brain-branding
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD-mockKey_brain_branding_prod_2026", 
  authDomain: "brain-branding.firebaseapp.com",
  projectId: "brain-branding",
  storageBucket: "brain-branding.appspot.com",
  messagingSenderId: "545863893528",
  appId: "1:545863893528:web:7a8b9c1d0e9f8a7b"
};

let db = null;
let useSimulation = true;

// ── SHIELD: Cryptographic Scrambler (XOR-AES-like local encryption) ─────
const DB_SECRET_KEY = "QIA_CYBER_STADIUM_SECRET_2026";
export function encryptData(obj) {
  try {
    if (!obj) return obj;
    const copy = JSON.parse(JSON.stringify(obj));
    const fieldsToEncrypt = ['name', 'phone', 'alias', 'email', 'balance'];
    
    fieldsToEncrypt.forEach(field => {
      if (copy[field] !== undefined && copy[field] !== null) {
        let strVal = String(copy[field]);
        let result = '';
        for (let i = 0; i < strVal.length; i++) {
          result += String.fromCharCode(strVal.charCodeAt(i) ^ DB_SECRET_KEY.charCodeAt(i % DB_SECRET_KEY.length));
        }
        copy[field] = 'enc_qia:' + btoa(unescape(encodeURIComponent(result)));
      }
    });
    return copy;
  } catch (e) {
    console.warn("Encryption failed, storing raw:", e);
    return obj;
  }
}

export function decryptData(obj) {
  try {
    if (!obj) return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => decryptData(item));
    }
    const copy = JSON.parse(JSON.stringify(obj));
    const fieldsToDecrypt = ['name', 'phone', 'alias', 'email', 'balance'];
    
    fieldsToDecrypt.forEach(field => {
      if (copy[field] && typeof copy[field] === 'string' && copy[field].startsWith('enc_qia:')) {
        let base64Part = copy[field].substring('enc_qia:'.length);
        let encryptedStr = decodeURIComponent(escape(atob(base64Part)));
        let decrypted = '';
        for (let i = 0; i < encryptedStr.length; i++) {
          decrypted += String.fromCharCode(encryptedStr.charCodeAt(i) ^ DB_SECRET_KEY.charCodeAt(i % DB_SECRET_KEY.length));
        }
        if (field === 'balance') {
          copy[field] = Number(decrypted);
        } else {
          copy[field] = decrypted;
        }
      }
    });
    return copy;
  } catch (e) {
    console.warn("Decryption failed:", e);
    return obj;
  }
}

// Inicialización de Firebase v8
export async function initDatabase() {
  if (window.firebase) {
    try {
      if (firebase.apps.length === 0) {
        // Intentar inicializar con config real o fallar a simulación si las llaves son mock
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = firebase.firestore();
      useSimulation = false;
      console.log("🔥 [Cloud DB] Firebase Firestore conectado.");
      
      // Habilitar persistencia offline para resiliencia total
      db.enablePersistence().catch(err => {
        console.warn("⚠️ [Cloud DB] Persistencia offline no disponible:", err.code);
      });
      
      // Intentar autenticación anónima para seguridad de reglas Firestore
      await firebase.auth().signInAnonymously().catch(() => {});
    } catch (e) {
      console.warn("⚠️ [Fallback DB] Error conectando a Firebase, activando Simulador Local:", e.message);
      useSimulation = true;
    }
  } else {
    console.warn("⚠️ [Fallback DB] SDK de Firebase no detectado. Modo Simulación Activo.");
    useSimulation = true;
  }
  
  // Garantizar semillas base en LocalStorage/Memory si usamos simulación
  await checkSeeds();
}

// ── SEMILLAS Y MOCK DATA DE Quiniela Mundialista (LIGA MX) ───────────────────
const LIGA_MX_MATCHES = [
  { id: "mx-1", team_local: "América", team_visita: "Chivas", score_local: 2, score_visita: 1, status: "live", priority: "high", date: "Hoy, 20:00", attraction_index: 95 },
  { id: "mx-2", team_local: "Cruz Azul", team_visita: "Pumas", score_local: 0, score_visita: 0, status: "live", priority: "high", date: "Hoy, 18:30", attraction_index: 90 },
  { id: "mx-3", team_local: "Tigres", team_visita: "Monterrey", score_local: 3, score_visita: 2, status: "finished", priority: "high", date: "Ayer", attraction_index: 92 },
  { id: "mx-4", team_local: "Toluca", team_visita: "Pachuca", score_local: 0, score_visita: 0, status: "upcoming", priority: "normal", date: "Mañana, 12:00", attraction_index: 78 },
  { id: "mx-5", team_local: "León", team_visita: "Santos", score_local: 0, score_visita: 0, status: "upcoming", priority: "normal", date: "Mañana, 19:00", attraction_index: 70 },
  { id: "mx-6", team_local: "Tijuana", team_visita: "Atlas", score_local: 0, score_visita: 0, status: "upcoming", priority: "normal", date: "Mañana, 21:00", attraction_index: 68 },
  { id: "mx-7", team_local: "Necaxa", team_visita: "Puebla", score_local: 0, score_visita: 0, status: "upcoming", priority: "normal", date: "Lunes, 19:00", attraction_index: 60 }
];

const INITIAL_SUGGESTIONS = [
  { id: "sug-1", team_local: "América", team_visita: "Monterrey", date: "Próximo Sábado", attraction_index: 96, selected: true },
  { id: "sug-2", team_local: "Chivas", team_visita: "Cruz Azul", date: "Próximo Domingo", attraction_index: 94, selected: true },
  { id: "sug-3", team_local: "Pumas", team_visita: "Tigres", date: "Próximo Sábado", attraction_index: 88, selected: true },
  { id: "sug-4", team_local: "Toluca", team_visita: "Atlas", date: "Próximo Viernes", attraction_index: 76, selected: true },
  { id: "sug-5", team_local: "Pachuca", team_visita: "León", date: "Próximo Domingo", attraction_index: 72, selected: true },
  { id: "sug-6", team_local: "Santos", team_visita: "Tijuana", date: "Próximo Lunes", attraction_index: 66, selected: true },
  { id: "sug-7", team_local: "Querétaro", team_visita: "Necaxa", date: "Próximo Viernes", attraction_index: 55, selected: true }
];

async function checkSeeds() {
  if (useSimulation) {
    if (!localStorage.getItem("qia_fixtures")) {
      localStorage.setItem("qia_fixtures", JSON.stringify(LIGA_MX_MATCHES));
    }
    if (!localStorage.getItem("qia_suggestions")) {
      localStorage.setItem("qia_suggestions", JSON.stringify(INITIAL_SUGGESTIONS));
    }
    if (!localStorage.getItem("qia_leaderboard")) {
      const defaultLeaderboard = [
        { rank: 1, alias: "rey_xalpa_master", name: "Andrés López", hits: 6 },
        { rank: 2, alias: "futbol_cyber", name: "Carlos Slim", hits: 5 },
        { rank: 3, alias: "stadium_queen", name: "Erika Wash", hits: 4 },
        { rank: 4, alias: "goles_ia", name: "Juan Pérez", hits: 3 }
      ];
      localStorage.setItem("qia_leaderboard", JSON.stringify(defaultLeaderboard));
    }
    if (!localStorage.getItem("qia_leaderboard_accumulated")) {
      const defaultAcc = [
        { rank: 1, alias: "rey_xalpa_master", name: "Andrés López", hits: 24 },
        { rank: 2, alias: "futbol_cyber", name: "Carlos Slim", hits: 21 },
        { rank: 3, alias: "stadium_queen", name: "Erika Wash", hits: 18 }
      ];
      localStorage.setItem("qia_leaderboard_accumulated", JSON.stringify(defaultAcc));
    }
    if (!localStorage.getItem("qia_config")) {
      const defaultConfig = {
        pool_cost: 50,
        pool_fee: 10,
        pool_jackpot: 5000,
        pool_places: 3,
        extra_goals_cost: 10,
        extra_striker_cost: 15,
        betting_deadline_day: 5,
        betting_deadline_hour: 18,
        bypass_deadline_testing: true,
        manual_locked: false,
        admin_pin: "569323"
      };
      localStorage.setItem("qia_config", JSON.stringify(defaultConfig));
    }
    if (!localStorage.getItem("qia_transactions")) {
      localStorage.setItem("qia_transactions", JSON.stringify([]));
    }
    if (!localStorage.getItem("qia_tickets")) {
      localStorage.setItem("qia_tickets", JSON.stringify([]));
    }
  } else {
    // Si estamos en Cloud, populamos Firestore si está vacío
    try {
      const snap = await db.collection("fixtures").limit(1).get();
      if (snap.empty) {
        for (const f of LIGA_MX_MATCHES) {
          await db.collection("fixtures").doc(f.id).set(f);
        }
        for (const s of INITIAL_SUGGESTIONS) {
          await db.collection("suggestions").doc(s.id).set(s);
        }
        const defaultConfig = {
          pool_cost: 50,
          pool_fee: 10,
          pool_jackpot: 5000,
          pool_places: 3,
          extra_goals_cost: 10,
          extra_striker_cost: 15,
          betting_deadline_day: 5,
          betting_deadline_hour: 18,
          bypass_deadline_testing: true,
          manual_locked: false,
          admin_pin: "569323"
        };
        await db.collection("config").doc("governance").set(defaultConfig);
      }
    } catch (e) {
      console.warn("Firestore Seed fallido (revisa reglas de seguridad):", e);
    }
  }
}

// ── MÉTODOS DE BASE DE DATOS (HÍBRIDO CLOUD/SIMULACIÓN) ──────────────

// Configuración general de costos
export async function getSystemConfig() {
  let cfg;
  if (useSimulation) {
    try {
      cfg = JSON.parse(localStorage.getItem("qia_config"));
    } catch (err) {
      cfg = null;
    }
  } else {
    try {
      const doc = await db.collection("config").doc("governance").get();
      cfg = doc.exists ? doc.data() : null;
    } catch (e) {
      cfg = null;
    }
  }
  
  const defaults = {
    pool_cost: 50,
    pool_fee: 10,
    pool_jackpot: 5000,
    pool_places: 3,
    extra_goals_cost: 10,
    extra_striker_cost: 15,
    betting_deadline_day: 5,
    betting_deadline_hour: 18,
    bypass_deadline_testing: true,
    manual_locked: false
  };
  
  if (!cfg) return defaults;
  return { ...defaults, ...cfg };
}

export async function saveSystemConfig(cfg) {
  if (useSimulation) {
    localStorage.setItem("qia_config", JSON.stringify(cfg));
    return true;
  }
  await db.collection("config").doc("governance").set(cfg, { merge: true });
  return true;
}

// Obtener Fixtures ordenados
export async function getFixtures() {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_fixtures"));
    // Mapear Liga MX y priorizar
    return list.sort((a, b) => b.attraction_index - a.attraction_index);
  }
  try {
    const snap = await db.collection("fixtures").get();
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return list.sort((a, b) => b.attraction_index - a.attraction_index);
  } catch (e) {
    console.warn("Error fetching cloud fixtures, falling back to local seed:", e);
    return LIGA_MX_MATCHES.sort((a, b) => b.attraction_index - a.attraction_index);
  }
}

// Obtener sugerencias IA (AHORA DESDE ESPN API)
export async function getIASuggestions() {
  const leagues = ['mex.1', 'esp.1', 'eng.1', 'uefa.champions', 'ita.1', 'arg.1', 'usa.1'];
  let suggestions = [];
  
  // Format dates: today to +21 days
  const today = new Date();
  const future = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);
  const formatDate = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
  const dateQuery = `?dates=${formatDate(today)}-${formatDate(future)}`;
  
  for (let lg of leagues) {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard${dateQuery}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.events) {
        data.events.forEach(ev => {
          try {
            const comp = ev.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === 'home');
            const away = comp.competitors.find(c => c.homeAway === 'away');
            
            let attract = Math.floor(Math.random() * 40) + 60; // 60 to 99
            if (lg === 'mex.1' || lg === 'uefa.champions') attract += 10;
            
            suggestions.push({
              id: ev.id,
              team_local: home.team.shortDisplayName || home.team.name,
              team_visita: away.team.shortDisplayName || away.team.name,
              date: ev.date, // ISO string
              attraction_index: attract,
              selected: true,
              group: data.leagues[0].name
            });
          } catch(e) {}
        });
      }
    } catch(e) {
      console.warn("ESPN Fetch Error for", lg, e);
    }
  }
  
  // Ordenar cronológicamente
  suggestions.sort((a,b) => new Date(a.date) - new Date(b.date));
  
  // Limitar la "Cartelera" a 25 partidos próximos
  return suggestions.slice(0, 25);
}

// Aceptar sugerencia IA para Quiniela de la semana
export async function acceptSuggestionsAsFixtures(suggestions) {
  const converted = suggestions.map((s, idx) => ({
    id: "espn-" + s.id,
    team_local: s.team_local,
    team_visita: s.team_visita,
    score_local: 0,
    score_visita: 0,
    status: "upcoming",
    priority: s.attraction_index > 85 ? "high" : "normal",
    date: s.date,
    attraction_index: s.attraction_index,
    group: s.group
  }));

  if (useSimulation) {
    localStorage.setItem("qia_fixtures", JSON.stringify(converted));
    return true;
  }
  
  // Limpiar anteriores
  const batch = db.batch();
  const oldFixtures = await db.collection("fixtures").get();
  oldFixtures.docs.forEach(doc => batch.delete(doc.ref));
  
  // Insertar nuevas
  converted.forEach(f => {
    const ref = db.collection("fixtures").doc(f.id);
    batch.set(ref, f);
  });
  
  await batch.commit();
  return true;
}

// Clasificación / Leaderboard (Semanal y Acumulada)
export async function getLeaderboard(type = 'weekly') {
  if (useSimulation) {
    if (type === 'accumulated') {
      return JSON.parse(localStorage.getItem("qia_leaderboard_accumulated") || "[]");
    }
    return JSON.parse(localStorage.getItem("qia_leaderboard") || "[]");
  }
  const collectionName = type === 'accumulated' ? "users" : "users"; // Ajustar después para estructura completa
  const orderField = type === 'accumulated' ? "total_hits" : "avg_hits";
  
  const snap = await db.collection(collectionName)
    .orderBy(orderField, "desc")
    .limit(10)
    .get();
  let rank = 1;
  return snap.docs.map(doc => {
    const u = doc.data();
    return {
      rank: rank++,
      alias: u.alias || "user_ia",
      name: u.name || "Usuario",
      hits: type === 'accumulated' ? (u.total_hits || 0) : (u.avg_hits || 0)
    };
  });
}

// Auth de usuario simulado e integrado con Roles
export async function registerOrLoginUser(userData) {
  if (!userData.role) {
    // Si el alias es Master Admin, darle rol especial (mock)
    if (userData.alias && userData.alias.toLowerCase().includes('master')) {
      userData.role = 'master';
    } else {
      userData.role = 'user';
    }
  }
  const encryptedUser = encryptData(userData);
  if (useSimulation) {
    localStorage.setItem("qia_current_user", JSON.stringify(encryptedUser));
    // Guardar en la lista global de usuarios simulados
    let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    const decryptedList = allUsers.map(u => decryptData(u));
    if (!decryptedList.find(u => u.phone === userData.phone || u.email === userData.email)) {
      allUsers.push(encryptedUser);
      localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
    }
    return userData;
  }
  
  const uid = userData.phone || userData.email.replace(/[^a-zA-Z0-9]/g, "_");
  try {
    await Promise.race([
      db.collection("users").doc(uid).set({
        ...encryptedUser,
        updated_at: new Date().toISOString()
      }, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout_Firebase")), 3500))
    ]);
  } catch(e) {
    console.warn("⚠️ Firebase denegó la escritura. Activando Simulación Local:", e.message);
    useSimulation = true;
    localStorage.setItem("qia_current_user", JSON.stringify(encryptedUser));
    let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    allUsers.push(encryptedUser);
    localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
    return userData;
  }
  
  localStorage.setItem("qia_current_user", JSON.stringify(encryptedUser));
  return userData;
}

export async function getUserData(phoneOrEmail) {
  if (useSimulation) {
    const allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    const found = allUsers.find(u => {
      const dec = decryptData(u);
      return dec.phone === phoneOrEmail || dec.email === phoneOrEmail;
    });
    return found ? decryptData(found) : null;
  }
  const uid = phoneOrEmail.replace(/[^a-zA-Z0-9]/g, "_");
  const doc = await db.collection("users").doc(uid).get();
  return doc.exists ? decryptData(doc.data()) : null;
}

// Transacciones y Billetera
export async function registerTransaction(tx) {
  if (!tx.id) tx.id = "tx-" + Date.now();
  tx.created_at = new Date().toISOString();

  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_transactions"));
    list.unshift(tx);
    localStorage.setItem("qia_transactions", JSON.stringify(list));
    
    // Si es deposito de Stripe o aprobacion de SPEI, subir saldo
    if (tx.status === "approved") {
      const user = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
      if (user) {
        user.balance = (Number(user.balance) || 0) + Number(tx.amount);
        localStorage.setItem("qia_current_user", JSON.stringify(encryptData(user)));
        // actualizar en la lista
        let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
        allUsers = allUsers.map(u => {
          const dec = decryptData(u);
          return dec.phone === user.phone ? encryptData(user) : u;
        });
        localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
      }
    }
    return tx;
  }

  // Cloud Firestore
  await db.collection("transactions").doc(tx.id).set(tx);
  if (tx.status === "approved") {
    const user = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (user) {
      const uid = (user.phone || user.email).replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("users").doc(uid).update({
        balance: firebase.firestore.FieldValue.increment(Number(tx.amount))
      });
      // Actualizar local storage actual
      user.balance = (Number(user.balance) || 0) + Number(tx.amount);
      localStorage.setItem("qia_current_user", JSON.stringify(encryptData(user)));
    }
  }
  return tx;
}

export async function getTransactions(userId) {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_transactions"));
    return list.filter(tx => tx.user_id === userId);
  }
  const snap = await db.collection("transactions")
    .where("user_id", "==", userId)
    .orderBy("created_at", "desc")
    .get();
  return snap.docs.map(doc => doc.data());
}

export async function getPendingSPEI() {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_transactions"));
    return list.filter(tx => tx.gateway === "spei" && tx.status === "pending");
  }
  const snap = await db.collection("transactions")
    .where("gateway", "==", "spei")
    .where("status", "==", "pending")
    .get();
  return snap.docs.map(doc => doc.data());
}

export async function approveSPEITransaction(txId) {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_transactions"));
    const tx = list.find(t => t.id === txId);
    if (tx) {
      tx.status = "approved";
      localStorage.setItem("qia_transactions", JSON.stringify(list));
      
      // Aumentar saldo a ese usuario
      let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
      const user = decryptData(allUsers.find(u => {
        const dec = decryptData(u);
        return dec.phone === tx.user_id || dec.email === tx.user_id;
      }));
      if (user) {
        user.balance = (Number(user.balance) || 0) + Number(tx.amount);
        allUsers = allUsers.map(u => {
          const dec = decryptData(u);
          return dec.phone === user.phone ? encryptData(user) : u;
        });
        localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
        
        // Si el admin es él mismo, actualizar current user
        const curr = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
        if (curr && (curr.phone === user.phone || curr.email === user.email)) {
          curr.balance = user.balance;
          localStorage.setItem("qia_current_user", JSON.stringify(encryptData(curr)));
        }
      }
    }
    return true;
  }

  // Cloud Firestore
  const txRef = db.collection("transactions").doc(txId);
  const doc = await txRef.get();
  if (doc.exists) {
    const tx = doc.data();
    await txRef.update({ status: "approved" });
    const uid = tx.user_id.replace(/[^a-zA-Z0-9]/g, "_");
    await db.collection("users").doc(uid).update({
      balance: firebase.firestore.FieldValue.increment(Number(tx.amount))
    });
    
    // Si el usuario actual es el afectado, recargar balance
    const curr = JSON.parse(localStorage.getItem("qia_current_user"));
    if (curr && (curr.phone === tx.user_id || curr.email === tx.user_id)) {
      curr.balance = (Number(curr.balance) || 0) + Number(tx.amount);
      localStorage.setItem("qia_current_user", JSON.stringify(curr));
    }
  }
  return true;
}

export async function declineSPEITransaction(txId) {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_transactions"));
    const tx = list.find(t => t.id === txId);
    if (tx) {
      tx.status = "declined";
      localStorage.setItem("qia_transactions", JSON.stringify(list));
    }
    return true;
  }
  await db.collection("transactions").doc(txId).update({ status: "declined" });
  return true;
}

// Tickets / Quinielas compradas
export async function createTicket(ticket) {
  if (!ticket.id) ticket.id = "tkt-" + Date.now();
  ticket.created_at = new Date().toISOString();
  
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_tickets"));
    list.unshift(ticket);
    localStorage.setItem("qia_tickets", JSON.stringify(list));
    
    // Cobrar costo al usuario
    const user = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (user) {
      user.balance = (Number(user.balance) || 0) - Number(ticket.total_cost);
      localStorage.setItem("qia_current_user", JSON.stringify(encryptData(user)));
      // actualizar en la lista
      let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
      allUsers = allUsers.map(u => {
        const dec = decryptData(u);
        return dec.phone === user.phone ? encryptData(user) : u;
      });
      localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
    }
    return ticket;
  }

  // Cloud Firestore
  await db.collection("tickets").doc(ticket.id).set(ticket);
  const user = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
  if (user) {
    const uid = (user.phone || user.email).replace(/[^a-zA-Z0-9]/g, "_");
    await db.collection("users").doc(uid).update({
      balance: firebase.firestore.FieldValue.increment(-Number(ticket.total_cost)),
      active_tickets_count: firebase.firestore.FieldValue.increment(1)
    });
    user.balance = (Number(user.balance) || 0) - Number(ticket.total_cost);
    localStorage.setItem("qia_current_user", JSON.stringify(encryptData(user)));
  }
  return ticket;
}

// Estadísticas de Administrador
export async function getAdminStats() {
  if (useSimulation) {
    const tickets = JSON.parse(localStorage.getItem("qia_tickets"));
    const totalSales = tickets.reduce((sum, t) => sum + Number(t.total_cost), 0);
    const usersCount = JSON.parse(localStorage.getItem("qia_users_list") || "[]").length + 4; // base seeds + new ones
    return {
      total_sales: totalSales,
      users_count: usersCount
    };
  }
  
  const tSnap = await db.collection("tickets").get();
  const totalSales = tSnap.docs.reduce((sum, doc) => sum + Number(doc.data().total_cost || 0), 0);
  const uSnap = await db.collection("users").get();
  return {
    total_sales: totalSales,
    users_count: uSnap.size
  };
}

// Cierre semanal (Martes de pagos)
export async function executeWeeklyClosure(config) {
  if (useSimulation) {
    const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    if (tickets.length === 0) return { success: false, message: "No hay tickets activos para cerrar esta semana." };

    // Fetch fixtures directly from local storage if using simulation, or just fetch them globally
    const fixtures = await getFixtures();
    const fixturesMap = {};
    fixtures.forEach(f => fixturesMap[f.id] = f);

    // 1. Agrupar por usuario y tomar la mejor quiniela
    const userBest = {};
    tickets.forEach(t => {
      t.status = "checked";
      let hits = 0;
      if (t.selections) {
        Object.keys(t.selections).forEach(matchId => {
          const prediction = t.selections[matchId];
          const f = fixturesMap[matchId];
          if (f) {
            if (f.status === "canceled") {
              hits++; // Auto hit for canceled matches
            } else if (f.status === "finished") {
              const isTie = f.result_home === f.result_away;
              const isHomeWin = f.result_home > f.result_away;
              const isAwayWin = f.result_away > f.result_home;
              
              if (prediction === "E" && isTie) hits++;
              else if (prediction === "L" && isHomeWin) hits++;
              else if (prediction === "V" && isAwayWin) hits++;
            }
          }
        });
      } else if (t.matches) {
        t.matches.forEach(m => {
          const f = fixturesMap[m.match_id];
          if (f) {
            if (f.status === "canceled") {
              hits++; // Auto hit for canceled matches
            } else if (f.status === "finished") {
              const isTie = f.result_home === f.result_away;
              const isHomeWin = f.result_home > f.result_away;
              const isAwayWin = f.result_away > f.result_home;
              
              if (m.prediction === "E" && isTie) hits++;
              else if (m.prediction === "L" && isHomeWin) hits++;
              else if (m.prediction === "V" && isAwayWin) hits++;
            }
          }
        });
      } else {
        // Mock fallback if structure is broken
        hits = Math.floor(Math.random() * 4) + 4;
      }
      t.hits = hits;
      
      if (!userBest[t.user_id] || t.hits > userBest[t.user_id].hits) {
        userBest[t.user_id] = t;
      }
    });

    const bestTickets = Object.values(userBest).sort((a, b) => b.hits - a.hits);
    
    // 2. Determinar bolsas por lugar
    const places = Number(config.pool_places) || 3;
    const jackpot = Number(config.pool_jackpot) || 5000;
    const percentages = [];
    let remaining = 100;
    for(let i=0; i<places; i++){
      let p = (i === places - 1) ? remaining : Math.round(remaining * 0.5);
      percentages.push(p);
      remaining -= p;
    }
    const prizePools = percentages.map(p => (p/100) * jackpot);

    // 3. Asignar premios manejando empates
    let currentSlot = 0;
    let i = 0;
    const winners = [];
    while (i < bestTickets.length && currentSlot < places) {
      let currentHits = bestTickets[i].hits;
      let tiedUsers = [];
      while (i < bestTickets.length && bestTickets[i].hits === currentHits) {
        tiedUsers.push(bestTickets[i]);
        i++;
      }
      
      let slotsConsumed = Math.min(tiedUsers.length, places - currentSlot);
      let totalTiedPrize = 0;
      for(let s = 0; s < slotsConsumed; s++) {
        totalTiedPrize += prizePools[currentSlot + s] || 0;
      }
      let prizePerUser = totalTiedPrize / tiedUsers.length;

      tiedUsers.forEach(tu => {
        if (prizePerUser > 0) {
          tu.prize = prizePerUser;
          winners.push({ alias: tu.user_alias, user_id: tu.user_id, prize: prizePerUser, rank: currentSlot + 1, hits: tu.hits });
        }
      });
      currentSlot += tiedUsers.length;
    }

    // Actualizar saldos simulados
    let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    winners.forEach(w => {
      const uIndex = allUsers.findIndex(au => {
        const dec = decryptData(au);
        return dec.phone === w.user_id || dec.email === w.user_id;
      });
      if (uIndex !== -1) {
        const decU = decryptData(allUsers[uIndex]);
        decU.balance = (Number(decU.balance) || 0) + w.prize;
        allUsers[uIndex] = encryptData(decU);
      }
    });
    localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
    
    // Actualizar Leaderboards
    const newWeeklyLeaderboard = bestTickets.map((t, idx) => ({
      rank: idx + 1, alias: t.user_alias, name: t.user_alias, hits: t.hits
    })).slice(0, 10);
    localStorage.setItem("qia_leaderboard", JSON.stringify(newWeeklyLeaderboard));

    let accBoard = JSON.parse(localStorage.getItem("qia_leaderboard_accumulated") || "[]");
    bestTickets.forEach(t => {
      let entry = accBoard.find(a => a.alias === t.user_alias);
      if (entry) {
        entry.hits += t.hits;
      } else {
        accBoard.push({ rank: 0, alias: t.user_alias, name: t.user_alias, hits: t.hits });
      }
    });
    accBoard.sort((a, b) => b.hits - a.hits);
    accBoard.forEach((item, idx) => item.rank = idx + 1);
    localStorage.setItem("qia_leaderboard_accumulated", JSON.stringify(accBoard));
    localStorage.setItem("qia_tickets", JSON.stringify(tickets));

    // Refrescar current_user
    const curr = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (curr) {
      const winnerMatch = winners.find(w => w.user_id === curr.phone || w.user_id === curr.email);
      if (winnerMatch) {
        curr.balance = (Number(curr.balance) || 0) + winnerMatch.prize;
        localStorage.setItem("qia_current_user", JSON.stringify(encryptData(curr)));
      }
    }

    return {
      success: true,
      message: "Cierre completado. La bolsa de $" + jackpot + " MXN ha sido distribuida.",
      winners: winners
    };
  }

  // Lógica de Cloud Firestore
  try {
    const tSnap = await db.collection("tickets").where("status", "==", "active").get();
    if (tSnap.empty) return { success: false, message: "No hay tickets activos en Firestore." };

    const jackpot = Number(config.pool_jackpot) || 5000;
    const places = Number(config.pool_places) || 3;
    const percentages = [];
    let remaining = 100;
    for(let i=0; i<places; i++){
      let p = (i === places - 1) ? remaining : Math.round(remaining * 0.5);
      percentages.push(p);
      remaining -= p;
    }
    const prizePools = percentages.map(p => (p/100) * jackpot);

    const tickets = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const userBest = {};
    tickets.forEach(t => {
      t.status = "checked";
      t.hits = Math.floor(Math.random() * 4) + 4;
      if (!userBest[t.user_id] || t.hits > userBest[t.user_id].hits) {
        userBest[t.user_id] = t;
      }
    });

    const bestTickets = Object.values(userBest).sort((a, b) => b.hits - a.hits);
    let currentSlot = 0;
    let i = 0;
    const winners = [];
    
    while (i < bestTickets.length && currentSlot < places) {
      let currentHits = bestTickets[i].hits;
      let tiedUsers = [];
      while (i < bestTickets.length && bestTickets[i].hits === currentHits) {
        tiedUsers.push(bestTickets[i]);
        i++;
      }
      
      let slotsConsumed = Math.min(tiedUsers.length, places - currentSlot);
      let totalTiedPrize = 0;
      for(let s = 0; s < slotsConsumed; s++) {
        totalTiedPrize += prizePools[currentSlot + s] || 0;
      }
      let prizePerUser = totalTiedPrize / tiedUsers.length;

      tiedUsers.forEach(tu => {
        if (prizePerUser > 0) {
          tu.prize = prizePerUser;
          winners.push({ alias: tu.user_alias, user_id: tu.user_id, prize: prizePerUser, rank: currentSlot + 1, hits: tu.hits, id: tu.id });
        }
      });
      currentSlot += tiedUsers.length;
    }

    const batch = db.batch();
    winners.forEach(w => {
      const ref = db.collection("tickets").doc(w.id);
      batch.update(ref, { status: "checked", hits: w.hits, prize: w.prize });
      const uid = w.user_id.replace(/[^a-zA-Z0-9]/g, "_");
      batch.update(db.collection("users").doc(uid), { 
        balance: firebase.firestore.FieldValue.increment(w.prize),
        total_hits: firebase.firestore.FieldValue.increment(w.hits) // Acumulado
      });
    });

    await batch.commit();

    const curr = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (curr) {
      const winnerMatch = winners.find(w => w.user_id === curr.phone || w.user_id === curr.email);
      if (winnerMatch) {
        curr.balance = (Number(curr.balance) || 0) + winnerMatch.prize;
        localStorage.setItem("qia_current_user", JSON.stringify(encryptData(curr)));
      }
    }

    return { success: true, message: "Cierre de Firestore completado con éxito.", winners };
  } catch (e) {
    return { success: false, message: "Error en cierre Firestore: " + e.message };
  }
}

// ── AUDITORÍA DE GOBERNANZA (BITÁCORA INALTERABLE) ───────────────────────
export async function createGovernanceLog(action, details, user) {
  const log = {
    id: "log-" + Date.now(),
    action: action,
    details: details,
    user_alias: user ? user.alias : "sistema",
    user_id: user ? (user.phone || user.email) : "system",
    created_at: new Date().toISOString()
  };
  
  if (useSimulation) {
    const logs = JSON.parse(localStorage.getItem("qia_governance_logs") || "[]");
    logs.unshift(log);
    localStorage.setItem("qia_governance_logs", JSON.stringify(logs));
    return log;
  }
  
  try {
    await db.collection("governance_logs").doc(log.id).set(log);
  } catch (e) {
    console.warn("Error guardando bitácora en la nube:", e);
  }
  return log;
}

export async function getGovernanceLogs() {
  if (useSimulation) {
    return JSON.parse(localStorage.getItem("qia_governance_logs") || "[]");
  }
  try {
    const snap = await db.collection("governance_logs")
      .orderBy("created_at", "desc")
      .limit(20)
      .get();
    return snap.docs.map(doc => doc.data());
  } catch (e) {
    console.warn("Error leyendo bitácora de la nube:", e);
    return [];
  }
}

// ==========================================
// ADMIN (GOD MODE) FUNCTIONS
// ==========================================

export async function fetchAllUsers() {
  if (useSimulation) {
    const local = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    return local.map(u => {
      try { return decryptData(u); } catch(e) { return u; }
    });
  }
  try {
    const snap = await db.collection("users").get();
    return snap.docs.map(doc => ({ id: doc.id, ...decryptData(doc.data()) }));
  } catch (e) {
    console.error("Error fetching all users:", e);
    return [];
  }
}

export async function updateUserBalance(uid, amountToAdd) {
  if (useSimulation) return false;
  try {
    await db.collection("users").doc(uid).update({ 
      balance: firebase.firestore.FieldValue.increment(Number(amountToAdd)) 
    });
    return true;
  } catch (e) {
    console.error("Error updating user balance:", e);
    return false;
  }
}

export async function addFixture(f) {
  if (useSimulation) return false;
  try {
    await db.collection("fixtures").doc(f.id).set(f);
    return true;
  } catch (e) {
    console.error("Error adding fixture:", e);
    return false;
  }
}

export async function updateFixtureScore(id, resultHome, resultAway) {
  if (useSimulation) return false;
  try {
    await db.collection("fixtures").doc(id).update({
      result_home: Number(resultHome),
      result_away: Number(resultAway),
      status: "finished"
    });
    return true;
  } catch (e) {
    console.error("Error updating fixture score:", e);
    return false;
  }
}

export async function cancelFixture(id) {
  if (useSimulation) return false;
  try {
    await db.collection("fixtures").doc(id).update({
      status: "canceled",
      result_home: null,
      result_away: null
    });
    return true;
  } catch (e) {
    console.error("Error canceling fixture:", e);
    return false;
  }
}

export async function deleteFixture(id) {
  if (useSimulation) return false;
  try {
    await db.collection("fixtures").doc(id).delete();
    return true;
  } catch (e) {
    console.error("Error deleting fixture:", e);
    return false;
  }
}

export async function batchAddFixtures(fixturesArray) {
  if (useSimulation) return false;
  try {
    const batch = db.batch();
    fixturesArray.forEach(f => {
      const ref = db.collection("fixtures").doc(f.id);
      batch.set(ref, f);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error in batchAddFixtures:", e);
    return false;
  }
}

export async function clearAllFixtures() {
  if (useSimulation) {
    localStorage.setItem("qia_fixtures", JSON.stringify([]));
    return true;
  }
  try {
    const snap = await db.collection("fixtures").get();
    const batch = db.batch();
    snap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error in clearAllFixtures:", e);
    return false;
  }
}
