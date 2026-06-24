import React, { useState } from 'react';
import { Bot, BarChart3, TrendingUp, DollarSign, Cpu, ArrowUpRight } from 'lucide-react';

const MOCK_DATA_7D = [
  { label: 'Lun', prompt: 4500, response: 1800, total: 6300 },
  { label: 'Mar', prompt: 5200, response: 2100, total: 7300 },
  { label: 'Mié', prompt: 3100, response: 1500, total: 4600 },
  { label: 'Jue', prompt: 8200, response: 3900, total: 12100 },
  { label: 'Vie', prompt: 9100, response: 4300, total: 13400 },
  { label: 'Sáb', prompt: 2500, response: 1200, total: 3700 },
  { label: 'Dom', prompt: 4100, response: 1900, total: 6000 }
];

const MOCK_DATA_30D = [
  { label: 'S1', prompt: 24000, response: 11000, total: 35000 },
  { label: 'S2', prompt: 35000, response: 16000, total: 51000 },
  { label: 'S3', prompt: 42000, response: 19000, total: 61000 },
  { label: 'S4', prompt: 31050, response: 14950, total: 46000 }
];

export default function GeminiUsageChart() {
  const [range, setRange] = useState('7d');
  const data = range === '7d' ? MOCK_DATA_7D : MOCK_DATA_30D;

  const totalPrompt = data.reduce((sum, d) => sum + d.prompt, 0);
  const totalResponse = data.reduce((sum, d) => sum + d.response, 0);
  const totalTokens = totalPrompt + totalResponse;
  
  // Cost calculation based on Gemini 2.5 Flash prices (roughly $0.075 per 1M input, $0.30 per 1M output)
  const estimatedCost = (totalPrompt * 0.000000075) + (totalResponse * 0.00000030);

  // SVG Chart sizing
  const width = 500;
  const height = 180;
  const paddingLeft = 40;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 20;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(...data.map(d => d.total)) * 1.15 || 10000;

  // Calculate points for the SVG path
  const points = data.map((d, index) => {
    const x = paddingLeft + (index / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.total / maxVal) * chartHeight;
    return { x, y, label: d.label, total: d.total };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  // Fills closed path for background gradient area
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
    : '';

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-2.5 text-indigo-400">
          <BarChart3 className="w-5 h-5" />
          <h2 className="text-base font-bold text-white uppercase tracking-wider">Consumo de IA (Gemini)</h2>
        </div>
        <div className="flex bg-slate-950/80 border border-slate-850 rounded-xl p-1 self-start sm:self-auto">
          <button
            onClick={() => setRange('7d')}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
              range === '7d' 
                ? 'bg-brand-650 text-white shadow' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Últimos 7 Días
          </button>
          <button
            onClick={() => setRange('30d')}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
              range === '30d' 
                ? 'bg-brand-650 text-white shadow' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Último Mes
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-950/30 border border-slate-850 rounded-2xl flex items-center space-x-3.5 shadow-sm">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total de Tokens</span>
            <span className="text-sm font-bold text-white tracking-wide">{totalTokens.toLocaleString()}</span>
          </div>
        </div>

        <div className="p-4 bg-slate-950/30 border border-slate-850 rounded-2xl flex items-center space-x-3.5 shadow-sm">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Prompt / Input</span>
            <span className="text-sm font-bold text-white tracking-wide">{totalPrompt.toLocaleString()} ({Math.round(totalPrompt/totalTokens*100)}%)</span>
          </div>
        </div>

        <div className="p-4 bg-slate-950/30 border border-slate-850 rounded-2xl flex items-center space-x-3.5 shadow-sm">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Costo Estimado</span>
            <span className="text-sm font-bold text-emerald-400 tracking-wide">${estimatedCost.toFixed(5)} USD</span>
          </div>
        </div>
      </div>

      {/* SVG Interactive Chart */}
      <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-2xl">
        <div className="relative">
          <svg className="w-full h-auto" viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0"/>
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + ratio * chartHeight;
              const val = Math.round(maxVal - ratio * maxVal);
              return (
                <g key={i} className="opacity-40">
                  <line 
                    x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} 
                    stroke="#1e293b" strokeWidth="0.8" strokeDasharray="3 3"
                  />
                  <text x={paddingLeft - 8} y={y + 3} fill="#475569" fontSize="8" textAnchor="end" fontWeight="bold">
                    {val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                  </text>
                </g>
              );
            })}

            {/* Area Fill */}
            {areaD && <path d={areaD} fill="url(#chartGrad)" />}

            {/* Line Path */}
            {pathD && <path d={pathD} stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

            {/* Dots */}
            {points.map((p, i) => (
              <g key={i} className="group cursor-pointer">
                <circle 
                  cx={p.x} cy={p.y} r="3.5" 
                  fill="#818cf8" stroke="#020617" strokeWidth="1.5"
                  className="transition-all hover:r-5"
                />
                
                {/* Tooltip on Hover */}
                <text 
                  x={p.x} y={p.y - 8} 
                  fill="#a5b4fc" fontSize="7" fontWeight="bold" 
                  textAnchor="middle" className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {p.total.toLocaleString()}
                </text>

                {/* X Axis Labels */}
                <text 
                  x={p.x} y={height - 4} 
                  fill="#475569" fontSize="8" fontWeight="bold" 
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="flex items-center justify-between text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-2.5 px-2">
          <span>Tokens de Entrada + Salida</span>
          <span className="flex items-center text-brand-400">
            <span>Ver detalles en vivo</span>
            <ArrowUpRight className="w-3 h-3 ml-0.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
