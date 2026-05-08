import { useEffect } from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';

const ICONS = {
  success: <FiCheckCircle />,
  error: <FiAlertCircle />,
  info: <FiInfo />,
};

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => onDismiss(), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type || 'info'} animate-toast`}>
      <span className="toast-icon">{ICONS[toast.type] || ICONS.info}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={onDismiss}>
        <FiX />
      </button>
    </div>
  );
}
