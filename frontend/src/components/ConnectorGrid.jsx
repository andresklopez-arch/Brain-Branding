import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Smartphone, Instagram, Send, Mail, Twitter, 
  Video, Youtube, MapPin, Code, ShieldCheck, ChevronRight, Save, ToggleLeft, ToggleRight
} from 'lucide-react';
import { api } from '../services/api';

const CHANNELS_CONFIG = [
  { key: 'whatsapp', name: 'WhatsApp Business', icon: MessageSquare, color: 'border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40 bg-emerald-500/5', fields: [{key: 'whatsapp_phone_id', label: 'Phone Number ID'}, {key: 'whatsapp_token', label: 'Access Token', secret: true}] },
  { key: 'telegram', name: 'Telegram Bot', icon: Send, color: 'border-sky-500/20 text-sky-400 hover:border-sky-500/40 bg-sky-500/5', fields: [{key: 'telegram_bot_token', label: 'Bot Token', secret: true}] },
  { key: 'sms', name: 'Twilio SMS', icon: Smartphone, color: 'border-red-500/20 text-red-400 hover:border-red-500/40 bg-red-500/5', fields: [{key: 'twilio_sms_sid', label: 'Account SID'}, {key: 'twilio_sms_auth', label: 'Auth Token', secret: true}] },
  { key: 'instagram', name: 'Instagram Graph', icon: Instagram, color: 'border-pink-500/20 text-pink-400 hover:border-pink-500/40 bg-pink-500/5', fields: [{key: 'instagram_page_token', label: 'Page Access Token', secret: true}] },
  { key: 'messenger', name: 'Facebook Messenger', icon: MessageSquare, color: 'border-blue-500/20 text-blue-400 hover:border-blue-500/40 bg-blue-500/5', fields: [{key: 'messenger_page_id', label: 'Page ID'}, {key: 'messenger_page_token', label: 'Page Access Token', secret: true}] },
  { key: 'twitter', name: 'Twitter/X Bot', icon: Twitter, color: 'border-slate-500/20 text-slate-400 hover:border-slate-500/40 bg-slate-500/5', fields: [{key: 'twitter_x_bearer_token', label: 'Bearer Token', secret: true}] },
  { key: 'tiktok', name: 'TikTok Business', icon: Video, color: 'border-cyan-500/20 text-cyan-400 hover:border-cyan-500/40 bg-cyan-500/5', fields: [{key: 'tiktok_business_access_token', label: 'Business Access Token', secret: true}] },
  { key: 'youtube', name: 'YouTube Moderation', icon: Youtube, color: 'border-rose-500/20 text-rose-400 hover:border-rose-500/40 bg-rose-500/5', fields: [{key: 'youtube_api_key', label: 'Data API Key', secret: true}] },
  { key: 'google_business', name: 'Google Business', icon: MapPin, color: 'border-blue-500/20 text-blue-400 hover:border-blue-500/40 bg-blue-500/5', fields: [{key: 'google_business_profile_id', label: 'Profile ID'}] },
  { key: 'email', name: 'Email IMAP/SMTP', icon: Mail, color: 'border-yellow-500/20 text-yellow-400 hover:border-yellow-500/40 bg-yellow-500/5', fields: [{key: 'email_config_user', label: 'SMTP Email Address'}, {key: 'email_config_pass', label: 'SMTP App Password', secret: true}] },
  { key: 'web_widget', name: 'Chat Web Widget', icon: Code, color: 'border-indigo-500/20 text-indigo-400 hover:border-indigo-500/40 bg-indigo-500/5', fields: [], widgetEmbed: true }
];

export default function ConnectorGrid({ tenantId }) {
  const [credentials, setCredentials] = useState({});
  const [activeChannels, setActiveChannels] = useState({});
  const [expandedChannel, setExpandedChannel] = useState(null);
  const [formState, setFormState] = useState({});
  const [saveStatus, setSaveStatus] = useState({});

  useEffect(() => {
    if (tenantId) {
      loadCredentials();
    }
  }, [tenantId]);

  const loadCredentials = async () => {
    try {
      const data = await api.getCredentials(tenantId);
      setCredentials(data);
      // Map initial formState from fetched database credentials
      const initialForm = {};
      const initialActive = {};
      CHANNELS_CONFIG.forEach(chan => {
        chan.fields.forEach(field => {
          initialForm[field.key] = data[field.key] || '';
        });
        // Simplification: channel is active if token is present
        const hasToken = chan.fields.some(f => !!data[f.key]) || chan.key === 'web_widget';
        initialActive[chan.key] = hasToken;
      });
      setFormState(initialForm);
      setActiveChannels(initialActive);
    } catch (err) {
      console.error("Error loading credentials:", err);
    }
  };

  const handleToggle = (channelKey) => {
    setActiveChannels(prev => ({
      ...prev,
      [channelKey]: !prev[channelKey]
    }));
  };

  const handleInputChange = (fieldKey, value) => {
    setFormState(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleSave = async (channelKey) => {
    setSaveStatus(prev => ({ ...prev, [channelKey]: 'saving' }));
    try {
      const payload = {};
      const channel = CHANNELS_CONFIG.find(c => c.key === channelKey);
      channel.fields.forEach(field => {
        payload[field.key] = formState[field.key];
      });

      await api.updateCredentials(tenantId, payload);
      setSaveStatus(prev => ({ ...prev, [channelKey]: 'saved' }));
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [channelKey]: null }));
      }, 1500);
    } catch (err) {
      console.error(err);
      setSaveStatus(prev => ({ ...prev, [channelKey]: 'error' }));
    }
  };

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const embedCode = `<script src="${API_BASE_URL}/widget.js?tenant_id=${tenantId}"></script>`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {CHANNELS_CONFIG.map((chan) => {
        const IconComponent = chan.icon;
        const isExpanded = expandedChannel === chan.key;
        const isActive = activeChannels[chan.key];
        const status = saveStatus[chan.key];

        return (
          <div 
            key={chan.key}
            className={`border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 ${chan.color} ${isExpanded ? 'lg:col-span-2' : ''}`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-slate-950/40 border border-slate-800 rounded-lg">
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">{chan.name}</h3>
                </div>
                
                <button 
                  onClick={() => handleToggle(chan.key)}
                  className="focus:outline-none transition-transform active:scale-95"
                >
                  {isActive ? (
                    <ToggleRight className="w-9 h-9 text-brand-500" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-600" />
                  )}
                </button>
              </div>

              {isActive && (
                <div className="mt-3">
                  <button 
                    onClick={() => setExpandedChannel(isExpanded ? null : chan.key)}
                    className="flex items-center text-xs font-semibold text-brand-400 hover:text-brand-300 space-x-1"
                  >
                    <span>{isExpanded ? 'Ocultar Configuración' : 'Configurar Conector'}</span>
                    <ChevronRight className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="mt-4 space-y-3 pt-3 border-t border-slate-800/50">
                      {chan.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            {field.label}
                          </label>
                          <input
                            type={field.secret ? "password" : "text"}
                            value={formState[field.key] || ''}
                            onChange={(e) => handleInputChange(field.key, e.target.value)}
                            placeholder={`Ingresa ${field.label.toLowerCase()}`}
                            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-brand-500"
                          />
                        </div>
                      ))}

                      {chan.widgetEmbed && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Código Embed (JS)
                          </label>
                          <textarea
                            readOnly
                            rows={3}
                            value={embedCode}
                            onClick={(e) => { e.target.select(); document.execCommand('copy'); alert('Código copiado al portapapeles'); }}
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-[10px] text-emerald-400 font-mono focus:outline-none cursor-pointer"
                          />
                          <p className="text-[9px] text-slate-500 mt-1">Copia y pega este script en el cuerpo de tu HTML para renderizar el chat flotante.</p>
                        </div>
                      )}

                      {chan.fields.length > 0 && (
                        <button
                          onClick={() => handleSave(chan.key)}
                          className="mt-2 w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center space-x-1 transition-all"
                        >
                          <Save className="w-4 h-4" />
                          <span>{status === 'saving' ? 'Guardando...' : status === 'saved' ? '¡Guardado!' : 'Guardar Credenciales'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/10 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center space-x-1">
                <ShieldCheck className={`w-4 h-4 ${isActive ? 'text-emerald-500' : 'text-slate-600'}`} />
                <span>{isActive ? 'Activo' : 'Inactivo'}</span>
              </span>
              <span>v1.0</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
