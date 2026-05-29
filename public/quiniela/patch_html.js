const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const modal = `
  <!-- MODAL DICCIONARIO DE EQUIPOS -->
  <div id="alias-modal" class="hidden fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
    <div class="bg-white/10 border border-white/20 p-6 rounded-3xl w-full max-w-md">
      <h2 class="text-2xl font-black text-white mb-4">Diccionario de Equipos</h2>
      <p class="text-white/70 text-sm mb-4">Agrega traducciones o sinónimos para asegurar que la API reconozca los nombres. Ejemplo: Local: Holanda, API: Netherlands.</p>
      <div class="flex flex-col gap-3 mb-4">
        <input type="text" id="alias-local" placeholder="Nombre en App (ej. Estados Unidos)" class="w-full bg-black/50 text-white rounded-xl px-4 py-3 outline-none border border-white/20">
        <input type="text" id="alias-api" placeholder="Nombre Oficial (ej. USA)" class="w-full bg-black/50 text-white rounded-xl px-4 py-3 outline-none border border-white/20">
        <button id="btn-add-alias" class="bg-white text-black font-black py-3 rounded-xl hover:bg-gray-200 transition-colors">AGREGAR ALIAS</button>
      </div>
      <div class="max-h-48 overflow-y-auto mb-4 bg-black/30 rounded-xl p-2" id="alias-list-container">
        <!-- Lista de alias dinǭmica -->
      </div>
      <button id="btn-close-alias" class="w-full border border-white/30 text-white font-bold py-3 rounded-xl hover:bg-white/10 transition-colors">CERRAR DICCIONARIO</button>
    </div>
  </div>
`;

if (!html.includes('id="alias-modal"')) {
  html = html.replace('<!-- FIN MODAL OPCIONES PARTIDO -->', '<!-- FIN MODAL OPCIONES PARTIDO -->' + modal);
  
  // Add a button in the Admin Panel to open the modal
  const adminBtn = `<button id="btn-open-alias" class="w-full border border-white/30 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 mb-4">
    <i class="ri-book-3-line text-xl"></i> DICCIONARIO DE EQUIPOS
  </button>`;
  
  html = html.replace('<div id="admin-matches-container"', adminBtn + '\n          <div id="admin-matches-container"');
  
  fs.writeFileSync('index.html', html);
  console.log('Modal added');
} else {
  console.log('Modal already exists');
}
