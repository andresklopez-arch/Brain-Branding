import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Calendar, RefreshCw, MessageSquare } from 'lucide-react';
import { api } from '../services/api';

export default function LeadsCRM({ tenantId }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadLeads();
    }
  }, [tenantId]);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const data = await api.getLeads(tenantId);
      setLeads(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-base font-bold text-white">Prospectos Autogenerados (IA CRM)</h3>
          <p className="text-xs text-slate-400">Datos de contacto extraídos en tiempo real de tus conversaciones</p>
        </div>
        
        <button 
          onClick={loadLeads}
          disabled={loading}
          className="p-2 bg-slate-950/40 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && leads.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">Cargando prospectos...</div>
      ) : leads.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">
          No se han detectado prospectos aún. La IA guardará aquí nombres, teléfonos o correos que los clientes mencionen.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="pb-3">Nombre</th>
                <th className="pb-3">Contacto</th>
                <th className="pb-3">Canal Origen</th>
                <th className="pb-3">Datos Extraídos</th>
                <th className="pb-3">Notas de Interés</th>
                <th className="pb-3">Fecha Captura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-800/10 transition-colors">
                  <td className="py-3.5 font-bold text-white flex items-center space-x-2">
                    <div className="p-1.5 bg-slate-950/40 border border-slate-800 rounded-lg text-brand-400">
                      <User className="w-4 h-4" />
                    </div>
                    <span>{lead.nombre_extraido || 'No especificado'}</span>
                  </td>
                  <td className="py-3.5">
                    <div className="space-y-1">
                      {lead.email && (
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{lead.email}</span>
                        </div>
                      )}
                      {lead.telefono && (
                        <a 
                          href={`https://wa.me/${lead.telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${lead.nombre_extraido || ''}, te contacto de la empresa en relación a tu consulta en nuestros canales de atención.`)}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center space-x-1.5 text-brand-400 hover:text-brand-300 hover:underline transition-all"
                          title="Contactar por WhatsApp"
                        >
                          <Phone className="w-3.5 h-3.5 text-brand-500" />
                          <span>{lead.telefono}</span>
                        </a>
                      )}
                      {!lead.email && !lead.telefono && <span className="text-slate-600">Sin datos de contacto</span>}
                    </div>
                  </td>
                  <td className="py-3.5">
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-950/60 border border-slate-800 text-slate-300">
                      <MessageSquare className="w-3 h-3 text-slate-500" />
                      <span className="capitalize">{lead.red_social_origen}</span>
                    </span>
                  </td>
                  <td className="py-3.5">
                    <div className="flex flex-wrap gap-1.5 max-w-xs">
                      {lead.campos_personalizados_json && Object.entries(lead.campos_personalizados_json).length > 0 ? (
                        Object.entries(lead.campos_personalizados_json).map(([key, val]) => (
                          val && (
                            <span 
                              key={key} 
                              className="inline-flex items-center px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded text-[10px]"
                            >
                              <span className="font-bold uppercase mr-1">{key}:</span>
                              <span>{val}</span>
                            </span>
                          )
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">-</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 text-slate-400 max-w-xs truncate">
                    {lead.notas_interes_ia || 'Interés comercial general'}
                  </td>
                  <td className="py-3.5 text-slate-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
