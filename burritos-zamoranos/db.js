const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');

// Asegurar que la carpeta de datos exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  shifts: path.join(DATA_DIR, 'shifts.json'),
  config: path.join(DATA_DIR, 'config.json'),
  catalog: path.join(DATA_DIR, 'catalog.json')
};

// Generar Hash y Sal
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Escritura atómica para evitar corrupción
function safeWriteJson(filepath, data) {
  const tempPath = filepath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filepath);
}

function safeReadJson(filepath, defaultData = []) {
  if (!fs.existsSync(filepath)) {
    safeWriteJson(filepath, defaultData);
    return defaultData;
  }
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error al leer archivo JSON en ${filepath}:`, error);
    return defaultData;
  }
}

// Inicialización de la base de datos y usuarios por defecto
function initDb() {
  const users = safeReadJson(FILES.users, []);
  
  if (users.length === 0) {
    const defaultRoles = [
      { username: 'admin', role: 'Administrador' },
      { username: 'gerente', role: 'Gerente' },
      { username: 'cajero', role: 'Cajero' },
      { username: 'mesero', role: 'Mesero' },
      { username: 'cocina', role: 'Cocina' }
    ];

    defaultRoles.forEach(u => {
      const salt = generateSalt();
      const hash = hashPassword('1111', salt);
      users.push({
        username: u.username,
        role: u.role,
        passwordHash: hash,
        salt: salt,
        mustChangePassword: true
      });
    });
    safeWriteJson(FILES.users, users);
    console.log('[DB] Usuarios por defecto inicializados con contraseña "1111".');
  }

  // Inicializar configuraciones por defecto
  const config = safeReadJson(FILES.config, {});
  if (Object.keys(config).length === 0) {
    safeWriteJson(FILES.config, {
      printer: {
        type: 'bluetooth',
        address: '00:11:22:33:44:55',
        ticketHeader: 'BURRITOS ZAMORANOS\nHERMANOS GÓMEZ\nTradición desde 1970\n',
        ticketFooter: '¡Gracias por su preferencia!\nFacture en: hfgomez.com'
      },
      cashDrawer: {
        autoOpenOnCashSale: true,
        port: 'COM1'
      },
      quickTags: ['Sin cebolla', 'Sin cilantro', 'Sin picante', 'Extra queso', 'Salsa aparte']
    });
  } else if (!config.quickTags) {
    config.quickTags = ['Sin cebolla', 'Sin cilantro', 'Sin picante', 'Extra queso', 'Salsa aparte'];
    safeWriteJson(FILES.config, config);
  }

  // Inicializar colecciones de pedidos y turnos si no existen
  safeReadJson(FILES.orders, []);
  safeReadJson(FILES.shifts, []);

  // Inicializar catálogo por defecto
  const catalog = safeReadJson(FILES.catalog, {});
  if (Object.keys(catalog).length === 0) {
    safeWriteJson(FILES.catalog, {
      categories: [
        { id: 'burritos', name: 'Burritos' },
        { id: 'hamburguesas', name: 'Hamburguesas' },
        { id: 'bebidas', name: 'Bebidas' },
        { id: 'postres', name: 'Postres' },
        { id: 'otros', name: 'Otros' }
      ],
      products: [
        { id: 'b1', name: 'Burrito Zamorano', category: 'burritos', price: 95, desc: 'Carne asada premium, frijoles refritos, queso Oaxaca derretido y aguacate fresco.', img: 'https://images.unsplash.com/photo-1626700051175-6518c4793f4f?w=400&q=80' },
        { id: 'b2', name: 'Burrito de Chile Relleno', category: 'burritos', price: 90, desc: 'Auténtico chile poblano relleno de queso fundido, arropado con frijoles y arroz.', img: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80' },
        { id: 'b3', name: 'Burrito Ahogado', category: 'burritos', price: 110, desc: 'Gran burrito de res bañado en nuestra salsa roja picante especial con crema y queso espolvoreado.', img: 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=400&q=80' },
        { id: 'h1', name: 'Hamburguesa Hnos. Gómez', category: 'hamburguesas', price: 125, desc: 'Doble carne de res a la parrilla, tocino crujiente, queso gouda, piña y aderezo especial de la casa.', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80' },
        { id: 'h2', name: 'Hamburguesa Sencilla', category: 'hamburguesas', price: 85, desc: 'Carne jugosa de res, queso cheddar americano, lechuga fresca, jitomate y cebolla.', img: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80' },
        { id: 'd1', name: 'Agua de Horchata', category: 'bebidas', price: 35, desc: 'Refrescante agua de arroz tradicional con un toque cremoso y canela molida. (1 Litro)', img: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&q=80' },
        { id: 'd2', name: 'Agua de Jamaica', category: 'bebidas', price: 35, desc: 'Infusión helada de flores de Jamaica naturales. (1 Litro)', img: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&q=80' },
        { id: 'd3', name: 'Refresco Embotellado', category: 'bebidas', price: 30, desc: 'Refrescos clásicos de la familia Coca-Cola en presentación de vidrio.', img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&q=80' },
        { id: 'c1', name: 'Papas con Queso', category: 'otros', price: 45, desc: 'Papas fritas sazonadas bañadas con nuestra salsa de queso cheddar fundido.', img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80' },
        { id: 'c2', name: 'Guacamole con Totopos', category: 'otros', price: 60, desc: 'Aguacate machacado con pico de gallo acompañado de una canasta de totopos crujientes.', img: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=400&q=80' }
      ]
    });
  }

  console.log('[DB] Base de datos inicializada.');
}

// === Gestión de Usuarios ===
function getUsers() {
  return safeReadJson(FILES.users, []);
}

function getUser(username) {
  return getUsers().find(u => u.username === username);
}

function saveUsers(users) {
  safeWriteJson(FILES.users, users);
}

function verifyUser(username, password) {
  const user = getUser(username);
  if (!user) return null;
  const hash = hashPassword(password, user.salt);
  if (user.passwordHash === hash) {
    return {
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    };
  }
  return null;
}

function changePassword(username, newPassword) {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === username);
  if (userIndex === -1) return false;

  const salt = generateSalt();
  users[userIndex].salt = salt;
  users[userIndex].passwordHash = hashPassword(newPassword, salt);
  users[userIndex].mustChangePassword = false;
  
  saveUsers(users);
  return true;
}

function addUser(username, role, password) {
  const users = getUsers();
  if (users.some(u => u.username === username)) return false;

  const salt = generateSalt();
  users.push({
    username,
    role,
    passwordHash: hashPassword(password, salt),
    salt,
    mustChangePassword: true
  });
  saveUsers(users);
  return true;
}

function deleteUser(username) {
  const users = getUsers();
  const filtered = users.filter(u => u.username !== username);
  if (users.length === filtered.length) return false;
  saveUsers(filtered);
  return true;
}

// === Gestión de Pedidos ===
function getOrders() {
  return safeReadJson(FILES.orders, []);
}

function saveOrders(orders) {
  safeWriteJson(FILES.orders, orders);
}

function addOrder(orderData) {
  const orders = getOrders();
  const date = new Date();
  
  const newOrder = {
    id: 'PED-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    table: orderData.table || 'Llevar',
    items: orderData.items || [],
    total: orderData.total || 0,
    status: orderData.status || 'Pendiente', // Pendiente, En Cocina, Listo, Entregado, Pagado, Cancelado
    timestamp: date.toISOString(),
    // Métrica y logs estructurados para IA (Sugerencia 3)
    aiData: {
      timeOfDay: date.getHours() + ':' + date.getMinutes(),
      dayOfWeek: date.getDay(), // 0 = Domingo, 1 = Lunes, etc.
      upsellSuggested: orderData.upsellSuggested || null,
      upsellAccepted: orderData.upsellAccepted || false,
      upsellTriggeredBy: orderData.upsellTriggeredBy || null
    }
  };

  orders.push(newOrder);
  saveOrders(orders);
  return newOrder;
}

function updateOrderStatus(orderId, status) {
  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === orderId);
  if (orderIndex === -1) return null;

  orders[orderIndex].status = status;
  saveOrders(orders);
  return orders[orderIndex];
}

// === Gestión de Turnos y Gastos ===
function getShifts() {
  return safeReadJson(FILES.shifts, []);
}

function saveShifts(shifts) {
  safeWriteJson(FILES.shifts, shifts);
}

function getActiveShift() {
  return getShifts().find(s => s.status === 'Abierto');
}

function startShift(username, initialCash) {
  const shifts = getShifts();
  
  // Buscar si hay un turno abierto por el sistema de forma automática
  const autoShiftIndex = shifts.findIndex(s => s.status === 'Abierto' && s.openedBy === 'Sistema (Auto)');
  if (autoShiftIndex !== -1) {
    // Si existe, lo actualizamos con los datos del usuario real y su caja inicial
    shifts[autoShiftIndex].openedBy = username;
    shifts[autoShiftIndex].initialCash = Number(initialCash);
    saveShifts(shifts);
    return shifts[autoShiftIndex];
  }

  if (shifts.some(s => s.status === 'Abierto')) return null;

  const newShift = {
    id: 'TUR-' + Date.now(),
    openedBy: username,
    openedAt: new Date().toISOString(),
    closedBy: null,
    closedAt: null,
    initialCash: Number(initialCash),
    finalCash: 0,
    expenses: [],
    transactions: [],
    status: 'Abierto'
  };

  shifts.push(newShift);
  saveShifts(shifts);
  return newShift;
}

function addExpenseToShift(username, amount, description) {
  const shifts = getShifts();
  const activeShiftIndex = shifts.findIndex(s => s.status === 'Abierto');
  if (activeShiftIndex === -1) return null;

  const expense = {
    id: 'EXP-' + Date.now(),
    registeredBy: username,
    amount: Number(amount),
    description,
    timestamp: new Date().toISOString()
  };

  shifts[activeShiftIndex].expenses.push(expense);
  saveShifts(shifts);
  return expense;
}

function addTransactionToShift(orderId, amount, type = 'Venta') {
  const shifts = getShifts();
  let activeShiftIndex = shifts.findIndex(s => s.status === 'Abierto');
  
  if (activeShiftIndex === -1) {
    // Si no hay un turno activo, se crea uno automáticamente por el Sistema
    const newShift = {
      id: 'TUR-' + Date.now(),
      openedBy: 'Sistema (Auto)',
      openedAt: new Date().toISOString(),
      closedBy: null,
      closedAt: null,
      initialCash: 0,
      finalCash: 0,
      expenses: [],
      transactions: [],
      status: 'Abierto'
    };
    shifts.push(newShift);
    activeShiftIndex = shifts.length - 1;
  }

  shifts[activeShiftIndex].transactions.push({
    orderId,
    amount: Number(amount),
    type,
    timestamp: new Date().toISOString()
  });

  saveShifts(shifts);
  return true;
}

function closeShift(username, finalCash, comment = '') {
  const shifts = getShifts();
  const activeShiftIndex = shifts.findIndex(s => s.status === 'Abierto');
  if (activeShiftIndex === -1) return null;

  const shift = shifts[activeShiftIndex];
  shift.closedBy = username;
  shift.closedAt = new Date().toISOString();
  shift.finalCash = Number(finalCash);
  shift.status = 'Cerrado';
  shift.comment = comment;

  // Calcular totales del Corte de Caja
  const totalSales = shift.transactions
    .filter(t => t.type === 'Venta')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = shift.expenses
    .reduce((sum, e) => sum + e.amount, 0);

  const expectedCash = shift.initialCash + totalSales - totalExpenses;
  shift.report = {
    totalSales,
    totalExpenses,
    expectedCash,
    actualCash: shift.finalCash,
    difference: shift.finalCash - expectedCash
  };

  saveShifts(shifts);
  return shift;
}

// === Gestión de Configuración ===
function getConfig() {
  return safeReadJson(FILES.config, {});
}

function saveConfig(configData) {
  safeWriteJson(FILES.config, configData);
  return configData;
}

// === Gestión de Catálogo ===
function getCatalog() {
  return safeReadJson(FILES.catalog, { categories: [], products: [] });
}

function saveCatalog(catalogData) {
  safeWriteJson(FILES.catalog, catalogData);
  return catalogData;
}

// Inicializar la base de datos inmediatamente al importar el módulo
initDb();

module.exports = {
  verifyUser,
  changePassword,
  addUser,
  deleteUser,
  getUsers,
  getOrders,
  addOrder,
  updateOrderStatus,
  getActiveShift,
  startShift,
  addExpenseToShift,
  addTransactionToShift,
  closeShift,
  getShifts,
  getConfig,
  saveConfig,
  getCatalog,
  saveCatalog
};
