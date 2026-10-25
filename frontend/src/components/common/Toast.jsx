import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'info', onClose, duration = 4000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const isSuccess = type === 'success' || message.toLowerCase().includes('success');
  const isError = type === 'error' || message.toLowerCase().includes('fail') || message.toLowerCase().includes('error');

  const Icon = isSuccess ? CheckCircle2 : isError ? AlertCircle : Info;
  const toastClass = isSuccess ? 'ciq-toast-success' : isError ? 'ciq-toast-error' : '';

  return (
    <div className="ciq-toast-container">
      <div className={`ciq-toast ${toastClass}`}>
        <Icon size={18} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{message}</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 0,
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            opacity: 0.8,
          }}
          aria-label="Dismiss message"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
