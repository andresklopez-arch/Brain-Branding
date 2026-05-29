const fs = require('fs');
let c = fs.readFileSync('app_db.js', 'utf8');

const injection = `
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
`;

// Replace from export async function getLeaderboard... up to the end of the function (the return snap.docs.map block)
const startRegex = /export async function getLeaderboard[\s\S]*?\}\s*\)\;\s*\}/;
c = c.replace(startRegex, injection.trim());

// We also need to update executeWeeklyClosure to NOT limit to 10 in storage, and NOT overwrite total_hits wrongly.
// Wait, executeWeeklyClosure adds hits to total_hits. If we dynamically add them in getLeaderboard BEFORE closure, we need to make sure closure adds them properly.
// executeWeeklyClosure currently:
const ewRegex = /const newWeeklyLeaderboard = bestTickets\.map\(\(t, idx\) => \(\{\s*rank: idx \+ 1, alias: t\.user_alias, name: t\.user_alias, hits: t\.hits\s*\}\)\)\.slice\(0, 10\);/;
c = c.replace(ewRegex, `const newWeeklyLeaderboard = bestTickets.map((t, idx) => ({
      rank: idx + 1, alias: t.user_alias, name: t.user_alias, hits: t.hits
    })).slice(0, 15);`);

fs.writeFileSync('app_db.js', c);
console.log("Patched getLeaderboard");
