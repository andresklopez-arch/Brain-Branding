import React, { useState } from 'react';
import { Sparkles, Globe, ArrowRight, Loader } from 'lucide-react';
import { api } from '../services/api';

export default function SetupForm({ onSetupComplete }) {
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombreEmpresa || !websiteUrl) return;

    setLoading(true);
    setStatusMessage('Indexando tu negocio con IA...');

    try {
      const data = await api.setupTenant(nombreEmpresa, websiteUrl);
      setStatusMessage('¡Empresa creada con éxito! Iniciando escaneo del sitio en segundo plano...');
      
      // Delay slightly for visual comfort
      setTimeout(() => {
        onSetupComplete(data);
      }, 1500);
    } catch (err) {
      console.error(err);
      setStatusMessage(err.message || 'Error al configurar la cuenta. Reintenta.');
      setLoading(false);
    }
  };

  return (
    <div className="relative max-w-lg w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl overflow-hidden group">
      {/* Decorative gradient overlay */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl group-hover:bg-brand-500/20 transition-all duration-700"></div>
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl"></div>

      <div className="relative z-10">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-brand-500/10 rounded-xl border border-brand-500/20 text-brand-400">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Activación en un Clic</h2>
            <p className="text-sm text-slate-400">Configura tu agente inteligente Astro Link de inmediato</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Nombre de la Empresa</label>
            <input
              type="text"
              required
              disabled={loading}
              placeholder="Ej. Hamburguesas Gourmet Inc."
              value={nombreEmpresa}
              onChange={(e) => {
                setNombreEmpresa(e.target.value);
                if (statusMessage) setStatusMessage('');
              }}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Sitio Web de Referencia</label>
            <div className="relative">
              <Globe className="absolute left-4 top-3.5 w-5 h-5 text-slate-600" />
              <input
                type="url"
                required
                disabled={loading}
                placeholder="https://tupaginaweb.com"
                value={websiteUrl}
                onChange={(e) => {
                  setWebsiteUrl(e.target.value);
                  if (statusMessage) setStatusMessage('');
                }}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">Nuestra IA auto-rastreará esta web para absorber precios, servicios y FAQs.</p>
          </div>

          {statusMessage && (
            <div className="flex items-center space-x-3 bg-slate-950/40 border border-slate-800 rounded-xl p-4 text-sm text-slate-300">
              {loading && <Loader className="w-5 h-5 text-brand-400 animate-spin flex-shrink-0" />}
              <span>{statusMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !nombreEmpresa || !websiteUrl}
            className="w-full relative overflow-hidden group/btn bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center space-x-2 transition-all duration-300 shadow-lg shadow-brand-500/20 disabled:opacity-40 disabled:pointer-events-none"
          >
            <span>Crear Cuenta & Indexar con IA</span>
            <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
}
