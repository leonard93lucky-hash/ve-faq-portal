import { FiClock, FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw } from 'react-icons/fi';

const ACTION_ICONS = {
  ADD: <FiPlus />,
  EDIT: <FiEdit2 />,
  DELETE: <FiTrash2 />,
};

const ACTION_COLORS = {
  ADD: 'log-action-add',
  EDIT: 'log-action-edit',
  DELETE: 'log-action-delete',
};

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivityLog({ isOpen, onClose, logs, onRefresh }) {
  if (!isOpen) return null;

  return (
    <div className="activity-log-overlay" onClick={onClose}>
      <div className="activity-log-panel glass animate-slide-in" onClick={e => e.stopPropagation()}>
        <div className="activity-log-header">
          <h2><FiClock style={{ marginRight: '0.5rem' }} /> Activity Log</h2>
          <div className="activity-log-actions">
            <button className="icon-btn" onClick={onRefresh} title="Refresh" id="log-refresh-btn">
              <FiRefreshCw />
            </button>
            <button className="close-btn" onClick={onClose} id="log-close-btn">
              <FiX />
            </button>
          </div>
        </div>

        <div className="activity-log-body">
          {logs.length === 0 ? (
            <div className="log-empty">
              <FiClock className="log-empty-icon" />
              <p>No activity yet</p>
              <span>Actions like adding, editing, or deleting FAQs will appear here.</span>
            </div>
          ) : (
            <div className="log-list">
              {logs.map((log, index) => (
                <div key={index} className="log-item animate-fade-in">
                  <div className={`log-icon ${ACTION_COLORS[log.action] || ''}`}>
                    {ACTION_ICONS[log.action] || <FiClock />}
                  </div>
                  <div className="log-content">
                    <div className="log-meta">
                      <span className="log-user">{log.userId}</span>
                      <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                    </div>
                    <div className="log-details">{log.details}</div>
                    <div className={`log-badge ${ACTION_COLORS[log.action] || ''}`}>
                      {log.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
