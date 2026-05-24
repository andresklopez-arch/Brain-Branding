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

// ── SEMILLAS Y MOCK DATA DE CYBER STADIUM (LIGA MX) ───────────────────
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
    if (!localStorage.getItem("qia_config")) {
      const defaultConfig = {
        pool_cost: 50,
        pool_fee: 10,
        pool_jackpot: 5000,
        extra_goals_cost: 10,
        extra_striker_cost: 15
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
          extra_goals_cost: 10,
          extra_striker_cost: 15
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
  if (useSimulation) {
    return JSON.parse(localStorage.getItem("qia_config"));
  }
  try {
    const doc = await db.collection("config").doc("governance").get();
    return doc.exists ? doc.data() : {
      pool_cost: 50,
      pool_fee: 10,
      pool_jackpot: 5000,
      extra_goals_cost: 10,
      extra_striker_cost: 15
    };
  } catch (e) {
    return { pool_cost: 50, pool_fee: 10, pool_jackpot: 5000, extra_goals_cost: 10, extra_striker_cost: 15 };
  }
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

// Obtener sugerencias IA
export async function getIASuggestions() {
  if (useSimulation) {
    return JSON.parse(localStorage.getItem("qia_suggestions"));
  }
  const snap = await db.collection("suggestions").get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Aceptar sugerencia IA para Quiniela de la semana
export async function acceptSuggestionsAsFixtures(suggestions) {
  const converted = suggestions.map((s, idx) => ({
    id: "mx-ia-" + idx,
    team_local: s.team_local,
    team_visita: s.team_visita,
    score_local: 0,
    score_visita: 0,
    status: "upcoming",
    priority: s.attraction_index > 85 ? "high" : "normal",
    date: s.date,
    attraction_index: s.attraction_index
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

// Clasificación / Leaderboard
export async function getLeaderboard() {
  if (useSimulation) {
    return JSON.parse(localStorage.getItem("qia_leaderboard"));
  }
  const snap = await db.collection("users")
    .orderBy("avg_hits", "desc")
    .limit(10)
    .get();
  let rank = 1;
  return snap.docs.map(doc => {
    const u = doc.data();
    return {
      rank: rank++,
      alias: u.alias || "user_ia",
      name: u.name || "Usuario",
      hits: u.avg_hits || 0
    };
  });
}

// Auth de usuario simulado e integrado
export async function registerOrLoginUser(userData) {
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
  await db.collection("users").doc(uid).set({
    ...encryptedUser,
    updated_at: new Date().toISOString()
  }, { merge: true });
  
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
  // Simular la asignación de aciertos aleatorios a los tickets y repartición de bolsa
  if (useSimulation) {
    const tickets = JSON.parse(localStorage.getItem("qia_tickets"));
    const leaderboard = JSON.parse(localStorage.getItem("qia_leaderboard"));
    
    if (tickets.length === 0) return { success: false, message: "No hay tickets activos para cerrar esta semana." };

    // Evaluar aciertos (en simulación, evaluamos aciertos aleatorios de 4 a 7 para cada ticket)
    tickets.forEach(t => {
      t.status = "checked";
      t.hits = Math.floor(Math.random() * 4) + 4; // de 4 a 7 aciertos de 7 posibles
    });
    
    // Ordenar tickets por aciertos
    const sorted = [...tickets].sort((a, b) => b.hits - a.hits);
    
    // La bolsa se divide: 1er lugar (50%), 2do lugar (30%), 3er lugar (20%)
    const jackpot = Number(config.pool_jackpot) || 5000;
    const p1 = jackpot * 0.5;
    const p2 = jackpot * 0.3;
    const p3 = jackpot * 0.2;

    const winners = [];
    if (sorted[0]) {
      sorted[0].prize = p1;
      winners.push({ alias: sorted[0].user_alias, prize: p1, rank: 1, hits: sorted[0].hits });
      
      // Pagar premio en balance simulado
      let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
      const winnerUser = allUsers.find(u => u.phone === sorted[0].user_id || u.email === sorted[0].user_id);
      if (winnerUser) {
        winnerUser.balance = (Number(winnerUser.balance) || 0) + p1;
        localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
      }
    }
    if (sorted[1]) {
      sorted[1].prize = p2;
      winners.push({ alias: sorted[1].user_alias, prize: p2, rank: 2, hits: sorted[1].hits });
      
      let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
      const winnerUser = allUsers.find(u => u.phone === sorted[1].user_id || u.email === sorted[1].user_id);
      if (winnerUser) {
        winnerUser.balance = (Number(winnerUser.balance) || 0) + p2;
        localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
      }
    }
    if (sorted[2]) {
      sorted[2].prize = p3;
      winners.push({ alias: sorted[2].user_alias, prize: p3, rank: 3, hits: sorted[2].hits });
      
      let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
      const winnerUser = allUsers.find(u => u.phone === sorted[2].user_id || u.email === sorted[2].user_id);
      if (winnerUser) {
        winnerUser.balance = (Number(winnerUser.balance) || 0) + p3;
        localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
      }
    }

    // Actualizar Leaderboard semanal con los ganadores reales
    const newLeaderboard = winners.map(w => ({
      rank: w.rank,
      alias: w.alias,
      name: w.alias === "Admin" ? "Administrador" : w.alias,
      hits: w.hits
    }));
    
    // Rellenar leaderboard con otros seeds para que no quede vacía
    while (newLeaderboard.length < 4) {
      newLeaderboard.push({ rank: newLeaderboard.length + 1, alias: "stadium_pro_" + newLeaderboard.length, name: "Jugador IA", hits: 3 });
    }
    
    localStorage.setItem("qia_leaderboard", JSON.stringify(newLeaderboard));
    localStorage.setItem("qia_tickets", JSON.stringify(tickets)); // guardar con status checked
    
    // Si el usuario actual ganó, recargar balance en vista
    const curr = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (curr) {
      const allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
      const updatedCurr = allUsers.find(u => {
        const dec = decryptData(u);
        return dec.phone === curr.phone || dec.email === curr.email;
      });
      if (updatedCurr) {
        localStorage.setItem("qia_current_user", JSON.stringify(updatedCurr));
      }
    }

    return {
      success: true,
      message: "Cierre completado. La bolsa de $" + jackpot + " MXN ha sido distribuida entre los 3 primeros lugares.",
      winners: winners
    };
  }

  // Cloud Firestore Cierre semanal
  try {
    const tSnap = await db.collection("tickets").where("status", "==", "active").get();
    if (tSnap.empty) return { success: false, message: "No hay tickets activos para cerrar esta semana en Firestore." };

    const jackpot = Number(config.pool_jackpot) || 5000;
    const p1 = jackpot * 0.5;
    const p2 = jackpot * 0.3;
    const p3 = jackpot * 0.2;

    const tickets = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    tickets.forEach(t => {
      t.status = "checked";
      t.hits = Math.floor(Math.random() * 4) + 4; // simulación de aciertos
    });

    const sorted = [...tickets].sort((a, b) => b.hits - a.hits);
    const winners = [];

    // Repartir en lote Firestore
    const batch = db.batch();
    
    if (sorted[0]) {
      const ref = db.collection("tickets").doc(sorted[0].id);
      batch.update(ref, { status: "checked", hits: sorted[0].hits, prize: p1 });
      const uRef = db.collection("users").doc(sorted[0].user_id.replace(/[^a-zA-Z0-9]/g, "_"));
      batch.update(uRef, { balance: firebase.firestore.FieldValue.increment(p1) });
      winners.push({ alias: sorted[0].user_alias, prize: p1, rank: 1, hits: sorted[0].hits });
    }
    if (sorted[1]) {
      const ref = db.collection("tickets").doc(sorted[1].id);
      batch.update(ref, { status: "checked", hits: sorted[1].hits, prize: p2 });
      const uRef = db.collection("users").doc(sorted[1].user_id.replace(/[^a-zA-Z0-9]/g, "_"));
      batch.update(uRef, { balance: firebase.firestore.FieldValue.increment(p2) });
      winners.push({ alias: sorted[1].user_alias, prize: p2, rank: 2, hits: sorted[1].hits });
    }
    if (sorted[2]) {
      const ref = db.collection("tickets").doc(sorted[2].id);
      batch.update(ref, { status: "checked", hits: sorted[2].hits, prize: p3 });
      const uRef = db.collection("users").doc(sorted[2].user_id.replace(/[^a-zA-Z0-9]/g, "_"));
      batch.update(uRef, { balance: firebase.firestore.FieldValue.increment(p3) });
      winners.push({ alias: sorted[2].user_alias, prize: p3, rank: 3, hits: sorted[2].hits });
    }

    // Actualizar los demás a checked
    for (let i = 3; i < sorted.length; i++) {
      const ref = db.collection("tickets").doc(sorted[i].id);
      batch.update(ref, { status: "checked", hits: sorted[i].hits, prize: 0 });
    }

    await batch.commit();

    // Actualizar current user local si coincide con ganadores
    const curr = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (curr) {
      const winnerMatch = winners.find(w => w.alias === curr.alias);
      if (winnerMatch) {
        curr.balance = (Number(curr.balance) || 0) + winnerMatch.prize;
        localStorage.setItem("qia_current_user", JSON.stringify(encryptData(curr)));
      }
    }

    return {
      success: true,
      message: "Cierre de Firestore completado con éxito.",
      winners: winners
    };
  } catch (e) {
    return { success: false, message: "Error en cierre Firestore: " + e.message };
  }
}
