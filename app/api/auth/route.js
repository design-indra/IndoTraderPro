/**
 * app/api/auth/route.js — Auth (Login / Logout / Verify)
 * Menggunakan Supabase untuk menyimpan user
 * Token: JWT (bukan cookie, agar kompatibel dengan mobile & Railway)
 */
import { NextResponse } from 'next/server';
import { supabase }     from '../../../lib/supabase.js';
import { createToken, verifyToken, hashPassword } from '../../../lib/auth.js';

export async function POST(req) {
  const { action, email, password, token } = await req.json().catch(() => ({}));

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!email || !password)
      return NextResponse.json({ success: false, error: 'Email dan password wajib diisi' }, { status: 400 });

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash, role, subscription_status, subscription_expires_at, name')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user)
      return NextResponse.json({ success: false, error: 'Email tidak terdaftar' }, { status: 401 });

    if (user.password_hash !== hashPassword(password))
      return NextResponse.json({ success: false, error: 'Password salah' }, { status: 401 });

    // Cek subscription (kecuali admin)
    if (user.role !== 'admin' && user.subscription_status !== 'active') {
      return NextResponse.json({
        success: false,
        error: 'Akun belum aktif. Silakan hubungi admin untuk aktivasi.',
        requireSubscription: true,
      }, { status: 403 });
    }

    const jwt = createToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    return NextResponse.json({
      success: true,
      token: jwt,
      user: { id: user.id, email: user.email, role: user.role, name: user.name, subscription_status: user.subscription_status },
    });
  }

  // ── VERIFY ─────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ success: false, error: 'Token tidak valid' }, { status: 401 });
    return NextResponse.json({ success: true, user: payload });
  }

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  if (action === 'logout') {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}

export async function GET(req) {
  const auth    = req.headers.get('authorization') || '';
  const token   = auth.replace('Bearer ', '').trim();
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, user: payload });
}
