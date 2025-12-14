import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 6000); 
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      icon: <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: <Info className="w-6 h-6 text-blue-600 flex-shrink-0" />
    },
  };

  const style = styles[type];

  return (
    <div className={`fixed top-4 left-4 right-4 z-[3000] flex items-start gap-3 p-4 rounded-xl border shadow-2xl transition-all animate-[slideIn_0.3s_ease-out] ${style.bg} ${style.border}`}>
      {style.icon}
      <div className={`flex-1 text-sm font-bold whitespace-pre-line leading-relaxed ${style.text}`}>
        {message}
      </div>
      <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-full transition-colors">
        <X className="w-5 h-5 opacity-40" />
      </button>
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};