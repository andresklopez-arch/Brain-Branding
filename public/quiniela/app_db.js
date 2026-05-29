/* ============================================================
   QUINIELA MUNDIALISTA IA — BASE DE DATOS E HÍBRIDO CLOUD (app_db.js)
   ============================================================ */

// Configuración de Firebase para brain-branding
const FIREBASE_CONFIG = {
  projectId: "brain-branding",
  appId: "1:545863893528:web:f0e82a190dbaa5d743396d",
  storageBucket: "brain-branding.firebasestorage.app",
  apiKey: "AIzaSyCgIpvZux4c6VjBI31KX8rACPe-zDSVRYo",
  authDomain: "brain-branding.firebaseapp.com",
  messagingSenderId: "545863893528",
  measurementId: "G-BE0LZ27Y8N"
};

let db = null;
let useSimulation = false;

// ── SHIELD: Cryptographic Scrambler (XOR-AES-like local encryption) ─────
const DB_SECRET_KEY = "QIA_CYBER_STADIUM_SECRET_2026";
export function encryptData(obj) {
  try {
    if (!obj) return obj;
    const copy = JSON.parse(JSON.stringify(obj));
    const fieldsToEncrypt = ['name', 'phone', 'alias', 'email', 'balance', 'pin'];
    
    fieldsToEncrypt.forEach(field => {
      if (copy[field] !== undefined && copy[field] !== null) {
        let strVal = String(copy[field]);
        // 1. Convertir a binario UTF-8 primero
        let utf8Str = unescape(encodeURIComponent(strVal));
        // 2. Realizar XOR sobre la cadena binaria de bytes
        let scrambled = '';
        for (let i = 0; i < utf8Str.length; i++) {
          scrambled += String.fromCharCode(utf8Str.charCodeAt(i) ^ DB_SECRET_KEY.charCodeAt(i % DB_SECRET_KEY.length));
        }
        // 3. Codificar en Base64 el resultado del XOR
        copy[field] = 'enc_qia:' + btoa(scrambled);
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
    const fieldsToDecrypt = ['name', 'phone', 'alias', 'email', 'balance', 'pin'];
    
    fieldsToDecrypt.forEach(field => {
      if (copy[field] && typeof copy[field] === 'string' && copy[field].startsWith('enc_qia:')) {
        let base64Part = copy[field].substring('enc_qia:'.length);
        // 1. Decodificar Base64 para obtener el binario scrambled
        let scrambled = atob(base64Part);
        // 2. Descifrar XOR para obtener la cadena binaria original UTF-8
        let utf8Str = '';
        for (let i = 0; i < scrambled.length; i++) {
          utf8Str += String.fromCharCode(scrambled.charCodeAt(i) ^ DB_SECRET_KEY.charCodeAt(i % DB_SECRET_KEY.length));
        }
        // 3. Reconvertir binario UTF-8 a texto plano original
        let decrypted = decodeURIComponent(escape(utf8Str));
        
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
  if (window.firebase && !FIREBASE_CONFIG.apiKey.includes("mockKey")) {
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
    console.warn("⚠️ [Fallback DB] SDK de Firebase no detectado o API Key mock. Modo Simulación Activo.");
    useSimulation = true;
  }
  
  // Garantizar semillas base en LocalStorage/Memory si usamos simulación
  await checkSeeds();
}

// ── SEMILLAS Y MOCK DATA DE Quiniela Mundialista (LIGA MX) ───────────────────
const LIGA_MX_MATCHES = [];

const INITIAL_SUGGESTIONS = [];

async function checkSeeds() {
  if (useSimulation) {
    try {
      const oldFixtures = localStorage.getItem("qia_fixtures");
      if (oldFixtures && (oldFixtures.includes("mx-1") || oldFixtures.includes("mx-2") || oldFixtures.includes("Tigres"))) {
        localStorage.removeItem("qia_fixtures");
      }
      const oldLeaderboard = localStorage.getItem("qia_leaderboard");
      if (oldLeaderboard && (oldLeaderboard.includes("Slim") || oldLeaderboard.includes("Lopez") || oldLeaderboard.includes("Wash"))) {
        localStorage.removeItem("qia_leaderboard");
        localStorage.removeItem("qia_leaderboard_accumulated");
      }
    } catch (e) {}

    if (!localStorage.getItem("qia_fixtures")) {
      localStorage.setItem("qia_fixtures", JSON.stringify(LIGA_MX_MATCHES));
    }
    if (!localStorage.getItem("qia_suggestions")) {
      localStorage.setItem("qia_suggestions", JSON.stringify(INITIAL_SUGGESTIONS));
    }
    if (!localStorage.getItem("qia_leaderboard")) {
      const defaultLeaderboard = [];
      localStorage.setItem("qia_leaderboard", JSON.stringify(defaultLeaderboard));
    }
    if (!localStorage.getItem("qia_leaderboard_accumulated")) {
      const defaultAcc = [];
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
        pool_matches_count: 10,
        required_selections: 10,
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
    const usersRaw = localStorage.getItem("qia_users_list");
    if (usersRaw) {
      try {
        const parsed = JSON.parse(usersRaw);
        const decList = parsed.map(u => decryptData(u));
        const hasCorrupted = decList.some(u => !u || isNaN(u.balance) || (u.alias && u.alias.startsWith('enc_qia:')));
        if (hasCorrupted) {
          console.warn("⚠️ Lista de usuarios local corrupta o antigua. Forzando re-sembrado...");
          localStorage.removeItem("qia_users_list");
        }
      } catch (e) {
        localStorage.removeItem("qia_users_list");
      }
    }

    if (!localStorage.getItem("qia_users_list")) {
      const defaultUsers = [
        {
          phone: "jugador_admin",
          email: "yoy@quinielamundialista.mx",
          name: "Andres",
          alias: "YoY",
          pin: "1234",
          balance: 2000,
          is_admin: true,
          role: "master",
          created_at: new Date().toISOString()
        }
      ];
      const encryptedUsers = defaultUsers.map(u => encryptData(u));
      localStorage.setItem("qia_users_list", JSON.stringify(encryptedUsers));
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
      console.warn("⚠️ [Cloud DB] Falló getSystemConfig. Activando modo simulación...", e);
      useSimulation = true;
      await checkSeeds();
      return getSystemConfig();
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
    manual_locked: false,
    pool_matches_count: 10,
    required_selections: 10
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
    console.warn("⚠️ [Cloud DB] Falló getFixtures. Activando modo simulación...", e);
    useSimulation = true;
    await checkSeeds();
    return getFixtures();
  }
}

export async function getIASuggestions(selectedLeagues, scanDays = 8) {
  const allLeagues = [
    'mex.1', 'mex.w.1', 'mex.2', 'uefa.champions', 'uefa.europa', 'uefa.euro', 
    'conmebol.america', 'conmebol.libertadores', 'conmebol.sudamericana',
    'esp.1', 'eng.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1',
    'usa.1', 'arg.1', 'bra.1', 'fifa.friendly', 'fifa.w.friendly'
  ];
  const leagues = (selectedLeagues && selectedLeagues.length > 0) ? selectedLeagues : allLeagues;
  let suggestions = [];
  
  // Rango de fechas: hoy a +8 días
  const today = new Date();
  const future = new Date(today.getTime() + scanDays * 24 * 60 * 60 * 1000);
  const formatDate = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
  const dateQuery = `?dates=${formatDate(today)}-${formatDate(future)}`;
  
  const fetchPromises = leagues.map(async (lg) => {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard${dateQuery}`);
      if (!res.ok) return [];
      const data = await res.json();
      const leagueSuggestions = [];
      if (data.events) {
        data.events.forEach(ev => {
          try {
            const comp = ev.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === 'home');
            const away = comp.competitors.find(c => c.homeAway === 'away');
            
            // Jerarquía de atracción especificada
            let attract = 70;
            if (lg === 'mex.1') {
              attract = 95 + Math.floor(Math.random() * 5); // 95 - 99 (Liga MX)
            } else if (lg === 'uefa.champions') {
              attract = 90 + Math.floor(Math.random() * 5); // 90 - 94 (Champions)
            } else if (lg === 'esp.1' || lg === 'eng.1' || lg === 'ita.1' || lg === 'ger.1') {
              attract = 80 + Math.floor(Math.random() * 10); // 80 - 89 (Ligas Europeas)
            } else if (lg === 'mex.w.1' || lg === 'fifa.w.friendly') {
              attract = 75 + Math.floor(Math.random() * 10); // 75 - 84 (Femenil/Selección)
            } else if (lg === 'usa.1') {
              attract = 60 + Math.floor(Math.random() * 10); // 60 - 69 (MLS)
            } else if (lg === 'arg.1' || lg === 'bra.1') {
              attract = 50 + Math.floor(Math.random() * 10); // 50 - 59 (Liga Latinoamericana)
            } else {
              attract = 70 + Math.floor(Math.random() * 10); // 70 - 79 (Selecciones/Internacionales u otros)
            }
            
            leagueSuggestions.push({
              id: ev.id,
              team_local: home.team.shortDisplayName || home.team.name,
              team_visita: away.team.shortDisplayName || away.team.name,
              date: ev.date, // ISO string
              attraction_index: attract,
              selected: true,
              group: data.leagues[0].name,
              reason: `Partido regular de ${data.leagues[0].name}. Un encuentro clave en la cartelera internacional.`
            });
          } catch(e) {}
        });
      }
      return leagueSuggestions;
    } catch(e) {
      console.warn("ESPN Fetch Error for", lg, e);
      return [];
    }
  });
  
  const results = await Promise.all(fetchPromises);
  results.forEach(resList => {
    suggestions.push(...resList);
  });
  
  // Evitar duplicados por ID de partido
  const seenIds = new Set();
  suggestions = suggestions.filter(s => {
    if (seenIds.has(s.id)) return false;
    seenIds.add(s.id);
    return true;
  });
  
  // Ordenar cronológicamente
  suggestions.sort((a,b) => new Date(a.date) - new Date(b.date));
  
  // Retornar los mejores partidos (hasta 30)
  return suggestions.slice(0, 30);
}

// Encriptar datos de caché de búsqueda de Google AI
export function encryptAISearchData(obj) {
  try {
    const str = JSON.stringify(obj);
    let result = '';
    for (let i = 0; i < str.length; i++) {
      result += String.fromCharCode(str.charCodeAt(i) ^ DB_SECRET_KEY.charCodeAt(i % DB_SECRET_KEY.length));
    }
    return 'enc_search:' + btoa(unescape(encodeURIComponent(result)));
  } catch(e) {
    return JSON.stringify(obj);
  }
}

// Desencriptar datos de caché de búsqueda de Google AI
export function decryptAISearchData(encStr) {
  try {
    if (!encStr) return null;
    if (!encStr.startsWith('enc_search:')) {
      return JSON.parse(encStr);
    }
    let base64Part = encStr.substring('enc_search:'.length);
    let encryptedStr = decodeURIComponent(escape(atob(base64Part)));
    let decrypted = '';
    for (let i = 0; i < encryptedStr.length; i++) {
      decrypted += String.fromCharCode(encryptedStr.charCodeAt(i) ^ DB_SECRET_KEY.charCodeAt(i % DB_SECRET_KEY.length));
    }
    return JSON.parse(decrypted);
  } catch(e) {
    console.error("Fallo desencriptar caché de búsqueda IA:", e);
    return null;
  }
}

// Obtener resultados detallados del buscador de Google con Modo IA (Filtrado por Categoría)
export async function getGoogleAISearchResults(query, category = "todos", selectedLeagues, scanDays = 8) {
  let suggestions = await getIASuggestions(selectedLeagues, scanDays);
  
  // Si la consulta contiene palabras clave de torneos, forzar la categoría correspondiente automáticamente
  const queryLower = (query || "").toLowerCase();
  let activeCat = category;
  
  if (category === 'todos') {
    if (queryLower.includes('euro') || queryLower.includes('europa') || queryLower.includes('escocia') || queryLower.includes('alemania') || queryLower.includes('españa') || queryLower.includes('croacia')) {
      activeCat = 'euro';
    } else if (queryLower.includes('copa') || queryLower.includes('america') || queryLower.includes('américa') || queryLower.includes('messi') || queryLower.includes('argentina') || queryLower.includes('jamaica') || queryLower.includes('méxico')) {
      activeCat = 'copa';
    } else if (queryLower.includes('liga mx') || queryLower.includes('mls') || queryLower.includes('chivas') || queryLower.includes('cruz azul') || queryLower.includes('américa vs') || queryLower.includes('galaxy') || queryLower.includes('inter miami')) {
      activeCat = 'local';
    }
  }
  
  // Filtrar partidos
  if (activeCat === 'euro') {
    suggestions = suggestions.filter(s => s.group.toLowerCase().includes('euro') || s.group.toLowerCase().includes('champions') || s.group.toLowerCase().includes('uefa'));
  } else if (activeCat === 'copa') {
    suggestions = suggestions.filter(s => s.group.toLowerCase().includes('copa') || s.group.toLowerCase().includes('conmebol'));
  } else if (activeCat === 'local') {
    suggestions = suggestions.filter(s => s.group.toLowerCase().includes('liga mx') || s.group.toLowerCase().includes('mls') || s.group.toLowerCase().includes('campeón') || s.group.toLowerCase().includes('expansión'));
  }
  
  const todayStr = new Date().toLocaleDateString('es-MX', {day: 'numeric', month: 'long'});
  const futureStr = new Date(Date.now() + scanDays*24*60*60*1000).toLocaleDateString('es-MX', {day: 'numeric', month: 'long', year: 'numeric'});
  
  let overview = "";
  if (suggestions.length === 0) {
    overview = `La Inteligencia Artificial de Google analizó la cartelera de los próximos 8 días (del <b>${todayStr}</b> al <b>${futureStr}</b>) y determinó que no hay encuentros profesionales programados en este momento para la categoría seleccionada.`;
  } else {
    // Tomar los 3 partidos con mayor índice de atracción
    const topMatches = [...suggestions]
      .sort((a, b) => b.attraction_index - a.attraction_index)
      .slice(0, 3);
    
    const matchesListHtml = topMatches.map(m => {
      let timeStr = "";
      try {
        timeStr = new Date(m.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      } catch(e) {}
      return `<li>🔥 <b>${m.team_local} vs ${m.team_visita}</b> (${m.group} - ${timeStr}): Calificación IA de atracción del <b>${m.attraction_index}%</b>. Un encuentro clave en la cartelera internacional.</li>`;
    }).join("");
    
    overview = `La Inteligencia Artificial de Google ha analizado en tiempo real los eventos futbolísticos del <b>${todayStr}</b> al <b>${futureStr}</b> y ha seleccionado un total de <b>${suggestions.length} encuentros</b> profesionales para ti.
    <br><br>
    Los encuentros más destacados e imperdibles para tu quiniela de esta semana son:
    <br><br>
    <ul>
      ${matchesListHtml}
    </ul>
    <br>
    Todos estos partidos se han sincronizado con las estadísticas oficiales y están listos para ser incorporados a la cartelera activa.`;
  }

  return {
    overview: overview,
    matches: suggestions,
    category: activeCat
  };
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
// Funciǭn auxiliar para calcular aciertos dinǭmicos
async function calculateDynamicHits() {
  const tickets = useSimulation 
    ? JSON.parse(localStorage.getItem("qia_tickets") || "[]")
    : (await db.collection("tickets").where("status", "==", "active").get()).docs.map(d => d.data());
    
  const fixtures = await getFixtures();
  const fixturesMap = {};
  fixtures.forEach(f => fixturesMap[f.id] = f);

  const userBest = {};
  
  tickets.forEach(t => {
    let hits = 0;
    const matchesArray = t.matches || (t.selections ? Object.keys(t.selections).map(k => ({match_id: k, prediction: t.selections[k]})) : []);
    
    matchesArray.forEach(m => {
      const f = fixturesMap[m.match_id];
      if (f && f.status === 'finished') {
        let realResult = null;
        if (f.score_local > f.score_visita) realResult = 'L';
        else if (f.score_local === f.score_visita) realResult = 'E';
        else realResult = 'V';
        
        if (m.prediction === realResult) hits++;
      } else if (f && f.status === 'canceled') {
        hits++; // Partido cancelado = acierto automático
      }
    });

    if (!userBest[t.user_alias] || hits > userBest[t.user_alias].hits) {
      userBest[t.user_alias] = hits;
    }
  });
  
  return userBest;
}

export async function getLeaderboard(type = 'weekly') {
  const dynamicHits = await calculateDynamicHits();
  
  if (useSimulation) {
    const allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]").map(u => decryptData(u));
    
    let board = allUsers.map(u => {
      const currentHits = dynamicHits[u.alias] || 0;
      let score = 0;
      if (type === 'accumulated') {
        score = (u.total_hits || 0) + currentHits;
      } else {
        score = currentHits;
      }
      return { alias: u.alias, name: u.name, hits: score };
    });
    
    board = board.sort((a, b) => b.hits - a.hits).slice(0, 15);
    return board.map((r, idx) => ({ ...r, rank: idx + 1 }));
  }

  // Live Firebase Mode
  const dynamicHitsFB = await calculateDynamicHits();
  const snap = await db.collection("users").get();
  
  let board = snap.docs.map(doc => {
    const u = doc.data();
    const currentHits = dynamicHitsFB[u.alias] || 0;
    let score = type === 'accumulated' ? (u.total_hits || 0) + currentHits : currentHits;
    return { alias: u.alias || "user_ia", name: u.name || "Usuario", hits: score };
  });

  board = board.sort((a, b) => b.hits - a.hits).slice(0, 15);
  return board.map((r, idx) => ({ ...r, rank: idx + 1 }));
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
  
  const uid = userData.email ? userData.email.replace(/[^a-zA-Z0-9]/g, "_") : userData.phone;
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
    await checkSeeds();
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
  try {
    const doc = await db.collection("users").doc(uid).get();
    return doc.exists ? decryptData(doc.data()) : null;
  } catch (e) {
    console.warn("⚠️ [Cloud DB] Falló getUserData. Activando modo simulación...", e);
    useSimulation = true;
    await checkSeeds();
    return getUserData(phoneOrEmail); // Re-intentar con simulación local
  }
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
      const uid = (user.email || user.phone).replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("users").doc(uid).set({
        balance: firebase.firestore.FieldValue.increment(Number(tx.amount))
      }, { merge: true });
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
        
        // Activar quinielas reservadas automáticamente
        const allTickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
        let hasChanges = false;
        allTickets.forEach(tkt => {
          if (tkt.user_id === tx.user_id && tkt.status === "reserved") {
            const cost = Number(tkt.total_cost) || 0;
            if (user.balance >= cost) {
              user.balance -= cost;
              tkt.status = "active";
              hasChanges = true;
            }
          }
        });
        if (hasChanges) {
          localStorage.setItem("qia_tickets", JSON.stringify(allTickets));
        }

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
    
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      let currentBalance = (Number(userDoc.data().balance) || 0) + Number(tx.amount);
      
      const reservedTickets = await db.collection("tickets")
        .where("user_id", "==", tx.user_id)
        .where("status", "==", "reserved")
        .get();
        
      let newlyActiveCount = 0;
      
      for (let tDoc of reservedTickets.docs) {
        const tkt = tDoc.data();
        const cost = Number(tkt.total_cost) || 0;
        if (currentBalance >= cost) {
          currentBalance -= cost;
          newlyActiveCount++;
          await db.collection("tickets").doc(tDoc.id).update({ status: "active" });
        }
      }
      
      await userRef.set({
        balance: currentBalance,
        active_tickets_count: firebase.firestore.FieldValue.increment(newlyActiveCount)
      }, { merge: true });
      
      // Si el usuario actual es el afectado, recargar balance
      const curr = JSON.parse(localStorage.getItem("qia_current_user"));
      if (curr) {
        const decryptedCurr = decryptData(curr);
        if (decryptedCurr.phone === tx.user_id || decryptedCurr.email === tx.user_id) {
          decryptedCurr.balance = currentBalance;
          localStorage.setItem("qia_current_user", JSON.stringify(encryptData(decryptedCurr)));
        }
      }
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
      
      // Eliminar tickets reservados
      let tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
      tickets = tickets.filter(t => !(t.user_id === tx.user_id && t.status === "reserved"));
      localStorage.setItem("qia_tickets", JSON.stringify(tickets));
    }
    return true;
  }
  
  const txRef = db.collection("transactions").doc(txId);
  const doc = await txRef.get();
  if (doc.exists) {
    const tx = doc.data();
    await txRef.update({ status: "declined" });
    
    // Eliminar tickets reservados
    const reservedTickets = await db.collection("tickets")
      .where("user_id", "==", tx.user_id)
      .where("status", "==", "reserved")
      .get();
      
    for (let tDoc of reservedTickets.docs) {
      await db.collection("tickets").doc(tDoc.id).delete();
    }
  }
  
  return true;
}

// Tickets / Quinielas compradas
export async function createTicket(ticket) {
  if (!ticket.id) ticket.id = "tkt-" + Date.now();
  ticket.created_at = new Date().toISOString();
  
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    list.unshift(ticket);
    localStorage.setItem("qia_tickets", JSON.stringify(list));
    
    // Cobrar costo al usuario solo si está activa
    if (ticket.status !== "reserved") {
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
    }
    return ticket;
  }

  // Cloud Firestore
  await db.collection("tickets").doc(ticket.id).set(ticket);
  if (ticket.status !== "reserved") {
    const user = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
    if (user) {
      const uid = (user.email || user.phone).replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("users").doc(uid).set({
        balance: firebase.firestore.FieldValue.increment(-Number(ticket.total_cost)),
        active_tickets_count: firebase.firestore.FieldValue.increment(1)
      }, { merge: true });
      user.balance = (Number(user.balance) || 0) - Number(ticket.total_cost);
      localStorage.setItem("qia_current_user", JSON.stringify(encryptData(user)));
    }
  }
  return ticket;
}

// Estadísticas de Administrador
export async function getAdminStats() {
  if (useSimulation) {
    const tickets = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    const totalSales = tickets.reduce((sum, t) => sum + Number(t.total_cost), 0);
    const usersCount = JSON.parse(localStorage.getItem("qia_users_list") || "[]").length;
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
    })).slice(0, 15);
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

    const tickets = tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const poolCost = Number(config.pool_cost) || 50;
    const poolFee = Number(config.pool_fee) || 10;
    const jackpot = tickets.length * poolCost * (1 - (poolFee / 100));

    const places = Number(config.pool_places) || 3;
    const percentages = [];
    if (places === 1) {
      percentages.push(100);
    } else if (places === 3) {
      percentages.push(50, 35, 15);
    } else {
      let remaining = 100;
      for(let i=0; i<places; i++){
        let p = (i === places - 1) ? remaining : Math.round(remaining * 0.5);
        percentages.push(p);
        remaining -= p;
      }
    }
    const prizePools = percentages.map(p => (p/100) * jackpot);
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
      batch.set(db.collection("users").doc(uid), { 
        balance: firebase.firestore.FieldValue.increment(w.prize),
        total_hits: firebase.firestore.FieldValue.increment(w.hits) // Acumulado
      }, { merge: true });
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
      try { 
        let d = decryptData(u); 
        if (!d.id) d.id = d.phone || d.email; 
        return d; 
      } catch(e) { return u; }
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
  if (useSimulation) {
    let allUsers = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    let found = false;
    allUsers = allUsers.map(u => {
      const dec = decryptData(u);
      if (dec.phone === uid || dec.email === uid || dec.id === uid) {
        dec.balance = (Number(dec.balance) || 0) + Number(amountToAdd);
        found = true;
        return encryptData(dec);
      }
      return u;
    });
    if (found) {
      localStorage.setItem("qia_users_list", JSON.stringify(allUsers));
      // Si el usuario actual es el afectado, actualizarlo en localStorage también
      const curr = decryptData(JSON.parse(localStorage.getItem("qia_current_user")));
      if (curr && (curr.phone === uid || curr.email === uid || curr.id === uid)) {
        curr.balance = (Number(curr.balance) || 0) + Number(amountToAdd);
        localStorage.setItem("qia_current_user", JSON.stringify(encryptData(curr)));
      }
      return true;
    }
    return false;
  }
  try {
    await db.collection("users").doc(uid).set({ 
      balance: firebase.firestore.FieldValue.increment(Number(amountToAdd)) 
    }, { merge: true });
    return true;
  } catch (e) {
    console.error("Error updating user balance:", e);
    return false;
  }
}

export async function addFixture(f) {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_fixtures") || "[]");
    if (!list.find(item => item.id === f.id)) {
      list.push(f);
      localStorage.setItem("qia_fixtures", JSON.stringify(list));
    }
    return true;
  }
  try {
    await db.collection("fixtures").doc(f.id).set(f);
    return true;
  } catch (e) {
    console.error("Error adding fixture:", e);
    return false;
  }
}

export async function updateFixtureScore(id, resultHome, resultAway) {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_fixtures") || "[]");
    const f = list.find(item => item.id === id);
    if (f) {
      f.result_home = Number(resultHome);
      f.result_away = Number(resultAway);
      f.score_local = Number(resultHome);
      f.score_visita = Number(resultAway);
      f.status = "finished";
      localStorage.setItem("qia_fixtures", JSON.stringify(list));
      return true;
    }
    return false;
  }
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
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_fixtures") || "[]");
    const f = list.find(item => item.id === id);
    if (f) {
      f.status = "canceled";
      f.result_home = null;
      f.result_away = null;
      localStorage.setItem("qia_fixtures", JSON.stringify(list));
      return true;
    }
    return false;
  }
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
  if (useSimulation) {
    let list = JSON.parse(localStorage.getItem("qia_fixtures") || "[]");
    list = list.filter(f => f.id !== id);
    localStorage.setItem("qia_fixtures", JSON.stringify(list));
    return true;
  }
  try {
    await db.collection("fixtures").doc(id).delete();
    return true;
  } catch (e) {
    console.error("Error deleting fixture:", e);
    return false;
  }
}

export async function syncWithApiFootball(apiKey) {
  try {
    const allFixtures = await getFixtures();
    if (!allFixtures || allFixtures.length === 0) return { success: true, updated: 0, msg: "No hay partidos" };

    const activeFixtures = allFixtures.filter(f => f.status !== "finished" && f.status !== "canceled");
    if (activeFixtures.length === 0) return { success: true, updated: 0, msg: "Todos están terminados" };

    const datesNeeded = new Set();
    const today = new Date();
    datesNeeded.add(today.toISOString().split("T")[0]);
    for (let i = 1; i <= 3; i++) {
      const past = new Date(today);
      past.setDate(today.getDate() - i);
      datesNeeded.add(past.toISOString().split("T")[0]);
      const future = new Date(today);
      future.setDate(today.getDate() + i);
      datesNeeded.add(future.toISOString().split("T")[0]);
    }

    activeFixtures.forEach(f => {
      if (f.date) {
        const d = new Date(f.date);
        if (!isNaN(d.getTime())) {
          datesNeeded.add(d.toISOString().split("T")[0]);
        }
      }
    });

    let totalUpdated = 0;

    // Cargar diccionario de alias
    let teamAliases = [];
    try {
      if (!useSimulation) {
        const aliasSnap = await db.collection("settings").doc("team_aliases").get();
        if (aliasSnap.exists) {
          teamAliases = aliasSnap.data().list || [];
        }
      } else {
        teamAliases = JSON.parse(localStorage.getItem("qia_team_aliases") || "[]");
      }
    } catch(err) { console.warn("Error cargando alias:", err); }

    function stringSimilarity(s1, s2) {
      if (s1 === s2) return 1.0;
      const longer = s1.length > s2.length ? s1 : s2;
      const shorter = s1.length > s2.length ? s2 : s1;
      if (longer.length === 0) return 1.0;
      const costs = [];
      for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
          if (i === 0) costs[j] = j;
          else if (j > 0) {
            let newValue = costs[j - 1];
            if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
        if (i > 0) costs[shorter.length] = lastValue;
      }
      return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
    }

    
    // Antispam local (30 segundos max entre consultas globales por seguridad de créditos)
    const lastSync = localStorage.getItem("last_api_sync_time");
    if (lastSync && Date.now() - parseInt(lastSync) < 30000) {
      return { success: false, updated: 0, msg: "Se actualizó recientemente. Espera unos segundos." };
    }
    localStorage.setItem("last_api_sync_time", Date.now().toString());

    // Normalizar nombres de equipos
    const normalize = (name) => {
      if (!name) return "";
      return name.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace("fc", "")
        .replace("cf", "")
        .replace("club", "")
        .replace("universidad", "u")
        .replace("republic of", "rep")
        .replace("rep of", "rep")
        .replace("republic", "rep")
        .replace(/[^a-z0-9]/g, "")
        .trim();
    };

    for (const dateStr of datesNeeded) {
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
        headers: { "x-apisports-key": apiKey }
      });
      const data = await res.json();
      if (!data || !data.response) continue;

      for (const apiMatch of data.response) {
        const hName = normalize(apiMatch.teams.home.name);
        const aName = normalize(apiMatch.teams.away.name);
        const apiStatus = apiMatch.fixture.status.short;

        for (const f of activeFixtures) {
          if (f.updated_from_api_this_run) continue;
          

          let dbLocal = normalize(f.team_local);
          let dbVisita = normalize(f.team_visita);

          // 1. Reemplazo por alias de Diccionario (Si existe "USA" -> "United States")
          for (const alias of teamAliases) {
            const aliasLoc = normalize(alias.local);
            const aliasApi = normalize(alias.api);
            if (dbLocal === aliasLoc) dbLocal = aliasApi;
            if (dbVisita === aliasLoc) dbVisita = aliasApi;
          }

          // 2. Fuzzy match cruzado (includes)
          let isMatch = (hName.includes(dbLocal) || dbLocal.includes(hName)) && 
                        (aName.includes(dbVisita) || dbVisita.includes(aName));

          // 3. Similitud Matemǭtica si falla el includes (Tolerancia 30% a errores)
          if (!isMatch) {
            const sim1 = stringSimilarity(hName, dbLocal);
            const sim2 = stringSimilarity(aName, dbVisita);
            if (sim1 >= 0.70 && sim2 >= 0.70) {
              isMatch = true;
            }
          }


          if (isMatch) {
             const homeGoals = apiMatch.goals.home;
             const awayGoals = apiMatch.goals.away;
             
             let newStatus = f.status;
             if (apiStatus === "FT" || apiStatus === "AET" || apiStatus === "PEN") {
               newStatus = "finished";
             } else if (["1H", "HT", "2H", "ET", "P"].includes(apiStatus)) {
               newStatus = "live";
             }

             if (homeGoals !== null && awayGoals !== null) {
                if (useSimulation) {
                  const list = JSON.parse(localStorage.getItem("qia_fixtures") || "[]");
                  const item = list.find(x => x.id === f.id);
                  if (item) {
                    item.result_home = Number(homeGoals);
                    item.result_away = Number(awayGoals);
                    item.score_local = Number(homeGoals);
                    item.score_visita = Number(awayGoals);
                    item.status = newStatus;
                    localStorage.setItem("qia_fixtures", JSON.stringify(list));
                  }
                } else {
                  await db.collection("fixtures").doc(f.id).update({
                    result_home: Number(homeGoals),
                    result_away: Number(awayGoals),
                    score_local: Number(homeGoals),
                    score_visita: Number(awayGoals),
                    status: newStatus
                  });
                }
                f.updated_from_api_this_run = true;
                totalUpdated++;
             }
          }
        }
      }
    }

    return { success: true, updated: totalUpdated, msg: `Se encontraron actualizaciones para ${totalUpdated} partido(s).` };
  } catch(e) {
    console.error(e);
    return { success: false, updated: 0, msg: "Error al conectar con la API." };
  }
}

export async function batchAddFixtures(fixturesArray) {
  if (useSimulation) {
    let list = JSON.parse(localStorage.getItem("qia_fixtures") || "[]");
    fixturesArray.forEach(f => {
      if (!list.find(item => item.id === f.id)) {
        list.push(f);
      }
    });
    localStorage.setItem("qia_fixtures", JSON.stringify(list));
    return true;
  }
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

// Tickets del usuario actual (TODOS los estados: active, reserved, checked)
export async function getUserTickets(userId) {
  if (!userId) return [];
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    return list.filter(t => t.user_id === userId).sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  }
  try {
    // SIN .orderBy() para evitar requerir índice compuesto en Firestore.
    // El ordenamiento se hace en JS después del fetch.
    const snap = await db.collection("tickets")
      .where("user_id", "==", userId)
      .get();
    const tickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Ordenar por fecha descendente en JavaScript
    return tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (e) {
    console.warn("⚠️ [Cloud DB] Falló getUserTickets. Usando simulación...", e);
    const list = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    return list.filter(t => t.user_id === userId).sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  }
}

export async function getActiveTickets() {
  if (useSimulation) {
    const list = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    const usersList = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    return list.filter(t => {
      if (t.status !== "active") return false;
      const encryptedUser = usersList.find(u => {
        const dec = decryptData(u);
        return dec.phone === t.user_id || dec.email === t.user_id;
      });
      if (encryptedUser) {
        const user = decryptData(encryptedUser);
        const balance = Number(user.balance);
        if (isNaN(balance) || balance < 0) return false;
      }
      return true;
    });
  }
  try {
    const snap = await db.collection("tickets").where("status", "==", "active").get();
    const tickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const usersSnap = await db.collection("users").get();
    const usersMap = {};
    usersSnap.docs.forEach(doc => {
      const dec = decryptData(doc.data());
      usersMap[dec.phone || dec.email] = dec;
    });
    return tickets.filter(t => {
      const user = usersMap[t.user_id];
      if (user) {
        const balance = Number(user.balance);
        if (isNaN(balance) || balance < 0) return false;
      }
      return true;
    });
  } catch (e) {
    console.warn("⚠️ [Cloud DB] Falló getActiveTickets. Usando simulación...", e);
    const list = JSON.parse(localStorage.getItem("qia_tickets") || "[]");
    const usersList = JSON.parse(localStorage.getItem("qia_users_list") || "[]");
    return list.filter(t => {
      if (t.status !== "active") return false;
      const encryptedUser = usersList.find(u => {
        const dec = decryptData(u);
        return dec.phone === t.user_id || dec.email === t.user_id;
      });
      if (encryptedUser) {
        const user = decryptData(encryptedUser);
        const balance = Number(user.balance);
        if (isNaN(balance) || balance < 0) return false;
      }
      return true;
    });
  }
}

// Actualizar automáticamente resultados oficiales desde ESPN Scoreboard
export async function autoUpdateMatchResults(silent = false) {
  const fixtures = await getFixtures();
  const pendingFixtures = fixtures.filter(f => f.status !== "finished" && f.status !== "canceled");
  
  if (pendingFixtures.length === 0) return 0;
  
  const today = new Date();
  const past = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 días atrás
  const future = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 días al futuro
  const formatDate = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
  const dateQuery = `?dates=${formatDate(past)}-${formatDate(future)}`;
  
  const leagues = [
    'mex.1', 'mex.w.1', 'mex.2', 'uefa.champions', 'uefa.europa', 'uefa.euro', 
    'conmebol.america', 'conmebol.libertadores', 'conmebol.sudamericana',
    'esp.1', 'eng.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1',
    'usa.1', 'arg.1', 'bra.1', 'fifa.friendly', 'fifa.w.friendly'
  ];
  
  let updatedCount = 0;
  
  // Normalizar nombres de equipos para matching
  const normalize = (name) => {
    if (!name) return "";
    return name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .replace("fc", "")
      .replace("cf", "")
      .replace("club", "")
      .trim();
  };
  
  // Ejecutar fetches en paralelo
  const fetchPromises = leagues.map(async (lg) => {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard${dateQuery}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    } catch (e) {
      return [];
    }
  });
  
  const eventsLists = await Promise.all(fetchPromises);
  const allEvents = eventsLists.flat();
  
  for (const f of pendingFixtures) {
    const fLocalNorm = normalize(f.team_local);
    const fVisitaNorm = normalize(f.team_visita);
    
    // Buscar evento coincidente
    const ev = allEvents.find(e => {
      if (e.id === f.id) return true;
      try {
        const comp = e.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        const homeNorm = normalize(home.team.name || home.team.shortDisplayName);
        const awayNorm = normalize(away.team.name || away.team.shortDisplayName);
        
        return (fLocalNorm.includes(homeNorm) || homeNorm.includes(fLocalNorm)) && 
               (fVisitaNorm.includes(awayNorm) || awayNorm.includes(fVisitaNorm));
      } catch (err) {
        return false;
      }
    });
    
    if (ev && ev.status && ev.status.type && ev.status.type.state === 'post') {
      try {
        const comp = ev.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        const scoreHome = Number(home.score);
        const scoreAway = Number(away.score);
        
        const success = await updateFixtureScore(f.id, scoreHome, scoreAway);
        if (success) {
          updatedCount++;
        }
      } catch (err) {}
    }
  }
  
  return updatedCount;
}

