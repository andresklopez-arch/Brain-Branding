const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = {
  // One-Click Setup
  async setupTenant(nombreEmpresa, websiteUrl) {
    const url = `${API_BASE_URL}/tenants/setup?nombre_empresa=${encodeURIComponent(nombreEmpresa)}&website_url=${encodeURIComponent(websiteUrl)}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error('Error al configurar la empresa');
    return res.json();
  },

  // Get credentials
  async getCredentials(tenantId) {
    const res = await fetch(`${API_BASE_URL}/tenants/${tenantId}/credentials`);
    if (!res.ok) throw new Error('Error al obtener credenciales');
    return res.json();
  },

  // Save/Update credentials
  async updateCredentials(tenantId, payload) {
    const res = await fetch(`${API_BASE_URL}/tenants/${tenantId}/credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error al actualizar credenciales');
    return res.json();
  },

  // Get CRM Leads
  async getLeads(tenantId) {
    const res = await fetch(`${API_BASE_URL}/crm/${tenantId}/leads`);
    if (!res.ok) throw new Error('Error al obtener prospectos del CRM');
    return res.json();
  },

  // Get active conversations list
  async getConversations(tenantId) {
    const res = await fetch(`${API_BASE_URL}/inbox/${tenantId}/conversations`);
    if (!res.ok) throw new Error('Error al obtener conversaciones');
    return res.json();
  },

  // Get specific conversation
  async getConversationDetail(tenantId, threadId) {
    const res = await fetch(`${API_BASE_URL}/inbox/${tenantId}/conversations/${threadId}`);
    if (!res.ok) throw new Error('Error al obtener detalles de la conversación');
    return res.json();
  },

  // Toggle AI bot status
  async toggleAI(tenantId, threadId, active) {
    const res = await fetch(`${API_BASE_URL}/inbox/${tenantId}/conversations/${threadId}/toggle-ai?active=${active}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Error al cambiar estado de la IA');
    return res.json();
  },

  // Send human intervention message
  async sendHumanMessage(tenantId, threadId, message) {
    const res = await fetch(`${API_BASE_URL}/inbox/${tenantId}/conversations/${threadId}/send?message=${encodeURIComponent(message)}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Error al enviar mensaje');
    return res.json();
  },

  // Login (simplificado)
  async login(nombreEmpresa) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_empresa: nombreEmpresa })
    });
    if (!res.ok) throw new Error('Empresa no encontrada o credenciales inválidas');
    return res.json();
  },

  // Get WebSocket URL helper
  getWebSocketUrl(tenantId) {
    const base = API_BASE_URL.replace(/^http/, 'ws');
    return `${base}/inbox/${tenantId}/ws`;
  }
};
