import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Send, Bot, User, ShieldAlert, ShieldCheck, 
  AlertCircle, Smartphone, Instagram, Globe, HelpCircle 
} from 'lucide-react';
import { api } from '../services/api';

const CHANNEL_ICONS = {
  whatsapp: { icon: MessageSquare, color: 'text-emerald-400' },
  messenger: { icon: MessageSquare, color: 'text-blue-400' },
  sms: { icon: Smartphone, color: 'text-red-400' },
  instagram: { icon: Instagram, color: 'text-pink-400' },
  telegram: { icon: Send, color: 'text-sky-400' },
  web_widget: { icon: Globe, color: 'text-indigo-400' }
};

export default function Inbox({ tenantId }) {
  const [conversations, setConversations] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  
  const wsRef = useRef(null);
  const chatBottomRef = useRef(null);

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
    // Scroll chat to bottom whenever messages update
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const data = await api.getConversations(tenantId);
      setConversations(data);
    } catch (err) {
      console.error(err);
    }
  };

  const setupWebSocket = () => {
    if (wsRef.current) wsRef.current.close();
    
    const wsUrl = api.getWebSocketUrl(tenantId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("[WS RECEIVED]", data);
      
      // Reload list or update messages in real-time
      if (data.event === "new_message" || data.event === "message_sent" || data.event === "human_handoff_alert") {
        loadConversations();
        
        // If current open conversation matches the update, append to message list
        if (selectedThread && selectedThread.contacto_identificador_plataforma === data.sender_id) {
          setMessages(prev => [
            ...prev, 
            {
              role: data.event === "message_sent" ? "model" : "user",
              content: data.content,
              timestamp: new Date().toISOString()
            }
          ]);
          
          if (data.event === "human_handoff_alert") {
            setSelectedThread(prev => ({ ...prev, ai_active_status: false }));
          }
        }
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(setupWebSocket, 3000);
    };
  };

  const handleSelectThread = async (thread) => {
    setLoading(true);
    try {
      const data = await api.getConversationDetail(tenantId, thread.id);
      setSelectedThread(data);
      setMessages(data.historial_chat_json || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAI = async (threadId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      await api.toggleAI(tenantId, threadId, newStatus);
      setSelectedThread(prev => ({ ...prev, ai_active_status: newStatus }));
      loadConversations();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedThread) return;

    const textToSend = replyText;
    setReplyText('');

    try {
      // Optimistic message append
      setMessages(prev => [
        ...prev,
        { role: 'model', content: textToSend, timestamp: new Date().toISOString(), by_human: true }
      ]);
      
      await api.sendHumanMessage(tenantId, selectedThread.id, textToSend);
      // Auto-turn off AI locally in thread model
      setSelectedThread(prev => ({ ...prev, ai_active_status: false }));
      loadConversations();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-[600px] bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* 1. Conversations List (Left Pane) */}
      <div className="w-1/3 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800 bg-slate-950/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Chats Activos</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No hay conversaciones activas.</div>
          ) : (
            conversations.map((thread) => {
              const chan = CHANNEL_ICONS[thread.canal_origen] || { icon: HelpCircle, color: 'text-slate-400' };
              const Icon = chan.icon;
              const isSelected = selectedThread?.id === thread.id;
              
              // Get last message text
              const history = thread.historial_chat_json || [];
              const lastMsg = history[history.length - 1]?.content || 'Sin mensajes';

              return (
                <button
                  key={thread.id}
                  onClick={() => handleSelectThread(thread)}
                  className={`w-full p-4 text-left flex items-start space-x-3 transition-colors hover:bg-slate-800/20 ${isSelected ? 'bg-brand-500/10 hover:bg-brand-500/15' : ''}`}
                >
                  <div className={`p-2 bg-slate-950/40 border border-slate-800 rounded-lg ${chan.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-xs font-bold text-white truncate">{thread.contacto_identificador_plataforma}</h4>
                      <span className="text-[9px] text-slate-500">{new Date(thread.ultima_interaccion_timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-1">{lastMsg}</p>
                    
                    <div className="mt-2 flex items-center space-x-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${thread.ai_active_status ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {thread.ai_active_status ? '🤖 IA Activa' : '👤 Humano'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Chat Area (Right Pane) */}
      <div className="flex-1 flex flex-col bg-slate-950/20">
        {selectedThread ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/30">
              <div>
                <h4 className="text-xs font-bold text-white">{selectedThread.contacto_identificador_plataforma}</h4>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Canal: {selectedThread.canal_origen}</p>
              </div>

              <div className="flex items-center space-x-3">
                {/* Human Takeover Toggle */}
                <button
                  onClick={() => handleToggleAI(selectedThread.id, selectedThread.ai_active_status)}
                  className={`text-xs font-semibold py-1.5 px-3 rounded-lg border transition-all flex items-center space-x-1.5 ${
                    selectedThread.ai_active_status 
                      ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 hover:bg-brand-500/20' 
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                  }`}
                >
                  {selectedThread.ai_active_status ? (
                    <>
                      <Bot className="w-4 h-4 animate-bounce" />
                      <span>Bot IA Respondiendo (Pausar)</span>
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4" />
                      <span>Agente Humano (Reactivar IA)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Warning Banner if AI is turned off */}
            {!selectedThread.ai_active_status && (
              <div className="bg-rose-500/5 border-b border-rose-500/20 px-4 py-2 flex items-center space-x-2 text-xs text-rose-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>La respuesta automática de IA está pausada. Intervención humana requerida.</span>
              </div>
            )}

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, index) => {
                const isAI = msg.role === 'model' && !msg.by_human;
                const isHumanAgent = msg.role === 'model' && msg.by_human;
                
                return (
                  <div 
                    key={index}
                    className={`flex ${isAI || isHumanAgent ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-xs ${
                      isAI 
                        ? 'bg-slate-900 border border-slate-800 text-slate-100' 
                        : isHumanAgent
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-800 text-slate-100'
                    }`}>
                      <p className="leading-relaxed">{msg.content}</p>
                      <div className="flex items-center justify-between mt-1 text-[8px] text-slate-400 space-x-4">
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {isAI && <span className="text-brand-400 font-semibold">🤖 AstroBot</span>}
                        {isHumanAgent && <span className="text-indigo-200 font-semibold">👤 Agente</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Reply Input Form */}
            <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-slate-950/30 flex space-x-3">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Escribe una respuesta... (Esto apagará el bot automáticamente)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-brand-500"
              />
              <button 
                type="submit"
                disabled={!replyText.trim()}
                className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition-all flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-slate-500">
            <MessageSquare className="w-12 h-12 mb-2 text-slate-700" />
            <p className="text-xs">Selecciona un chat activo para comenzar</p>
          </div>
        )}
      </div>
    </div>
  );
}
