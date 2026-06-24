import React, { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose, duration = 3000 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const icons = {
    success: <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
    error: <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
  };

  const bgColors = {
    success: 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100',
    error: 'bg-rose-950/90 border-rose-500/30 text-rose-100',
    info: 'bg-slate-950/90 border-indigo-500/30 text-indigo-100'
  };

  const keyframes = `
    @keyframes toastSlideIn {
      from { transform: translateY(1rem) scale(0.95); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
  `;

  return (
    <>
      <style>{keyframes}</style>
      <div 
        style={{ animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-4 py-3 border rounded-xl shadow-2xl backdrop-blur-md ${bgColors[type]}`}
      >
        {icons[type]}
        <span className="text-[11px] font-semibold tracking-wide">{message}</span>
        <button 
          onClick={onClose} 
          className="hover:opacity-80 focus:outline-none transition-opacity pl-2"
        >
          <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
        </button>
      </div>
    </>
  );
}
