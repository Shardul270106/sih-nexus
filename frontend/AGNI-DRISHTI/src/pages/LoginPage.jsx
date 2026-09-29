import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, register, loading, error, setError } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setError(null);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const displayError = localError || error;

  // Deterministic pseudo-random layout for the particle field (stable across renders)
  const particles = [...Array(8)].map((_, i) => {
    const s = Math.sin(i * 999 + 1) * 10000;
    const r = (n) => (Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1;
    const abs = (x) => Math.abs(x);
    return {
      size: abs(r(1)) * 4 + 2,
      opacity: abs(r(2)) * 0.5 + 0.1,
      top: abs(r(3)) * 100,
      left: abs(r(4)) * 100,
      duration: abs(r(5)) * 3 + 2,
      seed: s,
    };
  });

  return (
    <div className="login-page">
      {/* Background glow effect */}
      <div className="login-bg-glow" />

      {/* Floating particles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {particles.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `rgba(249, 115, 22, ${p.opacity})`,
            borderRadius: '50%',
            top: `${p.top}%`,
            left: `${p.left}%`,
            animation: `pulse ${p.duration}s infinite`,
          }} />
        ))}
      </div>

      <div className="login-card fade-in">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">🔥</div>
          <div>
            <h1 style={{ fontSize: '22px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, color: 'var(--text-primary)' }}>
              AGNI-DRISHTI
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Thermal Intelligence System
            </p>
          </div>
        </div>

        {/* Subtitle */}
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
          {mode === 'login'
            ? 'Sign in to access the NTRO thermal source classification dashboard'
            : 'Create an analyst account to start monitoring thermal anomalies'
          }
        </p>

        {/* Mode toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          padding: '3px',
          marginBottom: '20px',
          gap: '2px'
        }}>
          {['login', 'register'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setLocalError(''); setError(null); }}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.2s',
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="Analyst name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              className="form-input"
              type="email"
              placeholder="analyst@ntro.gov.in"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          {displayError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: 'var(--accent-red)',
              marginBottom: '16px'
            }}>
              ⚠️ {displayError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px' }}
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner" style={{ width: 16, height: 16 }} /> Processing...</>
            ) : (
              mode === 'login' ? '🔐 Sign In' : '🚀 Create Account'
            )}
          </button>
        </form>

        {/* Demo login hint */}
        <div style={{
          marginTop: '20px',
          padding: '10px 12px',
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          textAlign: 'center'
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Demo:</strong> Register with any email to get started.
          The system auto-loads FIRMS thermal data.
        </div>

        {/* NTRO attribution */}
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>
          SIH 2026 · Problem Statement 26162 · NTRO<br />
          <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Thermal Source Characterization System</span>
        </div>
      </div>
    </div>
  );
}
