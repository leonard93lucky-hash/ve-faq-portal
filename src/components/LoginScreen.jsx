import { useState } from 'react';
import { FiShield, FiArrowRight, FiLoader } from 'react-icons/fi';

export default function LoginScreen({ onLogin }) {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId.trim()) {
      setError('Please enter your User ID');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onLogin(userId.trim());
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-card glass animate-fade-in">
        <div className="login-icon-wrap" style={{ background: 'transparent', boxShadow: 'none', width: 'auto', height: 'auto' }}>
          <img 
            src="https://privy.id/_nuxt/Privy_Logo_Red.BXNsidzu.png" 
            alt="Privy" 
            style={{ width: '120px', objectFit: 'contain' }} 
          />
        </div>
        <h1>FAQ Portal</h1>
        <p>Enter your PrivyID to access the internal knowledge base</p>
        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="input-group">
            <input
              id="user-id-input"
              type="text"
              className="input-field"
              placeholder="e.g. PRVY1234..."
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setError(''); }}
              autoFocus
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="btn-primary login-btn"
            id="login-btn"
            disabled={loading}
          >
            {loading ? (
              <><FiLoader className="spin" /> Verifying...</>
            ) : (
              <>Access Portal <FiArrowRight style={{ marginLeft: '0.5rem' }} /></>
            )}
          </button>
          {error && <div className="error-msg animate-fade-in" id="login-error">{error}</div>}
        </form>
        <div className="login-footer">
          <span>Internal Use Only • VE Team</span>
        </div>
      </div>
    </div>
  );
}
