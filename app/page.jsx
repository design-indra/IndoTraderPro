'use client';
import { useState, useEffect } from 'react';
import Dashboard   from '../components/Dashboard';
import LoginScreen from '../components/LoginScreen';

export default function Home() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token   = localStorage.getItem('it_token');
    const cached  = localStorage.getItem('it_user');
    if (!token) { setLoading(false); return; }

    // Verify token ke server
    fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', token }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) { setUser(d.user); }
        else           { localStorage.removeItem('it_token'); localStorage.removeItem('it_user'); }
      })
      .catch(() => {
        // Gunakan cache lokal jika server tidak bisa dicapai
        if (cached) { try { setUser(JSON.parse(cached)); } catch {} }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogin  = (userData) => setUser(userData);
  const handleLogout = () => {
    localStorage.removeItem('it_token');
    localStorage.removeItem('it_user');
    localStorage.removeItem('it_demo');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' }}>
            <span className="text-white text-xl">⚡</span>
          </div>
          <p className="text-slate-400 text-sm">Memuat IndoTrader Pro...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return <Dashboard user={user} onLogout={handleLogout} />;
}
