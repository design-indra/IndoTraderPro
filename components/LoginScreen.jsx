'use client';
import { useState } from 'react';
import { Zap, Mail, Lock, Eye, EyeOff, User, AlertCircle, CheckCircle } from 'lucide-react';

export default function LoginScreen({ onLogin }) {
  const [tab,      setTab]      = useState('login'); // 'login' | 'register'
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('Email dan password wajib diisi'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('it_token', data.token);
        localStorage.setItem('it_user',  JSON.stringify(data.user));
        onLogin(data.user);
      } else {
        setError(data.error || 'Login gagal');
      }
    } catch { setError('Koneksi gagal, coba lagi'); }
    finally  { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name || !email || !password) { setError('Semua field wajib diisi'); return; }
    if (password.length < 6) { setError('Password minimal 6 karakter'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res  = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('✅ Akun dibuat! Menunggu aktivasi admin. Silakan login setelah diaktifkan.');
        setTab('login'); setName(''); setPassword('');
      } else {
        setError(data.error || 'Registrasi gagal');
      }
    } catch { setError('Koneksi gagal, coba lagi'); }
    finally  { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)' }}>

      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl"
          style={{ background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' }}>
          <Zap size={40} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">
          Indo<span className="text-sky-400">Trader</span> <span className="text-sky-300 text-sm font-normal">Pro</span>
        </h1>
        <p className="text-slate-500 text-sm mt-1">Crypto Bot — Indodax</p>
      </div>

      {/* Success message */}
      {success && (
        <div className="w-full max-w-sm mb-4 p-3 rounded-2xl flex items-start gap-2 text-sm"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <p className="text-emerald-300">{success}</p>
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-700"
        style={{ background: 'var(--surface-2, #1e293b)' }}>

        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden mb-6" style={{ background: '#0f172a' }}>
          {[['login','Masuk'],['register','Daftar']].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setError(''); setSuccess(''); }}
              className="flex-1 py-2 text-sm font-semibold transition-all"
              style={{ background: tab===id ? '#0ea5e9' : 'transparent', color: tab===id ? '#fff' : '#94a3b8' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {/* Name (register only) */}
          {tab === 'register' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nama Lengkap</label>
              <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-slate-600"
                style={{ background: '#0f172a' }}>
                <User size={16} className="text-slate-500" />
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Nama kamu" className="flex-1 bg-transparent text-sm text-slate-100 outline-none"
                  onKeyDown={e => e.key==='Enter' && handleRegister()} />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email</label>
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-slate-600"
              style={{ background: '#0f172a' }}>
              <Mail size={16} className="text-slate-500" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@kamu.com" className="flex-1 bg-transparent text-sm text-slate-100 outline-none"
                onKeyDown={e => e.key==='Enter' && (tab==='login' ? handleLogin() : handleRegister())} />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Password</label>
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 border border-slate-600"
              style={{ background: '#0f172a' }}>
              <Lock size={16} className="text-slate-500" />
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={tab==='register' ? 'Min. 6 karakter' : '••••••••'}
                className="flex-1 bg-transparent text-sm text-slate-100 outline-none"
                onKeyDown={e => e.key==='Enter' && (tab==='login' ? handleLogin() : handleRegister())} />
              <button onClick={() => setShowPw(!showPw)} className="text-slate-500">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm rounded-xl p-3"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button onClick={tab==='login' ? handleLogin : handleRegister} disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white transition-all"
            style={{ background: loading ? '#334155' : 'linear-gradient(135deg,#0ea5e9,#2563eb)',
              opacity: loading ? 0.7 : 1 }}>
            {loading ? '⏳ Memproses...' : (tab==='login' ? '🚀 Masuk' : '📝 Daftar Sekarang')}
          </button>

          {/* Info register */}
          {tab === 'register' && (
            <p className="text-xs text-slate-500 text-center">
              Setelah daftar, akun perlu diaktifkan admin sebelum bisa login.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
