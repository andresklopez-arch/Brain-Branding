import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Send, Bot, User, Globe, Smartphone, Instagram, 
  HelpCircle, Trash2, Settings, ArrowRight, ShieldCheck, AlertCircle, RefreshCw
} from 'lucide-react';
import { api } from '../services/api';

const CHANNELS = [
  { key: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { key: 'telegram', name: 'Telegram', icon: Send, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  { key: 'sms', name: 'Twilio SMS', icon: Smartphone, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { key: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
  { key: 'web_widget', name: 'Chat Widget', icon: Globe, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' }
];

export default function SimulatedInbox({ tenantId }) {
  const [selectedChannel, setSelectedChannel] = useState('web_widget');
  const [contactId, setContactId] = useState('sim-user-77');
  const [messageText, setMessageText] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  
  // Widget Customizer States (Sugerencia 25)
  const [widgetTheme, setWidgetTheme] = useState(() => localStorage.getItem('astrolink_w_theme') || '#4F46E5');
  const [widgetWelcome, setWidgetWelcome] = useState(() => localStorage.getItem('astrolink_w_welcome') || '¡Hola! ¿Cómo podemos ayudarte hoy?');
  const [widgetLogo, setWidgetLogo] = useState(() => localStorage.getItem('astrolink_w_logo') || '🤖');

  const wsRef = useRef(null);
  const chatBottomRef = useRef(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (tenantId) {
      loadConversations();
      setupWebSocket();
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [tenantId]);

  useEffect(() => {
    if (activeThread) {
      loadThreadMessages(activeThread.id);
    }
  }, [activeThread]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const data = await api.getConversations(tenantId);
      setConversations(data);
      // Select the first conversation if none selected
      if (data.length > 0 && !activeThread) {
        setActiveThread(data[0]);
      }
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  };

  const loadThreadMessages = async (threadId) => {
    try {
      const data = await api.getConversationDetail(tenantId, threadId);
      setMessages(data.historial_chat_json || []);
    } catch (err) {
      console.error("Error loading thread messages:", err);
    }
  };

  const setupWebSocket = () => {
    if (wsRef.current) wsRef.current.close();
    const wsUrl = api.getWebSocketUrl(tenantId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("[SIMULATOR WS RECEIVED]", data);
      
      if (["new_message", "message_sent", "spam_alert", "human_handoff_alert"].includes(data.event)) {
        loadConversations();
        if (activeThread && activeThread.contacto_identificador_plataforma === data.sender_id) {
          loadThreadMessages(activeThread.id);
        }
      }
    };
  };

  const handleSaveWidgetConfig = () => {
    localStorage.setItem('astrolink_w_theme', widgetTheme);
    localStorage.setItem('astrolink_w_welcome', widgetWelcome);
    localStorage.setItem('astrolink_w_logo', widgetLogo);
    alert("¡Configuración del widget flotante guardada localmente!");
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!messageText.trim() || !contactId.trim()) return;

    setSending(true);
    try {
      let res;
      const simId = 'sim-' + Math.random().toString(36).substring(7);

      if (selectedChannel === 'web_widget') {
        res = await fetch(`${API_BASE_URL}/webhooks/${tenantId}/widget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contacto_id: contactId,
            mensaje: messageText
          })
        });
      } else if (selectedChannel === 'whatsapp') {
        res = await fetch(`${API_BASE_URL}/webhooks/${tenantId}/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entry: [{
              changes: [{
                value: {
                  messages: [{
                    id: simId,
                    from: contactId,
                    text: { body: messageText }
                  }]
                }
              }]
            }]
          })
        });
      } else if (selectedChannel === 'telegram') {
        res = await fetch(`${API_BASE_URL}/webhooks/${tenantId}/telegram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            update_id: Math.floor(Math.random() * 100000),
            message: {
              chat: { id: contactId },
              text: messageText
            }
          })
        });
      } else if (selectedChannel === 'sms') {
        const formData = new URLSearchParams();
        formData.append('From', contactId);
        formData.append('Body', messageText);
        formData.append('MessageSid', simId);
        res = await fetch(`${API_BASE_URL}/webhooks/${tenantId}/sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });
      } else if (selectedChannel === 'instagram') {
        res = await fetch(`${API_BASE_URL}/webhooks/${tenantId}/instagram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entry: [{
              messaging: [{
                message: { mid: simId, text: messageText },
                sender: { id: contactId }
              }]
            }]
          })
        });
      }

      if (!res.ok) throw new Error("Error procesando simulación de canal");
      
      setMessageText('');
      // Force reload thread
      setTimeout(() => {
        loadConversations();
        if (activeThread) loadThreadMessages(activeThread.id);
      }, 800);

    } catch (err) {
      console.error(err);
      alert(err.message || "Error al conectar con la API de simulación");
    } finally {
      setSending(false);
    }
  };

  const currentChannelObj = CHANNELS.find(c => c.key === selectedChannel);
  const IconComponent = currentChannelObj?.icon || Globe;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 p-1">
      {/* Col 1: Configurar Simulador & Widget Customizer */}
      <div className="space-y-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4 backdrop-blur-sm shadow-xl">
          <div className="flex items-center space-x-2 text-indigo-400">
            <RefreshCw className="w-5 h-5" />
            <h2 className="text-base font-bold text-white uppercase tracking-wider">Simulador de Webhooks</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Envía mensajes de prueba simulando diferentes redes sociales para evaluar la respuesta de Gemini AI en tiempo real.
          </p>

          <div className="space-y-3">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Red Social del Remitente</label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map(chan => {
                const ChanIcon = chan.icon;
                const isSelected = selectedChannel === chan.key;
                return (
                  <button
                    key={chan.key}
                    type="button"
                    onClick={() => {
                      setSelectedChannel(chan.key);
                      // Suggest mock identifiers
                      if (chan.key === 'whatsapp') setContactId('5215512345678');
                      else if (chan.key === 'telegram') setContactId('98765432');
                      else if (chan.key === 'sms') setContactId('+14155552671');
                      else if (chan.key === 'instagram') setContactId('insta_user_mock');
                      else setContactId('sim-user-77');
                    }}
                    className={`flex items-center space-x-2 p-2.5 rounded-xl border text-[10px] font-semibold transition-all ${
                      isSelected 
                        ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 shadow-lg shadow-indigo-500/5'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ChanIcon className="w-4 h-4" />
                    <span>{chan.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID / Número del Contacto</label>
            <input
              type="text"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-brand-500"
              placeholder="Ej. +5215512345678 o user_name"
            />
          </div>
        </div>

        {/* Widget Customizer (Sugerencia 25) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4 backdrop-blur-sm shadow-xl">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Settings className="w-5 h-5" />
            <h2 className="text-base font-bold text-white uppercase tracking-wider">Diseño del Chat Widget</h2>
          </div>
          
          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Color del Tema</label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={widgetTheme}
                  onChange={(e) => setWidgetTheme(e.target.value)}
                  className="w-9 h-9 bg-transparent border-0 cursor-pointer rounded"
                />
                <span className="text-xs text-slate-300 font-mono">{widgetTheme}</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mensaje de Bienvenida</label>
              <textarea
                value={widgetWelcome}
                onChange={(e) => setWidgetWelcome(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                placeholder="Mensaje inicial de la IA..."
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Icono / Avatar del Bot</label>
              <input
                type="text"
                value={widgetLogo}
                onChange={(e) => setWidgetLogo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                placeholder="Ej: 🤖, 💬, 🚀"
              />
            </div>

            <button
              onClick={handleSaveWidgetConfig}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-2 rounded-xl text-xs transition-all shadow-md"
            >
              Guardar Diseño de Widget
            </button>
          </div>
        </div>
      </div>

      {/* Col 2: Chat Simulator View (Mocked Phone) */}
      <div className="xl:col-span-2">
        <div className="bg-slate-950 border border-slate-900 rounded-[40px] p-4 max-w-[450px] mx-auto shadow-2xl relative">
          {/* Top Notch speaker */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-950 rounded-full border border-slate-900 z-10 flex items-center justify-center space-x-1">
            <div className="w-12 h-1 bg-slate-900 rounded-full"></div>
            <div className="w-2.5 h-2.5 bg-slate-900 rounded-full"></div>
          </div>

          <div className="bg-slate-900/40 border border-slate-900 rounded-[32px] overflow-hidden flex flex-col h-[650px]">
            {/* Header info */}
            <div className="p-4 pt-8 bg-slate-950/60 border-b border-slate-900 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-xl">
                  {widgetLogo}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Agente de IA Astro</h4>
                  <span className="text-[9px] text-emerald-400 font-semibold flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping mr-1"></span>
                    En línea ({currentChannelObj?.name || 'Widget'})
                  </span>
                </div>
              </div>
              <IconComponent className="w-5 h-5 text-slate-500" />
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex justify-center my-2">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/60 border border-slate-900 px-2 py-0.5 rounded-full">
                  Hoy
                </span>
              </div>

              {/* Initial welcome message */}
              <div className="flex items-start space-x-2 max-w-[85%]">
                <div className="w-7 h-7 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-xs">
                  🤖
                </div>
                <div className="bg-slate-950 border border-slate-900/60 rounded-2xl p-3 text-[10px] text-slate-300 leading-relaxed shadow-sm">
                  {widgetWelcome}
                </div>
              </div>

              {messages.map((msg, index) => {
                const isModel = msg.role === 'model';
                const isSystem = msg.role === 'system';
                
                if (isSystem) {
                  return (
                    <div key={index} className="flex justify-center my-2">
                      <div className="bg-amber-950/20 border border-amber-500/20 text-amber-400 rounded-xl px-3 py-1 text-[8px] font-semibold max-w-[90%] text-center">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={index} className={`flex items-start space-x-2 max-w-[85%] ${isModel ? '' : 'ml-auto flex-row-reverse space-x-reverse'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${
                      isModel 
                        ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400' 
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    }`}>
                      {isModel ? '🤖' : '👤'}
                    </div>
                    <div className={`rounded-2xl p-3 text-[10px] leading-relaxed shadow-sm ${
                      isModel 
                        ? 'bg-slate-950 border border-slate-900 text-slate-300' 
                        : 'bg-indigo-600 text-white border border-indigo-500'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Message Area */}
            <form onSubmit={handleSendMessage} className="p-3 bg-slate-950/60 border-t border-slate-900 flex space-x-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Escribe a ${currentChannelObj?.name || 'Astro'}...`}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-brand-500"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white p-2 rounded-xl transition-all flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
