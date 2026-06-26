const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === WebSocket Broadcast helper ===
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// === WebSocket Connection handling ===
wss.on('connection', ws => {
  console.log('[WS] Nuevo cliente conectado.');

  // Enviar estado de inicialización o pedidos activos al conectar
  ws.send(JSON.stringify({ 
    type: 'INIT', 
    data: { 
      orders: db.getOrders(),
      activeShift: db.getActiveShift()
    } 
  }));

  ws.on('message', messageStr => {
    try {
      const { type, data } = JSON.parse(messageStr);
      console.log(`[WS] Evento recibido: ${type}`);

      if (type === 'CREATE_ORDER') {
        const newOrder = db.addOrder(data);
        broadcast('NEW_ORDER', newOrder);
        // Si la orden viene ya cobrada directamente desde caja, registrar transacción al instante
        if (newOrder.status === 'Pagado') {
          db.addTransactionToShift(newOrder.id, newOrder.total, 'Venta');
          const activeShift = db.getActiveShift();
          broadcast('SHIFT_UPDATED', activeShift);
        }
      } 
      else if (type === 'UPDATE_STATUS') {
        const { orderId, status } = data;
        const updatedOrder = db.updateOrderStatus(orderId, status);
        if (updatedOrder) {
          broadcast('ORDER_UPDATED', updatedOrder);
          // Si el platillo está listo, disparar alerta auditiva/vibración
          if (status === 'Listo') {
            broadcast('ALERTA_LISTO', updatedOrder);
          }
          // Si se cobró la orden en caja, vincular la transacción al turno activo
          if (status === 'Pagado') {
            db.addTransactionToShift(orderId, updatedOrder.total, 'Venta');
            const activeShift = db.getActiveShift();
            broadcast('SHIFT_UPDATED', activeShift);
          }
        }
      }
    } catch (err) {
      console.error('[WS] Error al procesar mensaje:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Cliente desconectado.');
  });
});

// === REST API Routes ===

// Autenticación
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
  }

  const user = db.verifyUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  res.json({ success: true, user });
});

app.post('/api/change-password', (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  const success = db.changePassword(username, newPassword);
  if (!success) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  res.json({ success: true, message: 'Contraseña cambiada exitosamente.' });
});

app.post('/api/users/change-password-admin', (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  const success = db.changePassword(username, newPassword);
  if (!success) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  res.json({ success: true, message: 'NIP actualizado exitosamente.' });
});

// Gestión de Usuarios (Admin/Gerente)
app.get('/api/users', (req, res) => {
  const list = db.getUsers().map(u => ({
    username: u.username,
    role: u.role,
    mustChangePassword: u.mustChangePassword
  }));
  res.json(list);
});

app.post('/api/users', (req, res) => {
  const { username, role, password } = req.body;
  if (!username || !role || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const success = db.addUser(username, role, password);
  if (!success) {
    return res.status(400).json({ error: 'El usuario ya existe.' });
  }

  res.json({ success: true, message: 'Usuario creado exitosamente.' });
});

app.delete('/api/users/:username', (req, res) => {
  const { username } = req.params;
  const success = db.deleteUser(username);
  if (!success) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }
  res.json({ success: true, message: 'Usuario eliminado exitosamente.' });
});

// Gestión de Turnos y Caja
app.get('/api/shift/active', (req, res) => {
  res.json(db.getActiveShift() || { status: 'Cerrado' });
});

app.post('/api/shift/start', (req, res) => {
  const { username, initialCash } = req.body;
  if (!username || initialCash === undefined) {
    return res.status(400).json({ error: 'Usuario y saldo inicial requeridos.' });
  }

  const shift = db.startShift(username, initialCash);
  if (!shift) {
    return res.status(400).json({ error: 'Ya existe un turno activo.' });
  }

  broadcast('SHIFT_UPDATED', shift);
  res.json({ success: true, shift });
});

app.post('/api/shift/expense', (req, res) => {
  const { username, amount, description } = req.body;
  if (!username || !amount || !description) {
    return res.status(400).json({ error: 'Campos requeridos incompletos.' });
  }

  const expense = db.addExpenseToShift(username, amount, description);
  if (!expense) {
    return res.status(400).json({ error: 'No hay un turno activo en caja.' });
  }

  const activeShift = db.getActiveShift();
  broadcast('SHIFT_UPDATED', activeShift);
  res.json({ success: true, expense });
});

app.post('/api/shift/close', (req, res) => {
  const { username, finalCash, comment } = req.body;
  if (!username || finalCash === undefined) {
    return res.status(400).json({ error: 'Usuario y efectivo final requeridos.' });
  }

  const closedShift = db.closeShift(username, finalCash, comment);
  if (!closedShift) {
    return res.status(400).json({ error: 'No hay un turno activo para cerrar.' });
  }

  broadcast('SHIFT_UPDATED', null);
  res.json({ success: true, shift: closedShift });
});

app.get('/api/shift/history', (req, res) => {
  res.json(db.getShifts());
});

// Configuración general
app.get('/api/config', (req, res) => {
  res.json(db.getConfig());
});

app.post('/api/config', (req, res) => {
  const newConfig = db.saveConfig(req.body);
  res.json({ success: true, config: newConfig });
});

// Pedidos
app.get('/api/orders', (req, res) => {
  res.json(db.getOrders());
});

// === Endpoints del Catálogo de Artículos ===
app.get('/api/catalog', (req, res) => {
  res.json(db.getCatalog());
});

app.post('/api/catalog/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre de categoría requerido.' });
  
  const catalog = db.getCatalog();
  const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
  
  if (catalog.categories.some(c => c.id === id)) {
    return res.status(400).json({ error: 'La categoría ya existe.' });
  }

  catalog.categories.push({ id, name });
  db.saveCatalog(catalog);
  
  res.json({ success: true, categories: catalog.categories });
});

app.post('/api/catalog/products', (req, res) => {
  const { name, price, category, desc, img } = req.body;
  if (!name || price === undefined || !category) {
    return res.status(400).json({ error: 'Nombre, precio y categoría requeridos.' });
  }

  const catalog = db.getCatalog();
  const id = 'prod-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  
  const newProduct = {
    id,
    name,
    price: Number(price),
    category,
    desc: desc || '',
    img: img || ''
  };

  catalog.products.push(newProduct);
  db.saveCatalog(catalog);

  res.json({ success: true, product: newProduct });
});

app.put('/api/catalog/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, category, desc, img } = req.body;
  
  if (!name || price === undefined || !category) {
    return res.status(400).json({ error: 'Nombre, precio y categoría requeridos.' });
  }

  const catalog = db.getCatalog();
  const prodIndex = catalog.products.findIndex(p => p.id === id);
  if (prodIndex === -1) return res.status(404).json({ error: 'Producto no encontrado.' });

  catalog.products[prodIndex] = {
    id,
    name,
    price: Number(price),
    category,
    desc: desc || '',
    img: img || ''
  };
  
  db.saveCatalog(catalog);
  res.json({ success: true, product: catalog.products[prodIndex] });
});

app.delete('/api/catalog/products/:id', (req, res) => {
  const { id } = req.params;
  const catalog = db.getCatalog();
  
  const filtered = catalog.products.filter(p => p.id !== id);
  if (catalog.products.length === filtered.length) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  catalog.products = filtered;
  db.saveCatalog(catalog);
  res.json({ success: true, message: 'Producto eliminado.' });
});

// Endpoint para obtener la IP de red local del servidor
app.get('/api/network-ip', (req, res) => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let ipAddress = 'localhost';
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
        break;
      }
    }
    if (ipAddress !== 'localhost') break;
  }
  res.json({ ip: ipAddress });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] Servidor corriendo en http://localhost:${PORT}`);
  
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  console.log('[SERVER] Para acceder desde otros dispositivos (celulares, tablets) en la misma red Wi-Fi, abre:');
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   👉 http://${iface.address}:${PORT}/`);
      }
    }
  }
});
