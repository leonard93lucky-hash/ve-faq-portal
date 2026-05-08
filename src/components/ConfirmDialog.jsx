import { FiAlertTriangle, FiLoader } from 'react-icons/fi';
import { useState } from 'react';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-dialog glass animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon-wrap">
          <FiAlertTriangle className="confirm-icon" />
        </div>
        <h3>{title || 'Are you sure?'}</h3>
        <p>{message || 'This action cannot be undone.'}</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-danger" onClick={handleConfirm} disabled={loading} id="confirm-delete-btn">
            {loading ? <><FiLoader className="spin" /> Deleting...</> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
