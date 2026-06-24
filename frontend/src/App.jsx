import React, { useState, useEffect } from 'react';
import { 
  Sparkles, MessageSquare, Shield, Users, Radio, LogOut, Code, Bot, Send
} from 'lucide-react';
import SetupForm from './components/SetupForm';
import ConnectorGrid from './components/ConnectorGrid';
import Inbox from './components/Inbox';
import LeadsCRM from './components/LeadsCRM';
import { api } from './services/api';

export default function App() {
  const [tenant, setTenant] = useState(null);
  const [activeTab, setActiveTab] = useState('connectors');
  const [isWidgetView, setIsWidgetView] = useState(false);
  const [notification, setNotification] = useState(null);

  // Connect websocket for background notifications in dashboard
  useEffect(() => {
    if (!tenant) return;
    const wsUrl = api.getWebSocketUrl(tenant.id);
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "scraper_finished") {
          setNotification({
            status: data.status,
            message: data.message
          });
          // Auto-dismiss after 6 seconds
          setTimeout(() => setNotification(null), 6000);
        }
      } catch (err) {
        console.error("[WS NOTIFICATION ERROR]", err);
      }
    };
    return () => ws.close();
  }, [tenant]);
  
  // Widget specific states
  const [widgetTenantId, setWidgetTenantId] = useState(null);
  const [widgetMessages, setWidgetMessages] = useState([
    { role: 'model', content: '¡Hola! ¿En qué puedo ayudarte hoy?' }
  ]);
  const [widgetInput, setWidgetInput] = useState('');
  const [widgetContactId, setWidgetContactId] = useState('');

  useEffect(() => {
    // Check if URL is for the floating widget iframe
    const params = new URLSearchParams(window.location.search);
    const tenantIdParam = params.get('tenant_id');
    const path = window.location.pathname;

    if (tenantIdParam && (path.includes('widget') || params.get('widget') === 'true')) {
      setIsWidgetView(true);
      setWidgetTenantId(tenantIdParam);
      // Generate a random client session identifier for this widget session
      setWidgetContactId('client_' + Math.random().toString(36).substring(2, 9));
      
      // Connect to websocket to receive replies in real-time
      const wsUrl = api.getWebSocketUrl(tenantIdParam);
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // If message is sent back to this client
        if (data.event === "message_sent" && data.sender_id === widgetContactId) {
          setWidgetMessages(prev => [
            ...prev,
            { role: 'model', content: data.content }
          ]);
        }
      };
      
      return () => ws.close();
    } else {
      // Standard Dashboard Flow: check if logged in previously
      const savedTenant = localStorage.getItem('astro_tenant');
      if (savedTenant) {
        setTenant(JSON.parse(savedTenant));
      }
    }
  }, []);

  const handleSetupComplete = (data) => {
    setTenant(data);
    localStorage.setItem('astro_tenant', JSON.stringify(data));
  };

  const handleLogout = () => {
    setTenant(null);
    localStorage.removeItem('astro_tenant');
  };

  const handleWidgetSend = async (e) => {
    e.preventDefault();
    if (!widgetInput.trim() || !widgetTenantId) return;

    const text = widgetInput;
    setWidgetInput('');
    
    // Append user message locally
    setWidgetMessages(prev => [...prev, { role: 'user', content: text }]);

    try {
      // Call widget webhook in backend
      const res = await fetch(`http://localhost:8000/webhooks/${widgetTenantId}/widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacto_id: widgetContactId,
          mensaje: text
        })
      });
      
      // In mock mode (or keyless), the webhook immediately triggers websocket push, 
      // but in case of standard fallback or no websocket receipt, we poll or append
    } catch (err) {
      console.error(err);
    }
  };

  // --- RENDER 1: Embedded Chat Widget View ---
  if (isWidgetView) {
    return (
      <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 font-sans border border-slate-800 rounded-xl overflow-hidden">
        {/* Widget Header */}
        <div className="bg-brand-600 px-4 py-3 flex items-center space-x-2 shadow-md">
          <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center space-x-1">
              <span>Soporte Astro Link</span>
              <Bot className="w-3.5 h-3.5" />
            </h4>
            <p className="text-[10px] text-brand-200">Respuesta inteligente instantánea</p>
          </div>
        </div>

        {/* Message Viewport */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/30">
          {widgetMessages.map((msg, index) => {
            const isBot = msg.role === 'model';
            return (
              <div 
                key={index}
                className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}
              >
                <div className={`max-w-[75%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  isBot 
                    ? 'bg-slate-900 border border-slate-800 text-slate-100' 
                    : 'bg-brand-600 text-white shadow-md'
                }`}>
                  <p>{msg.content}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Message Input Form */}
        <form onSubmit={handleWidgetSend} className="p-3 border-t border-slate-800 bg-slate-950 flex space-x-2">
          <input
            type="text"
            value={widgetInput}
            onChange={(e) => setWidgetInput(e.target.value)}
            placeholder="Escribe tu consulta..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-brand-500"
          />
          <button 
            type="submit"
            disabled={!widgetInput.trim()}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white p-2 rounded-lg transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }

  // --- RENDER 2: Client Landing Page (Before Setup) ---
  if (!tenant) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-3/4 left-1/3 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl"></div>
        
        <div className="z-10 text-center mb-8">
          <h1 className="text-4xl font-extrabold text-white tracking-tight flex items-center justify-center space-x-2">
            <span>Astro Link</span>
            <span className="text-brand-500 font-normal">🚀</span>
          </h1>
          <p className="text-slate-400 mt-2 max-w-md text-sm leading-relaxed">
            Plataforma Omnicanal Multi-tenant para automatizar ventas, soporte y CRM mediante IA (Gemini 3.5 Flash).
          </p>
        </div>

        <SetupForm onSetupComplete={handleSetupComplete} />
      </div>
    );
  }

  // --- RENDER 3: Full Dashboard Pane ---
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Real-time Webhook Scraper Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[99999] max-w-sm w-full bg-slate-900 border ${
          notification.status === 'success' ? 'border-emerald-500/30' : 'border-rose-500/30'
        } rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 duration-300`}>
          <div className="flex items-start space-x-3">
            <div className={`p-2 rounded-lg ${
              notification.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {notification.status === 'success' ? 'Indexación Completada' : 'Error de Indexación'}
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-slate-500 hover:text-white transition-all text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <nav className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex justify-between items-center z-20">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-500/10 rounded-lg text-brand-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">Astro Link Dashboard</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">{tenant.nombre_empresa} • Plan {tenant.plan_saas}</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-rose-400 font-semibold py-1.5 px-3 rounded-lg hover:bg-slate-800/40 border border-transparent hover:border-rose-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        
        {/* Summary Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-5 flex items-center space-x-4">
            <div className="p-3 bg-brand-500/10 rounded-lg text-brand-400"><MessageSquare className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Conversaciones Activas</p>
              <h4 className="text-xl font-bold text-white mt-0.5">Real-time</h4>
            </div>
          </div>
          <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-5 flex items-center space-x-4">
            <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400"><Users className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Leads CRM (IA)</p>
              <h4 className="text-xl font-bold text-white mt-0.5">Captura Activa</h4>
            </div>
          </div>
          <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-5 flex items-center space-x-4">
            <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400"><Radio className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Canales 360°</p>
              <h4 className="text-xl font-bold text-white mt-0.5">10 Integrados</h4>
            </div>
          </div>
          <div className="bg-slate-900/30 border border-slate-800/60 rounded-xl p-5 flex items-center space-x-4">
            <div className="p-3 bg-sky-500/10 rounded-lg text-sky-400"><Shield className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Motor IA</p>
              <h4 className="text-xl font-bold text-white mt-0.5">Gemini 3.5 Flash</h4>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="border-b border-slate-800 flex space-x-6 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('connectors')}
            className={`pb-3 relative transition-all ${activeTab === 'connectors' ? 'text-brand-400' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Conectores Omnicanal</span>
            {activeTab === 'connectors' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"></div>}
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`pb-3 relative transition-all ${activeTab === 'inbox' ? 'text-brand-400' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Bandeja Entrada Unificada</span>
            {activeTab === 'inbox' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"></div>}
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`pb-3 relative transition-all ${activeTab === 'crm' ? 'text-brand-400' : 'text-slate-400 hover:text-white'}`}
          >
            <span>Prospectos CRM (Leads)</span>
            {activeTab === 'crm' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"></div>}
          </button>
        </div>

        {/* Tab Content Rendering */}
        <div className="min-h-[400px]">
          {activeTab === 'connectors' && <ConnectorGrid tenantId={tenant.id} />}
          {activeTab === 'inbox' && <Inbox tenantId={tenant.id} />}
          {activeTab === 'crm' && <LeadsCRM tenantId={tenant.id} />}
        </div>
      </main>
    </div>
  );
}
