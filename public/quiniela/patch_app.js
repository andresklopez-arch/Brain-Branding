const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');

const injection = `
  // --- LÓGICA DEL DICCIONARIO DE EQUIPOS ---
  const btnOpenAlias = document.getElementById('btn-open-alias');
  const btnCloseAlias = document.getElementById('btn-close-alias');
  const aliasModal = document.getElementById('alias-modal');
  const btnAddAlias = document.getElementById('btn-add-alias');
  const inputAliasLocal = document.getElementById('alias-local');
  const inputAliasApi = document.getElementById('alias-api');
  const aliasListContainer = document.getElementById('alias-list-container');

  let teamAliasesList = [];

  async function loadAliases() {
    try {
      if (!window.useSimulation) {
        const doc = await db.collection("settings").doc("team_aliases").get();
        if (doc.exists) {
          teamAliasesList = doc.data().list || [];
        }
      } else {
        teamAliasesList = JSON.parse(localStorage.getItem("qia_team_aliases") || "[]");
      }
      renderAliases();
    } catch(e) { console.warn("Error loading aliases", e); }
  }

  function renderAliases() {
    if (!aliasListContainer) return;
    aliasListContainer.innerHTML = '';
    if (teamAliasesList.length === 0) {
      aliasListContainer.innerHTML = '<p class="text-white/50 text-center py-2 text-sm">No hay alias registrados.</p>';
      return;
    }
    teamAliasesList.forEach((alias, index) => {
      const div = document.createElement('div');
      div.className = "flex justify-between items-center bg-black/50 p-3 rounded-lg mb-2";
      div.innerHTML = \`
        <div>
          <div class="text-white font-bold text-sm">\${alias.local} <i class="ri-arrow-right-line text-green-400 mx-1"></i> \${alias.api}</div>
        </div>
        <button class="text-red-500 hover:text-red-400 p-2" onclick="window.deleteAlias(\${index})">
          <i class="ri-delete-bin-line"></i>
        </button>
      \`;
      aliasListContainer.appendChild(div);
    });
  }

  window.deleteAlias = async function(index) {
    teamAliasesList.splice(index, 1);
    await saveAliases();
    renderAliases();
  };

  async function saveAliases() {
    try {
      if (!window.useSimulation) {
        await db.collection("settings").doc("team_aliases").set({ list: teamAliasesList });
      } else {
        localStorage.setItem("qia_team_aliases", JSON.stringify(teamAliasesList));
      }
    } catch(e) { console.error("Error saving aliases", e); }
  }

  if (btnOpenAlias) {
    btnOpenAlias.addEventListener('click', () => {
      loadAliases();
      aliasModal.classList.remove('hidden');
    });
  }

  if (btnCloseAlias) {
    btnCloseAlias.addEventListener('click', () => {
      aliasModal.classList.add('hidden');
    });
  }

  if (btnAddAlias) {
    btnAddAlias.addEventListener('click', async () => {
      const loc = inputAliasLocal.value.trim();
      const api = inputAliasApi.value.trim();
      if (!loc || !api) {
        showToast("Completa ambos campos.", "warning");
        return;
      }
      teamAliasesList.push({ local: loc, api: api });
      inputAliasLocal.value = '';
      inputAliasApi.value = '';
      await saveAliases();
      renderAliases();
      showToast("Alias agregado correctamente.", "success");
    });
  }
`;

if (!c.includes('LÓGICA DEL DICCIONARIO DE EQUIPOS')) {
  // Inject before the end of DOMContentLoaded
  c = c.replace('  }, 1000); // Esperar a que el DOM y componentes se rendericen\n});', injection + '\n  }, 1000); // Esperar a que el DOM y componentes se rendericen\n});');
  fs.writeFileSync('app.js', c);
  console.log("App logic patched");
} else {
  console.log("App logic already exists");
}
