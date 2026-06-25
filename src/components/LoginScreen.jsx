import { useState, useRef, useEffect } from 'react';
import { FiShield, FiArrowRight, FiArrowLeft, FiLoader, FiLock, FiMail } from 'react-icons/fi';
import { login } from '../api.js';

// Step 1: Enter PrivyID or Email
// Step 2a: requires_pin  → Enter 6-digit PIN
// Step 2b: setup_pin     → Set PIN + Email for the first time

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('code'); // 'code' | 'pin_verify' | 'pin_setup'
  const [identifier, setIdentifier] = useState('');
  const [resolvedUser, setResolvedUser] = useState(null); // { userId, name }
  const [pinDigits, setPinDigits] = useState(['', '', '', '', '', '']);
  const pinRefs = useRef([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ((step === 'pin_verify' || step === 'pin_setup') && pinRefs.current[0]) {
      pinRefs.current[0].focus();
    }
  }, [step]);

  const pinValue = pinDigits.join('');

  const handlePinChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...pinDigits];
    next[index] = value;
    setPinDigits(next);
    setError('');
    if (value && index < 5) pinRefs.current[index + 1]?.focus();
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  const handlePinPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setPinDigits(next);
    pinRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const resetToCode = () => {
    setStep('code');
    setResolvedUser(null);
    setPinDigits(['', '', '', '', '', '']);
    setEmail('');
    setError('');
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) { setError('Please enter your PrivyID or @privy.id email'); return; }
    setLoading(true); setError('');
    try {
      const data = await login(identifier.trim());
      setResolvedUser({ userId: data.userId, name: data.name });
      setStep(data.status === 'requires_pin' ? 'pin_verify' : 'pin_setup');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinVerify = async (e) => {
    e.preventDefault();
    if (pinValue.length !== 6) { setError('Please enter all 6 digits of your PIN'); return; }
    setLoading(true); setError('');
    try {
      const data = await login(resolvedUser.userId, pinValue);
      if (data.success) {
        onLogin({ userId: data.userId, name: data.name });
      } else {
        setError(data.error || 'Incorrect PIN.');
        setPinDigits(['', '', '', '', '', '']);
        pinRefs.current[0]?.focus();
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
      setPinDigits(['', '', '', '', '', '']);
      pinRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handlePinSetup = async (e) => {
    e.preventDefault();
    if (pinValue.length !== 6) { setError('Please enter all 6 digits for your PIN'); return; }
    if (!email.trim().toLowerCase().endsWith('@privy.id')) {
      setError('Please enter a valid @privy.id email address');
      return;
    }
    setLoading(true); setError('');
    try {
      const data = await login(resolvedUser.userId, pinValue, email.trim().toLowerCase());
      if (data.success) {
        onLogin({ userId: data.userId, name: data.name });
      } else {
        setError(data.error || 'Setup failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
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

        {step === 'code' && (
          <>
            <h1>FAQ Portal</h1>
            <p>Enter your PrivyID or @privy.id email to continue</p>
            <form onSubmit={handleCodeSubmit} className="login-form" id="login-form">
              <div className="input-group">
                <input
                  id="identifier-input"
                  type="text"
                  className="input-field"
                  placeholder="Input PrivyID or e-mail"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                  autoFocus
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
              <button type="submit" className="btn-primary login-btn" id="continue-btn" disabled={loading}>
                {loading
                  ? <><span className="spin-icon">⏳</span> Checking...</>
                  : <>Continue <FiArrowRight style={{ marginLeft: '0.5rem' }} /></>}
              </button>
              {error && <div className="error-msg animate-fade-in" id="login-error">{error}</div>}
            </form>
          </>
        )}

        {step === 'pin_verify' && resolvedUser && (
          <>
            <div className="pin-step-header">
              <div className="pin-icon-wrap"><FiLock size={24} /></div>
              <h1>Enter PIN</h1>
              <p>Welcome back, <strong>{resolvedUser.name}</strong>!<br />Enter your 6-digit PIN to continue.</p>
            </div>
            <form onSubmit={handlePinVerify} className="login-form" id="pin-verify-form">
              <div className="pin-grid" onPaste={handlePinPaste}>
                {pinDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => pinRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className={`pin-box${error ? ' pin-box-error' : ''}`}
                    value={d}
                    onChange={e => handlePinChange(i, e.target.value)}
                    onKeyDown={e => handlePinKeyDown(i, e)}
                    disabled={loading}
                    id={`pin-${i}`}
                    autoComplete="off"
                  />
                ))}
              </div>
              <button type="submit" className="btn-primary login-btn" id="verify-pin-btn" disabled={loading || pinValue.length !== 6}>
                {loading ? <>⏳ Verifying...</> : <>Access Portal <FiArrowRight style={{ marginLeft: '0.5rem' }} /></>}
              </button>
              {error && <div className="error-msg animate-fade-in" id="pin-error">{error}</div>}
              <button type="button" className="back-btn" onClick={resetToCode} id="back-btn">
                <FiArrowLeft style={{ marginRight: '0.4rem' }} /> Back
              </button>
            </form>
          </>
        )}

        {step === 'pin_setup' && resolvedUser && (
          <>
            <div className="pin-step-header">
              <div className="pin-icon-wrap setup"><FiShield size={24} /></div>
              <h1>Set Up PIN</h1>
              <p>Hi <strong>{resolvedUser.name}</strong>! Create your 6-digit PIN and register your Privy email for account security.</p>
            </div>
            <form onSubmit={handlePinSetup} className="login-form" id="pin-setup-form">
              <div className="pin-label">Choose a 6-digit PIN</div>
              <div className="pin-grid" onPaste={handlePinPaste}>
                {pinDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => pinRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className={`pin-box${error && error.toLowerCase().includes('pin') ? ' pin-box-error' : ''}`}
                    value={d}
                    onChange={e => handlePinChange(i, e.target.value)}
                    onKeyDown={e => handlePinKeyDown(i, e)}
                    disabled={loading}
                    id={`setup-pin-${i}`}
                    autoComplete="off"
                  />
                ))}
              </div>
              <div className="pin-label" style={{ marginTop: '1.25rem' }}>
                <FiMail style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                Privy Email
              </div>
              <div className="input-group">
                <input
                  id="email-input"
                  type="email"
                  className="input-field"
                  placeholder="yourname@privy.id"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
              <button type="submit" className="btn-primary login-btn" id="setup-pin-btn"
                disabled={loading || pinValue.length !== 6 || !email.trim()}>
                {loading ? <>⏳ Saving...</> : <>Save PIN & Enter Portal <FiArrowRight style={{ marginLeft: '0.5rem' }} /></>}
              </button>
              {error && <div className="error-msg animate-fade-in" id="setup-error">{error}</div>}
              <button type="button" className="back-btn" onClick={resetToCode} id="back-btn-setup">
                <FiArrowLeft style={{ marginRight: '0.4rem' }} /> Back
              </button>
            </form>
          </>
        )}

        <div className="login-footer">
          <span>Internal Use Only • VE Team</span>
        </div>
      </div>
    </div>
  );
}
