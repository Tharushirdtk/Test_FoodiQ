import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import '../styles/ToastContainer.css';

const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

let idSeq = 1;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, { duration = 2500, type = 'default' } = {}) => {
    const id = idSeq++;
    setToasts((prev) => [...prev, { id, message, duration, type }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map(t => {
      const timer = setTimeout(() => removeToast(t.id), t.duration);
      return () => clearTimeout(timer);
    });
    return () => timers.forEach(fn => fn());
  }, [toasts, removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="toast-root" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div className="toast-message">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastContext;
