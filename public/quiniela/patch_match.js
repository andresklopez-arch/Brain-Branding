const fs = require('fs');
let c = fs.readFileSync('app_db.js', 'utf8');

const injection = `
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
`;

c = c.replace(/          const dbLocal = normalize\(f\.team_local\);\s*const dbVisita = normalize\(f\.team_visita\);\s*\/\/ Fuzzy match cruzado\s*const isMatch = \(hName\.includes\(dbLocal\) \|\| dbLocal\.includes\(hName\)\) && \s*\(aName\.includes\(dbVisita\) \|\| dbVisita\.includes\(aName\)\);/g, injection);
fs.writeFileSync('app_db.js', c);
console.log("Patched match logic.");
