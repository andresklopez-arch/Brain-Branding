const fs = require('fs');
let c = fs.readFileSync('app_db.js', 'utf8');

const injection = `    let totalUpdated = 0;

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
`;

c = c.replace(/    let totalUpdated = 0;/g, injection);
fs.writeFileSync('app_db.js', c);
console.log("Patched similarity and aliases.");
